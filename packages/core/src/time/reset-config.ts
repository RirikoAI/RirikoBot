import { z } from 'zod';
import { createResetSchedule, type ResetSchedule } from './reset-schedule.js';

/** 24-hour `HH:MM` wall-clock time used by the daily reset boundary. */
export const ResetTimeSchema = z
  .string()
  .regex(/^\d{1,2}:\d{2}$/, 'Reset time must be in HH:MM format')
  .refine((value) => {
    const [hour, minute] = value.split(':').map(Number) as [number, number];
    return hour <= 23 && minute <= 59;
  }, 'Reset time must be a valid 24-hour clock time');

/**
 * Environment fields governing the shared reset boundary. Spread into the application
 * config schema so there is exactly one definition of these settings.
 */
export const ResetConfigShape = {
  /** Minutes ahead of UTC for every daily reset. 480 = GMT+8. */
  RIRIKO_RESET_OFFSET_MINUTES: z.coerce.number().int().min(-720).max(840).default(480),
  /** Default wall-clock reset time inside that offset. */
  RIRIKO_RESET_TIME: ResetTimeSchema.default('00:00'),
  /** Per-feature overrides; omit to inherit RIRIKO_RESET_TIME. */
  RIRIKO_RESET_TIME_DAILY: ResetTimeSchema.optional(),
  RIRIKO_RESET_TIME_ENERGY: ResetTimeSchema.optional(),
  RIRIKO_RESET_TIME_ENERGY_POTIONS: ResetTimeSchema.optional(),
  RIRIKO_RESET_TIME_TCG_SHOP: ResetTimeSchema.optional(),
  RIRIKO_RESET_TIME_SHOP_PURCHASES: ResetTimeSchema.optional(),
  /** Consecutive missed days tolerated before a daily streak is wiped. 0 disables forgiveness. */
  RIRIKO_DAILY_STREAK_FORGIVENESS: z.coerce.number().int().min(0).max(365).default(3),
} as const;

export const ResetConfigSchema = z.object(ResetConfigShape);

export type ResetConfig = z.infer<typeof ResetConfigSchema>;

/** Daily systems that observe the shared reset boundary. */
export type ResetFeature = 'daily' | 'energy' | 'energyPotions' | 'tcgShop' | 'shopPurchases';

export type ResetSchedules = Record<ResetFeature, ResetSchedule>;

/**
 * Resolves the per-feature reset schedules from configuration.
 *
 * All features share one timezone offset so that "today" means the same calendar day
 * everywhere in the bot; only the wall-clock boundary time may differ per feature, which
 * lets operators stagger resets (for example rotating the shop at 06:00 rather than
 * during the overnight quiet hours).
 */
export function resolveResetSchedules(config: ResetConfig): ResetSchedules {
  const offset = config.RIRIKO_RESET_OFFSET_MINUTES;
  const fallback = config.RIRIKO_RESET_TIME;

  const build = (override: string | undefined): ResetSchedule =>
    createResetSchedule(offset, override ?? fallback);

  return {
    daily: build(config.RIRIKO_RESET_TIME_DAILY),
    energy: build(config.RIRIKO_RESET_TIME_ENERGY),
    energyPotions: build(config.RIRIKO_RESET_TIME_ENERGY_POTIONS),
    tcgShop: build(config.RIRIKO_RESET_TIME_TCG_SHOP),
    shopPurchases: build(config.RIRIKO_RESET_TIME_SHOP_PURCHASES),
  };
}

/**
 * Parses reset settings straight from an environment bag, applying defaults.
 * Throws a {@link z.ZodError} on malformed values so misconfiguration surfaces at startup
 * rather than silently shifting every reset in the bot.
 */
export function resolveResetSchedulesFromEnv(
  env: Record<string, string | undefined> = process.env,
): { schedules: ResetSchedules; config: ResetConfig } {
  const config = ResetConfigSchema.parse(env);
  return { schedules: resolveResetSchedules(config), config };
}
