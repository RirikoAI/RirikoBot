import { MessageFlags } from 'discord.js';
import type {
  ChatInputCommandInteraction,
  MessageContextMenuCommandInteraction,
  Client,
  Guild,
  GuildMember,
  InteractionReplyOptions,
  InteractionResponse,
  InteractionEditReplyOptions,
  Message,
  MessageCreateOptions,
  MessageEditOptions,
  MessagePayload,
  MessageReplyOptions,
  TextBasedChannel,
  User,
} from 'discord.js';
import type {
  Command,
  CommandContext,
  CommandOptionDefinition,
  ICommandOptionsResolver,
} from './types.js';
import { SlashOptionsResolver, PrefixOptionsResolver } from './options.js';

/**
 * Turns the legacy `ephemeral` option into `flags: MessageFlags.Ephemeral`. discord.js v15
 * drops `ephemeral` from reply options, and v14 prints a deprecation warning for it. Command
 * code keeps writing `ephemeral: true`; this is the one place that converts it for interactions.
 * Strings, payload objects and options without `ephemeral` pass through unchanged.
 */
export function withEphemeralFlag<T>(options: T): T {
  if (typeof options !== 'object' || options === null || !('ephemeral' in options)) {
    return options;
  }
  const { ephemeral, ...rest } = options as Record<string, unknown>;
  if (ephemeral !== true) return rest as T;
  const current = rest['flags'];
  if (current === undefined || current === null) {
    return { ...rest, flags: MessageFlags.Ephemeral } as T;
  }
  if (typeof current === 'number') {
    return { ...rest, flags: current | MessageFlags.Ephemeral } as T;
  }
  const list = Array.isArray(current) ? current : [current];
  return { ...rest, flags: [...list, MessageFlags.Ephemeral] } as T;
}

/**
 * CommandContext implementation wrapping a Discord Slash Command interaction.
 */
class InteractionCommandContext<
  T extends ChatInputCommandInteraction | MessageContextMenuCommandInteraction,
> implements CommandContext {
  public readonly id: string;
  public readonly client: Client;
  public readonly guild: Guild | null;
  public readonly guildId: string | null;
  public readonly channel: TextBasedChannel | null;
  public readonly channelId: string;
  public readonly user: User;
  public readonly member: GuildMember | null;
  public readonly commandName: string;
  public readonly invokedName: string;
  public readonly invokedPrefix: string;
  public readonly options: ICommandOptionsResolver;
  public readonly command?: Command | undefined;
  public readonly raw: T;

  constructor(
    private readonly interaction: T,
    public readonly source: 'slash' | 'context-menu',
    options: ICommandOptionsResolver,
    command?: Command,
  ) {
    this.raw = interaction;
    this.command = command;
    this.id = interaction.id;
    this.client = interaction.client;
    this.guild = interaction.guild;
    this.guildId = interaction.guildId;
    this.channel = interaction.channel;
    this.channelId = interaction.channelId;
    this.user = interaction.user;
    this.member = (interaction.member as GuildMember) ?? null;
    this.commandName = command?.metadata.name ?? interaction.commandName;
    this.invokedName = interaction.commandName.toLowerCase().trim();
    this.invokedPrefix = source === 'slash' ? '/' : '';
    this.options = options;
  }

  public get isReplied(): boolean {
    return this.interaction.replied;
  }

  public get isDeferred(): boolean {
    return this.interaction.deferred;
  }

  public async reply(
    options: string | MessagePayload | InteractionReplyOptions | MessageReplyOptions,
  ): Promise<Message | InteractionResponse> {
    if (this.interaction.deferred || this.interaction.replied) {
      return await this.interaction.followUp(
        withEphemeralFlag(options) as string | MessagePayload | InteractionReplyOptions,
      );
    }
    return await this.interaction.reply(
      withEphemeralFlag(options) as string | MessagePayload | InteractionReplyOptions,
    );
  }

  public async deferReply(options?: { ephemeral?: boolean }): Promise<void> {
    if (!this.interaction.deferred && !this.interaction.replied) {
      await this.interaction.deferReply(withEphemeralFlag(options));
    }
  }

  public async editReply(
    options: string | MessagePayload | InteractionEditReplyOptions,
  ): Promise<Message> {
    return await this.interaction.editReply(options);
  }

  public async followUp(
    options: string | MessagePayload | InteractionReplyOptions | MessageReplyOptions,
  ): Promise<Message> {
    return await this.interaction.followUp(
      withEphemeralFlag(options) as string | MessagePayload | InteractionReplyOptions,
    );
  }

  public async send(options: string | MessagePayload | MessageCreateOptions): Promise<Message> {
    if (!this.channel || !('send' in this.channel)) {
      throw new Error('Cannot send message: Channel is not available.');
    }
    return await (
      this.channel as unknown as {
        send: (opt: typeof options) => Promise<Message>;
      }
    ).send(options);
  }
}

export class SlashCommandContext extends InteractionCommandContext<ChatInputCommandInteraction> {
  constructor(interaction: ChatInputCommandInteraction, command?: Command) {
    super(interaction, 'slash', new SlashOptionsResolver(interaction), command);
  }
}

export class MessageContextMenuCommandContext extends InteractionCommandContext<MessageContextMenuCommandInteraction> {
  constructor(interaction: MessageContextMenuCommandInteraction, command: Command) {
    // Message context menus have a target message but no command arguments.
    const options = new PrefixOptionsResolver(
      interaction.targetMessage,
      [],
      [],
      interaction.client,
    );
    super(interaction, 'context-menu', options, command);
  }
}

/**
 * CommandContext implementation wrapping a Discord text Message.
 */
export class PrefixCommandContext implements CommandContext {
  public readonly source = 'prefix' as const;
  public readonly id: string;
  public readonly client: Client;
  public readonly guild: Guild | null;
  public readonly guildId: string | null;
  public readonly channel: TextBasedChannel | null;
  public readonly channelId: string;
  public readonly user: User;
  public readonly member: GuildMember | null;
  public readonly commandName: string;
  public readonly invokedName: string;
  public readonly invokedPrefix: string;
  public readonly options: ICommandOptionsResolver;
  public readonly command?: Command | undefined;
  public readonly raw: Message;

  private _repliedMessage: Message | null = null;
  private _isDeferred = false;

  constructor(
    private readonly message: Message,
    commandOrName: string | Command,
    invokedPrefix: string,
    rawArgs: string[],
    definitions: CommandOptionDefinition[] = [],
    invokedName?: string | undefined,
  ) {
    this.raw = message;
    this.id = message.id;
    this.client = message.client;
    this.guild = message.guild;
    this.guildId = message.guildId;
    this.channel = message.channel;
    this.channelId = message.channelId;
    this.user = message.author;
    this.member = message.member;

    if (typeof commandOrName === 'string') {
      this.commandName = commandOrName;
      this.command = undefined;
    } else {
      this.command = commandOrName;
      this.commandName = commandOrName.metadata.name;
    }

    // Backward compatible: existing call sites that omit the raw invoked token (alias or
    // primary name the user actually typed) fall back to the resolved command's primary name.
    this.invokedName = (invokedName ?? this.commandName).toLowerCase().trim();

    this.invokedPrefix = invokedPrefix;
    const resolvedDefs =
      definitions.length > 0 ? definitions : (this.command?.metadata.options ?? []);
    this.options = new PrefixOptionsResolver(message, rawArgs, resolvedDefs, message.client);
  }

  public get isReplied(): boolean {
    return this._repliedMessage !== null;
  }

  public get isDeferred(): boolean {
    return this._isDeferred;
  }

  public async reply(
    options: string | MessagePayload | InteractionReplyOptions | MessageReplyOptions,
  ): Promise<Message> {
    // Strip interaction-only options if any
    const payload = this.normalizeMessageOptions(options);
    const sent = await this.message.reply(payload);
    this._repliedMessage = sent;
    return sent;
  }

  public async deferReply(_options?: { ephemeral?: boolean }): Promise<void> {
    this._isDeferred = true;
    if (this.channel && 'sendTyping' in this.channel) {
      await this.channel.sendTyping();
    }
  }

  public async editReply(
    options: string | MessagePayload | InteractionEditReplyOptions,
  ): Promise<Message> {
    if (this._repliedMessage) {
      return await this._repliedMessage.edit(options as unknown as MessageEditOptions);
    }
    return await this.reply(options as unknown as MessageReplyOptions);
  }

  public async followUp(
    options: string | MessagePayload | InteractionReplyOptions | MessageReplyOptions,
  ): Promise<Message> {
    const payload = this.normalizeMessageOptions(options);
    if (!this.channel || !('send' in this.channel)) {
      throw new Error('Cannot follow up: Channel is not available.');
    }
    return await (
      this.channel as unknown as {
        send: (opt: typeof payload) => Promise<Message>;
      }
    ).send(payload);
  }

  public async send(options: string | MessagePayload | MessageCreateOptions): Promise<Message> {
    if (!this.channel || !('send' in this.channel)) {
      throw new Error('Cannot send message: Channel is not available.');
    }
    return await (
      this.channel as unknown as {
        send: (opt: typeof options) => Promise<Message>;
      }
    ).send(options);
  }

  private normalizeMessageOptions(
    options: string | MessagePayload | InteractionReplyOptions | MessageReplyOptions,
  ): MessageReplyOptions {
    if (typeof options === 'string') {
      return { content: options };
    }

    const copy = { ...(options as Record<string, unknown>) };
    delete copy['ephemeral'];
    delete copy['fetchReply'];

    return copy as MessageReplyOptions;
  }
}
