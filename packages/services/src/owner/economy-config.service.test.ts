import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AuditLogRepository,
  createDatabaseClient,
  EconomyConfigRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { DEFAULT_ECONOMY_CONFIG } from '@ririko/core';
import {
  GuildConfigValidationError,
  type GuildConfigActor,
} from '../guild/guild-config.service.js';
import { EconomyConfigService } from './economy-config.service.js';

const NOW = new Date('2026-09-27T00:00:00Z');
const owner: GuildConfigActor = {
  userId: 'owner-1',
  source: 'dashboard',
  ipAddress: '203.0.113.7',
  userAgent: 'vitest',
};

describe('EconomyConfigService (TASK-1651)', () => {
  let db: SqliteDatabaseClient;
  let service: EconomyConfigService;

  const auditRows = () =>
    db.raw.prepare('SELECT guild_id, actor_user_id, action, details FROM audit_logs').all() as {
      guild_id: string | null;
      actor_user_id: string;
      action: string;
      details: string;
    }[];

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    db = raw;
    service = new EconomyConfigService({
      db,
      repository: new EconomyConfigRepository(db),
      audit: new AuditLogRepository(db),
      now: () => NOW,
    });
  });

  afterEach(async () => {
    await db.close();
  });

  it('reads the defaults before anything is saved', async () => {
    expect(await service.get()).toEqual(DEFAULT_ECONOMY_CONFIG);
  });

  it('saves a patch, keeps the other values and writes a global audit entry', async () => {
    const { values, changes } = await service.update(
      { dailyBaseReward: '400', bankCapacityPerLevel: 3000 },
      owner,
    );
    expect(values).toEqual({
      ...DEFAULT_ECONOMY_CONFIG,
      dailyBaseReward: 400,
      bankCapacityPerLevel: 3000,
    });
    expect(changes.map((change) => change.field)).toEqual([
      'dailyBaseReward',
      'bankCapacityPerLevel',
    ]);
    expect(await service.get()).toEqual(values);

    const rows = auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      guild_id: null,
      actor_user_id: 'owner-1',
      action: 'owner.economy_config.update',
    });
    expect(JSON.parse(rows[0]!.details)).toMatchObject({
      source: 'dashboard',
      changes: [
        { field: 'dailyBaseReward', before: 250, after: 400 },
        { field: 'bankCapacityPerLevel', before: 2500, after: 3000 },
      ],
    });
  });

  it('writes nothing when nothing changes', async () => {
    const { changes } = await service.update({ dailyBaseReward: 250 }, owner);
    expect(changes).toEqual([]);
    expect(auditRows()).toHaveLength(0);
    expect(await new EconomyConfigRepository(db).get()).toBeNull();
  });

  it('refuses invalid values with field errors and saves nothing', async () => {
    const error = await service
      .update({ dailyBaseReward: -5, dailyStreakBonusPercent: 500 }, owner)
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(GuildConfigValidationError);
    const { fieldErrors, message } = error as GuildConfigValidationError;
    expect(message).toContain('Invalid economy settings');
    expect(Object.keys(fieldErrors)).toEqual(['dailyBaseReward', 'dailyStreakBonusPercent']);
    expect(await service.get()).toEqual(DEFAULT_ECONOMY_CONFIG);
  });

  it('refuses keys that are not economy values', async () => {
    await expect(service.update({ currencyName: 'gems' }, owner)).rejects.toBeInstanceOf(
      GuildConfigValidationError,
    );
  });
});
