import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  Routes,
  type REST,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  type RESTPostAPIApplicationCommandsJSONBody,
  type APIApplicationCommandOption,
} from 'discord.js';
import { ValidationError } from '@ririko/core';
import type { CommandRegistry } from '../router/registry.js';
import type {
  Command,
  CommandOptionDefinition,
  CommandOptionType,
  CommandRegistrationScope,
} from '../command/types.js';

/**
 * Discord's per-scope limits: chat-input (slash) commands apply to the global scope and to each
 * guild separately; context menus are registered globally only.
 */
export const COMMAND_LIMITS = {
  chatInput: 100,
  message: 15,
  user: 15,
} as const;

export interface CommandSyncOptions {
  /** Which commands to build payloads for (default `'global'`). */
  scope?: CommandRegistrationScope | undefined;
}

export interface SyncResult {
  scope: 'global' | 'guild';
  applicationId: string;
  guildId?: string | undefined;
  registeredCount: number;
  commandNames: string[];
}

/**
 * Maps unified CommandOptionType strings to Discord REST API ApplicationCommandOptionType numbers.
 */
export function mapOptionType(type: CommandOptionType): ApplicationCommandOptionType {
  switch (type) {
    case 'STRING':
      return ApplicationCommandOptionType.String;
    case 'INTEGER':
      return ApplicationCommandOptionType.Integer;
    case 'NUMBER':
      return ApplicationCommandOptionType.Number;
    case 'BOOLEAN':
      return ApplicationCommandOptionType.Boolean;
    case 'USER':
      return ApplicationCommandOptionType.User;
    case 'CHANNEL':
      return ApplicationCommandOptionType.Channel;
    case 'ROLE':
      return ApplicationCommandOptionType.Role;
    case 'ATTACHMENT':
      return ApplicationCommandOptionType.Attachment;
    default:
      return ApplicationCommandOptionType.String;
  }
}

/**
 * Constructs a Discord REST v10 application command payload from a Command definition.
 */
export function buildCommandPayload(
  command: Command,
): RESTPostAPIChatInputApplicationCommandsJSONBody {
  const { metadata } = command;

  const payload: RESTPostAPIChatInputApplicationCommandsJSONBody = {
    name: metadata.name.toLowerCase().trim(),
    description: metadata.description.slice(0, 100) || 'No description provided.',
  };

  if (metadata.isGuildOnly !== undefined) {
    payload.dm_permission = !metadata.isGuildOnly;
  }

  if (metadata.userPermissions && metadata.userPermissions.length > 0) {
    const combined = metadata.userPermissions.reduce((acc, curr) => acc | curr, 0n);
    payload.default_member_permissions = combined.toString();
  }

  if (metadata.options && metadata.options.length > 0) {
    payload.options = metadata.options.map(
      (opt: CommandOptionDefinition): APIApplicationCommandOption => {
        const optionPayload: Record<string, unknown> = {
          name: opt.name.toLowerCase().trim(),
          description: opt.description.slice(0, 100) || 'No description provided.',
          type: mapOptionType(opt.type),
          required: opt.required ?? false,
        };

        // Discord rejects an option that carries both `choices` and `autocomplete`. When a
        // definition sets both, autocomplete wins (it is the escape hatch for option spaces
        // too large for the 25-choice REST limit) and the static choices are dropped rather
        // than throwing, so a definition authored with a choices fallback degrades gracefully.
        if (opt.autocomplete) {
          optionPayload.autocomplete = true;
        } else if (opt.choices && opt.choices.length > 0) {
          optionPayload.choices = opt.choices.map((c) => ({
            name: c.name,
            value: c.value,
          }));
        }

        if (opt.minValue !== undefined) optionPayload.min_value = opt.minValue;
        if (opt.maxValue !== undefined) optionPayload.max_value = opt.maxValue;
        if (opt.minLength !== undefined) optionPayload.min_length = opt.minLength;
        if (opt.maxLength !== undefined) optionPayload.max_length = opt.maxLength;

        return optionPayload as unknown as APIApplicationCommandOption;
      },
    );
  }

  return payload;
}

/** Payload count per command type, as Discord counts them against {@link COMMAND_LIMITS}. */
export function countPayloads(payloads: readonly RESTPostAPIApplicationCommandsJSONBody[]): {
  chatInput: number;
  message: number;
  user: number;
} {
  const count = (type: ApplicationCommandType) =>
    payloads.filter((p) => (p.type ?? ApplicationCommandType.ChatInput) === type).length;
  return {
    chatInput: count(ApplicationCommandType.ChatInput),
    message: count(ApplicationCommandType.Message),
    user: count(ApplicationCommandType.User),
  };
}

function assertWithinLimits(
  scope: CommandRegistrationScope,
  payloads: readonly RESTPostAPIApplicationCommandsJSONBody[],
): void {
  const counts = countPayloads(payloads);
  const over = (Object.keys(COMMAND_LIMITS) as (keyof typeof COMMAND_LIMITS)[]).filter(
    (kind) => counts[kind] > COMMAND_LIMITS[kind],
  );
  if (over.length === 0) return;
  throw new ValidationError(
    `The ${scope} command scope exceeds Discord's limits: ${over
      .map((kind) => `${counts[kind]} ${kind} commands (max ${COMMAND_LIMITS[kind]})`)
      .join(
        ', ',
      )}. Move commands to the other scope with registrationScope, or set slashEnabled: false on prefix-only commands.`,
    { details: { scope, counts } },
  );
}

/**
 * High-performance command synchronization engine.
 * Automatically synchronizes CommandRegistry definitions with Discord's REST API v10 endpoints.
 */
export class CommandSynchronizer {
  constructor(
    private readonly rest: REST,
    private readonly registry: CommandRegistry,
  ) {}

  /**
   * Generates the REST JSON payloads for one scope: its slash commands, plus every context menu
   * for the global scope. Throws before any REST call when a Discord limit would be exceeded,
   * since Discord rejects the whole PUT and leaves the scope unregistered.
   */
  public generatePayloads(
    options: CommandSyncOptions = {},
  ): RESTPostAPIApplicationCommandsJSONBody[] {
    const scope = options.scope ?? 'global';
    const all = this.registry.getAll();
    const payloads: RESTPostAPIApplicationCommandsJSONBody[] = all
      .filter(
        ({ metadata }) =>
          metadata.slashEnabled !== false && (metadata.registrationScope ?? 'global') === scope,
      )
      .map(buildCommandPayload);

    if (scope === 'global') {
      for (const { metadata } of all) {
        if (!metadata.messageContextMenuName) continue;
        payloads.push({
          name: metadata.messageContextMenuName,
          type: ApplicationCommandType.Message,
          ...(metadata.isGuildOnly !== undefined ? { dm_permission: !metadata.isGuildOnly } : {}),
          ...(metadata.userPermissions?.length
            ? {
                default_member_permissions: metadata.userPermissions
                  .reduce((a, b) => a | b, 0n)
                  .toString(),
              }
            : {}),
        });
      }
    }

    assertWithinLimits(scope, payloads);
    return payloads;
  }

  /**
   * Replaces the application's global commands with the global scope's payloads.
   */
  public async syncGlobal(applicationId: string): Promise<SyncResult> {
    const payloads = this.generatePayloads({ scope: 'global' });

    await this.rest.put(Routes.applicationCommands(applicationId), {
      body: payloads,
    });

    return {
      scope: 'global',
      applicationId,
      registeredCount: payloads.length,
      commandNames: payloads.map((p) => p.name),
    };
  }

  /**
   * Replaces one guild's commands with the guild scope's payloads. Changes appear instantly.
   */
  public async syncGuild(applicationId: string, guildId: string): Promise<SyncResult> {
    const payloads = this.generatePayloads({ scope: 'guild' });

    await this.rest.put(Routes.applicationGuildCommands(applicationId, guildId), {
      body: payloads,
    });

    return {
      scope: 'guild',
      applicationId,
      guildId,
      registeredCount: payloads.length,
      commandNames: payloads.map((p) => p.name),
    };
  }

  /**
   * Clears all globally registered slash commands.
   */
  public async clearGlobal(applicationId: string): Promise<void> {
    await this.rest.put(Routes.applicationCommands(applicationId), {
      body: [],
    });
  }

  /**
   * Clears all slash commands registered in a specific guild.
   */
  public async clearGuild(applicationId: string, guildId: string): Promise<void> {
    await this.rest.put(Routes.applicationGuildCommands(applicationId, guildId), {
      body: [],
    });
  }
}
