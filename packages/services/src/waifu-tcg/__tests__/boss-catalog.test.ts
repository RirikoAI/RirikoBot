import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { loadImage } from '@napi-rs/canvas';
import { resolveWorkspacePath } from '@ririko/core';
import {
  applySyncedCharacter,
  bossCatalogSchema,
  bossToCatalogCharacter,
  planSeasonFloors,
  suggestBossCandidates,
  toBossRow,
  toFloorRow,
  type BossCatalog,
} from '../dungeon/boss-catalog.js';
import {
  BOSS_IMAGE_HEIGHT,
  BOSS_IMAGE_WIDTH,
  BossSynthesizer,
} from '../canvas/boss-synthesizer.js';

function catalog(overrides: Partial<BossCatalog> = {}): BossCatalog {
  return bossCatalogSchema.parse({
    seasonId: 's9_test',
    season: {
      name: 'Test Season',
      description: 'test',
      themeElement: 'FIRE',
      seasonalAffixes: [],
      scalingModel: 'HYBRID',
      scalingParams: {},
      durationDays: 90,
    },
    floorCount: 12,
    floorOverrides: {
      '3': { name: 'The Third Gate', overrides: { statMultipliers: { hp: 1.2 } } },
    },
    bosses: [
      { key: 'a', name: 'Alpha', anime: 'Show A', element: 'FIRE', tier: 'STANDARD' },
      { key: 'b', name: 'Beta', anime: 'Show B', element: 'EARTH', tier: 'STANDARD' },
      { key: 'c', name: 'Gamma', anime: 'Show C', element: 'FIRE', tier: 'STANDARD' },
      {
        key: 'm5',
        name: 'Mini',
        anime: 'Show M',
        element: 'EARTH',
        tier: 'MINI_BOSS',
        floors: [5],
      },
      {
        key: 'm10',
        name: 'Major',
        anime: 'Show X',
        element: 'FIRE',
        tier: 'MAJOR_BOSS',
        floors: [10],
        title: 'Queen of Ash',
      },
    ],
    ...overrides,
  });
}

describe('Boss catalog & builder helpers (STORY-153)', () => {
  it('assigns every floor, rotating standard bosses without back-to-back repeats', () => {
    const plan = planSeasonFloors(catalog());
    expect(plan.map((f) => f.floorNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(plan.find((f) => f.floorNumber === 5)?.bossKey).toBe('m5');
    expect(plan.find((f) => f.floorNumber === 10)).toMatchObject({
      bossKey: 'm10',
      name: 'Queen of Ash',
      tier: 'MAJOR_BOSS',
    });
    expect(plan.find((f) => f.floorNumber === 3)?.name).toBe('The Third Gate');

    const standard = plan.filter((f) => f.tier === 'STANDARD').map((f) => f.bossKey);
    for (let i = 1; i < standard.length; i++) expect(standard[i]).not.toBe(standard[i - 1]);
    expect(new Set(standard)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('rejects tier/floor mismatches and unguarded boss floors', () => {
    const base = catalog();
    const wrongTier = {
      ...base,
      bosses: base.bosses.map((b) => (b.key === 'm5' ? { ...b, floors: [7] } : b)),
    };
    expect(() => planSeasonFloors(wrongTier)).toThrow(/floor 7 is a STANDARD floor/);

    const noMajor = { ...base, bosses: base.bosses.filter((b) => b.key !== 'm10') };
    expect(() => planSeasonFloors(noMajor)).toThrow(/floor 10 is a MAJOR_BOSS floor with no boss/);
  });

  it('maps catalog entries to boss and floor rows', () => {
    const cat = catalog();
    const plan = planSeasonFloors(cat);
    const floor3 = toFloorRow(cat, plan[2]!);
    expect(floor3.enemyLineup).toEqual([
      { bossId: 's9_test:c', overrides: { statMultipliers: { hp: 1.2 } } },
    ]);
    expect(toFloorRow(cat, plan[9]!)).toMatchObject({ isBossFloor: true, energyCost: 10 });

    const row = toBossRow(cat, cat.bosses[4]!, {
      assetId: 'asset-1',
      imagePath: 'public/bosses/s9_test/m10.png',
    });
    expect(row).toMatchObject({
      id: 's9_test:m10',
      tier: 'MAJOR_BOSS',
      title: 'Queen of Ash',
      assetId: 'asset-1',
    });
  });

  it('round-trips sync fields and suggests unused themed characters', () => {
    const cat = catalog();
    const synced = applySyncedCharacter(cat.bosses[0]!, {
      ...bossToCatalogCharacter(cat.bosses[0]!),
      anilistId: 42,
      danbooruTag: 'alpha_(show_a)',
    });
    expect(synced).toMatchObject({ key: 'a', anilistId: 42, danbooruTag: 'alpha_(show_a)' });

    const suggestions = suggestBossCandidates(
      [
        { key: 'x', name: 'Alpha', anime: 'Show A', element: 'FIRE', tags: [], favourites: 999 },
        { key: 'y', name: 'Blaze', anime: 'Show Y', element: 'FIRE', tags: [], favourites: 10 },
        { key: 'z', name: 'Frost', anime: 'Show Z', element: 'ICE', tags: [], favourites: 50 },
        { key: 'w', name: 'Rock', anime: 'Show W', element: 'EARTH', tags: [], favourites: 30 },
      ],
      cat,
      ['FIRE', 'EARTH'],
      5,
    );
    expect(suggestions.map((s) => s.name)).toEqual(['Rock', 'Blaze']);
  });

  it('renders a plain portrait with and without artwork', async () => {
    const synthesizer = new BossSynthesizer();
    const art = fs.readFileSync(resolveWorkspacePath('assets/tcg/elements/fire.png'));
    for (const input of [{ imageBuffer: art }, {}]) {
      const png = await synthesizer.render({
        name: 'Shana',
        animeTitle: 'Shakugan no Shana',
        element: 'FIRE',
        tier: 'MAJOR_BOSS',
        title: 'Flame Haze',
        floorLabel: 'Floor 10',
        ...input,
      });
      const img = await loadImage(png);
      expect([img.width, img.height]).toEqual([BOSS_IMAGE_WIDTH, BOSS_IMAGE_HEIGHT]);
    }
  });
});
