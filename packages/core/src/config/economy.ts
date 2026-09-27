import { z } from 'zod';
import { IntSetting } from './guild-config.js';

/*
 * Global economy values. Balances, the daily reward and the bank are global per user, so these
 * are edited only in the owner console and with `ririko economy:config`, never per guild.
 */

export const MAX_DAILY_BASE_REWARD = 1_000_000;
export const MAX_DAILY_STREAK_BONUS_PERCENT = 100;
export const MAX_DAILY_MAX_STREAK_BONUS_PERCENT = 1000;
export const MAX_BANK_BASE_CAPACITY = 1_000_000_000;
export const MAX_BANK_CAPACITY_PER_LEVEL = 10_000_000;

export const EconomyConfigSchema = z
  .object({
    dailyBaseReward: IntSetting(0, MAX_DAILY_BASE_REWARD).describe(
      'Credits for a /daily claim on day 1 of a streak',
    ),
    dailyStreakBonusPercent: IntSetting(0, MAX_DAILY_STREAK_BONUS_PERCENT).describe(
      'Extra reward for each further day of a streak, in percent of the base reward',
    ),
    dailyMaxStreakBonusPercent: IntSetting(0, MAX_DAILY_MAX_STREAK_BONUS_PERCENT).describe(
      'Largest streak bonus, in percent of the base reward',
    ),
    bankBaseCapacity: IntSetting(0, MAX_BANK_BASE_CAPACITY).describe(
      'Bank capacity at level 0, in credits',
    ),
    bankCapacityPerLevel: IntSetting(0, MAX_BANK_CAPACITY_PER_LEVEL).describe(
      'Extra bank capacity for each account level, in credits',
    ),
  })
  .strict();

export type EconomyConfig = z.output<typeof EconomyConfigSchema>;
export type EconomyConfigKey = keyof EconomyConfig;

export const ECONOMY_CONFIG_KEYS = Object.keys(EconomyConfigSchema.shape) as EconomyConfigKey[];

export function isEconomyConfigKey(value: string): value is EconomyConfigKey {
  return Object.hasOwn(EconomyConfigSchema.shape, value);
}

/** Values used until an owner saves others. */
export const DEFAULT_ECONOMY_CONFIG: EconomyConfig = {
  dailyBaseReward: 250,
  dailyStreakBonusPercent: 5,
  dailyMaxStreakBonusPercent: 150,
  bankBaseCapacity: 10_000,
  bankCapacityPerLevel: 2_500,
};

type DailyRewardConfig = Pick<
  EconomyConfig,
  'dailyBaseReward' | 'dailyStreakBonusPercent' | 'dailyMaxStreakBonusPercent'
>;

/** Streak bonus in whole percent: nothing on day 1, then the daily step up to the maximum. */
function streakBonusPercent(streak: number, config: DailyRewardConfig): number {
  if (streak <= 1) return 0;
  return Math.min(
    config.dailyMaxStreakBonusPercent,
    (Math.floor(streak) - 1) * config.dailyStreakBonusPercent,
  );
}

/** Reward multiplier for a streak day, e.g. 1.05 on day 2 with a 5% step. */
export function dailyStreakMultiplier(streak: number, config: DailyRewardConfig): number {
  return Number((1 + streakBonusPercent(streak, config) / 100).toFixed(2));
}

/** Credits paid for a claim on the given streak day. */
export function dailyReward(streak: number, config: DailyRewardConfig): number {
  return Math.round((config.dailyBaseReward * (100 + streakBonusPercent(streak, config))) / 100);
}

/** Bank capacity for an account level: the base plus a step per level. */
export function bankCapacityFor(
  level: number,
  config: Pick<EconomyConfig, 'bankBaseCapacity' | 'bankCapacityPerLevel'>,
): number {
  return config.bankBaseCapacity + Math.max(0, Math.floor(level)) * config.bankCapacityPerLevel;
}
