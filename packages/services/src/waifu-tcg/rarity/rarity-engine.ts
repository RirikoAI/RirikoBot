import type { CardRarity } from '../types.js';

export interface RarityTierInfo {
  rarity: CardRarity;
  name: string;
  weight: number; // Probability between 0 and 1
  statMultiplier: number;
  maxLevel: number;
  foilEffect: string;
}

/**
 * Authoritative 8-Tier Rarity Specification from docs/waifu-tcg.md:L61-L71.
 */
export const RARITY_TIERS: Record<CardRarity, RarityTierInfo> = {
  COMMON: {
    rarity: 'COMMON',
    name: 'Common',
    weight: 0.6,
    statMultiplier: 1.0,
    maxLevel: 20,
    foilEffect: 'Standard Card Border',
  },
  UNCOMMON: {
    rarity: 'UNCOMMON',
    name: 'Uncommon',
    weight: 0.2,
    statMultiplier: 1.2,
    maxLevel: 30,
    foilEffect: 'Bronze Trim',
  },
  RARE: {
    rarity: 'RARE',
    name: 'Rare',
    weight: 0.1,
    statMultiplier: 1.5,
    maxLevel: 40,
    foilEffect: 'Silver Sheen',
  },
  SUPER_RARE: {
    rarity: 'SUPER_RARE',
    name: 'Super Rare (SR)',
    weight: 0.06,
    statMultiplier: 1.9,
    maxLevel: 50,
    foilEffect: 'Gold Shimmer',
  },
  ULTRA_RARE: {
    rarity: 'ULTRA_RARE',
    name: 'Ultra Rare (UR)',
    weight: 0.03,
    statMultiplier: 2.5,
    maxLevel: 60,
    foilEffect: 'Prismatic Hologram',
  },
  SECRET_RARE: {
    rarity: 'SECRET_RARE',
    name: 'Secret Rare (SEC)',
    weight: 0.009,
    statMultiplier: 3.2,
    maxLevel: 70,
    foilEffect: 'Dark Sparkle Foil',
  },
  SIR: {
    rarity: 'SIR',
    name: 'Special Illustration Rare (SIR)',
    weight: 0.0009,
    statMultiplier: 4.0,
    maxLevel: 85,
    foilEffect: 'Full-Art Textured Foil',
  },
  MYTHIC: {
    rarity: 'MYTHIC',
    name: 'Mythic',
    weight: 0.0001,
    statMultiplier: 5.0,
    maxLevel: 100,
    foilEffect: 'Cosmic Celestial Animated Foil',
  },
};

/**
 * Ordered tiers from rarest to commonest for threshold evaluation.
 */
export const ORDERED_RARITY_TIERS: CardRarity[] = [
  'MYTHIC',
  'SIR',
  'SECRET_RARE',
  'ULTRA_RARE',
  'SUPER_RARE',
  'RARE',
  'UNCOMMON',
  'COMMON',
];

/**
 * Simple, high-quality pseudo-random generator for deterministic testing.
 */
export function createMulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RarityEngine {
  private readonly randomFn: () => number;

  constructor(randomFn: () => number = Math.random) {
    this.randomFn = randomFn;
  }

  /**
   * Retrieves tier metadata for a given rarity.
   */
  getTierInfo(rarity: CardRarity): RarityTierInfo {
    return RARITY_TIERS[rarity];
  }

  /**
   * Rolls a random rarity tier based on exact cumulative probability weights.
   * Total distribution = 1.0 (100%).
   *
   * Thresholds:
   * [0.000000, 0.000100) -> MYTHIC (0.01%)
   * [0.000100, 0.001000) -> SIR (0.09%)
   * [0.001000, 0.010000) -> SECRET_RARE (0.90%)
   * [0.010000, 0.040000) -> ULTRA_RARE (3.00%)
   * [0.040000, 0.100000) -> SUPER_RARE (6.00%)
   * [0.100000, 0.200000) -> RARE (10.00%)
   * [0.200000, 0.400000) -> UNCOMMON (20.00%)
   * [0.400000, 1.000000] -> COMMON (60.00%)
   */
  rollRarity(roll?: number): CardRarity {
    const value = roll !== undefined ? roll : this.randomFn();

    if (value < 0.0001) return 'MYTHIC';
    if (value < 0.001) return 'SIR';
    if (value < 0.01) return 'SECRET_RARE';
    if (value < 0.04) return 'ULTRA_RARE';
    if (value < 0.1) return 'SUPER_RARE';
    if (value < 0.2) return 'RARE';
    if (value < 0.4) return 'UNCOMMON';
    return 'COMMON';
  }
}
