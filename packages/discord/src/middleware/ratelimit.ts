import type { CommandContext } from '../command/types.js';
import type { CommandMiddleware, MiddlewareNext } from './types.js';
import { CommandRateLimitError } from '../errors/index.js';

export interface RateLimitMiddlewareOptions {
  /**
   * Default rate limit parameters applied to commands that do not specify their own in metadata.
   */
  defaultLimit?: { max: number; windowSeconds: number } | undefined;

  /**
   * Predicate allowing specific callers (e.g. bot developers or administrators) to bypass rate limits.
   */
  bypass?: ((ctx: CommandContext) => boolean | Promise<boolean>) | undefined;

  /**
   * Scope of the rate limit: 'user' (default) or 'channel' or 'guild'.
   */
  scope?: 'user' | 'channel' | 'guild' | undefined;
}

/**
 * Creates Token Bucket / Sliding-Window Rate Limit Middleware.
 * Limits the number of invocations within a rolling window of seconds.
 */
export function createRateLimitMiddleware(
  options: RateLimitMiddlewareOptions = {},
): CommandMiddleware {
  // Key -> array of epoch millisecond timestamps
  const store = new Map<string, number[]>();

  const sweep = (): void => {
    const now = Date.now();
    for (const [key, timestamps] of store.entries()) {
      const valid = timestamps.filter((ts) => ts > now - 3600_000); // retain max 1hr
      if (valid.length === 0) {
        store.delete(key);
      } else {
        store.set(key, valid);
      }
    }
  };

  return async (ctx: CommandContext, next: MiddlewareNext): Promise<void> => {
    if (!ctx.command) {
      await next();
      return;
    }

    const config = ctx.command.metadata.rateLimit ?? options.defaultLimit;
    if (!config || config.max <= 0 || config.windowSeconds <= 0) {
      await next();
      return;
    }

    if (options.bypass && (await options.bypass(ctx))) {
      await next();
      return;
    }

    let scopeId: string;
    switch (options.scope) {
      case 'channel':
        scopeId = ctx.channelId;
        break;
      case 'guild':
        scopeId = ctx.guildId ?? ctx.user.id;
        break;
      case 'user':
      default:
        scopeId = ctx.user.id;
        break;
    }

    const key = `${ctx.command.metadata.name}:${scopeId}`;
    const now = Date.now();
    const windowMs = config.windowSeconds * 1000;
    const windowStart = now - windowMs;

    const timestamps = (store.get(key) ?? []).filter((ts) => ts > windowStart);

    if (timestamps.length >= config.max) {
      const oldest = timestamps[0]!;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      throw new CommandRateLimitError(`Rate limit exceeded. Try again in ${retryAfterSeconds}s.`, {
        retryAfterSeconds,
      });
    }

    timestamps.push(now);
    store.set(key, timestamps);

    if (store.size > 1000) {
      sweep();
    }

    await next();
  };
}
