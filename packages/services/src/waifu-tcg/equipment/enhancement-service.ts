import { DatabaseError } from '@ririko/core';
import type {
  GameItemRepository,
  UserInventoryItemRepository,
} from '@ririko/database';
import type {
  EnhancementCost,
  EnhancementResult,
  EquipmentStats,
} from './types.js';
import { CRAFTING_DUST_CODE } from './catalog.js';
import { ItemGrantService } from './item-grant.service.js';

export const MAX_ENHANCEMENT_LEVEL = 10;

export const RARITY_ENHANCEMENT_MULTIPLIERS: Record<string, number> = {
  COMMON: 1.0,
  UNCOMMON: 1.2,
  RARE: 1.5,
  SUPER_RARE: 2.0,
  ULTRA_RARE: 3.0,
  SECRET_RARE: 4.0,
  SPECIAL_ILLUSTRATION_RARE: 5.0,
  MYTHIC: 8.0,
};

/**
 * Computes scaled stats for an equipment piece at a given enhancement level (+0 to +10).
 * Base stats increase by +8% per level (up to +80% at +10).
 */
export function scaleEquipmentStats(
  baseStats: Record<string, number> | null | undefined,
  level: number,
): EquipmentStats {
  if (!baseStats) return {};

  const levelClamped = Math.max(0, Math.min(MAX_ENHANCEMENT_LEVEL, level));
  const multiplier = 1 + 0.08 * levelClamped;

  const scaled: EquipmentStats = {};

  if (baseStats.attack !== undefined) {
    scaled.attack = Math.round(baseStats.attack * multiplier);
  }
  if (baseStats.defense !== undefined) {
    scaled.defense = Math.round(baseStats.defense * multiplier);
  }
  if (baseStats.health !== undefined) {
    scaled.health = Math.round(baseStats.health * multiplier);
  }
  if (baseStats.speed !== undefined) {
    scaled.speed = Math.round(baseStats.speed * multiplier);
  }
  if (baseStats.critRate !== undefined) {
    scaled.critRate = +(baseStats.critRate + levelClamped * 0.005).toFixed(4);
  }
  if (baseStats.critDamage !== undefined) {
    scaled.critDamage = +(baseStats.critDamage + levelClamped * 0.01).toFixed(4);
  }
  if (baseStats.mitigation !== undefined) {
    scaled.mitigation = +(baseStats.mitigation + levelClamped * 0.005).toFixed(4);
  }
  if (baseStats.elementalMastery !== undefined) {
    scaled.elementalMastery = +(baseStats.elementalMastery + levelClamped * 0.01).toFixed(4);
  }
  if (baseStats.manaShield !== undefined) {
    scaled.manaShield = Math.round(baseStats.manaShield * multiplier);
  }
  if (baseStats.armorPiercing !== undefined) {
    scaled.armorPiercing = +(baseStats.armorPiercing + levelClamped * 0.005).toFixed(4);
  }
  if (baseStats.elementalResistance !== undefined) {
    scaled.elementalResistance = +(baseStats.elementalResistance + levelClamped * 0.005).toFixed(4);
  }
  if (baseStats.manaMax !== undefined) {
    scaled.manaMax = Math.round(baseStats.manaMax * multiplier);
  }
  if (baseStats.manaRegen !== undefined) {
    scaled.manaRegen = +(baseStats.manaRegen + levelClamped * 0.01).toFixed(4);
  }

  return scaled;
}

/**
 * Returns perk scaling tier or enhanced perk identifiers for +5 and +10 breakpoints.
 */
export function scaleEquipmentPerks(perks: string[] | null | undefined, level: number): string[] {
  if (!perks || perks.length === 0) return [];
  const levelClamped = Math.max(0, Math.min(MAX_ENHANCEMENT_LEVEL, level));

  return perks.map((perk) => {
    if (levelClamped >= 10) {
      return `${perk}_T3`;
    } else if (levelClamped >= 5) {
      return `${perk}_T2`;
    }
    return perk;
  });
}

export class EnhancementService {
  private readonly grants: ItemGrantService;

  constructor(
    private readonly itemRepo: GameItemRepository,
    private readonly inventoryRepo: UserInventoryItemRepository,
  ) {
    this.grants = new ItemGrantService(itemRepo, inventoryRepo);
  }

  /** Crafting Dust the user currently holds. */
  getDustBalance(userId: string): Promise<number> {
    return this.grants.countOwned(userId, CRAFTING_DUST_CODE);
  }

  /**
   * Calculates Crafting Dust and Credit costs to upgrade from currentLevel to currentLevel + 1.
   */
  getEnhancementCost(rarity: string, currentLevel: number): EnhancementCost {
    if (currentLevel >= MAX_ENHANCEMENT_LEVEL) {
      return { dustCost: 0, creditCost: 0 };
    }

    const multiplier = RARITY_ENHANCEMENT_MULTIPLIERS[rarity.toUpperCase()] ?? 1.0;
    const targetLevel = currentLevel + 1;

    const baseDust = targetLevel * 25;
    const baseCredits = targetLevel * 200;

    return {
      dustCost: Math.round(baseDust * multiplier),
      creditCost: Math.round(baseCredits * multiplier),
    };
  }

  getScaledStats(baseStats: Record<string, number> | null | undefined, level: number): EquipmentStats {
    return scaleEquipmentStats(baseStats, level);
  }

  getScaledPerks(perks: string[] | null | undefined, level: number): string[] {
    return scaleEquipmentPerks(perks, level);
  }

  /**
   * Performs an equipment enhancement from +N to +(N+1), spending the user's Crafting Dust.
   * Credits are checked here; the caller debits them through the economy ledger.
   */
  async enhance(userId: string, userItemId: string, userCredits: bigint | number): Promise<EnhancementResult> {
    const invItem = await this.inventoryRepo.findById(userItemId);
    if (!invItem || invItem.userId !== userId) {
      throw new DatabaseError('Item not found or does not belong to you');
    }

    const itemDef = await this.itemRepo.findById(invItem.itemId);
    if (!itemDef) {
      throw new DatabaseError('Item definition not found in catalog');
    }

    if (itemDef.type !== 'EQUIPMENT' && itemDef.type !== 'ACCESSORY') {
      throw new DatabaseError('Only equipment and accessories can be enhanced');
    }

    if (invItem.enhancementLevel >= MAX_ENHANCEMENT_LEVEL) {
      throw new DatabaseError(`Item is already at maximum enhancement (+${MAX_ENHANCEMENT_LEVEL})`);
    }

    const cost = this.getEnhancementCost(itemDef.rarity, invItem.enhancementLevel);
    const creditsNum = Number(userCredits);
    const userDust = await this.getDustBalance(userId);

    if (userDust < cost.dustCost) {
      throw new DatabaseError(
        `Insufficient Crafting Dust! Required: ${cost.dustCost} Dust, but you only have ${userDust} Dust.`,
      );
    }
    if (creditsNum < cost.creditCost) {
      throw new DatabaseError(
        `Insufficient Credits! Required: ${cost.creditCost} Credits, but you only have ${creditsNum} Credits.`,
      );
    }

    await this.grants.consume(userId, CRAFTING_DUST_CODE, cost.dustCost);

    const newLevel = invItem.enhancementLevel + 1;
    const updated = await this.inventoryRepo.update(userItemId, {
      enhancementLevel: newLevel,
    });

    const scaledStats = this.getScaledStats(itemDef.baseStats, newLevel);
    const scaledPerks = this.getScaledPerks(itemDef.battlePerks, newLevel);

    return {
      success: true,
      item: updated,
      previousLevel: invItem.enhancementLevel,
      newLevel,
      dustSpent: cost.dustCost,
      creditsSpent: cost.creditCost,
      scaledStats,
      scaledPerks,
    };
  }
}
