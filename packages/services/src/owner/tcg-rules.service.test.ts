import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AuditLogRepository,
  createDatabaseClient,
  TcgConfigRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { DEFAULT_TCG_RULES } from '@ririko/core';
import {
  GuildConfigValidationError,
  type GuildConfigActor,
} from '../guild/guild-config.service.js';
import { RETIRED_TCG_CONFIG_KEYS, TcgRulesService } from './tcg-rules.service.js';

const owner: GuildConfigActor = {
  userId: 'owner-1',
  source: 'dashboard',
  ipAddress: '203.0.113.7',
  userAgent: 'vitest',
};

describe('TcgRulesService (TASK-1124)', () => {
  let db: SqliteDatabaseClient;
  let repository: TcgConfigRepository;
  let service: TcgRulesService;
  let now: Date;

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
    now = new Date('2026-09-28T00:00:00Z');
    repository = new TcgConfigRepository(db);
    service = new TcgRulesService({
      db,
      repository,
      audit: new AuditLogRepository(db),
      now: () => now,
    });
  });

  afterEach(async () => {
    await db.close();
  });

  it('reads the defaults before anything is saved', async () => {
    expect(await service.get()).toEqual(DEFAULT_TCG_RULES);
  });

  it('reads rules older bots stored, clamping the tax and ignoring invalid values', async () => {
    await repository.setConfig('market_tax_rate', 0.5, 'old-bot');
    await repository.setConfig('global_max_energy_cap', 450, 'old-bot');
    await repository.setConfig('base_energy_capacity', 5000, 'old-bot');
    await repository.setConfig('daily_energy_restore_pot_limit', 'lots', 'old-bot');

    expect(await service.get()).toEqual({
      ...DEFAULT_TCG_RULES,
      marketTaxPercent: 20,
      globalMaxEnergyCap: 450,
    });

    await repository.setConfig('market_tax_rate', 0, 'old-bot');
    expect((await service.get()).marketTaxPercent).toBe(1);
  });

  it('saves a patch in the stored keys and writes a global audit entry', async () => {
    const { values, changes } = await service.update(
      { marketTaxPercent: '10', listingExpiryDays: 3, dailyEnergyPotionLimit: 5 },
      owner,
    );
    expect(values).toEqual({
      ...DEFAULT_TCG_RULES,
      marketTaxPercent: 10,
      listingExpiryDays: 3,
      dailyEnergyPotionLimit: 5,
    });
    expect(changes.map((change) => change.field)).toEqual([
      'marketTaxPercent',
      'listingExpiryDays',
      'dailyEnergyPotionLimit',
    ]);
    expect(await repository.getConfig('market_tax_rate')).toBe(0.1);
    expect(await repository.getConfig('listing_expiry_days')).toBe(3);
    expect(await repository.getConfig('daily_energy_restore_pot_limit')).toBe(5);
    expect(await repository.getConfig('global_max_energy_cap')).toBeNull();

    const [audit] = auditRows();
    expect(audit).toMatchObject({
      guild_id: null,
      actor_user_id: 'owner-1',
      action: 'owner.tcg_rules.update',
    });
    expect(JSON.parse(audit!.details)).toEqual({ source: 'dashboard', changes });
  });

  it('writes nothing when the rules are unchanged', async () => {
    const { changes } = await service.update({ marketTaxPercent: 5 }, owner);
    expect(changes).toEqual([]);
    expect(auditRows()).toEqual([]);
  });

  it('rejects invalid rules with field errors and writes nothing', async () => {
    const attempt = service.update(
      { marketTaxPercent: 25, globalMaxEnergyCap: 100, baseEnergyCapacity: 150 },
      owner,
    );
    await expect(attempt).rejects.toBeInstanceOf(GuildConfigValidationError);
    await expect(attempt).rejects.toMatchObject({
      fieldErrors: {
        marketTaxPercent: [expect.any(String)],
        globalMaxEnergyCap: [expect.any(String)],
      },
    });
    expect(await service.get()).toEqual(DEFAULT_TCG_RULES);
    expect(auditRows()).toEqual([]);
  });

  it('caches rules for gameplay for 30 seconds and drops the cache after an update', async () => {
    expect((await service.getRules()).marketTaxPercent).toBe(5);

    await repository.setConfig('market_tax_rate', 0.12, 'elsewhere');
    expect((await service.getRules()).marketTaxPercent).toBe(5);

    now = new Date(now.getTime() + 30_000);
    expect((await service.getRules()).marketTaxPercent).toBe(12);

    await service.update({ listingExpiryDays: 14 }, owner);
    expect((await service.getRules()).listingExpiryDays).toBe(14);
  });

  it('retires unused keys and returns the old global manager role', async () => {
    expect(await service.retireUnusedKeys()).toBeNull();

    await repository.setConfig(RETIRED_TCG_CONFIG_KEYS.managerRole, 'role-1', 'old-bot');
    await repository.setConfig('dungeon_growth_rate', 0.1, 'old-bot');
    await repository.setConfig('market_tax_rate', 0.07, 'old-bot');
    expect(await service.retireUnusedKeys()).toBe('role-1');
    expect(await repository.getConfig(RETIRED_TCG_CONFIG_KEYS.managerRole)).toBeNull();
    expect(await repository.getConfig('dungeon_growth_rate')).toBeNull();
    expect(await repository.getConfig('market_tax_rate')).toBe(0.07);

    await repository.setConfig(RETIRED_TCG_CONFIG_KEYS.managerRole, '', 'old-bot');
    expect(await service.retireUnusedKeys()).toBeNull();
  });
});
