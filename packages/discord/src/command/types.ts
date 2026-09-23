import type {
  AutocompleteInteraction,
  Channel,
  ChatInputCommandInteraction,
  Client,
  Guild,
  GuildMember,
  Message,
  MessageCreateOptions,
  MessagePayload,
  MessageReplyOptions,
  InteractionReplyOptions,
  InteractionResponse,
  TextBasedChannel,
  User,
  InteractionEditReplyOptions,
  Attachment,
} from 'discord.js';
import type { CommandMiddleware } from '../middleware/types.js';
/**
 * Standard default fallback command prefix across the entire bot system.
 * Preserves 100% parity with legacy Ririko 1.4.0 and database schema defaults.
 */
export const DEFAULT_COMMAND_PREFIX = '!';

export const CommandCategory = {
  AI: 'ai',
  MUSIC: 'music',
  MODERATION: 'moderation',
  TCG: 'tcg',
  ANIME: 'anime',
  ECONOMY: 'economy',
  UTILITY: 'utility',
  STREAMS: 'streams',
  GAMES: 'games',
  GENERAL: 'general',
  ADMIN: 'admin',
  REACTIONS: 'reactions',
  MEMES: 'memes',
} as const;

export type CommandCategory = (typeof CommandCategory)[keyof typeof CommandCategory];

export type CommandOptionType =
  'STRING' | 'INTEGER' | 'NUMBER' | 'BOOLEAN' | 'USER' | 'CHANNEL' | 'ROLE' | 'ATTACHMENT';

export interface CommandChoice {
  name: string;
  value: string | number;
}

export interface CommandOptionDefinition {
  name: string;
  description: string;
  type: CommandOptionType;
  required?: boolean | undefined;
  choices?: CommandChoice[] | undefined;
  /**
   * Enables Discord's dynamic autocomplete for this option (e.g. for STRING options with
   * more possible values than the 25-choice REST limit allows). Mutually exclusive with
   * `choices` — see `buildCommandPayload` in rest/sync.ts for how a conflict is resolved.
   */
  autocomplete?: boolean | undefined;
  minValue?: number | undefined;
  maxValue?: number | undefined;
  minLength?: number | undefined;
  maxLength?: number | undefined;
}

export interface CommandMetadata {
  name: string;
  category: CommandCategory;
  description: string;
  aliases?: string[] | undefined;
  slashEnabled?: boolean | undefined;
  prefixEnabled?: boolean | undefined;
  userPermissions?: bigint[] | undefined;
  botPermissions?: bigint[] | undefined;
  cooldownSeconds?: number | undefined;
  rateLimit?: { max: number; windowSeconds: number } | undefined;
  usage?: string | undefined;
  examples?: string[] | undefined;
  isOwnerOnly?: boolean | undefined;
  isGuildOnly?: boolean | undefined;
  isHidden?: boolean | undefined;
  middlewares?: readonly CommandMiddleware[] | undefined;
  options?: CommandOptionDefinition[] | undefined;
}

export interface ReplyOptions {
  content?: string | undefined;
  embeds?: unknown[] | undefined;
  components?: unknown[] | undefined;
  ephemeral?: boolean | undefined;
  files?: unknown[] | undefined;
}

export interface ICommandOptionsResolver {
  getString(name: string, required?: boolean): string | null;
  getInteger(name: string, required?: boolean): number | null;
  getNumber(name: string, required?: boolean): number | null;
  getBoolean(name: string, required?: boolean): boolean | null;
  getUser(name: string, required?: boolean): Promise<User | null>;
  getMember(name: string, required?: boolean): Promise<GuildMember | null>;
  getChannel(name: string, required?: boolean): Promise<Channel | null>;
  getAttachment(name: string, required?: boolean): Attachment | null;
  getRawArgs(): readonly string[];
}

export interface CommandContext {
  readonly source: 'slash' | 'prefix';
  readonly id: string;
  readonly client: Client;
  readonly guild: Guild | null;
  readonly guildId: string | null;
  readonly channel: TextBasedChannel | null;
  readonly channelId: string;
  readonly user: User;
  readonly member: GuildMember | null;
  readonly commandName: string;
  /**
   * The lowercased name the user actually typed to invoke this command — the alias or the
   * primary name. `commandName` always holds the command's canonical primary name, regardless
   * of which alias was used.
   */
  readonly invokedName: string;
  readonly invokedPrefix: string;
  readonly options: ICommandOptionsResolver;
  readonly command?: Command | undefined;
  readonly isReplied: boolean;
  readonly isDeferred: boolean;

  /**
   * Reference to the underlying Discord interaction or message.
   */
  readonly raw: ChatInputCommandInteraction | Message;

  reply(
    options: string | MessagePayload | InteractionReplyOptions | MessageReplyOptions,
  ): Promise<Message | InteractionResponse>;
  deferReply(options?: { ephemeral?: boolean }): Promise<void>;
  editReply(options: string | MessagePayload | InteractionEditReplyOptions): Promise<Message>;
  followUp(
    options: string | MessagePayload | InteractionReplyOptions | MessageReplyOptions,
  ): Promise<Message>;
  send(options: string | MessagePayload | MessageCreateOptions): Promise<Message>;
}

export interface Command {
  readonly metadata: CommandMetadata;
  execute(ctx: CommandContext): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}
