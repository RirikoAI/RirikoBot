import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ECONOMY_CONFIG, ValidationError } from '@ririko/core';
import { createDatabaseClient, type SqliteDatabaseClient } from '@ririko/database';
import type { EconomyConfigService } from '@ririko/services/owner';
import { createEconomyConfigService, runEconomyConfig } from './economy-config.js';

// Strip terminal colours so assertions read plainly.
// eslint-disable-next-line no-control-regex
const plain = (lines: string[]) => lines.map((line) => line.replace(/\x1b\[[0-9;]*m/g, ''));

describe('ririko economy:config (TASK-1651)', () => {
  let db: SqliteDatabaseClient;
  let service: EconomyConfigService;

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    db = raw;
    service = createEconomyConfigService(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('lists every value with its description', async () => {
    const lines = plain(await runEconomyConfig(service));
    expect(lines[0]).toBe('Global economy settings');
    expect(lines).toHaveLength(6);
    expect(lines.find((line) => line.includes('dailyBaseReward'))).toMatch(
      /dailyBaseReward\s+250\s+Credits for a \/daily claim/,
    );
  });

  it('sets a value, prints it back and records the CLI user in the audit log', async () => {
    expect(plain(await runEconomyConfig(service, 'dailyBaseReward', '400'))).toEqual([
      '✔ dailyBaseReward: 250 → 400',
    ]);
    expect(await runEconomyConfig(service, 'dailyBaseReward')).toEqual(['400']);
    expect(await service.get()).toEqual({ ...DEFAULT_ECONOMY_CONFIG, dailyBaseReward: 400 });

    const [row] = db.raw
      .prepare('SELECT guild_id, actor_user_id, action FROM audit_logs')
      .all() as { guild_id: string | null; actor_user_id: string; action: string }[];
    expect(row).toMatchObject({ guild_id: null, action: 'owner.economy_config.update' });
    expect(row?.actor_user_id).toMatch(/^cli/);
  });

  it('says when nothing changed', async () => {
    expect(await runEconomyConfig(service, 'bankBaseCapacity', '10000')).toEqual([
      'bankBaseCapacity is already 10000; nothing changed.',
    ]);
  });

  it('refuses unknown keys and out-of-range values', async () => {
    await expect(runEconomyConfig(service, 'currencyName', 'gems')).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(runEconomyConfig(service, 'dailyStreakBonusPercent', '900')).rejects.toThrow(
      'Invalid value for dailyStreakBonusPercent: Enter a whole number from 0 to 100.',
    );
  });
});
