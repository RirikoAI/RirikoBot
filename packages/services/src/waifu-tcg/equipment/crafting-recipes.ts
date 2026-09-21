import { CANONICAL_ITEMS } from './catalog.js';
import { DAILY_ROTATION_MARKUP } from './tcg-shop.service.js';
import { RARITY_ENHANCEMENT_MULTIPLIERS } from './enhancement-service.js';

export interface CraftingIngredient {
  /** Catalog code of the item consumed as material. */
  code: string;
  /** Quantity consumed per single craft (scaled by the requested craft quantity). */
  quantity: number;
}

export interface CraftingRecipe {
  /** Unique recipe code, e.g. CRAFT_WEAPON_OBSIDIAN_KATANA. */
  code: string;
  /** Catalog code granted on success. */
  outputCode: string;
  outputQuantity: number;
  dustCost: number;
  creditCost: number;
  /** Owned items consumed on craft (lower-tier gear upgrade paths, potion stacking). */
  ingredients?: CraftingIngredient[];
  /** Highest dungeon floor the user must have cleared (current season) to unlock this recipe. */
  unlockFloor: number;
}

const ITEMS_BY_CODE = new Map(CANONICAL_ITEMS.map((item) => [item.code, item]));

/**
 * Pricing formula (a meaningful Crafting Dust sink that never undercuts other ways to gear up):
 *
 *  - creditCost = round(shopPrice * CRAFT_CREDIT_MULTIPLIER). CRAFT_CREDIT_MULTIPLIER is
 *    DAILY_ROTATION_MARKUP (the 1.5x the Town Shop charges for a drop-only item during its daily
 *    rotation window, see tcg-shop.service.ts) plus a 0.25 crafting premium. So a rotation item
 *    bought via crafting always costs strictly more credits than buying the same item the day
 *    it happens to be in rotation - crafting is the reliable path, never the cheap one.
 *  - dustCost = round(shopPrice / 1000 * CRAFT_DUST_PER_1K_VALUE * rarityMultiplier), reusing the
 *    same RARITY_ENHANCEMENT_MULTIPLIERS scale that equipment enhancement spends dust against, so
 *    crafting dust costs land on the scale players already know from +1..+10 enhancement instead
 *    of an arbitrary new curve.
 */
const CRAFT_CREDIT_MULTIPLIER = DAILY_ROTATION_MARKUP + 0.25;
const CRAFT_DUST_PER_1K_VALUE = 40;

function craftCost(code: string): { dustCost: number; creditCost: number } {
  const item = ITEMS_BY_CODE.get(code);
  if (!item) {
    throw new Error(`crafting-recipes.ts: unknown catalog code "${code}"`);
  }
  const multiplier = RARITY_ENHANCEMENT_MULTIPLIERS[item.rarity?.toUpperCase() ?? 'COMMON'] ?? 1.0;
  const price = item.shopPrice ?? 0;
  return {
    creditCost: Math.round(price * CRAFT_CREDIT_MULTIPLIER),
    dustCost: Math.round((price / 1000) * CRAFT_DUST_PER_1K_VALUE * multiplier),
  };
}

interface GearChainTier {
  code: string;
  /** Highest floor cleared required - set just past the boss wall of the PREVIOUS rarity
   *  bracket, so the piece helps clear the NEXT wall without skipping the one it follows. */
  unlockFloor: number;
}

/**
 * Non-signature, drop-only gear organized into per-slot upgrade chains. Each tier (after the
 * first) consumes one owned, unequipped copy of the tier before it - "melting down" the old
 * piece into the new one - which is why these read as upgrade paths rather than flat purchases.
 * Boss signature drops (assets/tcg/catalog/bosses/*.json `signatureDropCode`) are intentionally
 * absent from every chain: they stay a reward for beating that boss, never a craft.
 */
const GEAR_CHAINS: GearChainTier[][] = [
  // WEAPON: RARE -> SUPER_RARE -> ULTRA_RARE -> MYTHIC (no non-signature SECRET_RARE weapon exists)
  [
    { code: 'WEAPON_OBSIDIAN_KATANA', unlockFloor: 10 },
    { code: 'WEAPON_SOLAR_LANCE', unlockFloor: 20 },
    { code: 'WEAPON_CRIMSON_CALAMITY', unlockFloor: 30 },
    { code: 'WEAPON_WORLD_BREAKER', unlockFloor: 45 },
  ],
  // ARMOR: RARE -> SUPER_RARE -> ULTRA_RARE -> SECRET_RARE
  [
    { code: 'ARMOR_MAGMA_MAIL', unlockFloor: 10 },
    { code: 'ARMOR_DRAGONSCALE_PLATE', unlockFloor: 20 },
    { code: 'ARMOR_AEGIS_BARRIER', unlockFloor: 30 },
    { code: 'ARMOR_ETERNAL_CRUCIBLE', unlockFloor: 40 },
  ],
  // RELIC: RARE -> SUPER_RARE -> ULTRA_RARE -> SPECIAL_ILLUSTRATION_RARE (no non-signature
  // SECRET_RARE relic exists; Phoenix Feather is the relic slot's top tier instead)
  [
    { code: 'RELIC_CINDER_LANTERN', unlockFloor: 10 },
    { code: 'RELIC_PHOENIX_ASH_CENSER', unlockFloor: 20 },
    { code: 'RELIC_CHRONOS_HOURGLASS', unlockFloor: 30 },
    { code: 'RELIC_PHOENIX_FEATHER', unlockFloor: 40 },
  ],
  // RING: RARE -> SUPER_RARE -> ULTRA_RARE -> SECRET_RARE
  [
    { code: 'RING_BLAZING_SUN', unlockFloor: 10 },
    { code: 'RING_SOLAR_FLARE', unlockFloor: 20 },
    { code: 'RING_INFERNO_CROWN', unlockFloor: 30 },
    { code: 'RING_SUNFORGED_SIGIL', unlockFloor: 40 },
  ],
  // AMULET: RARE -> SUPER_RARE -> ULTRA_RARE -> SECRET_RARE
  [
    { code: 'AMULET_MOUNTAIN', unlockFloor: 10 },
    { code: 'AMULET_OBSIDIAN_HEART', unlockFloor: 20 },
    { code: 'AMULET_MAGMA_CORE', unlockFloor: 30 },
    { code: 'AMULET_PRIMORDIAL_FLAME', unlockFloor: 40 },
  ],
  // TALISMAN: RARE -> SUPER_RARE -> ULTRA_RARE -> SECRET_RARE
  [
    { code: 'TALISMAN_WINDWALKER', unlockFloor: 10 },
    { code: 'TALISMAN_EMBERSTEP', unlockFloor: 20 },
    { code: 'TALISMAN_TEMPEST_FEATHER', unlockFloor: 30 },
    { code: 'TALISMAN_ASHEN_WINGS', unlockFloor: 40 },
  ],
];

function gearRecipe(tier: GearChainTier, previousTier: GearChainTier | undefined): CraftingRecipe {
  return {
    code: `CRAFT_${tier.code}`,
    outputCode: tier.code,
    outputQuantity: 1,
    unlockFloor: tier.unlockFloor,
    ...craftCost(tier.code),
    ...(previousTier ? { ingredients: [{ code: previousTier.code, quantity: 1 }] } : {}),
  };
}

function potionRecipe(
  outputCode: string,
  unlockFloor: number,
  ingredients: CraftingIngredient[],
): CraftingRecipe {
  return {
    code: `CRAFT_${outputCode}`,
    outputCode,
    outputQuantity: 1,
    unlockFloor,
    ingredients,
    ...craftCost(outputCode),
  };
}

/**
 * Static crafting recipe table. Covers every non-signature, drop-only equipment/accessory piece
 * across rarities (as per-slot upgrade chains) plus the two dungeon-only potions that are safe
 * to make craftable (POTION_MAJOR_HP, POTION_GREATER_MANA). POTION_ELIXIR_VITALITY,
 * POTION_COSMIC_ETHER and every ENERGY_POTION are deliberately left out: they are one-time
 * reward-tier items (full heal + cleanse, full mana + free cast, energy economy) that would
 * trivialize their systems if buyable with dust.
 */
export const CRAFTING_RECIPES: readonly CraftingRecipe[] = [
  ...GEAR_CHAINS.flatMap((chain) => chain.map((tier, i) => gearRecipe(tier, chain[i - 1]))),
  potionRecipe('POTION_MAJOR_HP', 5, [{ code: 'POTION_MINOR_HP', quantity: 3 }]),
  potionRecipe('POTION_GREATER_MANA', 5, [{ code: 'POTION_MANA_DRAUGHT', quantity: 3 }]),
];

/** Looks up a recipe by its code, or undefined when unknown. */
export function findCraftingRecipe(code: string): CraftingRecipe | undefined {
  return CRAFTING_RECIPES.find((recipe) => recipe.code === code);
}
