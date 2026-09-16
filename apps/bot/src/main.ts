import {
  createBot,
  getBotInfo,
  createBotServices,
  createEconomyCommands,
  registerMessageListener,
  registerVoiceListener,
} from './index.js';
import {
  CommandRouter,
  createHelpCommand,
  handleHelpInteraction,
  CommandSynchronizer,
  createRestClient,
  CommandCategory,
  type Command,
  type CommandContext,
} from '@ririko/discord';

/**
 * Main application entrypoint for Ririko AI Discord Bot.
 */
export async function main(): Promise<void> {
  const token = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID || process.env.DISCORD_APPLICATION_ID;
  const prefix = process.env.DEFAULT_PREFIX || '!';

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

  // 2. Initialize Dual-Dispatch Command Router
  const router = new CommandRouter(undefined, {
    defaultPrefix: prefix,
    mentionPrefix: true,
    onError: (ctx, err) => {
      console.error(`[Command:${ctx.commandName}] Execution error:`, err);
    },
  });

  // 3. Register standard test & diagnostic commands
  const pingCommand: Command = {
    metadata: {
      name: 'ping',
      category: CommandCategory.GENERAL,
      description: 'Check bot latency, heartbeat, and gateway connection health',
      aliases: ['p', 'latency'],
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
  const helpCommand = createHelpCommand(router.registry);
  router.registry.register(helpCommand);

  // 5. Initialize Domain Services and Register Economy Commands
  console.log('• Initializing bot repositories and domain services...');
  const services = await createBotServices();
  const economyCommands = createEconomyCommands(services);
  for (const cmd of economyCommands) {
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

  // Register Gateway message & voice event listeners
  registerMessageListener(bot.client, services);
  registerVoiceListener(bot.client, services);

  // Bind interactive Help Center UI components (select menus, buttons)
  bot.client.on('interactionCreate', async (interaction) => {
    try {
      await handleHelpInteraction(interaction, router.registry);
    } catch (err) {
      console.error('Unhandled error in help component interaction:', err);
    }
  });

  // 6. Graceful Shutdown Handlers
  let isShuttingDown = false;
  const handleShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[Bot] Received ${signal}. Shutting down gateway connection...`);
    try {
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

  // 7. Track Gateway State Transitions
  bot.gateway.on('stateChange', (event) => {
    console.log(
      `[Gateway] State changed: ${event.from} -> ${event.to}${event.reason ? ` (${event.reason})` : ''}`,
    );
    if (event.to === 'READY') {
      console.log(`✨ Logged in as: ${bot.client.user?.tag} (ID: ${bot.client.user?.id})`);
      console.log(`✨ Ready to process slash commands and prefix '${prefix}' messages!\n`);
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
