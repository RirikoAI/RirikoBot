import type { CommandContext, CommandCategory } from '../command/types.js';
import type { CommandMiddleware, MiddlewareNext } from './types.js';
import { CommandDisabledError } from '../errors/index.js';

export interface ModuleToggleMiddlewareOptions {
  /**
   * Evaluator checking whether a specific feature module/category is enabled for a guild.
   */
  isModuleEnabled: (guildId: string, category: CommandCategory) => boolean | Promise<boolean>;

  /**
   * Optional set of categories that are always enabled and exempt from module toggling
   * (e.g. general, admin, utility).
   */
  exemptCategories?: readonly CommandCategory[] | undefined;
}

/**
 * Creates Module Toggle Middleware.
 * Verifies that the command's parent category/module is enabled in the current guild.
 */
export function createModuleToggleMiddleware(
  options: ModuleToggleMiddlewareOptions,
): CommandMiddleware {
  const exempt = new Set<CommandCategory>(options.exemptCategories ?? []);

  return async (ctx: CommandContext, next: MiddlewareNext): Promise<void> => {
    // Only applies in guilds with an executing command
    if (!ctx.guildId || !ctx.command) {
      await next();
      return;
    }

    const category = ctx.command.metadata.category;
    if (exempt.has(category)) {
      await next();
      return;
    }

    const isEnabled = await options.isModuleEnabled(ctx.guildId, category);
    if (!isEnabled) {
      throw new CommandDisabledError(
        `The ${category} module is currently disabled in this server.`,
      );
    }

    await next();
  };
}
