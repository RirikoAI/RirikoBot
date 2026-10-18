import { describe, it, expect } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import {
  CardSynthesizer,
  clampTextScale,
  fitWrappedText,
  synthesizeCardImage,
} from '../canvas/card-synthesizer.js';
import type { CardElement, CardRarity } from '../types.js';

describe('CardSynthesizer', () => {
  const baseStats = {
    hp: 1250,
    attack: 240,
    defense: 180,
    speed: 45,
    critRate: 0.12,
    mp: 100,
  };

  const baseSkill = {
    name: 'Inferno Burst',
    description: 'Costs 35 MP. Deals 170% Fire ATK and applies Burn for 2 turns.',
    mpCost: 35,
  };

  const basePassive = {
    name: 'Flame Resonance',
    description: '+15% Fire damage and 10% increased Burn tick damage.',
  };

  it('synthesizes a valid PNG card with correct magic bytes', async () => {
    const synth = new CardSynthesizer();
    const buffer = await synth.synthesizeCard({
      name: 'Rias Gremory',
      animeTitle: 'High School DxD',
      element: 'FIRE',
      rarity: 'ULTRA_RARE',
      stats: baseStats,
      skill: baseSkill,
      passive: basePassive,
      collectionNumber: 1,
      maxCollectionNumber: 350,
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(10000);

    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50);
    expect(buffer[2]).toBe(0x4e);
    expect(buffer[3]).toBe(0x47);
    expect(buffer[4]).toBe(0x0d);
    expect(buffer[5]).toBe(0x0a);
    expect(buffer[6]).toBe(0x1a);
    expect(buffer[7]).toBe(0x0a);
  });

  it('renders all 7 elements successfully', async () => {
    const synth = new CardSynthesizer();
    const elements: CardElement[] = [
      'FIRE',
      'ICE',
      'WATER',
      'EARTH',
      'LIGHTNING',
      'LIGHT',
      'SHADOW',
    ];

    for (const element of elements) {
      const buffer = await synth.synthesizeCard({
        name: `Hero of ${element}`,
        animeTitle: 'Elemental Chronicles',
        element,
        rarity: 'RARE',
        stats: baseStats,
        skill: baseSkill,
        passive: basePassive,
      });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(5000);
      expect(buffer[0]).toBe(0x89);
    }
  });

  it('renders all 8 rarity tiers including full-art SIR and Mythic', async () => {
    const synth = new CardSynthesizer();
    const rarities: CardRarity[] = [
      'COMMON',
      'UNCOMMON',
      'RARE',
      'SUPER_RARE',
      'ULTRA_RARE',
      'SECRET_RARE',
      'SIR',
      'MYTHIC',
    ];

    for (const rarity of rarities) {
      const buffer = await synth.synthesizeCard({
        name: `Waifu ${rarity}`,
        animeTitle: 'Rarity Test Series',
        element: 'ICE',
        rarity,
        stats: baseStats,
        skill: baseSkill,
        passive: basePassive,
      });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(5000);
      expect(buffer[0]).toBe(0x89);
    }
  });

  it('gracefully handles missing artwork with silhouette fallback', async () => {
    const synth = new CardSynthesizer();
    const buffer = await synth.synthesizeCard({
      name: 'Silhouette Character',
      animeTitle: 'Unknown Series',
      element: 'SHADOW',
      rarity: 'SUPER_RARE',
      stats: baseStats,
      isSilhouette: true,
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(5000);
    expect(buffer[0]).toBe(0x89);
  });

  it('works with top-level synthesizeCardImage function export', async () => {
    const buffer = await synthesizeCardImage({
      name: 'Aria of the Flame',
      animeTitle: 'Starter Guild',
      element: 'FIRE',
      rarity: 'COMMON',
      stats: baseStats,
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(5000);
    expect(buffer[0]).toBe(0x89);
  });
  it('renders at both text scale limits and clamps out-of-range scales', async () => {
    expect(clampTextScale(undefined)).toBe(1);
    expect(clampTextScale(5)).toBe(1.2);
    expect(clampTextScale(0.1)).toBe(0.8);
    expect(clampTextScale(Number.NaN)).toBe(1);

    const synth = new CardSynthesizer();
    for (const textScale of [0.8, 1.2]) {
      const buffer = await synth.synthesizeCard({
        name: 'An Extremely Long Character Name That Must Shrink To Fit',
        animeTitle: 'A Very Long Anime Title: The Movie Part Two Remastered Edition',
        element: 'WATER',
        rarity: 'MYTHIC',
        stats: { ...baseStats, hp: 15000 },
        skill: { ...baseSkill, description: baseSkill.description.repeat(4) },
        passive: basePassive,
        textScale,
      });
      expect(buffer[0]).toBe(0x89);
    }
  });

  it('wraps text, shrinks before truncating, and never exceeds the line limit', () => {
    const ctx = createCanvas(10, 10).getContext('2d');
    const short = fitWrappedText(ctx, 'Short text', 600, 2, 24, 18);
    expect(short).toEqual({ lines: ['Short text'], size: 24 });

    const long = 'Deals heavy damage and applies several effects '.repeat(6).trim();
    const fitted = fitWrappedText(ctx, long, 300, 2, 24, 18);
    expect(fitted.lines).toHaveLength(2);
    expect(fitted.size).toBe(18);
    expect(fitted.lines[1]!.endsWith('…')).toBe(true);
    for (const line of fitted.lines) expect(ctx.measureText(line).width).toBeLessThanOrEqual(300);
  });
});
