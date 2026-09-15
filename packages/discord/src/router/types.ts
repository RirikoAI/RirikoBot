import type { Message } from 'discord.js';
import type { CommandContext } from '../command/types.js';

export type PrefixResolver = (message: Message) => string | Promise<string>;

export interface CommandRouterOptions {
  defaultPrefix?: string | undefined;
  resolvePrefix?: PrefixResolver | undefined;
  mentionPrefix?: boolean | undefined;
  onError?: ((ctx: CommandContext, error: Error) => void | Promise<void>) | undefined;
}

export type CommandExecutionHook = (ctx: CommandContext) => void | Promise<void>;
export type CommandErrorHook = (ctx: CommandContext, error: Error) => void | Promise<void>;
