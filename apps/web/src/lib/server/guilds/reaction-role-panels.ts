import 'server-only';
import { randomUUID } from 'node:crypto';
import { DiscordAPIError, type REST } from '@discordjs/rest';
import { RESTJSONErrorCodes, Routes } from 'discord-api-types/v10';
import {
  buildPanelMessage,
  describePanelIssues,
  hasForeignComponents,
  isReactionRoleComponent,
  panelButtonCustomId,
  panelFromMessage,
  ReactionRolePanelSchema,
  stripPanelBinding,
  type ApiComponent,
  type ApiEmbed,
  type ReactionRolePanel,
  type ReactionRolePanelInput,
} from '@ririko/core';
import {
  withTransaction,
  type AuditLogRepository,
  type DatabaseClient,
  type ReactionRole,
  type ReactionRoleRepository,
} from '@ririko/database';
import type { GuildResourceDirectory } from './guild-resources';
import { unassignableRoles } from './setting-checks';

/** Who changed a panel, recorded in `audit_logs`. */
export interface PanelActor {
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

/** A message as Discord returns it, with the fields panels use. */
interface ApiMessage {
  id: string;
  channel_id: string;
  content: string;
  author: { id: string };
  embeds: ApiEmbed[];
  components?: ApiComponent[];
}

/** A panel change as audit entries and change notices show it. */
export interface PanelChange {
  field: string;
  before: unknown;
  after: unknown;
}

export type PanelResult =
  | {
      status: 'published';
      channelId: string;
      messageId: string;
      created: boolean;
      changes: PanelChange[];
    }
  | { status: 'invalid'; errors: string[] };

/** One stored binding as the panel list shows it. */
export interface PanelBindingView {
  id: string;
  roleId: string;
  /** Null when the role no longer exists. */
  roleName: string | null;
  type: 'EMOJI' | 'BUTTON' | 'SELECT_MENU';
  label: string | null;
  /** The emoji members react with, for emoji bindings. */
  emoji: string | null;
}

/** The bindings on one message. */
export interface PanelSummary {
  channelId: string;
  /** Null when the channel no longer exists. */
  channelName: string | null;
  messageId: string;
  url: string;
  /** Whether the builder can edit it (it has buttons or a menu, not only emoji reactions). */
  editable: boolean;
  bindings: PanelBindingView[];
}

/** Thrown for a panel change Discord or the guild's setup refuses; the message is for the user. */
export class PanelError extends Error {}

export interface ReactionRolePanelDeps {
  db: DatabaseClient;
  reactionRoles: ReactionRoleRepository;
  audit: AuditLogRepository;
  rest: Pick<REST, 'get' | 'post' | 'patch' | 'delete'>;
  resources: Pick<
    GuildResourceDirectory,
    'messageChannels' | 'channelNames' | 'assignableRoles' | 'memberRoles' | 'botUserId'
  >;
  now?: () => Date;
}

const COMPONENT_TYPES = new Set(['BUTTON', 'SELECT_MENU']);

/** What went wrong with a Discord call, in words for the dashboard user. */
export function describeDiscordError(error: unknown): string | null {
  if (!(error instanceof DiscordAPIError)) return null;
  switch (error.code) {
    case RESTJSONErrorCodes.MissingPermissions:
      return 'Ririko is missing permissions in that channel. It needs View Channel, Send Messages and Embed Links.';
    case RESTJSONErrorCodes.MissingAccess:
      return 'Ririko cannot see that channel.';
    case RESTJSONErrorCodes.UnknownChannel:
      return 'That channel no longer exists.';
    case RESTJSONErrorCodes.UnknownMessage:
      return 'That message no longer exists.';
    case RESTJSONErrorCodes.InvalidFormBodyOrContentType:
      return `Discord rejected the panel (check the emojis and labels): ${error.message}`;
    default:
      return null;
  }
}

/**
 * Publishes reaction role panels through the bot token: posts a new message or edits one of
 * Ririko's own, then stores the bindings. Callers must have passed `requireGuildAccess` and a
 * passkey step-up for `guildId`.
 */
export class ReactionRolePanelService {
  private readonly now: () => Date;

  constructor(private readonly deps: ReactionRolePanelDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async publish(guildId: string, input: unknown, actor: PanelActor): Promise<PanelResult> {
    const parsed = ReactionRolePanelSchema.safeParse(
      typeof input === 'string' ? safeJson(input) : input,
    );
    if (!parsed.success) {
      return { status: 'invalid', errors: describePanelIssues(parsed.error.issues) };
    }
    const panel = parsed.data;
    const problems = await this.checkGuild(guildId, panel);
    if (problems.length > 0) return { status: 'invalid', errors: problems };

    const existing = panel.messageId
      ? await this.ownMessage(panel.channelId, panel.messageId)
      : null;
    const previous = existing
      ? (await this.deps.reactionRoles.findByMessageId(existing.id)).filter(
          (row) => row.guildId === guildId && COMPONENT_TYPES.has(row.type),
        )
      : [];
    const groupId = previous.find((row) => row.groupId)?.groupId ?? randomUUID();
    const bindingIds = panel.items.map(() => randomUUID());
    const body = buildPanelMessage(panel, bindingIds, groupId);
    const changes: PanelChange[] = [
      {
        field: 'roleIds',
        before: previous.map((row) => row.roleId),
        after: panel.items.map((item) => item.roleId),
      },
    ];

    const message = await this.discord(async () =>
      existing
        ? ((await this.deps.rest.patch(Routes.channelMessage(panel.channelId, existing.id), {
            body,
          })) as ApiMessage)
        : ((await this.deps.rest.post(Routes.channelMessages(panel.channelId), {
            body,
          })) as ApiMessage),
    );

    try {
      await withTransaction(this.deps.db, async (tx) => {
        await this.deps.reactionRoles.replaceComponentBindings(
          message.id,
          panel.items.map((item, index) => ({
            id: bindingIds[index]!,
            guildId,
            channelId: panel.channelId,
            messageId: message.id,
            // Buttons are found by their custom ID, menu options by their value (the role).
            emojiOrComponentId:
              panel.kind === 'BUTTONS' ? panelButtonCustomId(bindingIds[index]!) : item.roleId,
            roleId: item.roleId,
            type: panel.kind === 'BUTTONS' ? 'BUTTON' : 'SELECT_MENU',
            mode: panel.kind === 'BUTTONS' ? panel.mode : 'TOGGLE',
            groupId,
            label: item.label || null,
            description: item.description || null,
          })),
          tx,
        );
        await this.deps.audit.create(
          {
            guildId,
            actorUserId: actor.userId,
            action: 'reaction_roles.publish',
            details: {
              source: 'dashboard',
              channelId: panel.channelId,
              messageId: message.id,
              changes,
            },
            ipAddress: actor.ipAddress,
            userAgent: actor.userAgent,
          },
          this.now(),
          tx,
        );
      });
    } catch (error) {
      await this.undo(panel.channelId, message.id, existing);
      throw error;
    }
    return {
      status: 'published',
      channelId: panel.channelId,
      messageId: message.id,
      created: existing === null,
      changes,
    };
  }

  /** Every message with reaction role bindings in the guild, newest first. */
  async listPanels(guildId: string): Promise<PanelSummary[]> {
    const rows = await this.deps.reactionRoles.findByGuildId(guildId);
    if (rows.length === 0) return [];
    const [channels, roles] = await Promise.all([
      this.deps.resources.channelNames(guildId),
      this.deps.resources.memberRoles(guildId),
    ]);
    const roleNames = new Map(roles.map((role) => [role.id, role.name]));
    const byMessage = new Map<string, ReactionRole[]>();
    for (const row of rows) {
      byMessage.set(row.messageId, [...(byMessage.get(row.messageId) ?? []), row]);
    }
    return [...byMessage.values()]
      .map((bindings) => {
        const { channelId, messageId } = bindings[0]!;
        return {
          channelId,
          channelName: channels.get(channelId) ?? null,
          messageId,
          url: `https://discord.com/channels/${guildId}/${channelId}/${messageId}`,
          editable: bindings.some((row) => COMPONENT_TYPES.has(row.type)),
          bindings: bindings.map((row) => ({
            id: row.id,
            roleId: row.roleId,
            roleName: roleNames.get(row.roleId) ?? null,
            type: row.type as PanelBindingView['type'],
            label: row.label,
            emoji: row.type === 'EMOJI' ? row.emojiOrComponentId : null,
          })),
        };
      })
      .sort((a, b) => compareIds(b.messageId, a.messageId));
  }

  /** A published panel as builder input, read back from Discord; null when it has none. */
  async loadPanel(guildId: string, messageId: string): Promise<ReactionRolePanelInput | null> {
    const bindings = (await this.deps.reactionRoles.findByMessageId(messageId)).filter(
      (row) => row.guildId === guildId && COMPONENT_TYPES.has(row.type),
    );
    const first = bindings[0];
    if (!first) return null;
    const message = await this.discord(
      async () =>
        (await this.deps.rest.get(Routes.channelMessage(first.channelId, messageId))) as ApiMessage,
    );
    return panelFromMessage(message, bindings);
  }

  /**
   * Removes one binding and its button, menu option or Ririko's own reaction from the message.
   * A message that no longer exists only loses the binding.
   */
  async removeBinding(
    guildId: string,
    bindingId: string,
    actor: PanelActor,
  ): Promise<PanelChange[]> {
    const binding = await this.deps.reactionRoles.findById(bindingId);
    if (!binding || binding.guildId !== guildId) {
      throw new PanelError('That reaction role no longer exists.');
    }
    const route = Routes.channelMessage(binding.channelId, binding.messageId);
    if (binding.type === 'EMOJI') {
      await this.ignoreMissing(() =>
        this.deps.rest.delete(
          Routes.channelMessageOwnReaction(
            binding.channelId,
            binding.messageId,
            reactionRouteEmoji(binding.emojiOrComponentId),
          ),
        ),
      );
    } else {
      const message = await this.ignoreMissing(
        async () => (await this.deps.rest.get(route)) as ApiMessage,
      );
      const components = message?.components ?? [];
      const stripped = stripPanelBinding(components, binding);
      if (message && JSON.stringify(stripped) !== JSON.stringify(components)) {
        await this.discord(() => this.deps.rest.patch(route, { body: { components: stripped } }));
      }
    }
    const changes = [{ field: 'roleIds', before: [binding.roleId], after: [] }];
    await withTransaction(this.deps.db, async (tx) => {
      await this.deps.reactionRoles.delete(binding.id, tx);
      await this.audit('reaction_roles.remove', guildId, binding, changes, actor, tx);
    });
    return changes;
  }

  /**
   * Removes every binding on a message. Ririko's buttons, menu and reactions are taken off it,
   * or, with `deleteMessage`, Ririko's own message is deleted.
   */
  async deletePanel(
    guildId: string,
    messageId: string,
    options: { deleteMessage: boolean },
    actor: PanelActor,
  ): Promise<PanelChange[]> {
    const bindings = (await this.deps.reactionRoles.findByMessageId(messageId)).filter(
      (row) => row.guildId === guildId,
    );
    const first = bindings[0];
    if (!first) throw new PanelError('That panel no longer exists.');
    const route = Routes.channelMessage(first.channelId, messageId);
    const message = await this.ignoreMissing(
      async () => (await this.deps.rest.get(route)) as ApiMessage,
    );
    if (message && options.deleteMessage) {
      if (message.author.id !== (await this.deps.resources.botUserId())) {
        throw new PanelError('Ririko can only delete messages it sent. Remove the roles instead.');
      }
      await this.ignoreMissing(() => this.deps.rest.delete(route));
    } else if (message) {
      const rows = message.components ?? [];
      const components = rows
        .map((row) => ({
          ...row,
          components: (row.components ?? []).filter(
            (component) => !isReactionRoleComponent(component.custom_id),
          ),
        }))
        .filter((row) => row.components.length > 0);
      if (JSON.stringify(components) !== JSON.stringify(rows)) {
        await this.discord(() => this.deps.rest.patch(route, { body: { components } }));
      }
      for (const binding of bindings.filter((row) => row.type === 'EMOJI')) {
        await this.ignoreMissing(() =>
          this.deps.rest.delete(
            Routes.channelMessageOwnReaction(
              first.channelId,
              messageId,
              reactionRouteEmoji(binding.emojiOrComponentId),
            ),
          ),
        );
      }
    }
    const changes = [{ field: 'roleIds', before: bindings.map((row) => row.roleId), after: [] }];
    await withTransaction(this.deps.db, async (tx) => {
      await this.deps.reactionRoles.deleteByMessageId(messageId, tx);
      await this.audit('reaction_roles.delete_panel', guildId, first, changes, actor, tx);
    });
    return changes;
  }

  private async audit(
    action: string,
    guildId: string,
    binding: Pick<ReactionRole, 'channelId' | 'messageId'>,
    changes: PanelChange[],
    actor: PanelActor,
    tx: DatabaseClient,
  ): Promise<void> {
    await this.deps.audit.create(
      {
        guildId,
        actorUserId: actor.userId,
        action,
        details: {
          source: 'dashboard',
          channelId: binding.channelId,
          messageId: binding.messageId,
          changes,
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      },
      this.now(),
      tx,
    );
  }

  /** Runs a Discord call; a message, channel or reaction that is already gone gives null. */
  private async ignoreMissing<T>(call: () => Promise<T>): Promise<T | null> {
    try {
      return await call();
    } catch (error) {
      if (
        error instanceof DiscordAPIError &&
        (error.code === RESTJSONErrorCodes.UnknownMessage ||
          error.code === RESTJSONErrorCodes.UnknownChannel ||
          error.code === RESTJSONErrorCodes.UnknownEmoji)
      ) {
        return null;
      }
      const message = describeDiscordError(error);
      if (message) throw new PanelError(message, { cause: error });
      throw error;
    }
  }

  /** Channel and role problems the schema cannot see. */
  private async checkGuild(guildId: string, panel: ReactionRolePanel): Promise<string[]> {
    const [channels, roleProblems] = await Promise.all([
      this.deps.resources.messageChannels(guildId),
      unassignableRoles(
        this.deps.resources,
        guildId,
        panel.items.map((item) => item.roleId),
      ),
    ]);
    const errors: string[] = [];
    if (!channels.some((channel) => channel.id === panel.channelId)) {
      errors.push('Choose a text or announcement channel of this server.');
    }
    panel.items.forEach((item, index) => {
      const problem = roleProblems.get(item.roleId);
      if (problem) errors.push(`Role ${index + 1}: ${problem}`);
    });
    return errors;
  }

  /** The message to edit; it must be Ririko's and carry no other feature's components. */
  private async ownMessage(channelId: string, messageId: string): Promise<ApiMessage> {
    const [message, botId] = await Promise.all([
      this.discord(
        async () =>
          (await this.deps.rest.get(Routes.channelMessage(channelId, messageId))) as ApiMessage,
      ),
      this.deps.resources.botUserId(),
    ]);
    if (message.author.id !== botId) {
      throw new PanelError('Ririko can only add roles to messages it sent.');
    }
    if (hasForeignComponents(message.components ?? [])) {
      throw new PanelError(
        'That message has buttons or menus from another feature, so Ririko will not change it.',
      );
    }
    return message;
  }

  /** Puts Discord back as it was when the bindings could not be saved (best effort). */
  private async undo(channelId: string, messageId: string, previous: ApiMessage | null) {
    try {
      if (previous) {
        await this.deps.rest.patch(Routes.channelMessage(channelId, messageId), {
          body: {
            content: previous.content,
            embeds: previous.embeds,
            components: previous.components ?? [],
          },
        });
      } else {
        await this.deps.rest.delete(Routes.channelMessage(channelId, messageId));
      }
    } catch (error) {
      console.error(`[web] Could not undo reaction role message ${messageId}:`, error);
    }
  }

  /** Runs a Discord call, turning errors a user can fix into `PanelError`. */
  private async discord<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      const message = describeDiscordError(error);
      if (message) throw new PanelError(message, { cause: error });
      throw error;
    }
  }
}

/** Snowflake order: shorter IDs are older, equal lengths compare as text. */
function compareIds(a: string, b: string): number {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}

/** A stored reaction emoji as the reaction routes take it: `name:id` or the Unicode emoji. */
function reactionRouteEmoji(emoji: string): string {
  const custom = /^<a?:(\w+):(\d+)>$/.exec(emoji);
  return encodeURIComponent(custom ? `${custom[1]}:${custom[2]}` : emoji);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
