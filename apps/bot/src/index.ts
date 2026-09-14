import { existsSync } from 'node:fs';
import { once } from 'node:events';
import { AppError, SettingsService, createLogger, loadConfig, publicError, requireDiscordCredentials } from '@ririko/core';
import { connectDatabase } from '@ririko/database';
import { createGateway } from './gateway.js';
import { createHealthServer } from './health.js';

async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const config = loadConfig();
  const credentials = requireDiscordCredentials(config);
  const logger = createLogger(config.logLevel);
  const database = await connectDatabase(config.database);
  let shuttingDown = false;
  const gateway = createGateway(config, new SettingsService(database.settings, config.defaultPrefix));
  const client = gateway.client;
  const health = createHealthServer({ isGatewayReady: () => client.isReady(), checkDatabase: () => database.healthCheck(), isShuttingDown: () => shuttingDown });
  let stop: Promise<void> | undefined;

  function shutdown(): Promise<void> {
    stop ??= (async () => {
      shuttingDown = true;
      const results = await Promise.allSettled([
        gateway.close(),
        new Promise<void>((resolve) => {
          if (!health.listening) { resolve(); return; }
          health.close(() => resolve()); health.closeAllConnections();
        }),
      ]);
      // Database cleanup must happen even when Discord shutdown fails.
      await database.close();
      if (results.some((result) => result.status === 'rejected')) throw new AppError('SHUTDOWN', 'A gateway or HTTP resource failed to close.');
      logger.info({ module: 'runtime' }, 'Shutdown complete');
    })();
    return stop;
  }

  try {
    const status = await database.migrationStatus();
    if (status.current !== status.latest) throw new AppError('MIGRATION_REQUIRED', 'Database migrations are pending. Run pnpm ririko migrate before starting the bot.');
    await database.healthCheck();
    health.listen(config.health.port, config.health.host);
    await once(health, 'listening');
    const handleSignal = (): void => { void shutdown().catch(() => { logger.error('Shutdown failed'); process.exitCode = 1; }); };
    process.once('SIGTERM', handleSignal);
    process.once('SIGINT', handleSignal);
    await client.login(credentials.token);
  } catch (error) {
    await shutdown();
    throw error;
  }
}

void main().catch((error: unknown) => { console.error(publicError(error)); process.exitCode = 1; });
