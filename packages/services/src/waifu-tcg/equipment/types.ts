import type { GameItem, UserInventoryItem } from '@ririko/database';
import type { GearSlot } from '../types.js';

export type { GearSlot };

export type GearType = 'EQUIPMENT' | 'ACCESSORY' | 'CONSUMABLE';

export type GearSubtype =
  | 'WEAPON'
  | 'ARMOR'
  | 'RELIC'
  | 'RING'
  | 'AMULET'
  | 'TALISMAN'
  | 'HP_POTION'
  | 'MANA_POTION'
  | 'ENERGY_POTION';

export const EQUIPMENT_SLOTS: GearSlot[] = ['WEAPON', 'ARMOR', 'RELIC'];
export const ACCESSORY_SLOTS: GearSlot[] = ['RING', 'AMULET', 'TALISMAN'];
export const ALL_GEAR_SLOTS: GearSlot[] = [...EQUIPMENT_SLOTS, ...ACCESSORY_SLOTS];

export interface EquipmentStats {
  attack?: number | undefined;
  defense?: number | undefined;
  health?: number | undefined;
  speed?: number | undefined;
  critRate?: number | undefined;
  critDamage?: number | undefined;
  mitigation?: number | undefined;
  elementalMastery?: number | undefined;
  manaShield?: number | undefined;
  armorPiercing?: number | undefined;
  elementalResistance?: number | undefined;
  manaMax?: number | undefined;
  manaRegen?: number | undefined;
}

export interface UserInventoryItemWithDefinition {
  inventoryItem: UserInventoryItem;
  item: GameItem;
  effectiveStats: EquipmentStats;
  effectivePerks: string[];
}

export interface CardLoadout {
  cardId: string;
  weapon?: UserInventoryItemWithDefinition | undefined;
  armor?: UserInventoryItemWithDefinition | undefined;
  relic?: UserInventoryItemWithDefinition | undefined;
  ring?: UserInventoryItemWithDefinition | undefined;
  amulet?: UserInventoryItemWithDefinition | undefined;
  talisman?: UserInventoryItemWithDefinition | undefined;
  aggregateStats: EquipmentStats;
  activePerks: string[];
}

export interface EnhancementCost {
  dustCost: number;
  creditCost: number;
}

export interface EnhancementResult {
  success: boolean;
  item: UserInventoryItem;
  previousLevel: number;
  newLevel: number;
  dustSpent: number;
  creditsSpent: number;
  scaledStats: EquipmentStats;
  scaledPerks: string[];
}

export interface ConsumableUseResult {
  success: boolean;
  type: 'HP' | 'MANA' | 'ENERGY';
  restoredAmount: number;
  cleansedDebuffs?: boolean | undefined;
  reason?: string | undefined;
  userEnergy?: number | undefined;
  potsUsedToday?: number | undefined;
}
