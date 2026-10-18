import { describe, expect, it } from 'vitest';
import type { DungeonBoss, DungeonSeason } from '@ririko/database';
import { ScalingEngine } from '../dungeon/scaling-engine.js';
import { resolveAffixTheme, SEASON_AFFIX_SETS } from '../dungeon/season-affixes.js';
import {
  bossDefinitionFromInput,
  bossEditInputSchema,
  bossFormValues,
  newSeasonFormValues,
  seasonCreateInputSchema,
  seasonCurvePoints,
  seasonFormValues,
  seasonRowFromInput,
  seasonUpdateInputSchema,
} from '../dungeon/dungeon-admin-input.js';
import { toSeasonContent, toSeasonRow, type BossCatalog } from '../dungeon/boss-catalog.js';

function season(overrides: Partial<DungeonSeason> = {}): DungeonSeason {
  return {
    id: 's1',
    name: 'Season 1',
    description: 'Fire',
    themeElement: 'FIRE',
    seasonalAffixes: ['SCORCHED_EARTH', 'HEAT_HAZE'],
    scalingModel: 'EXPONENTIAL',
    scalingParams: {
      baseStats: { hp: 950, attack: 90, defense: 50, speed: 22 },
      growthRate: 0.058,
      affixStartFloor: 6,
      enrage: { startTurn: 12, trueDamage: false },
    },
    isTutorial: false,
    isActive: true,
    startsAt: new Date('2026-09-01T00:00:00Z'),
    endsAt: new Date('2026-12-01T00:00:00Z'),
    createdAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  } as DungeonSeason;
}

describe('resolveAffixTheme', () => {
  it('reads the theme from the affixes only', () => {
    for (const [theme, affixes] of Object.entries(SEASON_AFFIX_SETS)) {
      expect(resolveAffixTheme(affixes)).toBe(theme);
    }
    expect(resolveAffixTheme(['tidal_barrier'])).toBe('ABYSSAL_MAELSTROM');
    expect(resolveAffixTheme(['INFERNAL_HEAT'])).toBe('INFERNAL_CRUCIBLE');
    expect(resolveAffixTheme(['TWILIGHT_VEIL'])).toBe('CELESTIAL_TWILIGHT');
    expect(resolveAffixTheme(['TORRENTIAL_RAIN'])).toBe('ABYSSAL_MAELSTROM');
    expect(resolveAffixTheme([])).toBe('NONE');
    expect(resolveAffixTheme(null)).toBe('NONE');
    expect(resolveAffixTheme(['UNKNOWN'])).toBe('NONE');
  });
});

describe('season editor input', () => {
  it('round-trips a stored season through the form fields', () => {
    const stored = season();
    const values = seasonFormValues(stored);
    expect(values).toMatchObject({
      affixSet: 'INFERNAL_CRUCIBLE',
      startsAt: '2026-09-01',
      baseHp: 950,
      enrageStartTurn: 12,
      enrageTrueDamage: 'no',
      enragePerTurn: null,
    });
    const { id: _id, ...fields } = values;
    const row = seasonRowFromInput(seasonUpdateInputSchema.parse(fields));
    expect(row.scalingParams).toEqual(stored.scalingParams);
    expect(row.seasonalAffixes).toEqual(stored.seasonalAffixes);
    expect(row.startsAt).toEqual(stored.startsAt);
  });

  it('maps unknown stored values to editor defaults', () => {
    const values = seasonFormValues(
      season({ themeElement: 'NEUTRAL', scalingModel: 'CUSTOM', seasonalAffixes: [] }),
    );
    expect(values).toMatchObject({
      themeElement: 'ALL',
      scalingModel: 'EXPONENTIAL',
      affixSet: 'NONE',
    });
  });

  it('defaults a new season to 90 days from today', () => {
    const values = newSeasonFormValues(new Date('2026-09-28T15:30:00Z'));
    expect(values).toMatchObject({ startsAt: '2026-09-28', endsAt: '2026-12-27' });
  });

  it('validates the season ID, text, dates and numbers', () => {
    const result = seasonCreateInputSchema.safeParse({
      ...newSeasonFormValues(),
      id: 'bad id!',
      name: '',
      description: 'x',
      startsAt: 'soon',
      growthRate: '5',
      enrageStartTurn: '2.5',
    });
    expect(result.success).toBe(false);
    const fields = result.success ? {} : result.error.flatten().fieldErrors;
    expect(Object.keys(fields).sort()).toEqual(
      ['enrageStartTurn', 'growthRate', 'id', 'name', 'startsAt'].sort(),
    );
  });
});

describe('boss editor input', () => {
  const boss = {
    id: 's1:rem',
    definition: {
      stats: { attack: 500 },
      statMultipliers: { hp: 1.5, speed: 0.9 },
      critRate: 0.2,
      critDamage: 1.8,
      skill: { name: 'Morning Star', description: 'Swing', mpCost: 50, powerMult: 2 },
      enrage: { perTurn: 0.3 },
      wardLayers: [
        { element: 'ICE', hpPercent: 0.25 },
        { element: 'WATER', hpPercent: 0.5 },
      ],
      maxTurns: 25,
    },
    signatureDropCode: 'RING_COPPER_BAND',
  } as unknown as DungeonBoss;

  it('round-trips a stored definition through the form fields', () => {
    const values = bossFormValues(boss);
    expect(values).toMatchObject({
      hpMultiplier: 1.5,
      critRatePercent: 20,
      ward2Element: 'WATER',
      ward2Percent: 50,
      ward3Element: null,
      signatureDropCode: 'RING_COPPER_BAND',
    });
    const input = bossEditInputSchema.parse(values);
    expect(bossDefinitionFromInput(input, boss.definition)).toEqual(boss.definition);
  });

  it('clears everything the editor shows when the form is empty', () => {
    const input = bossEditInputSchema.parse({});
    expect(bossDefinitionFromInput(input, boss.definition)).toEqual({ stats: { attack: 500 } });
    expect(bossFormValues({ ...boss, definition: {}, signatureDropCode: null })).toMatchObject({
      skillName: null,
      enrageTrueDamage: null,
      ward1Percent: null,
    });
  });
});

describe('seasonCurvePoints', () => {
  it('uses ScalingEngine output for every floor', () => {
    const stored = season();
    const points = seasonCurvePoints(stored, 50);
    const engine = new ScalingEngine({
      model: 'EXPONENTIAL',
      baseStats: { hp: 950, attack: 90, defense: 50, speed: 22 },
      growthRate: 0.058,
    });
    expect(points).toHaveLength(50);
    for (const point of points) {
      expect(point).toEqual({
        floor: point.floor,
        type: engine.getFloorType(point.floor),
        ...engine.calculateFloorStats(point.floor),
      });
    }
    expect(points[9]!.type).toBe('MAJOR_BOSS');
  });
});

describe('boss catalog season rows', () => {
  const catalog = {
    seasonId: 's9',
    season: {
      name: 'S9',
      description: 'd',
      themeElement: 'ICE',
      seasonalAffixes: [],
      scalingModel: 'LINEAR',
      scalingParams: { linearK: 0.1 },
      durationDays: 30,
    },
  } as unknown as BossCatalog;

  it('leaves the schedule out of re-imported content', () => {
    const content = toSeasonContent(catalog);
    expect(Object.keys(content).sort()).toEqual(
      [
        'description',
        'name',
        'scalingModel',
        'scalingParams',
        'seasonalAffixes',
        'themeElement',
      ].sort(),
    );
    const row = toSeasonRow(catalog, new Date('2026-01-01T00:00:00Z'));
    expect(row).toMatchObject({ ...content, isActive: true, isTutorial: false });
    expect(row.endsAt.toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });
});
