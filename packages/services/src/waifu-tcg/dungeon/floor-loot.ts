import { z } from 'zod';

/*
 * Per-floor loot overrides, stored in `dungeon_floors.first_clear_rewards` and
 * `repeat_rewards_table`. Every field is optional and replaces only its part of the default
 * loot (`DungeonLootService` brackets); `{}` keeps the defaults. Item codes are `game_items`
 * codes, checked when an owner saves.
 */

export const MAX_FIRST_CLEAR_ITEMS = 5;
export const MAX_REPEAT_POOL_ENTRIES = 8;
export const MAX_LOOT_QUANTITY = 99;
export const MAX_LOOT_CREDITS = 10_000_000;
export const MAX_LOOT_EXP = 1_000_000;
export const MAX_LOOT_DUST = 100_000;
export const MAX_LOOT_WEIGHT = 1000;

const code = z.string().min(1).max(64);
const quantity = z.number().int().min(1).max(MAX_LOOT_QUANTITY);
const currencies = {
  credits: z.number().int().min(0).max(MAX_LOOT_CREDITS).optional(),
  exp: z.number().int().min(0).max(MAX_LOOT_EXP).optional(),
  craftingDust: z.number().int().min(0).max(MAX_LOOT_DUST).optional(),
};

/** Extra credits and dust for the first clear of every 10th floor up to 50. */
const MILESTONE_FIRST_CLEAR_BONUS: Readonly<
  Record<number, { credits: number; craftingDust: number }>
> = {
  10: { credits: 2500, craftingDust: 50 },
  20: { credits: 5000, craftingDust: 150 },
  30: { credits: 10000, craftingDust: 300 },
  40: { credits: 20000, craftingDust: 600 },
  50: { credits: 50000, craftingDust: 1500 },
};

/** Currencies of a first clear when the floor's table does not set them. */
export function defaultFirstClearCurrencies(floorNumber: number): {
  credits: number;
  exp: number;
  craftingDust: number;
} {
  const bonus = MILESTONE_FIRST_CLEAR_BONUS[floorNumber];
  return {
    credits: bonus?.credits ?? floorNumber * 100,
    exp: floorNumber * 15,
    craftingDust: bonus?.craftingDust ?? floorNumber * 5,
  };
}

export const firstClearRewardsSchema = z
  .object({
    ...currencies,
    /** Replaces the bracket item (or a boss floor's fallback gear); a boss's signature drop stays. */
    items: z
      .array(z.object({ code, quantity }).strict())
      .min(1)
      .max(MAX_FIRST_CLEAR_ITEMS)
      .optional(),
  })
  .strict();

export const repeatRewardsSchema = z
  .object({
    ...currencies,
    /** Chance of an item roll on a repeat clear (the bracket default is 0.35). */
    dropChance: z.number().min(0).max(1).optional(),
    /** Replaces the bracket's weighted item pool. */
    pool: z
      .array(
        z
          .object({
            code,
            weight: z.number().int().min(1).max(MAX_LOOT_WEIGHT),
            minQty: quantity,
            maxQty: quantity,
          })
          .strict()
          .refine((entry) => entry.minQty <= entry.maxQty, {
            message: 'The minimum quantity is above the maximum.',
          }),
      )
      .min(1)
      .max(MAX_REPEAT_POOL_ENTRIES)
      .optional(),
  })
  .strict();

export type FirstClearRewards = z.infer<typeof firstClearRewardsSchema>;
export type RepeatRewards = z.infer<typeof repeatRewardsSchema>;

export interface FloorLoot {
  firstClear: FirstClearRewards;
  repeat: RepeatRewards;
}

function parseOrWarn<T extends object>(schema: z.ZodType<T>, value: unknown, label: string): T {
  if (value === null || value === undefined) return {} as T;
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  console.warn(
    `[dungeon] Ignoring invalid ${label}: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
  );
  return {} as T;
}

/** A floor row's loot overrides; invalid stored JSON is reported and replaced by the defaults. */
export function parseFloorLoot(row: {
  id?: string;
  firstClearRewards?: unknown;
  repeatRewardsTable?: unknown;
}): FloorLoot {
  const label = row.id ? `floor ${row.id}` : 'floor';
  return {
    firstClear: parseOrWarn(
      firstClearRewardsSchema,
      row.firstClearRewards,
      `${label} first-clear rewards`,
    ),
    repeat: parseOrWarn(repeatRewardsSchema, row.repeatRewardsTable, `${label} repeat rewards`),
  };
}
