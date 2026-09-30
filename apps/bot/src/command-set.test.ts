import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabaseClient, type DatabaseClient } from '@ririko/database';
import {
  COMMAND_LIMITS,
  CommandRegistry,
  CommandSynchronizer,
  countPayloads,
} from '@ririko/discord';
import type { REST } from 'discord.js';
import { createCommandControllers, registerBotCommands } from './command-set.js';
import { createBot } from './index.js';
import { createBotServices } from './services.js';

const GUILD_SCOPED = [
  // Moderation
  'automod',
  'ban',
  'unban',
  'softban',
  'kick',
  'timeout',
  'untimeout',
  'warn',
  'history',
  'note',
  'nick',
  'purge',
  'lock',
  'unlock',
  // Server setup
  'prefix',
  'welcomer',
  'farewell',
  'autorole',
  'temprole',
  'create-reaction-role',
  'reaction-roles',
  'autovoice',
  'setup-music',
  // AI and image configuration
  'aichannel',
  'aipersona',
  'setup-stablediffusion-api',
  'stablediffusion-model',
  // Streams, events and TCG administration
  'stream',
  'setup-stream-notification',
  'giveaway',
  'tcg-admin',
];

const LEGACY_PREFIX_ONLY = [
  'subscribe',
  'unsubscribe',
  'gcreate',
  'gend',
  'greroll',
  'gdelete',
  'gedit',
  'glist',
  'avc',
  'vname',
  'vlimit',
  'vlock',
  'vunlock',
  'vpermit',
  'vkick',
  'vclaim',
  'vtransfer',
];

describe('bot command set (STORY-174)', () => {
  let db: DatabaseClient;
  const registry = new CommandRegistry();
  const sync = new CommandSynchronizer({} as REST, registry);

  beforeAll(async () => {
    db = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:', autoMigrate: true });
    const { client } = createBot();
    const services = await createBotServices(db, client);
    registerBotCommands(registry, {
      services,
      controllers: createCommandControllers(client, services, '!'),
      helpOptions: { defaultPrefix: '!' },
      prefix: '!',
      version: 'test',
    });
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it('fits every Discord limit in both scopes', () => {
    const global = countPayloads(sync.generatePayloads({ scope: 'global' }));
    const guild = countPayloads(sync.generatePayloads({ scope: 'guild' }));
    expect(global.chatInput).toBeLessThanOrEqual(COMMAND_LIMITS.chatInput);
    expect(global.message).toBeLessThanOrEqual(COMMAND_LIMITS.message);
    expect(guild).toEqual({ chatInput: GUILD_SCOPED.length, message: 0, user: 0 });
  });

  it('registers exactly the admin and setup commands per server', () => {
    const guildNames = sync.generatePayloads({ scope: 'guild' }).map((p) => p.name);
    expect([...guildNames].sort()).toEqual([...GUILD_SCOPED].sort());
  });

  it('never registers a name in both scopes', () => {
    const global = new Set(sync.generatePayloads({ scope: 'global' }).map((p) => p.name));
    for (const name of GUILD_SCOPED) expect(global.has(name)).toBe(false);
  });

  it('keeps the legacy aliases prefix-only', () => {
    for (const name of LEGACY_PREFIX_ONLY) {
      const command = registry.get(name);
      expect(command?.metadata.slashEnabled, name).toBe(false);
      expect(command?.metadata.prefixEnabled, name).not.toBe(false);
    }
  });
});
