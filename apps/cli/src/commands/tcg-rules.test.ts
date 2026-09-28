import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TCG_RULES, ValidationError } from '@ririko/core';
import { createDatabaseClient, type SqliteDatabaseClient } from '@ririko/database';
import type { TcgRulesService } from '@ririko/services/owner';
import { createTcgRulesService, runTcgRules } from './tcg-rules.js';

// Strip terminal colours so assertions read plainly.
// eslint-disable-next-line no-control-regex
const plain = (lines: string[]) => lines.map((line) => line.replace(/\x1b\[[0-9;]*m/g, ''));

describe('ririko tcg:rules (TASK-1124)', () => {
  let db: SqliteDatabaseClient;
  let service: TcgRulesService;

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    db = raw;
    service = createTcgRulesService(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('lists every rule with its description', async () => {
    const lines = plain(await runTcgRules(service));
    expect(lines[0]).toBe('Global Waifu TCG rules');
    expect(lines).toHaveLength(9);
    expect(lines.find((line) => line.includes('marketTaxPercent'))).toMatch(
      /marketTaxPercent\s+5\s+Tax taken from each market listing/,
    );
  });

  it('sets a rule, prints it back and records the CLI user in the audit log', async () => {
    expect(plain(await runTcgRules(service, 'marketTaxPercent', '12'))).toEqual([
      '✔ marketTaxPercent: 5 → 12',
    ]);
    expect(await runTcgRules(service, 'marketTaxPercent')).toEqual(['12']);
    expect(await service.get()).toEqual({ ...DEFAULT_TCG_RULES, marketTaxPercent: 12 });
    expect(await runTcgRules(service, 'marketTaxPercent', '12')).toEqual([
      'marketTaxPercent is already 12; nothing changed.',
    ]);

    const [row] = db.raw
      .prepare('SELECT guild_id, actor_user_id, action FROM audit_logs')
      .all() as { guild_id: string | null; actor_user_id: string; action: string }[];
    expect(row).toMatchObject({ guild_id: null, action: 'owner.tcg_rules.update' });
    expect(row?.actor_user_id).toMatch(/^cli/);
  });

  it('rejects unknown rules and invalid values', async () => {
    await expect(runTcgRules(service, 'dungeonGrowthRate', '1')).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(runTcgRules(service, 'marketTaxPercent', '50')).rejects.toThrow(
      /Invalid value for marketTaxPercent: Enter a whole number from 1 to 20/,
    );
    await expect(runTcgRules(service, 'baseEnergyCapacity', '200')).resolves.toBeDefined();
    await expect(runTcgRules(service, 'globalMaxEnergyCap', '150')).rejects.toThrow(
      /cannot be lower than the base energy capacity/,
    );
  });
});
