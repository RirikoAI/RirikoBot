import type { CommandContext } from '../command/types.js';

/**
 * Next function in the middleware chain.
 * Calling next() invokes the next middleware or the final command execution target.
 */
export type MiddlewareNext = () => Promise<void>;

/**
 * Middleware function signature.
 * Receives the CommandContext and next() runner.
 * The executing Command instance is accessible via `ctx.command`.
 */
export type CommandMiddleware = (ctx: CommandContext, next: MiddlewareNext) => Promise<void>;

export interface MiddlewarePipelineOptions {
  /**
   * Optional hook called when a middleware or downstream handler throws.
   */
  onError?: (ctx: CommandContext, error: Error) => Promise<void> | void;
}
