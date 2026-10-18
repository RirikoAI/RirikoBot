import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CommandSettingsRepository,
  createDatabaseClient,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { CommandOverrideService } from '../command-override.service.js';

const CHANNEL = '123456789012345678';

describe('CommandOverrideService (TASK-1631)', () => {
  let db: SqliteDatabaseClient;
  let repo: CommandSettingsRepository;
  let clock: number;
  let service: CommandOverrideService;

  const row = (commandName: string, channelId: string | null, isEnabled: boolean) => ({
    commandName,
    channelId,
    isEnabled,
    cooldownOverride: null,
    allowedRoles: [],
    blockedRoles: [],
  });

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    db = raw;
    repo = new CommandSettingsRepository(db);
    clock = 0;
    service = new CommandOverrideService({ repo, cacheTtlMs: 1000, now: () => clock });
  });

  afterEach(async () => {
    await db.close();
  });

  it('resolves the channel row first, then the server row', async () => {
    await repo.replaceForGuild('g1', [row('rps', null, false), row('rps', CHANNEL, true)]);
    expect(await service.resolve('g1', CHANNEL, 'rps')).toMatchObject({ enabled: true });
    expect(await service.resolve('g1', '999999999999999999', 'rps')).toMatchObject({
      enabled: false,
    });
    expect(await service.resolve('g1', CHANNEL, 'play')).toBeNull();
  });

  it('serves the cache until invalidated or expired', async () => {
    await repo.replaceForGuild('g1', [row('rps', null, false)]);
    expect(await service.resolve('g1', null, 'rps')).toMatchObject({ enabled: false });

    await repo.replaceForGuild('g1', []);
    expect(await service.resolve('g1', null, 'rps')).toMatchObject({ enabled: false });

    service.invalidate('g1');
    expect(await service.resolve('g1', null, 'rps')).toBeNull();

    await repo.replaceForGuild('g1', [row('rps', null, false)]);
    clock = 1000;
    expect(await service.resolve('g1', null, 'rps')).toMatchObject({ enabled: false });
  });
});
