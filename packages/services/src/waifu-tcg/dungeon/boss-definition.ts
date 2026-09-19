import { z } from 'zod';
import type { CardElement } from '../types.js';
import type { ScalingConfig, ScalingModel } from './scaling-engine.js';

const ELEMENTS = [
  'FIRE',
  'ICE',
  'EARTH',
  'LIGHTNING',
  'WATER',
  'LIGHT',
  'SHADOW',
] as const satisfies readonly CardElement[];

const positive = z.number().positive();

export const enrageSchema = z
  .object({
    /** First turn the boss is enraged. */
    startTurn: z.number().int().min(1),
    /** Extra attack multiplier gained per enraged turn (1 = +100% per turn). */
    perTurn: z.number().min(0),
    /** Enraged hits ignore defense and guard. */
    trueDamage: z.boolean(),
  })
  .partial()
  .strict();

export const bossSkillSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    mpCost: z.number().int().min(1),
    /** Damage multiplier over a basic attack (default 1.5). */
    powerMult: positive.optional(),
  })
  .strict();

/**
 * Combat overrides for a boss, stored in `dungeon_bosses.definition` and in
 * `dungeon_floors.enemy_lineup[].overrides`. Everything is optional; omitted fields fall back
 * to the season curve and code defaults.
 */
export const bossDefinitionSchema = z
  .object({
    /** Absolute stats. Win over the season curve and statMultipliers. */
    stats: z
      .object({ hp: positive, attack: positive, defense: z.number().min(0), speed: positive })
      .partial()
      .strict()
      .optional(),
    /** Multipliers applied to the season curve's stats for this floor. */
    statMultipliers: z
      .object({ hp: positive, attack: positive, defense: positive, speed: positive })
      .partial()
      .strict()
      .optional(),
    critRate: z.number().min(0).max(1).optional(),
    critDamage: z.number().min(1).optional(),
    skill: bossSkillSchema.optional(),
    enrage: enrageSchema.optional(),
    /** Elemental ward layers; hpPercent is a share of the boss's max HP. */
    wardLayers: z
      .array(
        z.object({ element: z.enum(ELEMENTS), hpPercent: z.number().min(0.01).max(2) }).strict(),
      )
      .optional(),
    maxTurns: z.number().int().min(5).max(50).optional(),
  })
  .strict();

export type BossDefinition = z.infer<typeof bossDefinitionSchema>;
export interface EnrageConfig {
  startTurn: number;
  perTurn: number;
  trueDamage: boolean;
}

export const floorLineupEntrySchema = z
  .object({ bossId: z.string().min(1), overrides: bossDefinitionSchema.optional() })
  .strict();

export type FloorLineupEntry = z.infer<typeof floorLineupEntrySchema>;

/**
 * Season difficulty curve, stored in `dungeon_seasons.scaling_params`.
 * `dungeon_seasons.scaling_model` picks the growth formula.
 */
export const seasonCurveSchema = z
  .object({
    baseStats: z
      .object({ hp: positive, attack: positive, defense: z.number().min(0), speed: positive })
      .strict()
      .optional(),
    growthRate: positive.optional(),
    linearK: positive.optional(),
    polyAlpha: positive.optional(),
    polyBeta: positive.optional(),
    miniBossMultiplier: positive.optional(),
    majorBossMultiplier: positive.optional(),
    enrage: enrageSchema.optional(),
    /** Seasonal affixes switch on from this floor (earlier floors fight without them). */
    affixStartFloor: z.number().int().min(1).optional(),
  })
  .strict();

export type SeasonCurve = z.infer<typeof seasonCurveSchema>;

export type BossTier = 'STANDARD' | 'MINI_BOSS' | 'MAJOR_BOSS';

/** Display data for a boss character, shown on the battle screen. */
export interface DungeonBossProfile {
  id: string;
  name: string;
  animeTitle: string;
  element: CardElement;
  tier: BossTier;
  title?: string | undefined;
  flavorText?: string | undefined;
  imagePath?: string | undefined;
  assetId?: string | undefined;
  signatureDropCode?: string | undefined;
}

export const DEFAULT_ENRAGE: Readonly<EnrageConfig> = Object.freeze({
  startTurn: 10,
  perTurn: 1,
  trueDamage: true,
});

const SCALING_MODELS: readonly ScalingModel[] = ['LINEAR', 'POLYNOMIAL', 'EXPONENTIAL', 'HYBRID'];

/** Parses stored JSON; invalid data is reported and ignored so one bad row cannot break a climb. */
function parseOrWarn<T>(schema: z.ZodType<T>, value: unknown, label: string): T | null {
  if (value === null || value === undefined) return null;
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  console.warn(
    `[dungeon] Ignoring invalid ${label}: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
  );
  return null;
}

export function parseBossDefinition(value: unknown, label = 'boss definition'): BossDefinition {
  return parseOrWarn(bossDefinitionSchema, value, label) ?? {};
}

export function parseSeasonCurve(value: unknown): SeasonCurve {
  return parseOrWarn(seasonCurveSchema, value, 'season scaling params') ?? {};
}

export function parseFloorLineup(value: unknown): FloorLineupEntry | null {
  const first = Array.isArray(value) ? value[0] : undefined;
  return parseOrWarn(floorLineupEntrySchema, first, 'floor enemy lineup');
}

/** Later definitions win; nested stat and enrage objects merge key by key. */
export function mergeBossDefinitions(...defs: Array<BossDefinition | undefined>): BossDefinition {
  const merged: BossDefinition = {};
  for (const def of defs) {
    if (!def) continue;
    const { stats, statMultipliers, enrage, ...rest } = def;
    Object.assign(merged, rest);
    if (stats) merged.stats = { ...merged.stats, ...stats };
    if (statMultipliers) merged.statMultipliers = { ...merged.statMultipliers, ...statMultipliers };
    if (enrage) merged.enrage = { ...merged.enrage, ...enrage };
  }
  return merged;
}

export function resolveEnrage(
  ...configs: Array<z.infer<typeof enrageSchema> | undefined>
): EnrageConfig {
  return Object.assign({}, DEFAULT_ENRAGE, ...configs.filter(Boolean));
}

/** ScalingEngine config for a season row. */
export function toScalingConfig(
  scalingModel: string | null | undefined,
  curve: SeasonCurve,
): ScalingConfig {
  const model = SCALING_MODELS.find((m) => m === scalingModel);
  const config: ScalingConfig = {};
  if (model) config.model = model;
  if (curve.baseStats) config.baseStats = { ...curve.baseStats };
  if (curve.growthRate !== undefined) config.growthRate = curve.growthRate;
  if (curve.linearK !== undefined) config.linearK = curve.linearK;
  if (curve.polyAlpha !== undefined) config.polyAlpha = curve.polyAlpha;
  if (curve.polyBeta !== undefined) config.polyBeta = curve.polyBeta;
  if (curve.miniBossMultiplier !== undefined) config.miniBossMultiplier = curve.miniBossMultiplier;
  if (curve.majorBossMultiplier !== undefined)
    config.majorBossMultiplier = curve.majorBossMultiplier;
  return config;
}
