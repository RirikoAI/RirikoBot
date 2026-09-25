import type { Message } from 'discord.js';
import type { CommandContext } from '../command/types.js';
import type { CommandMiddleware } from '../middleware/types.js';

export type PrefixResolver = (message: Message) => string | Promise<string>;

export interface CommandRouterOptions {
  defaultPrefix?: string | undefined;
  resolvePrefix?: PrefixResolver | undefined;
  mentionPrefix?: boolean | undefined;
  middlewares?: CommandMiddleware[] | undefined;
  onError?: ((ctx: CommandContext, error: Error) => void | Promise<void>) | undefined;
  /**
   * Called when a command passes the middleware pipeline, just before it executes. It must not
   * block: it runs on every command. Errors it throws are logged and ignored.
   */
  onCommandRun?: ((ctx: CommandContext) => void) | undefined;
}

export type CommandExecutionHook = (ctx: CommandContext) => void | Promise<void>;
export type CommandErrorHook = (ctx: CommandContext, error: Error) => void | Promise<void>;
