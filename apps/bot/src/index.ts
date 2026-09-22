import { CORE_VERSION } from '@ririko/core';
import { DB_PACKAGE } from '@ririko/database';
import {
  DISCORD_PACKAGE,
  createDiscordClient,
  GatewayManager,
  type DiscordClientConfig,
} from '@ririko/discord';
import type { Client } from 'discord.js';

export interface BotInstance {
  client: Client;
  gateway: GatewayManager;
}

export function createBot(discordConfig: DiscordClientConfig = {}): BotInstance {
  const client = createDiscordClient(discordConfig);
  const gateway = new GatewayManager(client);

  return {
    client,
    gateway,
  };
}

export function getBotInfo() {
  return {
    version: CORE_VERSION,
    database: DB_PACKAGE,
    discord: DISCORD_PACKAGE,
  };
}

export * from './services.js';
export * from './commands/economy/index.js';
export * from './commands/music/index.js';
export * from './commands/ai/index.js';
export * from './commands/moderation/index.js';
export * from './commands/streams/index.js';
export * from './commands/giveaway/index.js';
export * from './commands/autovoice/index.js';
export * from './commands/games/index.js';
export * from './commands/tcg/index.js';
export * from './commands/roles/index.js';
export * from './commands/anime/index.js';
export * from './commands/reminders/index.js';
export * from './commands/utility/index.js';
export * from './controllers/index.js';
export * from './listeners/index.js';
