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

export interface WaifuImTag {
  tag_id: number;
  name: string;
  description: string;
  is_nsfw: boolean;
}

export interface WaifuImImage {
  image_id: number | string;
  signature: string;
  extension: string;
  image: string; // URL
  url?: string;
  byte_size?: number;
  width: number;
  height: number;
  tags?: Array<{ name: string; is_nsfw?: boolean }>;
  dominant_color?: string;
  source?: string;
  uploaded_at?: string;
  is_nsfw?: boolean;
}

export interface WaifuImSearchResponse {
  images: WaifuImImage[];
}

export interface WaifuImSearchOptions {
  tags?: string[];
  isNsfw?: boolean;
  many?: boolean;
  limit?: number;
}

export interface IngestionResult {
  success: boolean;
  asset?: WaifuAsset;
  reason?: string;
  isDuplicate?: boolean;
}
