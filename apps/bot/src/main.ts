import {
  createDatabaseClient,
  databaseConfigFromEnv,
  ensureAdventureSchema,
  ensureCardSerialSchema,
  ensurePostgresSchema,
  ensureTextIdColumns,
} from '@ririko/database';
import {
  createBot,
  getBotInfo,
  createBotServices,
  registerMessageListener,
  registerVoiceListener,
  registerMusicVoiceListener,
  trackCurrentVoiceMembers,
  registerMemberListener,
  registerReactionListener,
} from './index.js';
import { syncCommandCatalog } from './command-catalog.js';
import { createCommandRouter, createHelpOptions } from './command-router.js';
import { createCommandControllers, registerBotCommands } from './command-set.js';
import { registerGuildJoinCommandSync, syncCommandsOnStartup } from './command-sync.js';
import { registerComponentInteractions } from './component-interactions.js';
import { healthPort, startHealthServer } from './health.js';
import { describeLegacyLayout, findLegacyLayout } from './legacy-layout.js';
import { runLegacyUpgrade } from './legacy-upgrade.js';
import { applyLegacyAliases } from '@ririko/core';
import { CommandSynchronizer, createRestClient, DEFAULT_COMMAND_PREFIX } from '@ririko/discord';

/**
 * Main application entrypoint for Ririko AI Discord Bot.
 */
export async function main(): Promise<void> {
  // 1.4.0 variable names, for the code below and the services that read process.env directly.
  Object.assign(process.env, applyLegacyAliases({ ...process.env }));
  // Refuse a 1.4.0 compose layout before anything opens or creates a file.
  const legacyLayout = findLegacyLayout();
  if (legacyLayout.length > 0) {
    for (const line of describeLegacyLayout(legacyLayout)) console.error(line);
    process.exit(1);
  }

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

  // 2. Initialize Domain Services and Repositories. An empty Postgres database gets the 2.0
  // schema, then a mounted 1.4.0 database is migrated once, before the services seed defaults.
  const db = await createDatabaseClient(databaseConfigFromEnv());
  // Probes answer from here on; /ready waits for the rest of startup and the gateway.
  let started = false;
  const port = healthPort();
  const health =
    port > 0
      ? startHealthServer(port, {
          version: info.version,
          ping: () => db.ping(),
          gateway: () => ({
            state: bot.gateway.state,
            pingMs: bot.client.ws.ping >= 0 ? Math.round(bot.client.ws.ping) : null,
          }),
          started: () => started,
        })
      : null;
  if (await ensurePostgresSchema(db)) console.log('• Created the PostgreSQL schema.');
  // Databases from before BUG-0038 hold uuid id columns; the ids SQLite holds are text.
  const textIds = await ensureTextIdColumns(db);
  if (textIds.length > 0) console.log(`• Changed ${textIds.length} PostgreSQL id columns to text.`);
  await runLegacyUpgrade(db);
  console.log('• Initializing bot repositories and domain services...');
  const services = await createBotServices(db, bot.client);
  // Upgrade gameplay storage before any gateway events or commands can run.
  await ensureAdventureSchema(services.db);
  await services.adventureEngine.assertCompatibleSessions();
  await ensureCardSerialSchema(services.db);

  // 3. Initialize Dual-Dispatch Command Router with in-memory cached dynamic prefix resolution
  const router = createCommandRouter(services, prefix);

  // 4. Register every command (the same set `ririko commands:sync` registers with Discord)
  const helpOptions = createHelpOptions(services, prefix);
  const controllers = createCommandControllers(bot.client, services, prefix);
  const { musicController, aiController, adventureController } = controllers;
  registerBotCommands(router.registry, {
    services,
    controllers,
    helpOptions,
    prefix,
    version: info.version,
  });

  // Music settings saved on the dashboard or with `ririko guild:config`.
  services.eventBus.on('guild:configChanged', ({ guildId, module }) => {
    if (module !== 'music') return;
    services.musicPlayer.forgetGuildSettings(guildId);
    // Posts the controller in a newly chosen music channel (the row has no message yet).
    void musicController.updateController(guildId);
  });

  // AI settings saved on the dashboard or with `ririko guild:config` (the channel is cached).
  services.eventBus.on('guild:configChanged', ({ guildId, module }) => {
    if (module === 'ai') aiController.invalidateChannelCache(guildId);
  });

  console.log(
    `✓ Registered ${router.registry.size} commands: ${router.registry
      .getAll()
      .map((c) => c.metadata.name)
      .join(', ')}`,
  );
  await syncCommandCatalog(router.registry.getAll(), services.commandCatalogRepo);

  // 6. Bind Gateway Interaction & Message Listeners
  router.bindClient(bot.client);

  // Register Gateway message, voice & member event listeners
  registerMessageListener(bot.client, services, musicController, aiController);
  registerVoiceListener(bot.client, services);
  registerMusicVoiceListener(bot.client, services);
  registerMemberListener(bot.client, services);
  registerReactionListener(bot.client, services);

  // Bind interactive Help Center UI components, Music Controller buttons, Giveaway buttons, and Role components
  registerComponentInteractions(bot.client, {
    services,
    controllers,
    registry: router.registry,
    helpOptions,
  });

  // Post every new moderation case to the guild's log channel. Subscribed once here, not on
  // READY, because READY fires again after each reconnect.
  const stopCaseLog = services.moderationLogService.startListening(bot.client);
  started = true;

  // 6. Graceful Shutdown Handlers
  let isShuttingDown = false;
  const handleShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[Bot] Received ${signal}. Shutting down gateway connection...`);
    try {
      adventureController.stop();
      services.streamWatcher.stop();
      services.freeGamesEngine.stop();
      services.giveawayEngine.stop();
      services.voiceRewardService?.stop();
      services.guildConfigWatcher.stop();
      services.botStatusReporter?.stop();
      await services.commandUsageRecorder.stop().catch((err: unknown) => {
        console.error('[CommandUsageRecorder] Failed to write command usage on shutdown:', err);
      });
      stopCaseLog?.();
      health?.close();
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
      adventureController.start(bot.client);
      services.streamWatcher.start();
      services.freeGamesEngine.start();
      services.giveawayEngine.start();
      trackCurrentVoiceMembers(bot.client, services);
      services.voiceRewardService?.start();
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

  // 8. Register commands with Discord: every server the bot joins gets the per-server
  // commands; SYNC_COMMANDS=true also re-registers everything now (`ririko commands:sync`
  // does the same without a restart).
  if (clientId) {
    const rest = createRestClient(token);
    const synchronizer = new CommandSynchronizer(rest, router.registry);
    registerGuildJoinCommandSync(bot.client, synchronizer, clientId);
    if (process.env.SYNC_COMMANDS === 'true') {
      console.log('[REST] Registering commands with Discord...');
      await syncCommandsOnStartup({
        sync: synchronizer,
        rest,
        applicationId: clientId,
        devGuildId: process.env.DISCORD_DEV_GUILD_ID || undefined,
      });
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
