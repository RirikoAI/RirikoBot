import { describe, expect, it } from 'vitest';
import {
  bankCapacityFor,
  dailyReward,
  dailyStreakMultiplier,
  DEFAULT_ECONOMY_CONFIG,
  ECONOMY_CONFIG_KEYS,
  EconomyConfigSchema,
  isEconomyConfigKey,
} from './economy.js';

describe('EconomyConfigSchema', () => {
  it('accepts the defaults and numeric strings from the CLI', () => {
    expect(EconomyConfigSchema.parse(DEFAULT_ECONOMY_CONFIG)).toEqual(DEFAULT_ECONOMY_CONFIG);
    expect(
      EconomyConfigSchema.parse({ ...DEFAULT_ECONOMY_CONFIG, dailyBaseReward: ' 400 ' }),
    ).toMatchObject({ dailyBaseReward: 400 });
  });

  it('refuses values out of range, fractions and unknown keys', () => {
    const bad = [
      { dailyBaseReward: -1 },
      { dailyBaseReward: 1_000_001 },
      { dailyStreakBonusPercent: 101 },
      { dailyMaxStreakBonusPercent: 1001 },
      { bankBaseCapacity: 1.5 },
      { bankCapacityPerLevel: 'lots' },
      { currencyName: 'gems' },
    ];
    for (const patch of bad) {
      expect(EconomyConfigSchema.safeParse({ ...DEFAULT_ECONOMY_CONFIG, ...patch }).success).toBe(
        false,
      );
    }
  });

  it('lists its keys', () => {
    expect(ECONOMY_CONFIG_KEYS).toContain('bankCapacityPerLevel');
    expect(isEconomyConfigKey('dailyBaseReward')).toBe(true);
    expect(isEconomyConfigKey('toString')).toBe(false);
  });
});

describe('daily reward', () => {
  it('pays the base on day 1 and adds the step per day up to the maximum', () => {
    const config = DEFAULT_ECONOMY_CONFIG;
    expect(dailyStreakMultiplier(1, config)).toBe(1);
    expect(dailyReward(1, config)).toBe(250);
    expect(dailyStreakMultiplier(2, config)).toBe(1.05);
    expect(dailyStreakMultiplier(6, config)).toBe(1.25);
    expect(dailyReward(2, config)).toBe(263);
    expect(dailyStreakMultiplier(31, config)).toBe(2.5);
    expect(dailyStreakMultiplier(100, config)).toBe(2.5);
    expect(dailyReward(31, config)).toBe(625);
  });

  it('follows other values', () => {
    const config = {
      dailyBaseReward: 100,
      dailyStreakBonusPercent: 20,
      dailyMaxStreakBonusPercent: 50,
    };
    expect(dailyReward(2, config)).toBe(120);
    expect(dailyReward(10, config)).toBe(150);
    expect(dailyReward(5, { ...config, dailyStreakBonusPercent: 0 })).toBe(100);
  });
});

describe('bankCapacityFor', () => {
  it('adds the step per level to the base; negative levels count as 0', () => {
    expect(bankCapacityFor(0, DEFAULT_ECONOMY_CONFIG)).toBe(10_000);
    expect(bankCapacityFor(10, DEFAULT_ECONOMY_CONFIG)).toBe(35_000);
    expect(bankCapacityFor(-2, DEFAULT_ECONOMY_CONFIG)).toBe(10_000);
    expect(bankCapacityFor(3, { bankBaseCapacity: 0, bankCapacityPerLevel: 100 })).toBe(300);
  });
});
