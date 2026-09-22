import type { WaifuAsset, WaifuSource } from '@ririko/database';

export type { WaifuAsset, WaifuSource };

export type CardElement =
  | 'FIRE'
  | 'ICE'
  | 'EARTH'
  | 'LIGHTNING'
  | 'WATER'
  | 'LIGHT'
  | 'SHADOW';

export type CardRarity =
  | 'COMMON'
  | 'UNCOMMON'
  | 'RARE'
  | 'SUPER_RARE'
  | 'ULTRA_RARE'
  | 'SECRET_RARE'
  | 'SIR'
  | 'MYTHIC';

export type GearSlot =
  | 'WEAPON'
  | 'ARMOR'
  | 'RELIC'
  | 'RING'
  | 'AMULET'
  | 'TALISMAN';

export type CardState = 'IDLE' | 'EQUIPPED' | 'IN_TRADE' | 'IN_MARKET';

export interface ImageValidationResult {
  isValid: boolean;
  format?: 'png' | 'jpeg' | 'webp';
  width?: number;
  height?: number;
  aspectRatio?: number;
  hash?: string;
  error?: string;
}

export interface IngestionResult {
  success: boolean;
  asset?: WaifuAsset;
  reason?: string;
  isDuplicate?: boolean;
}
