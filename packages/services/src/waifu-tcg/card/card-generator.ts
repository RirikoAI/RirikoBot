import type { CardElement, CardRarity, WaifuAsset } from '../types.js';
import { RarityEngine, type RarityTierInfo } from '../rarity/rarity-engine.js';

export interface CardPrimaryStats {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  critRate: number;
  mp: number;
}

export interface CardSkillInfo {
  name: string;
  description: string;
  mpCost: number;
}

export interface CardPassiveInfo {
  name: string;
  description: string;
}

export interface GeneratedCardData {
  name: string;
  element: CardElement;
  rarity: CardRarity;
  stats: CardPrimaryStats;
  skill: CardSkillInfo;
  passive: CardPassiveInfo;
  collectionNumber: number;
  tierInfo: RarityTierInfo;
}

export interface CardGeneratorOptions {
  rarityEngine?: RarityEngine;
  randomFn?: () => number;
}

/**
 * Elementary skill catalog according to docs/waifu-tcg.md:L85-86.
 */
export const ELEMENTAL_SKILLS: Record<CardElement, { skill: CardSkillInfo; passive: CardPassiveInfo }> = {
  FIRE: {
    skill: {
      name: 'Inferno Burst',
      description: 'Costs 35 MP. Deals 170% Fire ATK and applies Burn for 2 turns.',
      mpCost: 35,
    },
    passive: {
      name: 'Flame Resonance',
      description: '+15% Fire damage and 10% increased Burn tick damage.',
    },
  },
  ICE: {
    skill: {
      name: 'Glacial Prison',
      description: 'Costs 40 MP. Deals 180% Ice ATK and freezes target for 1 turn.',
      mpCost: 40,
    },
    passive: {
      name: 'Absolute Zero',
      description: '+20% damage against Earth and 15% slow aura against targets.',
    },
  },
  EARTH: {
    skill: {
      name: 'Terra Aegis',
      description: 'Costs 30 MP. Deals 140% Earth ATK and fortifies DEF by 30% for 2 turns.',
      mpCost: 30,
    },
    passive: {
      name: 'Bedrock Stance',
      description: '+20% damage reduction when below 50% HP.',
    },
  },
  LIGHTNING: {
    skill: {
      name: 'Thunder Surge',
      description: 'Costs 35 MP. Deals 190% Lightning ATK with +20% Critical Strike bonus.',
      mpCost: 35,
    },
    passive: {
      name: 'Overcharge Flow',
      description: '+15% SPD and 10% chance to shock attacker on hit.',
    },
  },
  WATER: {
    skill: {
      name: 'Tidal Cleansing',
      description: 'Costs 30 MP. Deals 150% Water ATK and purifies active debuffs.',
      mpCost: 30,
    },
    passive: {
      name: 'Oceanic Grace',
      description: '+8% Max HP regeneration per combat turn.',
    },
  },
  LIGHT: {
    skill: {
      name: 'Radiant Nova',
      description: 'Costs 45 MP. Deals 200% Light ATK and pierces 25% enemy DEF.',
      mpCost: 45,
    },
    passive: {
      name: 'Solar Halo',
      description: '+15% ATK buff to user and immunity to debuff dispels.',
    },
  },
  SHADOW: {
    skill: {
      name: 'Abyssal Leech',
      description: 'Costs 40 MP. Deals 175% Shadow ATK and leeches 25% damage as HP.',
      mpCost: 40,
    },
    passive: {
      name: 'Dark Harvest',
      description: '+20% lifesteal against Light enemies and +10% ATK on enemy defeat.',
    },
  },
};

/**
 * Formats a card serial number matching specification (e.g. #0042/1000).
 */
export function formatCardSerialNumber(serial: number, maxSerial = 1000): string {
  const padded = String(serial).padStart(4, '0');
  return `#${padded}/${maxSerial}`;
}

/**
 * Detects elemental affinity from tags or falls back to FIRE.
 */
export function resolveElementFromTags(tags: string[] = []): CardElement {
  const lowerTags = tags.map((t) => t.toLowerCase());
  if (lowerTags.some((t) => t.includes('ice') || t.includes('frost') || t.includes('cold'))) return 'ICE';
  if (lowerTags.some((t) => t.includes('fire') || t.includes('flame') || t.includes('burn'))) return 'FIRE';
  if (lowerTags.some((t) => t.includes('earth') || t.includes('stone') || t.includes('rock'))) return 'EARTH';
  if (lowerTags.some((t) => t.includes('lightning') || t.includes('thunder') || t.includes('electric'))) return 'LIGHTNING';
  if (lowerTags.some((t) => t.includes('water') || t.includes('aqua') || t.includes('ocean'))) return 'WATER';
  if (lowerTags.some((t) => t.includes('light') || t.includes('holy') || t.includes('radiant'))) return 'LIGHT';
  if (lowerTags.some((t) => t.includes('shadow') || t.includes('dark') || t.includes('void'))) return 'SHADOW';
  return 'FIRE';
}

export class CardGenerator {
  private readonly rarityEngine: RarityEngine;
  private readonly randomFn: () => number;

  constructor(options: CardGeneratorOptions = {}) {
    this.rarityEngine = options.rarityEngine ?? new RarityEngine(options.randomFn);
    this.randomFn = options.randomFn ?? Math.random;
  }

  /**
   * Generates dynamic primary stats conforming strictly to docs/waifu-tcg.md:L79-84:
   * - HP: 500 – 15,000
   * - ATK: 50 – 2,500
   * - DEF: 30 – 1,800
   * - SPD: 10 – 300
   * - CRIT: 5% – 50%
   * - MP: 100
   */
  generateStats(rarity: CardRarity): CardPrimaryStats {
    const tier = this.rarityEngine.getTierInfo(rarity);
    const m = tier.statMultiplier;

    // Base rolls before multiplier
    const baseHp = 500 + Math.floor(this.randomFn() * 1000); // 500 - 1500
    const baseAtk = 50 + Math.floor(this.randomFn() * 250);   // 50 - 300
    const baseDef = 30 + Math.floor(this.randomFn() * 180);   // 30 - 210
    const baseSpd = 10 + Math.floor(this.randomFn() * 80);    // 10 - 90
    const baseCrit = 0.05 + this.randomFn() * 0.08;          // 5% - 13%

    // Multiplier scaling & bounds clamping
    const hp = Math.min(15000, Math.max(500, Math.round(baseHp * m)));
    const attack = Math.min(2500, Math.max(50, Math.round(baseAtk * m)));
    const defense = Math.min(1800, Math.max(30, Math.round(baseDef * m)));
    const speed = Math.min(300, Math.max(10, Math.round(baseSpd * (1 + (m - 1) * 0.35))));
    const critRate = Math.min(0.50, Math.max(0.05, Number((baseCrit * (1 + (m - 1) * 0.2)).toFixed(3))));

    return {
      hp,
      attack,
      defense,
      speed,
      critRate,
      mp: 100, // Standard MP capacity
    };
  }

  /**
   * Generates a complete waifu card from an asset definition.
   */
  generateCard(
    asset: WaifuAsset,
    overrides?: {
      rarity?: CardRarity;
      element?: CardElement;
      collectionNumber?: number;
    },
  ): GeneratedCardData {
    const rarity = overrides?.rarity ?? this.rarityEngine.rollRarity();
    const element = overrides?.element ?? resolveElementFromTags(asset.tags);
    const tierInfo = this.rarityEngine.getTierInfo(rarity);
    const stats = this.generateStats(rarity);
    const elementalCatalog = ELEMENTAL_SKILLS[element];

    return {
      name: asset.characterName,
      element,
      rarity,
      stats,
      skill: elementalCatalog.skill,
      passive: elementalCatalog.passive,
      collectionNumber: overrides?.collectionNumber ?? 1,
      tierInfo,
    };
  }
}
