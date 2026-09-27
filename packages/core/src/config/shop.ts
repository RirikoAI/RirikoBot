import { z } from 'zod';
import { FlagSetting, IntSetting, OptionalIntSetting } from './guild-config.js';

/*
 * The global item shop (`economy_items`, `economy_item_categories`). Items are shared by every
 * guild, so they are edited only in the owner console.
 */

export const ITEM_RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'] as const;
export type ItemRarity = (typeof ITEM_RARITIES)[number];

/** What using an item does; `InventoryService.useItem` dispatches on it. */
export const ITEM_EFFECT_TYPES = [
  'ENERGY_RESTORE',
  'XP_GRANT',
  'CREDITS_GRANT',
  'PROFILE_BG_TOKEN',
  'GENERIC',
] as const;
export type ItemEffectTypeName = (typeof ITEM_EFFECT_TYPES)[number];

/** Metadata keys the item editor owns; any other key in an item's metadata is kept as it is. */
export const ITEM_EFFECT_METADATA_KEYS = [
  'itemType',
  'energyRestored',
  'dailyUsageCeiling',
  'xpAwarded',
  'creditsAwarded',
  'dailyPurchaseLimit',
] as const;

export const MAX_ITEM_PRICE = 1_000_000_000;
export const MAX_ITEM_DAILY_PURCHASE_LIMIT = 1000;
export const MAX_ITEM_ENERGY_RESTORED = 1000;
export const MAX_ITEM_DAILY_USAGE_CEILING = 100;
export const MAX_ITEM_XP_AWARDED = 100_000;
export const MAX_ITEM_CREDITS_AWARDED = 1_000_000;

const CODE_MESSAGE = 'Use 2 to 32 lowercase letters, digits or underscores.';

/** A stable slug: what members type in `/shop buy`, and what the default catalog seeds by. */
export const CatalogCodeSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
  z
    .string({ invalid_type_error: CODE_MESSAGE, required_error: CODE_MESSAGE })
    .regex(/^[a-z0-9_]{2,32}$/, CODE_MESSAGE),
);

function TextSetting(label: string, max: number) {
  const message = `${label} must be 1 to ${max} characters.`;
  return z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z
      .string({ invalid_type_error: message, required_error: message })
      .min(1, message)
      .max(max, message),
  );
}

/** Optional text: empty means none. */
function OptionalTextSetting(label: string, max: number) {
  const message = `${label} can be at most ${max} characters.`;
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string({ invalid_type_error: message }).trim().max(max, message).nullable().default(null),
  );
}

const IconUrlSetting = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z
    .string()
    .trim()
    .max(500, 'The icon URL can be at most 500 characters.')
    .url('Enter a full https:// URL, or leave it empty.')
    .refine((url) => url.startsWith('https://'), 'Enter a full https:// URL, or leave it empty.')
    .nullable()
    .default(null),
);

/** A category ID, or `null` for none; an empty string clears it. */
const CategoryIdSetting = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().max(64).nullable().default(null),
);

/** Optional number that only some effect types use; empty means unset. */
function EffectAmountSetting(max: number) {
  const message = `Enter a whole number from 1 to ${max}.`;
  return z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed === '' ? null : Number(trimmed);
    },
    z
      .number({ invalid_type_error: message })
      .int(message)
      .min(1, message)
      .max(max, message)
      .nullable()
      .default(null),
  );
}

/** Which amount each effect type needs, and the field it is edited under. */
const EFFECT_AMOUNT_FIELDS: Partial<
  Record<ItemEffectTypeName, 'energyRestored' | 'xpAwarded' | 'creditsAwarded'>
> = {
  ENERGY_RESTORE: 'energyRestored',
  XP_GRANT: 'xpAwarded',
  CREDITS_GRANT: 'creditsAwarded',
};

/** A shop item as the owner console and its schema see it. */
export const ShopItemInputSchema = z
  .object({
    code: CatalogCodeSchema,
    name: TextSetting('The name', 64),
    description: TextSetting('The description', 500),
    price: IntSetting(0, MAX_ITEM_PRICE),
    rarity: z.enum(ITEM_RARITIES, {
      errorMap: () => ({ message: `Choose one of ${ITEM_RARITIES.join(', ')}.` }),
    }),
    categoryId: CategoryIdSetting,
    iconUrl: IconUrlSetting,
    isPurchasable: FlagSetting,
    dailyPurchaseLimit: OptionalIntSetting(1, MAX_ITEM_DAILY_PURCHASE_LIMIT),
    itemType: z.enum(ITEM_EFFECT_TYPES, {
      errorMap: () => ({ message: `Choose one of ${ITEM_EFFECT_TYPES.join(', ')}.` }),
    }),
    energyRestored: EffectAmountSetting(MAX_ITEM_ENERGY_RESTORED),
    dailyUsageCeiling: EffectAmountSetting(MAX_ITEM_DAILY_USAGE_CEILING),
    xpAwarded: EffectAmountSetting(MAX_ITEM_XP_AWARDED),
    creditsAwarded: EffectAmountSetting(MAX_ITEM_CREDITS_AWARDED),
  })
  .strict()
  .superRefine((item, ctx) => {
    const field = EFFECT_AMOUNT_FIELDS[item.itemType];
    if (field && item[field] === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: 'This effect needs an amount.',
      });
    }
  })
  .transform((item) => ({
    ...item,
    // Only the chosen effect's amounts are kept; potions default to 3 uses a day.
    energyRestored: item.itemType === 'ENERGY_RESTORE' ? item.energyRestored : null,
    dailyUsageCeiling: item.itemType === 'ENERGY_RESTORE' ? (item.dailyUsageCeiling ?? 3) : null,
    xpAwarded: item.itemType === 'XP_GRANT' ? item.xpAwarded : null,
    creditsAwarded: item.itemType === 'CREDITS_GRANT' ? item.creditsAwarded : null,
  }));

export type ShopItemInput = z.output<typeof ShopItemInputSchema>;

/**
 * An item's metadata from the editor's values. Keys the editor does not own stay as they are,
 * and effect amounts the chosen effect does not use are removed.
 */
export function shopItemMetadata(
  input: ShopItemInput,
  previous: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(previous ?? {})) {
    if (!(ITEM_EFFECT_METADATA_KEYS as readonly string[]).includes(key)) metadata[key] = value;
  }
  metadata['itemType'] = input.itemType;
  for (const key of [
    'energyRestored',
    'dailyUsageCeiling',
    'xpAwarded',
    'creditsAwarded',
    'dailyPurchaseLimit',
  ] as const) {
    if (input[key] !== null) metadata[key] = input[key];
  }
  return metadata;
}

/** The editor's values for an existing item's metadata (unknown effects read as GENERIC). */
export function shopItemEffectValues(metadata: Record<string, unknown> | null | undefined): {
  itemType: ItemEffectTypeName;
  energyRestored: number | null;
  dailyUsageCeiling: number | null;
  xpAwarded: number | null;
  creditsAwarded: number | null;
  dailyPurchaseLimit: number | null;
} {
  const read = (key: string) => {
    const value = metadata?.[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };
  const type = metadata?.['itemType'];
  return {
    itemType: (ITEM_EFFECT_TYPES as readonly unknown[]).includes(type)
      ? (type as ItemEffectTypeName)
      : 'GENERIC',
    energyRestored: read('energyRestored'),
    dailyUsageCeiling: read('dailyUsageCeiling'),
    xpAwarded: read('xpAwarded'),
    creditsAwarded: read('creditsAwarded'),
    dailyPurchaseLimit: read('dailyPurchaseLimit'),
  };
}

export const ShopCategoryInputSchema = z
  .object({
    code: CatalogCodeSchema,
    name: TextSetting('The name', 64),
    description: OptionalTextSetting('The description', 200),
  })
  .strict();

export type ShopCategoryInput = z.output<typeof ShopCategoryInputSchema>;
