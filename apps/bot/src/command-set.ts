import {
  CommandCategory,
  createHelpCommand,
  type Command,
  type CommandContext,
  type CommandRegistry,
  type HelpOptions,
} from '@ririko/discord';
import type { Client } from 'discord.js';
import { createTranslateCommand } from './commands/ai/translate.command.js';
import {
  AdventureController,
  AiChatController,
  MusicEmbedController,
  createAchievementCommand,
  createAiCommands,
  createAnimeCommands,
  createAutoVoiceCommands,
  createCardCommand,
  createCardsCommand,
  createCraftCommand,
  createDungeonCommand,
  createEconomyCommands,
  createFreeGamesCommand,
  createGameCommand,
  createGamesCommands,
  createGiveawayCommands,
  createGuildCommand,
  createImageCommands,
  createItemCommand,
  createLoadoutCommand,
  createMarketCommand,
  createMemeCommands,
  createModerationCommands,
  createMusicCommands,
  createReactionCommands,
  createReminderCommand,
  createRoleCommands,
  createSetupMusicCommand,
  createStreamCommands,
  createTcgAdminCommand,
  createTcgInfoCommand,
  createTradeCommand,
  createUtilityCommands,
} from './index.js';
import type { BotServices } from './services.js';

export interface CommandControllers {
  musicController: MusicEmbedController;
  aiController: AiChatController;
  adventureController: AdventureController;
}

/** The stateful controllers that commands and gateway listeners share. */
export function createCommandControllers(
  client: Client,
  services: BotServices,
  defaultPrefix: string,
): CommandControllers {
  const musicController = new MusicEmbedController(client, services);
  return {
    musicController,
    aiController: new AiChatController(client, services, { defaultPrefix, musicController }),
    adventureController: new AdventureController(services),
  };
}

export interface BotCommandSetOptions {
  services: BotServices;
  controllers: CommandControllers;
  helpOptions: HelpOptions;
  /** Prefix shown in `/ping` examples. */
  prefix: string;
  version: string;
}

function createPingCommand(prefix: string, version: string): Command {
  return {
    metadata: {
      name: 'ping',
      category: CommandCategory.GENERAL,
      description: 'Check bot latency, heartbeat, and gateway connection health',
      aliases: ['latency'],
      usage: '/ping',
      examples: ['/ping', `${prefix}ping`],
    },
    async execute(ctx: CommandContext): Promise<void> {
      const sent = Date.now();
      const wsPing = ctx.client.ws.ping;
      const latency = wsPing >= 0 ? `${wsPing}ms` : 'calculating...';

      await ctx.reply({
        content: `🏓 **Pong!**\n• Gateway Latency: \`${latency}\`\n• Execution Latency: \`${Date.now() - sent}ms\`\n• Bot Version: \`v${version}\``,
      });
    },
  };
}

/**
 * Registers every bot command. The bot uses it to route commands; `ririko commands:sync` uses
 * it to build the same slash command payloads without logging in.
 */
export function registerBotCommands(
  registry: CommandRegistry,
  { services, controllers, helpOptions, prefix, version }: BotCommandSetOptions,
): void {
  const { musicController, aiController, adventureController } = controllers;
  const commands: Command[] = [
    createPingCommand(prefix, version),
    createHelpCommand(registry, helpOptions),
    ...createEconomyCommands(services),
    ...createMusicCommands(services, musicController),
    createSetupMusicCommand(services, musicController),
    createTranslateCommand(services),
    ...createAiCommands(services, aiController),
    ...createModerationCommands(services),
    ...createStreamCommands(services),
    createFreeGamesCommand(services),
    ...createGiveawayCommands(services),
    ...createAutoVoiceCommands(services),
    ...createGamesCommands(services, adventureController),
    // Waifu TCG & Equipment
    createCardCommand(services),
    createCardsCommand(services),
    createGameCommand(services),
    createItemCommand(services),
    createCraftCommand(services),
    createLoadoutCommand(services),
    createDungeonCommand(services),
    createTradeCommand(services),
    createMarketCommand(services),
    createGuildCommand(services),
    createAchievementCommand(services),
    createTcgAdminCommand(services),
    createTcgInfoCommand(services),
    ...createRoleCommands(services),
    ...createAnimeCommands(services),
    ...createReactionCommands(services),
    ...createMemeCommands(services),
    ...createImageCommands(services),
    createReminderCommand(services),
    ...createUtilityCommands(services),
  ];
  for (const command of commands) registry.register(command);
}
