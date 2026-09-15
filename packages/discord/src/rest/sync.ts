import {
  ApplicationCommandOptionType,
  Routes,
  type REST,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  type APIApplicationCommandOption,
} from 'discord.js';
import type { CommandRegistry } from '../router/registry.js';
import type { Command, CommandOptionDefinition, CommandOptionType } from '../command/types.js';

export interface CommandSyncOptions {
  /**
   * Only sync commands that have slashEnabled !== false (default: true).
   */
  filterSlashEnabled?: boolean | undefined;
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

        if (opt.choices && opt.choices.length > 0) {
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
   * Generates REST JSON payloads for all slash-eligible commands in the registry.
   */
  public generatePayloads(
    options: CommandSyncOptions = {},
  ): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
    const filterSlash = options.filterSlashEnabled ?? true;
    const commands = this.registry
      .getAll()
      .filter((cmd) => (filterSlash ? cmd.metadata.slashEnabled !== false : true));

    return commands.map(buildCommandPayload);
  }

  /**
   * Synchronizes all registered commands globally via Discord REST v10.
   */
  public async syncGlobal(
    applicationId: string,
    options: CommandSyncOptions = {},
  ): Promise<SyncResult> {
    const payloads = this.generatePayloads(options);

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
   * Synchronizes all registered commands to a specific guild via Discord REST v10 (instant for development).
   */
  public async syncGuild(
    applicationId: string,
    guildId: string,
    options: CommandSyncOptions = {},
  ): Promise<SyncResult> {
    const payloads = this.generatePayloads(options);

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
