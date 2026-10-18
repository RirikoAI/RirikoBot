import { describe, expect, it } from 'vitest';
import { DEFAULT_TCG_RULES, isTcgRulesKey, TCG_RULES_KEYS, TcgRulesSchema } from './tcg.js';

describe('TcgRulesSchema', () => {
  it('accepts the defaults and numeric strings from the CLI', () => {
    expect(TcgRulesSchema.parse(DEFAULT_TCG_RULES)).toEqual(DEFAULT_TCG_RULES);
    expect(TcgRulesSchema.parse({ ...DEFAULT_TCG_RULES, marketTaxPercent: ' 12 ' })).toMatchObject({
      marketTaxPercent: 12,
    });
  });

  it('refuses values out of range, fractions and unknown keys', () => {
    const bad = [
      { marketTaxPercent: 0 },
      { marketTaxPercent: 21 },
      { marketTaxPercent: 5.5 },
      { listingExpiryDays: 0 },
      { listingExpiryDays: 31 },
      { globalMaxEnergyCap: 99 },
      { baseEnergyCapacity: 201 },
      { energyScalingPerLevel: 6 },
      { dailyEnergyPotionLimit: 0 },
      { maxBonusEnergyCap: 501 },
      { dailyBonusEnergyIncrement: -1 },
      { dungeonGrowthRate: 0.1 },
    ];
    for (const patch of bad) {
      expect(TcgRulesSchema.safeParse({ ...DEFAULT_TCG_RULES, ...patch }).success).toBe(false);
    }
  });

  it('keeps the energy cap at or above the base capacity', () => {
    const result = TcgRulesSchema.safeParse({
      ...DEFAULT_TCG_RULES,
      globalMaxEnergyCap: 150,
      baseEnergyCapacity: 200,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['globalMaxEnergyCap']);
  });

  it('lists its keys', () => {
    expect(TCG_RULES_KEYS).toEqual(Object.keys(DEFAULT_TCG_RULES));
    expect(isTcgRulesKey('marketTaxPercent')).toBe(true);
    expect(isTcgRulesKey('toString')).toBe(false);
  });
});
