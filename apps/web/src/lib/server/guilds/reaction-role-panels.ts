import 'server-only';
import { randomUUID } from 'node:crypto';
import { DiscordAPIError, type REST } from '@discordjs/rest';
import { RESTJSONErrorCodes, Routes } from 'discord-api-types/v10';
import {
  buildPanelMessage,
  describePanelIssues,
  hasForeignComponents,
  panelButtonCustomId,
  ReactionRolePanelSchema,
  type ApiComponent,
  type ApiEmbed,
  type ReactionRolePanel,
} from '@ririko/core';
import {
  withTransaction,
  type AuditLogRepository,
  type DatabaseClient,
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

/** Thrown for a panel change Discord or the guild's setup refuses; the message is for the user. */
export class PanelError extends Error {}

export interface ReactionRolePanelDeps {
  db: DatabaseClient;
  reactionRoles: ReactionRoleRepository;
  audit: AuditLogRepository;
  rest: Pick<REST, 'get' | 'post' | 'patch' | 'delete'>;
  resources: Pick<
    GuildResourceDirectory,
    'messageChannels' | 'assignableRoles' | 'memberRoles' | 'botUserId'
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

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
