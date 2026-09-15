import type {
  Attachment,
  Channel,
  ChatInputCommandInteraction,
  Client,
  GuildMember,
  Message,
  User,
} from 'discord.js';
import type { CommandOptionDefinition, ICommandOptionsResolver } from './types.js';
import { ValidationError } from '@ririko/core';

/**
 * Resolves command options directly from Discord's ChatInputCommandInteraction.
 */
export class SlashOptionsResolver implements ICommandOptionsResolver {
  constructor(private readonly interaction: ChatInputCommandInteraction) {}

  getString(name: string, required = false): string | null {
    const val = this.interaction.options.getString(name, required);
    return val;
  }

  getInteger(name: string, required = false): number | null {
    const val = this.interaction.options.getInteger(name, required);
    return val;
  }

  getNumber(name: string, required = false): number | null {
    const val = this.interaction.options.getNumber(name, required);
    return val;
  }

  getBoolean(name: string, required = false): boolean | null {
    const val = this.interaction.options.getBoolean(name, required);
    return val;
  }

  async getUser(name: string, required = false): Promise<User | null> {
    const user = this.interaction.options.getUser(name, required);
    return user;
  }

  async getMember(name: string, _required = false): Promise<GuildMember | null> {
    const member = this.interaction.options.getMember(name);
    return (member as GuildMember) ?? null;
  }

  async getChannel(name: string, required = false): Promise<Channel | null> {
    const channel = this.interaction.options.getChannel(name, required);
    return (channel as Channel) ?? null;
  }

  getAttachment(name: string, required = false): Attachment | null {
    const attachment = this.interaction.options.getAttachment(name, required);
    return attachment;
  }

  getRawArgs(): readonly string[] {
    return [];
  }
}

/**
 * Resolves command options positionally from prefix arguments and message context.
 */
export class PrefixOptionsResolver implements ICommandOptionsResolver {
  private readonly definitions: readonly CommandOptionDefinition[];
  private readonly rawArgs: readonly string[];

  constructor(
    private readonly message: Message,
    rawArgs: string[],
    definitions: CommandOptionDefinition[] = [],
    private readonly client: Client,
  ) {
    this.rawArgs = rawArgs;
    this.definitions = definitions;
  }

  private getOptionIndex(name: string): number {
    return this.definitions.findIndex((def) => def.name.toLowerCase() === name.toLowerCase());
  }

  private getRawValue(name: string): string | null {
    const index = this.getOptionIndex(name);
    if (index === -1) {
      return null;
    }

    if (index >= this.rawArgs.length) {
      return null;
    }

    // If this is the last definition and it's a STRING, join all remaining arguments
    const isLastDefinition = index === this.definitions.length - 1;
    const def = this.definitions[index];
    if (isLastDefinition && def?.type === 'STRING') {
      return this.rawArgs.slice(index).join(' ');
    }

    return this.rawArgs[index] ?? null;
  }

  getString(name: string, required = false): string | null {
    const val = this.getRawValue(name);
    if (!val) {
      if (required) {
        throw new ValidationError(`Required parameter "${name}" was not provided.`);
      }
      return null;
    }
    return val;
  }

  getInteger(name: string, required = false): number | null {
    const raw = this.getRawValue(name);
    if (raw === null) {
      if (required) {
        throw new ValidationError(`Required parameter "${name}" was not provided.`);
      }
      return null;
    }

    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      if (required) {
        throw new ValidationError(
          `Parameter "${name}" must be a valid integer, received: "${raw}".`,
        );
      }
      return null;
    }

    return parsed;
  }

  getNumber(name: string, required = false): number | null {
    const raw = this.getRawValue(name);
    if (raw === null) {
      if (required) {
        throw new ValidationError(`Required parameter "${name}" was not provided.`);
      }
      return null;
    }

    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed)) {
      if (required) {
        throw new ValidationError(
          `Parameter "${name}" must be a valid number, received: "${raw}".`,
        );
      }
      return null;
    }

    return parsed;
  }

  getBoolean(name: string, required = false): boolean | null {
    const raw = this.getRawValue(name);
    if (raw === null) {
      if (required) {
        throw new ValidationError(`Required parameter "${name}" was not provided.`);
      }
      return null;
    }

    const lower = raw.toLowerCase();
    if (['true', '1', 'yes', 'y', 'on', 'enable'].includes(lower)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'off', 'disable'].includes(lower)) {
      return false;
    }

    if (required) {
      throw new ValidationError(
        `Parameter "${name}" must be true/yes or false/no, received: "${raw}".`,
      );
    }
    return null;
  }

  async getUser(name: string, required = false): Promise<User | null> {
    const raw = this.getRawValue(name);
    if (!raw) {
      if (required) {
        throw new ValidationError(`Required parameter "${name}" was not provided.`);
      }
      return null;
    }

    // Match <@!123456789>, <@123456789>, or raw snowflake
    const match = raw.match(/^(?:<@!?)?(\d{17,20})>?$/);
    if (!match) {
      if (required) {
        throw new ValidationError(
          `Parameter "${name}" must be a valid user mention or ID, received: "${raw}".`,
        );
      }
      return null;
    }

    const userId = match[1]!;
    try {
      const cached = this.client.users.cache.get(userId);
      if (cached) return cached;
      return await this.client.users.fetch(userId);
    } catch {
      if (required) {
        throw new ValidationError(`User with ID "${userId}" could not be found.`);
      }
      return null;
    }
  }

  async getMember(name: string, required = false): Promise<GuildMember | null> {
    const user = await this.getUser(name, required);
    if (!user || !this.message.guild) {
      return null;
    }

    try {
      const cached = this.message.guild.members.cache.get(user.id);
      if (cached) return cached;
      return await this.message.guild.members.fetch(user.id);
    } catch {
      return null;
    }
  }

  async getChannel(name: string, required = false): Promise<Channel | null> {
    const raw = this.getRawValue(name);
    if (!raw) {
      if (required) {
        throw new ValidationError(`Required parameter "${name}" was not provided.`);
      }
      return null;
    }

    // Match <#123456789> or raw snowflake
    const match = raw.match(/^(?:<#)?(\d{17,20})>?$/);
    if (!match) {
      if (required) {
        throw new ValidationError(
          `Parameter "${name}" must be a valid channel mention or ID, received: "${raw}".`,
        );
      }
      return null;
    }

    const channelId = match[1]!;
    try {
      const cached = this.client.channels.cache.get(channelId);
      if (cached) return cached;
      return await this.client.channels.fetch(channelId);
    } catch {
      if (required) {
        throw new ValidationError(`Channel with ID "${channelId}" could not be found.`);
      }
      return null;
    }
  }

  getAttachment(_name: string, required = false): Attachment | null {
    const attachment = this.message.attachments.first() ?? null;
    if (!attachment && required) {
      throw new ValidationError('A required file attachment was not provided.');
    }
    return attachment;
  }

  getRawArgs(): readonly string[] {
    return this.rawArgs;
  }
}
