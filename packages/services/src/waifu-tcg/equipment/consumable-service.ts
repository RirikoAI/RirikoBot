import { DatabaseError } from '@ririko/core';
import type {
  GameItemRepository,
  PlayerEnergyRepository,
  UserInventoryItemRepository,
} from '@ririko/database';
import type { Combatant } from '../combat/types.js';
import type { ConsumableUseResult } from './types.js';

export const DAILY_ENERGY_POTION_CAP = 3;

export class ConsumableService {
  constructor(
    private readonly itemRepo: GameItemRepository,
    private readonly inventoryRepo: UserInventoryItemRepository,
    private readonly energyRepo: PlayerEnergyRepository,
  ) {}

  /**
   * Consumes an item from user inventory (Energy Restores, HP Potions, Mana Potions).
   */
  async useItem(
    userId: string,
    userItemId: string,
    targetCombatant?: Combatant,
  ): Promise<ConsumableUseResult> {
    // 1. Fetch user inventory item
    const invItem = await this.inventoryRepo.findById(userItemId);
    if (!invItem || invItem.userId !== userId) {
      throw new DatabaseError('Item not found in your inventory');
    }
    if (invItem.quantity <= 0) {
      throw new DatabaseError('You do not have any more of this item');
    }

    // 2. Fetch definition
    const itemDef = await this.itemRepo.findById(invItem.itemId);
    if (!itemDef) {
      throw new DatabaseError('Item definition not found in catalog');
    }

    if (itemDef.type !== 'CONSUMABLE') {
      throw new DatabaseError(`Cannot consume ${itemDef.name}: it is not a consumable item`);
    }

    const effect = (itemDef.consumableEffect ?? {}) as Record<string, unknown>;

    // ─── A. ENERGY RESTORES ──────────────────────────────────────────────────
    if (itemDef.subtype === 'ENERGY_POTION') {
      let energyAmount = Number(effect.energyRestored ?? 15);

      if (effect.fullEnergyRestore === true) {
        const energyRecord = await this.energyRepo.getOrCreate(userId);
        energyAmount = energyRecord.maxEnergy + energyRecord.bonusEnergy - energyRecord.currentEnergy;
      }

      const potionResult = await this.energyRepo.consumeEnergyPotion(
        userId,
        energyAmount,
        DAILY_ENERGY_POTION_CAP,
      );

      if (!potionResult.success) {
        return {
          success: false,
          type: 'ENERGY',
          restoredAmount: 0,
          reason: potionResult.reason ?? `You have reached your daily stamina potion limit (${DAILY_ENERGY_POTION_CAP}/${DAILY_ENERGY_POTION_CAP}). Rest well, summoner!`,
          userEnergy: potionResult.energy.currentEnergy,
          potsUsedToday: potionResult.potsUsedToday,
        };
      }

      // Decrement item inventory quantity
      await this.decrementInventory(invItem.id, invItem.quantity);

      return {
        success: true,
        type: 'ENERGY',
        restoredAmount: potionResult.energyRestored,
        userEnergy: potionResult.energy.currentEnergy,
        potsUsedToday: potionResult.potsUsedToday,
      };
    }

    // ─── B. HP POTIONS ───────────────────────────────────────────────────────
    if (itemDef.subtype === 'HP_POTION') {
      if (!targetCombatant) {
        throw new DatabaseError('Please specify a combatant or card to use this HP potion on');
      }

      const healFlat = Number(effect.healFlat ?? 0);
      const healPercent = Number(effect.healPercent ?? 0);
      const cleanse = Boolean(effect.cleanseDebuffs ?? false);

      const percentAmount = Math.round(targetCombatant.maxHealth * healPercent);
      const restoreAmount = Math.max(healFlat, percentAmount);

      const prevHp = targetCombatant.currentHealth;
      targetCombatant.currentHealth = Math.min(
        targetCombatant.maxHealth,
        targetCombatant.currentHealth + restoreAmount,
      );
      const actualHealed = targetCombatant.currentHealth - prevHp;

      if (cleanse) {
        targetCombatant.statusEffects = [];
      }

      await this.decrementInventory(invItem.id, invItem.quantity);

      return {
        success: true,
        type: 'HP',
        restoredAmount: actualHealed,
        cleansedDebuffs: cleanse,
      };
    }

    // ─── C. MANA POTIONS ─────────────────────────────────────────────────────
    if (itemDef.subtype === 'MANA_POTION') {
      if (!targetCombatant) {
        throw new DatabaseError('Please specify a combatant or card to use this Mana potion on');
      }

      const restoreFlat = Number(effect.restoreMp ?? 0);
      const restorePercent = Number(effect.restoreMpPercent ?? 0);

      const percentAmount = Math.round(targetCombatant.maxMp * restorePercent);
      const restoreAmount = Math.max(restoreFlat, percentAmount);

      const prevMp = targetCombatant.currentMp;
      targetCombatant.currentMp = Math.min(
        targetCombatant.maxMp,
        targetCombatant.currentMp + restoreAmount,
      );
      const actualRestored = targetCombatant.currentMp - prevMp;

      await this.decrementInventory(invItem.id, invItem.quantity);

      return {
        success: true,
        type: 'MANA',
        restoredAmount: actualRestored,
      };
    }

    throw new DatabaseError(`Unsupported consumable subtype: ${itemDef.subtype}`);
  }

  private async decrementInventory(id: string, currentQty: number): Promise<void> {
    if (currentQty <= 1) {
      await this.inventoryRepo.delete(id);
    } else {
      await this.inventoryRepo.update(id, { quantity: currentQty - 1 });
    }
  }
}
