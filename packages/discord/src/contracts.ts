import type { ActorContext, GuildSettings, SettingsService } from '@ririko/core';

export type ArgumentValue = string | number | boolean;
export type CommandArguments = Readonly<Record<string, ArgumentValue>>;
export type CommandTransport = 'prefix' | 'slash' | 'context';
export type ContextMenuType = 'user' | 'message';

export interface CommandOption {
  name: string;
  description: string;
  type: 'string' | 'integer' | 'boolean' | 'user' | 'channel' | 'role';
  required?: boolean;
  min?: number;
  max?: number;
  choices?: readonly { name: string; value: ArgumentValue }[];
}

export interface CommandMetadata {
  name: string;
  aliases?: readonly string[];
  description: string;
  category: string;
  module: string;
  options?: readonly CommandOption[];
  guildOnly?: boolean;
  hidden?: boolean;
  ownerOnly?: boolean;
  defaultEphemeral?: boolean;
  permissions?: readonly string[];
  botPermissions?: readonly string[];
  cooldownMs?: number;
  examples: { slash: readonly string[]; prefix: readonly string[] };
  contextMenus?: readonly { name: string; type: ContextMenuType }[];
}

export interface CommandInvocation {
  actor: ActorContext;
  transport: CommandTransport;
  name: string;
  args: CommandArguments;
  contextType?: ContextMenuType;
  latencyMs?: number;
}

export interface CommandContext extends CommandInvocation {
  settings: GuildSettings | null;
  command: CommandMetadata;
}

export interface HelpEntry {
  name: string;
  description: string;
  category: string;
  aliases: readonly string[];
  slashExamples: readonly string[];
  prefixExamples: readonly string[];
  permissions: readonly string[];
  botPermissions: readonly string[];
  cooldownMs: number;
}

export interface TextResult {
  kind: 'text';
  content: string;
  ephemeral?: boolean;
}

/** Text is usable by any transport; structured fields support categories and paging. */
export interface HelpResult {
  kind: 'help';
  content: string;
  entries: readonly HelpEntry[];
  categories: readonly string[];
  page: number;
  pageCount: number;
  total: number;
  search: string;
  category: string | null;
}

export interface ErrorResult {
  kind: 'error';
  code: string;
  content: string;
  ephemeral: true;
}

export type CommandResult = TextResult | HelpResult | ErrorResult;

export interface CommandDefinition extends CommandMetadata {
  execute(this: void, context: CommandContext): Promise<CommandResult>;
}

export type CommandSettings = Pick<SettingsService, 'get' | 'setPrefix'>;

export interface HelpQuery {
  actor: ActorContext;
  settings: GuildSettings | null;
  search?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}
