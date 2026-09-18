import { describe, it, expect } from 'vitest';
import {
  RarityEngine,
  RARITY_TIERS,
  createMulberry32,
} from '../rarity/rarity-engine.js';
import {
  CardGenerator,
  formatCardSerialNumber,
  resolveElementFromTags,
  ELEMENTAL_SKILLS,
} from '../card/card-generator.js';
import { LevelingEngine } from '../card/leveling-engine.js';
import type { CardRarity, WaifuAsset } from '../types.js';

describe('Rarity Math, Card Generation & Leveling Engine (TASK-1011)', () => {
  describe('8-Tier Rarity Math (docs/waifu-tcg.md:L57-71)', () => {
    const engine = new RarityEngine();

    it('should configure exact 8 rarity tiers with specified multipliers and max levels', () => {
      expect(RARITY_TIERS.COMMON.statMultiplier).toBe(1.0);
      expect(RARITY_TIERS.COMMON.maxLevel).toBe(20);

      expect(RARITY_TIERS.UNCOMMON.statMultiplier).toBe(1.2);
      expect(RARITY_TIERS.UNCOMMON.maxLevel).toBe(30);

      expect(RARITY_TIERS.RARE.statMultiplier).toBe(1.5);
      expect(RARITY_TIERS.RARE.maxLevel).toBe(40);

      expect(RARITY_TIERS.SUPER_RARE.statMultiplier).toBe(1.9);
      expect(RARITY_TIERS.SUPER_RARE.maxLevel).toBe(50);

      expect(RARITY_TIERS.ULTRA_RARE.statMultiplier).toBe(2.5);
      expect(RARITY_TIERS.ULTRA_RARE.maxLevel).toBe(60);

      expect(RARITY_TIERS.SECRET_RARE.statMultiplier).toBe(3.2);
      expect(RARITY_TIERS.SECRET_RARE.maxLevel).toBe(70);

      expect(RARITY_TIERS.SIR.statMultiplier).toBe(4.0);
      expect(RARITY_TIERS.SIR.maxLevel).toBe(85);

      expect(RARITY_TIERS.MYTHIC.statMultiplier).toBe(5.0);
      expect(RARITY_TIERS.MYTHIC.maxLevel).toBe(100);
    });

    it('should map specific roll thresholds to exact rarity tiers', () => {
      expect(engine.rollRarity(0.00005)).toBe('MYTHIC');       // < 0.0001 (0.01%)
      expect(engine.rollRarity(0.0005)).toBe('SIR');           // < 0.001 (0.09%)
      expect(engine.rollRarity(0.005)).toBe('SECRET_RARE');    // < 0.01 (0.90%)
      expect(engine.rollRarity(0.025)).toBe('ULTRA_RARE');     // < 0.04 (3.00%)
      expect(engine.rollRarity(0.07)).toBe('SUPER_RARE');      // < 0.10 (6.00%)
      expect(engine.rollRarity(0.15)).toBe('RARE');            // < 0.20 (10.00%)
      expect(engine.rollRarity(0.30)).toBe('UNCOMMON');        // < 0.40 (20.00%)
      expect(engine.rollRarity(0.75)).toBe('COMMON');          // <= 1.0 (60.00%)
    });

    it('should approximate theoretical distribution across 10,000 deterministic seeded rolls', () => {
      const prng = createMulberry32(1337);
      const seededEngine = new RarityEngine(prng);

      const counts: Record<CardRarity, number> = {
        COMMON: 0,
        UNCOMMON: 0,
        RARE: 0,
        SUPER_RARE: 0,
        ULTRA_RARE: 0,
        SECRET_RARE: 0,
        SIR: 0,
        MYTHIC: 0,
      };

      const TOTAL_ROLLS = 10000;
      for (let i = 0; i < TOTAL_ROLLS; i++) {
        const rarity = seededEngine.rollRarity();
        counts[rarity] = (counts[rarity] ?? 0) + 1;
      }

      // Check within sensible statistical tolerance (3 standard deviations)
      expect((counts.COMMON ?? 0) / TOTAL_ROLLS).toBeGreaterThan(0.57);
      expect((counts.COMMON ?? 0) / TOTAL_ROLLS).toBeLessThan(0.63);

      expect((counts.UNCOMMON ?? 0) / TOTAL_ROLLS).toBeGreaterThan(0.17);
      expect((counts.UNCOMMON ?? 0) / TOTAL_ROLLS).toBeLessThan(0.23);

      expect((counts.RARE ?? 0) / TOTAL_ROLLS).toBeGreaterThan(0.08);
      expect((counts.RARE ?? 0) / TOTAL_ROLLS).toBeLessThan(0.12);

      expect((counts.SUPER_RARE ?? 0) / TOTAL_ROLLS).toBeGreaterThan(0.04);
      expect((counts.SUPER_RARE ?? 0) / TOTAL_ROLLS).toBeLessThan(0.08);
    });
  });

  describe('Card Generator (docs/waifu-tcg.md:L72-89)', () => {
    const generator = new CardGenerator();

    const mockAsset: WaifuAsset = {
      id: 'asset_esdeath_01',
      sourceId: 'WAIFU_IM',
      sourceImageId: '777',
      characterName: 'Esdeath',
      animeTitle: 'Akame ga Kill!',
      imageHash: 'esdeath_hash_777',
      localStoragePath: '/assets/esdeath.png',
      discordCdnUrl: null,
      isDeletedByRequest: false,
      tags: ['esdeath', 'general', 'ice_affinity'],
      createdAt: new Date(),
    };

    it('should format card serial numbers as specified (#0042/1000)', () => {
      expect(formatCardSerialNumber(42, 1000)).toBe('#0042/1000');
      expect(formatCardSerialNumber(1, 1000)).toBe('#0001/1000');
      expect(formatCardSerialNumber(1000, 1000)).toBe('#1000/1000');
    });

    it('should resolve element from asset tags, prioritizing ice over generic tags', () => {
      expect(resolveElementFromTags(['ice_queen', 'cold'])).toBe('ICE');
      expect(resolveElementFromTags(['fire_mage', 'flame'])).toBe('FIRE');
      expect(resolveElementFromTags(['stone_golem'])).toBe('EARTH');
      expect(resolveElementFromTags(['thunder_clash'])).toBe('LIGHTNING');
      expect(resolveElementFromTags(['ocean_breeze'])).toBe('WATER');
      expect(resolveElementFromTags(['holy_priest'])).toBe('LIGHT');
      expect(resolveElementFromTags(['dark_shadow'])).toBe('SHADOW');
    });

    it('should generate card data with bounds-compliant primary stats and elemental skills', () => {
      const card = generator.generateCard(mockAsset, {
        rarity: 'MYTHIC',
        element: 'ICE',
      });

      expect(card.name).toBe('Esdeath');
      expect(card.element).toBe('ICE');
      expect(card.rarity).toBe('MYTHIC');

      // Primary stats bounds check (docs/waifu-tcg.md:L79-84)
      expect(card.stats.hp).toBeGreaterThanOrEqual(500);
      expect(card.stats.hp).toBeLessThanOrEqual(15000);

      expect(card.stats.attack).toBeGreaterThanOrEqual(50);
      expect(card.stats.attack).toBeLessThanOrEqual(2500);

      expect(card.stats.defense).toBeGreaterThanOrEqual(30);
      expect(card.stats.defense).toBeLessThanOrEqual(1800);

      expect(card.stats.speed).toBeGreaterThanOrEqual(10);
      expect(card.stats.speed).toBeLessThanOrEqual(300);

      expect(card.stats.critRate).toBeGreaterThanOrEqual(0.05);
      expect(card.stats.critRate).toBeLessThanOrEqual(0.50);

      expect(card.stats.mp).toBe(100);

      // Unique Active Skill and Passive (docs/waifu-tcg.md:L85-86)
      expect(card.skill.name).toBe('Glacial Prison');
      expect(card.skill.mpCost).toBe(40);
      expect(card.passive.name).toBe('Absolute Zero');
    });

    it('should scale stats according to rarity multiplier', () => {
      const commonStats = generator.generateStats('COMMON');
      const mythicStats = generator.generateStats('MYTHIC');

      expect(mythicStats.hp).toBeGreaterThan(commonStats.hp);
      expect(mythicStats.attack).toBeGreaterThan(commonStats.attack);
      expect(mythicStats.defense).toBeGreaterThan(commonStats.defense);
    });

    it('should cover all 7 elements in skill catalog', () => {
      const elements = ['FIRE', 'ICE', 'EARTH', 'LIGHTNING', 'WATER', 'LIGHT', 'SHADOW'] as const;
      for (const el of elements) {
        expect(ELEMENTAL_SKILLS[el]).toBeDefined();
        expect(ELEMENTAL_SKILLS[el].skill.name).toBeDefined();
        expect(ELEMENTAL_SKILLS[el].skill.mpCost).toBeGreaterThan(0);
        expect(ELEMENTAL_SKILLS[el].passive.name).toBeDefined();
      }
    });
  });

  describe('Leveling Engine', () => {
    const leveling = new LevelingEngine();

    it('should calculate exponential EXP requirements', () => {
      expect(leveling.getExpForNextLevel(1)).toBe(100);
      expect(leveling.getExpForNextLevel(2)).toBe(282); // floor(100 * 2^1.5) = floor(282.84) = 282
      expect(leveling.getExpForNextLevel(10)).toBe(3162);
    });

    it('should advance card level and carry over remainder EXP', () => {
      // Lv 1 requires 100 EXP to reach Lv 2
      const res = leveling.addExp(1, 0, 150, 50);
      expect(res.newLevel).toBe(2);
      expect(res.newExp).toBe(50);
      expect(res.levelsGained).toBe(1);
      expect(res.isMaxLevel).toBe(false);
    });

    it('should enforce hard cap at rarity max level', () => {
      // COMMON card max level is 20
      const res = leveling.addExp(19, 0, 500000, 20);
      expect(res.newLevel).toBe(20);
      expect(res.newExp).toBe(0);
      expect(res.isMaxLevel).toBe(true);
      expect(res.expToNextLevel).toBe(0);
    });

    it('should calculate scaled stats with level growth (+2% per level beyond Lv 1)', () => {
      const baseStats = {
        hp: 1000,
        attack: 200,
        defense: 100,
        speed: 50,
        critRate: 0.1,
        mp: 100,
      };

      const lv1Stats = leveling.calculateScaledStats(baseStats, 1);
      expect(lv1Stats.hp).toBe(1000);
      expect(lv1Stats.attack).toBe(200);

      // Level 11 = 10 levels beyond Lv 1 = +20%
      const lv11Stats = leveling.calculateScaledStats(baseStats, 11);
      expect(lv11Stats.hp).toBe(1200);
      expect(lv11Stats.attack).toBe(240);
      expect(lv11Stats.defense).toBe(120);
      expect(lv11Stats.speed).toBe(60);
      expect(lv11Stats.mp).toBe(100);
    });
  });
});
