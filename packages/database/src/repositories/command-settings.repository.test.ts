import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { SqliteDatabaseClient } from '../client/types.js';
import { SQLITE_SCHEMA_DDL } from '../schema/sqlite/ddl.js';
import { CommandSettingsRepository } from './command-settings.repository.js';
import { CommandCatalogRepository } from './command-catalog.repository.js';

describe('CommandSettingsRepository (TASK-1631)', () => {
  let client: SqliteDatabaseClient;
  let repo: CommandSettingsRepository;

  beforeEach(async () => {
    const raw = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = raw;
    client.raw.exec(SQLITE_SCHEMA_DDL);
    repo = new CommandSettingsRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  const row = (commandName: string, channelId: string | null = null) => ({
    commandName,
    channelId,
    isEnabled: false,
    cooldownOverride: null,
    allowedRoles: [],
    blockedRoles: ['role-1'],
  });

  it('replaces a guild’s rows with generated ids, leaving other guilds alone', async () => {
    await repo.replaceForGuild('guild-1', [row('rps'), row('play')]);
    await repo.replaceForGuild('guild-2', [row('rps')]);
    await repo.replaceForGuild('guild-1', [row('rps', 'channel-1'), row('rps')]);

    const rows = await repo.listForGuild('guild-1');
    expect(rows.map((r) => [r.commandName, r.channelId])).toEqual([
      ['rps', null],
      ['rps', 'channel-1'],
    ]);
    expect(rows[0]).toMatchObject({
      guildId: 'guild-1',
      isEnabled: false,
      blockedRoles: ['role-1'],
    });
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
    expect(await repo.listForGuild('guild-2')).toHaveLength(1);
  });

  it('clears a guild with an empty list', async () => {
    await repo.replaceForGuild('guild-1', [row('rps')]);
    await repo.replaceForGuild('guild-1', []);
    expect(await repo.listForGuild('guild-1')).toEqual([]);
  });
});

describe('CommandCatalogRepository (TASK-1631)', () => {
  let client: SqliteDatabaseClient;
  let repo: CommandCatalogRepository;

  beforeEach(async () => {
    const raw = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = raw;
    client.raw.exec(SQLITE_SCHEMA_DDL);
    repo = new CommandCatalogRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  const entry = (name: string, category: string, cooldownSeconds = 0) => ({
    name,
    category,
    description: `${name} command`,
    slashEnabled: true,
    prefixEnabled: true,
    defaultPermission: null,
    cooldownSeconds,
  });

  it('upserts entries and removes commands that are no longer registered', async () => {
    await repo.replaceAll([entry('rps', 'games'), entry('play', 'music'), entry('old', 'utility')]);
    await repo.replaceAll([entry('rps', 'games', 3), entry('play', 'music')]);

    const rows = await repo.list();
    expect(rows.map((r) => r.name)).toEqual(['rps', 'play']);
    expect(rows[0]?.cooldownSeconds).toBe(3);
  });

  it('empties the catalog when nothing is registered', async () => {
    await repo.replaceAll([entry('rps', 'games')]);
    await repo.replaceAll([]);
    expect(await repo.list()).toEqual([]);
  });
});
