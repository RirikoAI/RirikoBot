import { DatabaseError } from '@ririko/core';
import type {
  GameItemRepository,
  UserInventoryItemRepository,
  WaifuCardRepository,
  UserCard,
} from '@ririko/database';
import type { Combatant } from '../combat/types.js';
import type { CardElement, CardRarity } from '../types.js';
import { createCardCombatant } from '../card/card-combatant.js';
import type { EnhancementService } from './enhancement-service.js';
import {
  ALL_GEAR_SLOTS,
  type CardLoadout,
  type EquipmentStats,
  type GearSlot,
  type UserInventoryItemWithDefinition,
} from './types.js';

/** Adds one gear piece's stats onto a running total. */
export function addEquipmentStats(target: EquipmentStats, source: EquipmentStats): void {
  if (source.attack) target.attack = (target.attack ?? 0) + source.attack;
  if (source.defense) target.defense = (target.defense ?? 0) + source.defense;
  if (source.health) target.health = (target.health ?? 0) + source.health;
  if (source.speed) target.speed = (target.speed ?? 0) + source.speed;
  if (source.critRate) target.critRate = +((target.critRate ?? 0) + source.critRate).toFixed(4);
  if (source.critDamage) target.critDamage = +((target.critDamage ?? 0) + source.critDamage).toFixed(4);
  if (source.mitigation) target.mitigation = +((target.mitigation ?? 0) + source.mitigation).toFixed(4);
  if (source.elementalMastery) target.elementalMastery = +((target.elementalMastery ?? 0) + source.elementalMastery).toFixed(4);
  if (source.manaShield) target.manaShield = (target.manaShield ?? 0) + source.manaShield;
  if (source.armorPiercing) target.armorPiercing = +((target.armorPiercing ?? 0) + source.armorPiercing).toFixed(4);
  if (source.elementalResistance) target.elementalResistance = +((target.elementalResistance ?? 0) + source.elementalResistance).toFixed(4);
  if (source.manaMax) target.manaMax = (target.manaMax ?? 0) + source.manaMax;
  if (source.manaRegen) target.manaRegen = +((target.manaRegen ?? 0) + source.manaRegen).toFixed(4);
}

/** Applies gear stats and battle perks to a combatant before battle. */
export function applyEquipmentToCombatant(
  combatant: Combatant,
  stats: EquipmentStats,
  perks: readonly string[],
): void {
  if (stats.health) {
    combatant.maxHealth += stats.health;
    combatant.currentHealth += stats.health;
  }
  if (stats.attack) {
    combatant.attack += stats.attack;
  }
  if (stats.defense) {
    combatant.defense += stats.defense;
  }
  if (stats.speed) {
    combatant.speed += stats.speed;
  }
  if (stats.critRate) {
    combatant.critRate += stats.critRate;
  }

  for (const perk of perks) {
    // Map tiered perks (e.g. VAMPIRIC_TOUCH_T2) back to base perk trigger for combat engine
    const basePerk = perk.replace(/_T\d+$/, '') as import('../combat/types.js').BattlePerkType;
    if (!combatant.perks.includes(basePerk)) {
      combatant.perks.push(basePerk);
    }
  }
}

export class LoadoutService {
  constructor(
    private readonly itemRepo: GameItemRepository,
    private readonly inventoryRepo: UserInventoryItemRepository,
    private readonly cardRepo: WaifuCardRepository,
    private readonly enhancementService: EnhancementService,
  ) {}

  /**
   * Equips an item to a card in one of the 6 designated slots.
   */
  async equip(
    userId: string,
    cardId: string,
    userItemId: string,
    slot: GearSlot,
  ): Promise<{ loadout: CardLoadout; unequippedItemName?: string | undefined }> {
    if (!ALL_GEAR_SLOTS.includes(slot)) {
      throw new DatabaseError(`Invalid gear slot: ${slot}. Allowed: ${ALL_GEAR_SLOTS.join(', ')}`);
    }

    // 1. Verify card exists and belongs to user
    const userCard = await this.cardRepo.findUserCardById(cardId);
    if (!userCard || userCard.userId !== userId) {
      throw new DatabaseError('Card not found or does not belong to you');
    }

    // 2. Verify item exists and belongs to user
    const invItem = await this.inventoryRepo.findById(userItemId);
    if (!invItem || invItem.userId !== userId) {
      throw new DatabaseError('Item not found or does not belong to you');
    }

    // 3. Verify item definition
    const itemDef = await this.itemRepo.findById(invItem.itemId);
    if (!itemDef) {
      throw new DatabaseError('Item definition not found in catalog');
    }

    // 4. Verify slot matches item subtype
    if (itemDef.subtype !== slot) {
      throw new DatabaseError(
        `Slot mismatch! ${itemDef.name} is a ${itemDef.subtype}, but you are trying to equip it into the ${slot} slot.`,
      );
    }

    // 5. Perform atomic equip and swap
    const { unequippedItem } = await this.inventoryRepo.equipToCard(
      userId,
      userItemId,
      cardId,
      slot,
    );

    let unequippedItemName: string | undefined;
    if (unequippedItem) {
      const oldDef = await this.itemRepo.findById(unequippedItem.itemId);
      unequippedItemName = oldDef?.name;
    }

    const loadout = await this.getCardLoadout(cardId);
    return { loadout, unequippedItemName };
  }

  /**
   * Unequips an item from a card.
   */
  async unequip(
    userId: string,
    userItemId: string,
  ): Promise<{ loadout: CardLoadout; unequippedItemName: string }> {
    const invItem = await this.inventoryRepo.findById(userItemId);
    if (!invItem || invItem.userId !== userId) {
      throw new DatabaseError('Item not found or does not belong to you');
    }
    if (invItem.state !== 'EQUIPPED' || !invItem.equippedToCardId) {
      throw new DatabaseError('Item is not currently equipped to any card');
    }

    const cardId = invItem.equippedToCardId;
    const itemDef = await this.itemRepo.findById(invItem.itemId);
    const unequippedItemName = itemDef?.name ?? 'Item';

    await this.inventoryRepo.unequipFromCard(userId, userItemId);
    const loadout = await this.getCardLoadout(cardId);

    return { loadout, unequippedItemName };
  }

  /**
   * Retrieves the full 6-slot loadout, aggregated stats, and active perks for a card.
   */
  async getCardLoadout(cardId: string): Promise<CardLoadout> {
    const equippedItems = await this.inventoryRepo.findEquippedByCard(cardId);

    const loadout: CardLoadout = {
      cardId,
      aggregateStats: {},
      activePerks: [],
    };

    for (const inv of equippedItems) {
      const itemDef = await this.itemRepo.findById(inv.itemId);
      if (!itemDef) continue;

      const effectiveStats = this.enhancementService.getScaledStats(
        itemDef.baseStats,
        inv.enhancementLevel,
      );
      const effectivePerks = this.enhancementService.getScaledPerks(
        itemDef.battlePerks,
        inv.enhancementLevel,
      );

      const piece: UserInventoryItemWithDefinition = {
        inventoryItem: inv,
        item: itemDef,
        effectiveStats,
        effectivePerks,
      };

      if (inv.slot === 'WEAPON') loadout.weapon = piece;
      else if (inv.slot === 'ARMOR') loadout.armor = piece;
      else if (inv.slot === 'RELIC') loadout.relic = piece;
      else if (inv.slot === 'RING') loadout.ring = piece;
      else if (inv.slot === 'AMULET') loadout.amulet = piece;
      else if (inv.slot === 'TALISMAN') loadout.talisman = piece;

      // Accumulate stats
      addEquipmentStats(loadout.aggregateStats, effectiveStats);

      // Accumulate perks
      for (const perk of effectivePerks) {
        if (!loadout.activePerks.includes(perk)) {
          loadout.activePerks.push(perk);
        }
      }
    }

    return loadout;
  }

  /**
   * Builds the battle-ready form of an owned card: level-scaled stats, the card's real
   * skill MP cost, and its equipped gear.
   */
  async buildCombatant(userCard: UserCard, team: 'TEAM_A' | 'TEAM_B'): Promise<Combatant | null> {
    const base = await this.cardRepo.findById(userCard.cardId);
    if (!base) return null;

    const combatant = createCardCombatant(
      {
        id: userCard.id,
        name: base.name,
        element: (base.element as CardElement) ?? 'FIRE',
        rarity: (base.rarity as CardRarity) ?? 'COMMON',
        level: userCard.level,
        stats: {
          hp: base.health,
          attack: base.attack,
          defense: base.defense,
          speed: base.speed,
          critRate: base.critRate,
        },
        skillName: base.skillName,
        skillDescription: base.skillDescription,
        passiveName: base.passiveName,
        passiveDescription: base.passiveDescription,
      },
      team,
    );

    this.applyLoadoutToCombatant(combatant, await this.getCardLoadout(userCard.id));
    return combatant;
  }

  /**
   * The user's battle party: their EQUIPPED cards, or their first card when none is equipped.
   */
  async buildActiveParty(userId: string, team: 'TEAM_A' | 'TEAM_B'): Promise<Combatant[]> {
    let userCards = await this.cardRepo.listUserCards(userId, { state: 'EQUIPPED' });
    if (userCards.length === 0) {
      userCards = await this.cardRepo.listUserCards(userId, { limit: 1 });
    }

    const party: Combatant[] = [];
    for (const userCard of userCards) {
      const combatant = await this.buildCombatant(userCard, team);
      if (combatant) party.push(combatant);
    }
    return party;
  }

  /**
   * Applies the equipped loadout stats and perks to a Combatant instance before battle.
   */
  applyLoadoutToCombatant(combatant: Combatant, loadout: CardLoadout): void {
    applyEquipmentToCombatant(combatant, loadout.aggregateStats, loadout.activePerks);
  }
}
