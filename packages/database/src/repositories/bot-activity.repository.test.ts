import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { SqliteDatabaseClient } from '../client/types.js';
import { BotActivityRepository } from './bot-activity.repository.js';

const at = (seconds: number) => new Date(Date.UTC(2026, 8, 26, 0, 0, seconds));

describe('BotActivityRepository (TASK-1131)', () => {
  let client: SqliteDatabaseClient;
  let repo: BotActivityRepository;

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = raw;
    repo = new BotActivityRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it('adds usage counts to existing rows and lists a guild from a day on', async () => {
    await repo.addCommandUsage([
      { guildId: 'g1', day: '2026-09-24', commandName: 'play', count: 2 },
      { guildId: 'g1', day: '2026-09-25', commandName: 'play', count: 1 },
      { guildId: 'g2', day: '2026-09-25', commandName: 'play', count: 7 },
    ]);
    await repo.addCommandUsage([
      { guildId: 'g1', day: '2026-09-25', commandName: 'play', count: 3 },
      { guildId: 'g1', day: '2026-09-25', commandName: 'help', count: 1 },
    ]);

    expect(await repo.listCommandUsage('g1', '2026-09-25')).toEqual([
      { guildId: 'g1', day: '2026-09-25', commandName: 'help', count: 1 },
      { guildId: 'g1', day: '2026-09-25', commandName: 'play', count: 4 },
    ]);
  });

  it('deletes usage rows before a day', async () => {
    await repo.addCommandUsage([
      { guildId: 'g1', day: '2026-06-01', commandName: 'play', count: 1 },
      { guildId: 'g1', day: '2026-06-02', commandName: 'play', count: 1 },
    ]);
    await repo.deleteCommandUsageBefore('2026-06-02');
    expect(await repo.listCommandUsage('g1', '2000-01-01')).toHaveLength(1);
  });

  it('upserts the bot status row', async () => {
    const status = {
      id: 'bot',
      gatewayPingMs: null,
      guildCount: 3,
      version: '2.0.0',
      startedAt: at(0),
      updatedAt: at(0),
    };
    await repo.saveBotStatus(status);
    await repo.saveBotStatus({ ...status, gatewayPingMs: 42, guildCount: 4, updatedAt: at(30) });

    expect(await repo.getBotStatus('bot')).toEqual({
      ...status,
      gatewayPingMs: 42,
      guildCount: 4,
      updatedAt: at(30),
    });
    expect(await repo.getBotStatus('other')).toBeNull();
  });

  it('stores voice activity per guild and removes it when no channel is active', async () => {
    await repo.setVoiceActivity('g1', [{ channelId: 'c1', members: 2 }], at(0));
    await repo.setVoiceActivity('g2', [{ channelId: 'c9', members: 1 }], at(0));
    await repo.setVoiceActivity('g1', [{ channelId: 'c2', members: 5 }], at(30));

    expect(await repo.getVoiceActivity('g1')).toEqual({
      guildId: 'g1',
      channels: [{ channelId: 'c2', members: 5 }],
      updatedAt: at(30),
    });

    await repo.setVoiceActivity('g1', [], at(60));
    expect(await repo.getVoiceActivity('g1')).toBeNull();

    await repo.clearVoiceActivity();
    expect(await repo.getVoiceActivity('g2')).toBeNull();
  });
});
