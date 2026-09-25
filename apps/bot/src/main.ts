import {
  createBot,
  getBotInfo,
  createBotServices,
  createEconomyCommands,
  createMusicCommands,
  createSetupMusicCommand,
  createAiCommands,
  createModerationCommands,
  createStreamCommands,
  createFreeGamesCommand,
  createGiveawayCommands,
  createAutoVoiceCommands,
  createGamesCommands,
  createCardCommand,
  createLoadoutCommand,
  createCraftCommand,
  createCardsCommand,
  createGameCommand,
  createItemCommand,
  createDungeonCommand,
  createTradeCommand,
  createMarketCommand,
  createGuildCommand,
  createAchievementCommand,
  createTcgAdminCommand,
  createTcgInfoCommand,
  createRoleCommands,
  createAnimeCommands,
  createReactionCommands,
  createMemeCommands,
  createImageCommands,
  handleImagineButtonInteraction,
  createReminderCommand,
  createUtilityCommands,
  handleGiveawayButtonInteraction,
  MusicEmbedController,
  AiChatController,
  registerMessageListener,
  registerVoiceListener,
  registerMemberListener,
  registerReactionListener,
} from './index.js';
import {
  CommandRouter,
  createHelpCommand,
  handleHelpInteraction,
  type HelpOptions,
  CommandSynchronizer,
  createRestClient,
  CommandCategory,
  DEFAULT_COMMAND_PREFIX,
  type Command,
  type CommandContext,
} from '@ririko/discord';

/**
 * Main application entrypoint for Ririko AI Discord Bot.
 */
export async function main(): Promise<void> {
  const token = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID || process.env.DISCORD_APPLICATION_ID;
  const prefix = process.env.DEFAULT_PREFIX || DEFAULT_COMMAND_PREFIX;

  if (!token) {
    console.error('✖ Error: DISCORD_TOKEN is not configured in environment or .env file.');
    console.error('  Please check your .env file or run: pnpm ririko doctor');
    process.exit(1);
  }

  const info = getBotInfo();
  console.log(`\n🤖 Starting Ririko AI Bot v${info.version}...`);
  console.log(`• Default Prefix: ${prefix}`);
  console.log(`• Node Environment: ${process.env.NODE_ENV || 'development'}`);

  // 1. Initialize Bot & Gateway
  const bot = createBot();

  // 2. Initialize Domain Services and Repositories
  console.log('• Initializing bot repositories and domain services...');
  const services = await createBotServices(undefined, bot.client);

  // 3. Initialize Dual-Dispatch Command Router with in-memory cached dynamic prefix resolution
  const router = new CommandRouter(undefined, {
    defaultPrefix: prefix,
    mentionPrefix: true,
    resolvePrefix: async (message) => {
      if (!message.guildId) return prefix;
      return services.guildSettingsService.getPrefix(message.guildId, prefix);
    },
    onError: (ctx, err) => {
      console.error(`[Command:${ctx.commandName}] Execution error:`, err);
    },
    onCommandRun: (ctx) => services.commandUsageRecorder.record(ctx.guildId, ctx.commandName),
  });

  // 3. Register standard test & diagnostic commands
  const pingCommand: Command = {
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
        content: `🏓 **Pong!**\n• Gateway Latency: \`${latency}\`\n• Execution Latency: \`${Date.now() - sent}ms\`\n• Bot Version: \`v${info.version}\``,
      });
    },
  };

  router.registry.register(pingCommand);

  // 4. Register Interactive Help Center (/help, !help, !h, !commands)
  const helpOptions: HelpOptions = {
    defaultPrefix: prefix,
    resolvePrefix: async (guildId) => {
      if (!guildId) return prefix;
      return services.guildSettingsService.getPrefix(guildId, prefix);
    },
  };
  const helpCommand = createHelpCommand(router.registry, helpOptions);
  router.registry.register(helpCommand);

  // 5. Register Economy Commands
  const economyCommands = createEconomyCommands(services);
  for (const cmd of economyCommands) {
    router.registry.register(cmd);
  }

  const musicController = new MusicEmbedController(bot.client, services);

  const musicCommands = createMusicCommands(services, musicController);
  for (const cmd of musicCommands) {
    router.registry.register(cmd);
  }

  const setupMusicCommand = createSetupMusicCommand(services, musicController);
  router.registry.register(setupMusicCommand);

  const aiController = new AiChatController(bot.client, services, {
    defaultPrefix: prefix,
    musicController,
  });
  const aiCommands = createAiCommands(services, aiController);
  for (const cmd of aiCommands) {
    router.registry.register(cmd);
  }

  const moderationCommands = createModerationCommands(services);
  for (const cmd of moderationCommands) {
    router.registry.register(cmd);
  }

  const streamCommands = createStreamCommands(services);
  for (const cmd of streamCommands) {
    router.registry.register(cmd);
  }

  const freeGamesCommand = createFreeGamesCommand(services);
  router.registry.register(freeGamesCommand);

  const giveawayCommands = createGiveawayCommands(services);
  for (const cmd of giveawayCommands) {
    router.registry.register(cmd);
  }

  const autoVoiceCommands = createAutoVoiceCommands(services);
  for (const cmd of autoVoiceCommands) {
    router.registry.register(cmd);
  }

  const gamesCommands = createGamesCommands(services);
  for (const cmd of gamesCommands) {
    router.registry.register(cmd);
  }

  // Waifu TCG & Equipment Commands
  router.registry.register(createCardCommand(services));
  router.registry.register(createCardsCommand(services));
  router.registry.register(createGameCommand(services));
  router.registry.register(createItemCommand(services));
  router.registry.register(createCraftCommand(services));
  router.registry.register(createLoadoutCommand(services));
  router.registry.register(createDungeonCommand(services));
  router.registry.register(createTradeCommand(services));
  router.registry.register(createMarketCommand(services));
  router.registry.register(createGuildCommand(services));
  router.registry.register(createAchievementCommand(services));
  router.registry.register(createTcgAdminCommand(services));
  router.registry.register(createTcgInfoCommand(services));

  const roleCommands = createRoleCommands(services);
  for (const cmd of roleCommands) {
    router.registry.register(cmd);
  }

  for (const cmd of createAnimeCommands(services)) {
    router.registry.register(cmd);
  }

  for (const cmd of createReactionCommands(services)) {
    router.registry.register(cmd);
  }

  for (const cmd of createMemeCommands(services)) {
    router.registry.register(cmd);
  }

  for (const cmd of createImageCommands(services)) {
    router.registry.register(cmd);
  }
  router.registry.register(createReminderCommand(services));

  for (const cmd of createUtilityCommands(services)) {
    router.registry.register(cmd);
  }

  console.log(
    `✓ Registered ${router.registry.size} commands: ${router.registry
      .getAll()
      .map((c) => c.metadata.name)
      .join(', ')}`,
  );

  // 6. Bind Gateway Interaction & Message Listeners
  router.bindClient(bot.client);

  // Register Gateway message, voice & member event listeners
  registerMessageListener(bot.client, services, musicController, aiController);
  registerVoiceListener(bot.client, services);
  registerMemberListener(bot.client, services);
  registerReactionListener(bot.client, services);

  // Bind interactive Help Center UI components, Music Controller buttons, Giveaway buttons, and Role components
  bot.client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isButton()) {
        if (interaction.customId.startsWith('music_')) {
          await musicController.handleButtonInteraction(interaction);
          return;
        }
        if (interaction.customId.startsWith('imagine:')) {
          await handleImagineButtonInteraction(interaction, services);
          return;
        }
        if (interaction.customId.startsWith('giveaway:enter:')) {
          await handleGiveawayButtonInteraction(interaction, services);
          return;
        }
        if (interaction.customId.startsWith('rr:btn:')) {
          await services.reactionRoleService.handleButtonInteraction(interaction);
          return;
        }
        if (interaction.customId.startsWith('verify:btn:')) {
          const guild = interaction.guild;
          const member = interaction.member;
          if (guild && member) {
            const res = await services.autoRoleService.handleVerification(guild, member as any);
            await interaction.reply({ content: res.message, ephemeral: true });
          }
          return;
        }
      }

      if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith('rr:select:')) {
          await services.reactionRoleService.handleSelectMenuInteraction(interaction);
          return;
        }
      }

      await handleHelpInteraction(interaction, router.registry, helpOptions);
    } catch (err) {
      console.error('Unhandled error in component interaction:', err);
    }
  });

  // Post every new moderation case to the guild's log channel. Subscribed once here, not on
  // READY, because READY fires again after each reconnect.
  const stopCaseLog = services.moderationLogService.startListening(bot.client);

  // 6. Graceful Shutdown Handlers
  let isShuttingDown = false;
  const handleShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[Bot] Received ${signal}. Shutting down gateway connection...`);
    try {
      services.streamWatcher.stop();
      services.freeGamesEngine.stop();
      services.giveawayEngine.stop();
      services.guildConfigWatcher.stop();
      services.botStatusReporter?.stop();
      await services.commandUsageRecorder.stop().catch((err: unknown) => {
        console.error('[CommandUsageRecorder] Failed to write command usage on shutdown:', err);
      });
      stopCaseLog?.();
      services.autoRoleService.stopSweeper();
      await bot.gateway.destroy();
      console.log('✓ Bot gateway cleanly disconnected. Goodbye!');
    } catch (err) {
      console.error('Error during shutdown:', err);
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => void handleShutdown('SIGINT'));
  process.on('SIGTERM', () => void handleShutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    console.error('[UnhandledRejection]', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[UncaughtException]', err);
  });

  // Forward raw Discord Gateway payloads for voice state & server updates to Lavalink
  bot.client.on('raw', (data: unknown) => {
    services.musicPlayer.sendRawData(data);
  });

  // Auto Voice Channel dynamic creation & cleanup
  bot.client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
      await services.autoVoiceService.handleVoiceStateUpdate(oldState, newState);
    } catch (err) {
      console.error('[AutoVoice] Error handling voice state update:', err);
    }
  });
  bot.client.on('channelDelete', async (channel) => {
    try {
      await services.autoVoiceService.handleChannelDelete(channel.id);
    } catch (err) {
      console.error('[AutoVoice] Error forgetting deleted channel:', err);
    }
  });

  // 7. Track Gateway State Transitions
  bot.gateway.on('stateChange', async (event) => {
    console.log(
      `[Gateway] State changed: ${event.from} -> ${event.to}${event.reason ? ` (${event.reason})` : ''}`,
    );
    if (event.to === 'READY') {
      console.log(`✨ Logged in as: ${bot.client.user?.tag} (ID: ${bot.client.user?.id})`);
      console.log(`✨ Ready to process slash commands and prefix '${prefix}' messages!\n`);

      // Start background watcher, announcer, giveaway & autorole engines
      services.streamWatcher.start();
      services.freeGamesEngine.start();
      services.giveawayEngine.start();
      services.autoRoleService.startSweeper(bot.client);
      services.reminderScheduler?.start();
      services.guildConfigWatcher.start();
      services.commandUsageRecorder.start();
      services.botStatusReporter?.start();
      console.log(
        '📡 Stream Watcher, Free Games Announcer, Giveaways, AutoRole, Reminder & Bot Status engines active!',
      );

      // Clean up orphaned dynamic voice channels across guilds
      for (const [, guild] of bot.client.guilds.cache) {
        services.autoVoiceService.cleanupOrphans(guild).catch((err: unknown) => {
          console.error(`[AutoVoice] Error cleaning orphans for guild ${guild.id}:`, err);
        });
      }

      // Initialize Lavalink connection with client credentials & shard router
      if (bot.client.user) {
        services.musicPlayer.setSendToShard((guildId, payload) => {
          const guild = bot.client.guilds.cache.get(guildId);
          if (guild) {
            guild.shard.send(payload as any);
          }
        });
        await services.musicPlayer.initLavalink({
          id: bot.client.user.id,
          username: bot.client.user.username,
        });
      }
    }
  });

  bot.gateway.on('error', (err) => {
    console.error('✖ Gateway error occurred:', err.message);
  });

  // 8. (Optional) Sync slash commands with Discord REST API
  if (process.env.SYNC_COMMANDS === 'true' && clientId) {
    try {
      console.log('[REST] Synchronizing slash commands with Discord REST API...');
      const rest = createRestClient(token);
      const synchronizer = new CommandSynchronizer(rest, router.registry);

      if (process.env.DISCORD_DEV_GUILD_ID) {
        const res = await synchronizer.syncGuild(clientId, process.env.DISCORD_DEV_GUILD_ID);
        console.log(
          `✓ Synchronized ${res.registeredCount} slash commands to dev guild (${process.env.DISCORD_DEV_GUILD_ID}): [${res.commandNames.join(', ')}]`,
        );
      } else {
        const res = await synchronizer.syncGlobal(clientId);
        console.log(
          `✓ Synchronized ${res.registeredCount} global slash commands: [${res.commandNames.join(', ')}]`,
        );
      }
    } catch (err) {
      console.error('✖ Failed to synchronize slash commands:', err);
    }
  }

  // 9. Connect to Discord Gateway
  console.log('[Gateway] Initiating connection to Discord Gateway...');
  await bot.gateway.connect(token);
}

// Automatically run main if invoked directly
const isDirectRun =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('main.ts') || process.argv[1].endsWith('main.js'));

if (isDirectRun) {
  main().catch((err) => {
    console.error('✖ Fatal error during bot startup:', err);
    process.exit(1);
  });
}
