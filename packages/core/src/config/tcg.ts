import { z } from 'zod';
import { IntSetting } from './guild-config.js';

/*
 * Global Waifu TCG rules. Cards, energy and market listings are global per user, so these are
 * edited only in the owner console, with `ririko tcg:rules` and by bot owners with
 * `/tcg-admin`, never per guild.
 */

export const MIN_MARKET_TAX_PERCENT = 1;
export const MAX_MARKET_TAX_PERCENT = 20;
export const MAX_LISTING_EXPIRY_DAYS = 30;

export const TcgRulesSchema = z
  .object({
    marketTaxPercent: IntSetting(MIN_MARKET_TAX_PERCENT, MAX_MARKET_TAX_PERCENT).describe(
      'Tax taken from each market listing, in percent of the price',
    ),
    listingExpiryDays: IntSetting(1, MAX_LISTING_EXPIRY_DAYS).describe(
      'Days a market listing stays up before it expires',
    ),
    globalMaxEnergyCap: IntSetting(100, 1000).describe(
      'Largest energy capacity any player can reach',
    ),
    baseEnergyCapacity: IntSetting(50, 200).describe('Energy capacity at player level 1'),
    energyScalingPerLevel: IntSetting(1, 5).describe('Extra energy capacity for each level'),
    dailyEnergyPotionLimit: IntSetting(1, 10).describe(
      'Energy potions a player can use per reset day',
    ),
    maxBonusEnergyCap: IntSetting(0, 500).describe(
      'Most bonus energy a player can bank on top of the capacity',
    ),
    dailyBonusEnergyIncrement: IntSetting(0, 50).describe(
      'Bonus energy added at each daily reset, up to the bonus cap',
    ),
  })
  .strict()
  .superRefine((rules, ctx) => {
    if (rules.globalMaxEnergyCap < rules.baseEnergyCapacity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['globalMaxEnergyCap'],
        message: 'The energy cap cannot be lower than the base energy capacity.',
      });
    }
  });

export type TcgRules = z.output<typeof TcgRulesSchema>;
export type TcgRulesKey = keyof TcgRules;

export const TCG_RULES_KEYS = Object.keys(TcgRulesSchema.innerType().shape) as TcgRulesKey[];

export function isTcgRulesKey(value: string): value is TcgRulesKey {
  return Object.hasOwn(TcgRulesSchema.innerType().shape, value);
}

/** Values used until an owner saves others. */
export const DEFAULT_TCG_RULES: TcgRules = {
  marketTaxPercent: 5,
  listingExpiryDays: 7,
  globalMaxEnergyCap: 300,
  baseEnergyCapacity: 100,
  energyScalingPerLevel: 2,
  dailyEnergyPotionLimit: 3,
  maxBonusEnergyCap: 50,
  dailyBonusEnergyIncrement: 5,
};
