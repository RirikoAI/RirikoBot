import type { CommandContext } from '../command/types.js';
import type { CommandMiddleware, MiddlewareNext } from './types.js';

export interface NoticeMiddlewareOptions {
  /** Whether this user should get the notice now. Only called after the command has run. */
  shouldNotify: (ctx: CommandContext) => boolean | Promise<boolean>;
  /** Sends the notice. When it resolves, the notice counts as delivered. */
  notify: (ctx: CommandContext) => Promise<void>;
  /** Called after a notice was delivered, such as to record that the user saw it. */
  onNotified?: ((ctx: CommandContext) => void | Promise<void>) | undefined;
  /** Reports a failure of the checks above. They never reach the user or stop the command. */
  onError?: ((ctx: CommandContext, error: unknown) => void) | undefined;
}

/**
 * Creates a middleware that shows a one-time notice after a command ran. The command's own reply
 * is never delayed: the notice follows the command. Put it last in the pipeline, so a command that
 * was blocked earlier (maintenance, permissions, cooldown) does not count as an interaction. A
 * command that throws shows no notice. Failures of the notice are reported through `onError` and
 * never fail the command; a notice that was not delivered is tried again on the next command.
 */
export function createNoticeMiddleware(options: NoticeMiddlewareOptions): CommandMiddleware {
  // Users with a notice on its way, so two commands at once do not show it twice.
  const inFlight = new Set<string>();

  return async (ctx: CommandContext, next: MiddlewareNext): Promise<void> => {
    await next();

    if (inFlight.has(ctx.user.id)) return;
    inFlight.add(ctx.user.id);
    try {
      if (!(await options.shouldNotify(ctx))) return;
      await options.notify(ctx);
      await options.onNotified?.(ctx);
    } catch (error) {
      try {
        options.onError?.(ctx, error);
      } catch {
        // A failing error hook must not fail the command that already ran.
      }
    } finally {
      inFlight.delete(ctx.user.id);
    }
  };
}
