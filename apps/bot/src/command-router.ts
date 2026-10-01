import {
  CommandCategory,
  CommandRouter,
  createCommandOverrideMiddleware,
  createCooldownMiddleware,
  createMaintenanceMiddleware,
  createModuleToggleMiddleware,
  createPermissionMiddleware,
  createRateLimitMiddleware,
  isRateLimitBypassed,
  overrideChannelId,
  type HelpOptions,
} from '@ririko/discord';
import type { BotServices } from './services.js';

/**
 * The bot's dual-dispatch (slash and prefix) command router: per-guild prefixes from guild
 * settings, command usage counters, then command overrides and cooldowns.
 */
export function createCommandRouter(services: BotServices, defaultPrefix: string): CommandRouter {
  return new CommandRouter(undefined, {
    defaultPrefix,
    mentionPrefix: true,
    resolvePrefix: async (message) => {
      if (!message.guildId) return defaultPrefix;
      return services.guildSettingsService.getPrefix(message.guildId, defaultPrefix);
    },
    onError: (ctx, err) => {
      console.error(`[Command:${ctx.commandName}] Execution error:`, err);
    },
    onCommandRun: (ctx) => services.commandUsageRecorder.record(ctx.guildId, ctx.commandName),
    // Middlewares execute in sequence:
    // 1. Maintenance: blocks non-developer commands bot-wide during maintenance
    // 2. Module Toggle: verifies whether the command's parent category/module is enabled
    // 3. Overrides: guild and channel overrides from dashboard/settings
    // 4. Permission: evaluates guildOnly, ownerOnly, userPermissions, botPermissions
    // 5. Rate Limit: sliding-window spam protection with owner & admin bypass
    // 6. Cooldown: per-user command cooldowns
    middlewares: [
      createMaintenanceMiddleware({
        isMaintenanceEnabled: () => services.maintenanceService.isEnabled(),
        ownerIds: services.botOwnerIds,
        isOwner: (userId) => services.botOwnerIds.includes(userId),
        maintenanceMessage: () => services.maintenanceService.getReason(),
      }),
      createModuleToggleMiddleware({
        isModuleEnabled: (guildId, category) =>
          services.moduleToggleService.isModuleEnabled(guildId, category),
        exemptCategories: [CommandCategory.GENERAL, CommandCategory.ADMIN, CommandCategory.UTILITY],
        canBypass: (ctx) => services.botOwnerIds.includes(ctx.user.id),
      }),
      createCommandOverrideMiddleware({
        resolve: (guildId, channelId, commandName) =>
          services.commandOverrideService.resolve(guildId, channelId, commandName),
      }),
      createPermissionMiddleware({
        ownerIds: services.botOwnerIds,
        isOwner: (userId) => services.botOwnerIds.includes(userId),
      }),
      createRateLimitMiddleware({
        defaultLimit: { max: 10, windowSeconds: 10 },
        bypass: (ctx) => isRateLimitBypassed(ctx, services.botOwnerIds),
        sweepIntervalMs: 60_000,
      }),
      createCooldownMiddleware({
        getCooldownSeconds: async (ctx) => {
          if (!ctx.guildId || !ctx.command) return undefined;
          const override = await services.commandOverrideService.resolve(
            ctx.guildId,
            overrideChannelId(ctx),
            ctx.command.metadata.name,
          );
          return override?.cooldownSeconds ?? undefined;
        },
      }),
    ],
  });
}

/** Help center options: each guild's custom prefix, or the default one. */
export function createHelpOptions(services: BotServices, defaultPrefix: string): HelpOptions {
  return {
    defaultPrefix,
    resolvePrefix: async (guildId) => {
      if (!guildId) return defaultPrefix;
      return services.guildSettingsService.getPrefix(guildId, defaultPrefix);
    },
  };
}
