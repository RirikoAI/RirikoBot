import { z } from 'zod';
import { FlagSetting, IntSetting } from './guild-config.js';

/*
 * The global Waifu TCG item catalog (`game_items`) and achievements (`game_achievements`) as the
 * owner console edits them. The bot re-syncs its canonical items at every start, so canonical
 * items only expose the shop fields (kept through `owner_overridden`); custom gear is fully
 * editable. Achievements keep their requirement, because the bot only records progress for the
 * types in `TRACKED_ACHIEVEMENT_TYPES`.
 */

/** Gear slots, which are also the `subtype` of a gear item. */
export const TCG_GEAR_SLOTS = ['WEAPON', 'ARMOR', 'RELIC', 'RING', 'AMULET', 'TALISMAN'] as const;
export type TcgGearSlot = (typeof TCG_GEAR_SLOTS)[number];

/** `game_items.type` of a gear slot: the first three are equipment, the rest accessories. */
export function tcgGearType(slot: TcgGearSlot): 'EQUIPMENT' | 'ACCESSORY' {
  return slot === 'WEAPON' || slot === 'ARMOR' || slot === 'RELIC' ? 'EQUIPMENT' : 'ACCESSORY';
}

/** Rarities used by the gear catalog (and its enhancement cost multipliers). */
export const TCG_ITEM_RARITIES = [
  'COMMON',
  'UNCOMMON',
  'RARE',
  'SUPER_RARE',
  'ULTRA_RARE',
  'SECRET_RARE',
  'SPECIAL_ILLUSTRATION_RARE',
  'MYTHIC',
] as const;
export type TcgItemRarity = (typeof TCG_ITEM_RARITIES)[number];

/** Battle perks the combat engine implements. */
export const TCG_BATTLE_PERKS = [
  'SHARPENED_EDGE',
  'VAMPIRIC_TOUCH',
  'GLACIAL_COUNTER',
  'MANA_CONDUIT',
  'PHOENIX_WARD',
  'COSMIC_CATACLYSM',
] as const;
export type TcgBattlePerk = (typeof TCG_BATTLE_PERKS)[number];

/** Gear stats the loadout adds as whole numbers. */
export const TCG_FLAT_GEAR_STATS = [
  'attack',
  'defense',
  'health',
  'speed',
  'manaShield',
  'manaMax',
] as const;
/** Gear stats the loadout adds as fractions (0.1 = 10%). */
export const TCG_FRACTION_GEAR_STATS = [
  'critRate',
  'critDamage',
  'mitigation',
  'elementalMastery',
  'armorPiercing',
  'elementalResistance',
  'manaRegen',
] as const;
export type TcgGearStat =
  (typeof TCG_FLAT_GEAR_STATS)[number] | (typeof TCG_FRACTION_GEAR_STATS)[number];

export const MAX_TCG_ITEM_PRICE = 100_000_000;
export const MAX_TCG_PURCHASE_LIMIT = 1000;
export const MAX_TCG_FLAT_GEAR_STAT = 100_000;

const MAX_ACHIEVEMENT_XP = 1_000_000;
const MAX_ACHIEVEMENT_CREDITS = 100_000_000;

/** Custom gear codes carry this prefix, so they can never collide with a canonical code. */
export const CUSTOM_TCG_ITEM_PREFIX = 'CUSTOM_';
const CUSTOM_CODE_MESSAGE = 'Use 2 to 40 letters, digits or underscores.';

/** A custom gear code; `blade` becomes `CUSTOM_BLADE`. */
export const CustomTcgItemCodeSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const code = value.trim().toUpperCase();
    return code.startsWith(CUSTOM_TCG_ITEM_PREFIX) ? code : `${CUSTOM_TCG_ITEM_PREFIX}${code}`;
  },
  z
    .string({ invalid_type_error: CUSTOM_CODE_MESSAGE, required_error: CUSTOM_CODE_MESSAGE })
    .regex(/^CUSTOM_[A-Z0-9_]{2,40}$/, CUSTOM_CODE_MESSAGE),
);

function Text(label: string, max: number) {
  const message = `${label} must be 1 to ${max} characters.`;
  return z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z
      .string({ invalid_type_error: message, required_error: message })
      .min(1, message)
      .max(max, message),
  );
}

function OptionalText(label: string, max: number) {
  const message = `${label} can be at most ${max} characters.`;
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string({ invalid_type_error: message }).trim().max(max, message).nullable().default(null),
  );
}

/** An optional stat: empty means the item does not have it. */
function StatSetting(max: number, fraction: boolean) {
  const message = fraction
    ? `Enter a fraction from 0 to ${max} (0.1 = 10%), or leave it empty.`
    : `Enter a whole number from 0 to ${max}, or leave it empty.`;
  const number = z.number({ invalid_type_error: message }).min(0, message).max(max, message);
  return z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed === '' ? null : Number(trimmed);
    },
    (fraction ? number : number.int(message)).nullable().default(null),
  );
}

/** Shop fields of any TCG item: the only fields of a canonical item the owner may change. */
const shopFields = {
  isShopBuyable: FlagSetting,
  shopPrice: IntSetting(0, MAX_TCG_ITEM_PRICE),
  /** Most a player can buy in one purchase; 0 means no limit. */
  maxDailyPurchases: IntSetting(0, MAX_TCG_PURCHASE_LIMIT),
};

export const TcgShopFieldsInputSchema = z.object(shopFields).strict();
export type TcgShopFieldsInput = z.infer<typeof TcgShopFieldsInputSchema>;

const statFields = Object.fromEntries([
  ...TCG_FLAT_GEAR_STATS.map((stat) => [stat, StatSetting(MAX_TCG_FLAT_GEAR_STAT, false)]),
  ...TCG_FRACTION_GEAR_STATS.map((stat) => [stat, StatSetting(1, true)]),
]) as Record<TcgGearStat, ReturnType<typeof StatSetting>>;

/** A custom gear piece: every field of the row, validated against what the engine reads. */
export const TcgGearInputSchema = z
  .object({
    code: CustomTcgItemCodeSchema,
    name: Text('The name', 64),
    description: Text('The description', 500),
    subtype: z.enum(TCG_GEAR_SLOTS, {
      errorMap: () => ({ message: `Choose one of ${TCG_GEAR_SLOTS.join(', ')}.` }),
    }),
    rarity: z.enum(TCG_ITEM_RARITIES, {
      errorMap: () => ({ message: `Choose one of ${TCG_ITEM_RARITIES.join(', ')}.` }),
    }),
    battlePerks: z
      .array(
        z.enum(TCG_BATTLE_PERKS, {
          errorMap: () => ({ message: `Choose from ${TCG_BATTLE_PERKS.join(', ')}.` }),
        }),
      )
      .max(TCG_BATTLE_PERKS.length)
      .transform((perks) => [...new Set(perks)])
      .default([]),
    isTradeable: FlagSetting,
    ...shopFields,
    ...statFields,
  })
  .strict()
  .superRefine((gear, ctx) => {
    const stats = [...TCG_FLAT_GEAR_STATS, ...TCG_FRACTION_GEAR_STATS];
    if (!stats.some((stat) => gear[stat] !== null && gear[stat] !== 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['attack'],
        message: 'Give the piece at least one stat.',
      });
    }
  });
export type TcgGearInput = z.infer<typeof TcgGearInputSchema>;

/** The `base_stats` JSON of a gear input: only the stats it has. */
export function tcgGearBaseStats(input: TcgGearInput): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const stat of [...TCG_FLAT_GEAR_STATS, ...TCG_FRACTION_GEAR_STATS]) {
    const value = input[stat];
    if (value !== null && value !== 0) stats[stat] = value;
  }
  return stats;
}

/** Requirement types the bot records progress for; other achievements never unlock yet. */
export const TRACKED_ACHIEVEMENT_TYPES: readonly string[] = ['TUTORIAL_CLEARED'];

export const ACHIEVEMENT_TIERS = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'MYTHIC'] as const;

/** What the owner may change on an achievement; the requirement and reward items stay. */
export const TcgAchievementInputSchema = z
  .object({
    title: Text('The title', 80),
    description: Text('The description', 300),
    tier: z.enum(ACHIEVEMENT_TIERS, {
      errorMap: () => ({ message: `Choose one of ${ACHIEVEMENT_TIERS.join(', ')}.` }),
    }),
    rewardXp: IntSetting(0, MAX_ACHIEVEMENT_XP),
    rewardCredits: IntSetting(0, MAX_ACHIEVEMENT_CREDITS),
    rewardTitle: OptionalText('The reward title', 64),
    badgeIcon: OptionalText('The badge', 32),
    isHidden: FlagSetting,
  })
  .strict();
export type TcgAchievementInput = z.infer<typeof TcgAchievementInputSchema>;
