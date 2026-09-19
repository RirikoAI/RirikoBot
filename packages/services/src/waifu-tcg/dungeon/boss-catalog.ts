import fs from 'node:fs';
import { z } from 'zod';
import type { NewDungeonBoss, NewDungeonFloor, NewDungeonSeason } from '@ririko/database';
import type { CardElement } from '../types.js';
import type { CatalogCharacter } from '../catalog/card-catalog.js';
import { bossDefinitionSchema, seasonCurveSchema, type BossTier } from './boss-definition.js';
import { getDungeonFloorEnergyCost } from './dungeon-runner.js';
import { ScalingEngine } from './scaling-engine.js';

const ELEMENTS = [
  'FIRE',
  'ICE',
  'EARTH',
  'LIGHTNING',
  'WATER',
  'LIGHT',
  'SHADOW',
] as const satisfies readonly CardElement[];

const imageSchema = z
  .object({
    url: z.string().min(1),
    source: z.enum(['DANBOORU', 'ANILIST', 'MANUAL']),
    sourceId: z.string(),
    credit: z.string(),
  })
  .strict();

/**
 * One boss character. Hand-edited: key, name, anime, element, tier, floors, title, flavorText,
 * signatureDropCode, definition. Filled by `--sync`: anilistId, favourites, danbooruTag, image.
 */
export const catalogBossSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9_]+$/, 'lowercase letters, digits and _ only'),
    name: z.string().min(1),
    anime: z.string().min(1),
    element: z.enum(ELEMENTS),
    tier: z.enum(['STANDARD', 'MINI_BOSS', 'MAJOR_BOSS']),
    /** Floors this boss guards. Mini/major bosses list theirs; standard bosses rotate when omitted. */
    floors: z.array(z.number().int().min(1)).optional(),
    title: z.string().optional(),
    flavorText: z.string().optional(),
    signatureDropCode: z.string().optional(),
    definition: bossDefinitionSchema.optional(),
    anilistId: z.number().int().optional(),
    favourites: z.number().int().optional(),
    danbooruTag: z.string().optional(),
    image: imageSchema.optional(),
  })
  .strict();

export const bossCatalogSchema = z
  .object({
    seasonId: z.string().min(1).max(32),
    /** Season row written by --import-db, including its difficulty curve. */
    season: z
      .object({
        name: z.string().min(1),
        description: z.string().min(1),
        themeElement: z.string(),
        seasonalAffixes: z.array(z.string()),
        scalingModel: z.enum(['LINEAR', 'POLYNOMIAL', 'EXPONENTIAL', 'HYBRID']),
        scalingParams: seasonCurveSchema,
        durationDays: z.number().int().min(1),
      })
      .strict(),
    floorCount: z.number().int().min(1).max(200),
    /** Per-floor combat overrides and names, keyed by floor number. */
    floorOverrides: z
      .record(
        z.string().regex(/^\d+$/),
        z
          .object({ name: z.string().optional(), overrides: bossDefinitionSchema.optional() })
          .strict(),
      )
      .optional(),
    bosses: z.array(catalogBossSchema).min(1),
  })
  .strict();

export type CatalogBoss = z.infer<typeof catalogBossSchema>;
export type BossCatalog = z.infer<typeof bossCatalogSchema>;

export interface PlannedFloor {
  floorNumber: number;
  bossKey: string;
  name: string;
  tier: BossTier;
  energyCost: number;
}

export function bossRowId(seasonId: string, key: string): string {
  return `${seasonId}:${key}`;
}

export function loadBossCatalog(filePath: string): BossCatalog {
  const raw: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const result = bossCatalogSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid boss catalog ${filePath}:\n${issues}`);
  }
  return result.data;
}

export function saveBossCatalog(filePath: string, catalog: BossCatalog): void {
  fs.writeFileSync(filePath, JSON.stringify(catalog, null, 2) + '\n');
}

/**
 * Assigns a boss to every floor. Mini/major bosses take the floors they list; standard floors
 * cycle through the standard bosses without listed floors, never repeating a boss on
 * back-to-back standard floors. Throws on gaps, clashes or tier/floor mismatches.
 */
export function planSeasonFloors(catalog: BossCatalog): PlannedFloor[] {
  const engine = new ScalingEngine();
  const byFloor = new Map<number, CatalogBoss>();
  const errors: string[] = [];

  const keys = new Set<string>();
  for (const boss of catalog.bosses) {
    if (keys.has(boss.key)) errors.push(`duplicate boss key ${boss.key}`);
    keys.add(boss.key);
    for (const floor of boss.floors ?? []) {
      if (floor > catalog.floorCount) errors.push(`${boss.key}: floor ${floor} is past floorCount`);
      const expected = engine.getFloorType(floor);
      if (expected !== boss.tier) {
        errors.push(
          `${boss.key}: floor ${floor} is a ${expected} floor but the boss is ${boss.tier}`,
        );
      }
      const clash = byFloor.get(floor);
      if (clash) errors.push(`floor ${floor} assigned to both ${clash.key} and ${boss.key}`);
      byFloor.set(floor, boss);
    }
  }

  const pool = catalog.bosses.filter((b) => b.tier === 'STANDARD' && !b.floors?.length);
  let poolIndex = 0;
  let previousStandard: string | undefined;
  const planned: PlannedFloor[] = [];

  for (let floor = 1; floor <= catalog.floorCount; floor++) {
    let boss = byFloor.get(floor);
    if (!boss) {
      if (engine.getFloorType(floor) !== 'STANDARD') {
        errors.push(
          `floor ${floor} is a ${engine.getFloorType(floor)} floor with no boss assigned`,
        );
        continue;
      }
      if (pool.length === 0) {
        errors.push(`floor ${floor} needs a standard boss but the rotating pool is empty`);
        continue;
      }
      boss = pool[poolIndex % pool.length]!;
      if (pool.length > 1 && boss.key === previousStandard) boss = pool[++poolIndex % pool.length]!;
      poolIndex++;
      previousStandard = boss.key;
    }
    const override = catalog.floorOverrides?.[String(floor)];
    planned.push({
      floorNumber: floor,
      bossKey: boss.key,
      tier: boss.tier,
      name: override?.name ?? `${boss.title ?? boss.name}`,
      energyCost: getDungeonFloorEnergyCost(floor),
    });
  }

  if (errors.length > 0)
    throw new Error(`Boss catalog ${catalog.seasonId} is invalid:\n  ${errors.join('\n  ')}`);
  return planned;
}

/** The season row the catalog describes. Keeps an existing season's start date. */
export function toSeasonRow(catalog: BossCatalog, startsAt: Date = new Date()): NewDungeonSeason {
  return {
    id: catalog.seasonId,
    name: catalog.season.name,
    description: catalog.season.description,
    themeElement: catalog.season.themeElement,
    seasonalAffixes: catalog.season.seasonalAffixes,
    scalingModel: catalog.season.scalingModel,
    scalingParams: catalog.season.scalingParams,
    isTutorial: false,
    isActive: true,
    startsAt,
    endsAt: new Date(startsAt.getTime() + catalog.season.durationDays * 86_400_000),
  };
}

export function toBossRow(
  catalog: BossCatalog,
  boss: CatalogBoss,
  extra: { assetId?: string | null; imagePath?: string | null },
): NewDungeonBoss {
  return {
    id: bossRowId(catalog.seasonId, boss.key),
    seasonId: catalog.seasonId,
    key: boss.key,
    name: boss.name,
    animeTitle: boss.anime,
    element: boss.element,
    tier: boss.tier,
    title: boss.title ?? null,
    flavorText: boss.flavorText ?? null,
    assetId: extra.assetId ?? null,
    anilistId: boss.anilistId ?? null,
    danbooruTag: boss.danbooruTag ?? null,
    imagePath: extra.imagePath ?? null,
    definition: boss.definition ?? {},
    signatureDropCode: boss.signatureDropCode ?? null,
    isActive: true,
  };
}

export function toFloorRow(catalog: BossCatalog, floor: PlannedFloor): NewDungeonFloor {
  const overrides = catalog.floorOverrides?.[String(floor.floorNumber)]?.overrides;
  return {
    seasonId: catalog.seasonId,
    floorNumber: floor.floorNumber,
    name: floor.name,
    energyCost: floor.energyCost,
    enemyLineup: [
      { bossId: bossRowId(catalog.seasonId, floor.bossKey), ...(overrides ? { overrides } : {}) },
    ],
    isBossFloor: floor.tier !== 'STANDARD',
  };
}

/** Bridges a boss to the card catalog's sync helpers (AniList + Danbooru). */
export function bossToCatalogCharacter(boss: CatalogBoss): CatalogCharacter {
  return {
    key: boss.key,
    name: boss.name,
    anime: boss.anime,
    element: boss.element,
    tags: [],
    ...(boss.anilistId !== undefined ? { anilistId: boss.anilistId } : {}),
    ...(boss.favourites !== undefined ? { favourites: boss.favourites } : {}),
    ...(boss.danbooruTag !== undefined ? { danbooruTag: boss.danbooruTag } : {}),
    ...(boss.image ? { image: boss.image } : {}),
  };
}

export function applySyncedCharacter(boss: CatalogBoss, character: CatalogCharacter): CatalogBoss {
  const next: CatalogBoss = { ...boss };
  if (character.anilistId !== undefined) next.anilistId = character.anilistId;
  if (character.favourites !== undefined) next.favourites = character.favourites;
  if (character.danbooruTag !== undefined) next.danbooruTag = character.danbooruTag;
  if (character.image) next.image = character.image;
  return next;
}

/** Card catalog characters that fit the given elements and are not bosses yet, most popular first. */
export function suggestBossCandidates(
  characters: readonly CatalogCharacter[],
  catalog: BossCatalog,
  elements: readonly CardElement[],
  limit: number,
): CatalogCharacter[] {
  const taken = new Set(catalog.bosses.map((b) => `${b.name}|${b.anime}`.toLowerCase()));
  return characters
    .filter((c) => elements.includes(c.element) && !taken.has(`${c.name}|${c.anime}`.toLowerCase()))
    .sort((a, b) => (b.favourites ?? 0) - (a.favourites ?? 0))
    .slice(0, limit);
}
