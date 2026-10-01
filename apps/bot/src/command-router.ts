import {
  CommandRouter,
  createCommandOverrideMiddleware,
  createCooldownMiddleware,
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
    // Overrides run first, so a blocked command does not start a cooldown.
    middlewares: [
      createCommandOverrideMiddleware({
        resolve: (guildId, channelId, commandName) =>
          services.commandOverrideService.resolve(guildId, channelId, commandName),
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
