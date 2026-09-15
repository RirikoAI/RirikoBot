import type { CommandContext } from '../command/types.js';
import type { CommandMiddleware, MiddlewareNext } from './types.js';
import { CommandCooldownError } from '../errors/index.js';

export interface CooldownMiddlewareOptions {
  /**
   * Predicate allowing specific callers (e.g. bot developers or administrators) to bypass cooldowns.
   */
  bypass?: ((ctx: CommandContext) => boolean | Promise<boolean>) | undefined;

  /**
   * Custom duration override resolver.
   */
  getCooldownSeconds?: ((ctx: CommandContext) => number | undefined) | undefined;

  /**
   * Scope of the cooldown: 'user' (default) or 'channel' or 'guild'.
   */
  scope?: 'user' | 'channel' | 'guild' | undefined;
}

/**
 * Creates Per-User / Scoped Cooldown Middleware.
 * Prevents rapid spamming of commands with configurable expiration windows.
 */
export function createCooldownMiddleware(
  options: CooldownMiddlewareOptions = {},
): CommandMiddleware {
  // Key -> Expiration timestamp (epoch ms)
  const store = new Map<string, number>();

  const sweep = (): void => {
    const now = Date.now();
    for (const [key, expiresAt] of store.entries()) {
      if (expiresAt <= now) {
        store.delete(key);
      }
    }
  };

  return async (ctx: CommandContext, next: MiddlewareNext): Promise<void> => {
    if (!ctx.command) {
      await next();
      return;
    }

    const duration = options.getCooldownSeconds?.(ctx) ?? ctx.command.metadata.cooldownSeconds ?? 0;

    if (duration <= 0) {
      await next();
      return;
    }

    if (options.bypass && (await options.bypass(ctx))) {
      await next();
      return;
    }

    // Determine scope identifier
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
    const expiresAt = store.get(key);

    if (expiresAt && expiresAt > now) {
      const remainingSeconds = Math.max(1, Math.ceil((expiresAt - now) / 1000));
      throw new CommandCooldownError(
        `You must wait ${remainingSeconds}s before using this command again.`,
        { retryAfterSeconds: remainingSeconds },
      );
    }

    // Set cooldown expiration
    store.set(key, now + duration * 1000);

    // Periodically sweep expired entries if cache grows
    if (store.size > 1000) {
      sweep();
    }

    await next();
  };
}
