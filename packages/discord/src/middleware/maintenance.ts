import type { CommandContext } from '../command/types.js';
import type { CommandMiddleware, MiddlewareNext } from './types.js';
import { CommandMaintenanceError } from '../errors/index.js';

export interface MaintenanceMiddlewareOptions {
  /**
   * Predicate or boolean determining whether maintenance mode is currently active.
   */
  isMaintenanceEnabled: () => boolean | Promise<boolean>;

  /**
   * User IDs of bot developers allowed to bypass maintenance mode.
   */
  ownerIds?: readonly string[] | undefined;

  /**
   * Custom evaluator to determine if a user ID is a developer who bypasses maintenance.
   */
  isOwner?: ((userId: string) => boolean | Promise<boolean>) | undefined;

  /**
   * Custom message displayed when a command is blocked by maintenance.
   */
  maintenanceMessage?: string | undefined;
}

/**
 * Creates Maintenance Mode Middleware.
 * Blocks non-developer commands when maintenance mode is active.
 */
export function createMaintenanceMiddleware(
  options: MaintenanceMiddlewareOptions,
): CommandMiddleware {
  const ownerSet = new Set(options.ownerIds ?? []);

  const isUserOwner = async (userId: string): Promise<boolean> => {
    if (ownerSet.has(userId)) {
      return true;
    }
    if (options.isOwner) {
      return await options.isOwner(userId);
    }
    return false;
  };

  return async (ctx: CommandContext, next: MiddlewareNext): Promise<void> => {
    const isEnabled = await options.isMaintenanceEnabled();
    if (!isEnabled) {
      await next();
      return;
    }

    // Check if the user is a developer/owner who bypasses maintenance
    const isOwner = await isUserOwner(ctx.user.id);
    if (isOwner) {
      await next();
      return;
    }

    throw new CommandMaintenanceError(
      options.maintenanceMessage ??
        'Ririko is currently undergoing scheduled maintenance. Please try again later.',
    );
  };
}
