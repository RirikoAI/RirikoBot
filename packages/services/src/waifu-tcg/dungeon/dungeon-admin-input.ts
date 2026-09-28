import { z } from 'zod';
import { FlagSetting } from '@ririko/core';
import type { DungeonBoss, DungeonSeason, NewDungeonSeason } from '@ririko/database';
import {
  DUNGEON_ELEMENTS,
  SCALING_MODELS,
  bossDefinitionSchema,
  parseBossDefinition,
  parseSeasonCurve,
  seasonCurveSchema,
  toScalingConfig,
  type BossDefinition,
  type SeasonCurve,
} from './boss-definition.js';
import {
  MAX_FIRST_CLEAR_ITEMS,
  MAX_LOOT_CREDITS,
  MAX_LOOT_DUST,
  MAX_LOOT_EXP,
  MAX_LOOT_QUANTITY,
  MAX_LOOT_WEIGHT,
  MAX_REPEAT_POOL_ENTRIES,
  firstClearRewardsSchema,
  parseFloorLoot,
  repeatRewardsSchema,
  type FirstClearRewards,
  type RepeatRewards,
} from './floor-loot.js';
import { ScalingEngine, type DungeonFloorType, type MonsterStats } from './scaling-engine.js';
import {
  SEASON_AFFIX_SETS,
  SEASON_AFFIX_SET_KEYS,
  resolveAffixTheme,
  type SeasonAffixSet,
} from './season-affixes.js';

/*
 * Owner console input for dungeon seasons and bosses. Forms post flat string fields; these
 * schemas turn them into season rows and boss definitions, and the `*FormValues` helpers turn
 * stored rows back into the same flat fields.
 */

export const SEASON_ID_PATTERN = /^[a-z0-9_]{2,32}$/;
export const SEASON_THEME_ELEMENTS = ['ALL', ...DUNGEON_ELEMENTS] as const;
export const SEASON_AFFIX_CHOICES = ['NONE', ...SEASON_AFFIX_SET_KEYS] as const;

const DAY_MS = 86_400_000;

function blankToNull(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? null : value;
}

function choice<T extends readonly [string, ...string[]]>(values: T) {
  return z.enum(values, {
    errorMap: () => ({ message: `Choose one of ${values.join(', ')}.` }),
  });
}

function text(max: number) {
  const message = `Enter 1 to ${max} characters.`;
  return z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z.string({ required_error: message }).min(1, message).max(max, message),
  );
}

function optionalText(max: number) {
  return z.preprocess(
    (value) => (typeof value === 'string' ? blankToNull(value.trim()) : value),
    z.string().max(max, `Use at most ${max} characters.`).nullable().default(null),
  );
}

/** A number from `min` to `max` (whole with `int`), or `null` when left empty. */
function optionalNumber(min: number, max: number, options: { int?: boolean } = {}) {
  const kind = options.int ? 'a whole number' : 'a number';
  const message = `Enter ${kind} from ${min} to ${max}, or leave it empty.`;
  let schema = z.number({ invalid_type_error: message }).min(min, message).max(max, message);
  if (options.int) schema = schema.int(message);
  return z.preprocess((value) => {
    const blank = blankToNull(value);
    return typeof blank === 'string' ? Number(blank.trim()) : blank;
  }, schema.nullable().default(null));
}

function optionalChoice<T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess(blankToNull, choice(values).nullable().default(null));
}

/** A `YYYY-MM-DD` day, read as midnight UTC. */
const dateSetting = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? new Date(`${trimmed}T00:00:00Z`) : trimmed;
  },
  z.date({ invalid_type_error: 'Pick a date.', required_error: 'Pick a date.' }),
);

/** Enrage fields shared by the season curve and the boss editor. */
const enrageFields = {
  enrageStartTurn: optionalNumber(1, 50, { int: true }),
  enragePerTurn: optionalNumber(0, 5),
  enrageTrueDamage: optionalChoice(['yes', 'no'] as const),
};

const seasonFields = z
  .object({
    name: text(80),
    description: text(500),
    themeElement: choice(SEASON_THEME_ELEMENTS),
    affixSet: choice(SEASON_AFFIX_CHOICES),
    scalingModel: choice(SCALING_MODELS),
    startsAt: dateSetting,
    endsAt: dateSetting,
    isActive: FlagSetting,
    baseHp: optionalNumber(1, 10_000_000, { int: true }),
    baseAttack: optionalNumber(1, 1_000_000, { int: true }),
    baseDefense: optionalNumber(0, 1_000_000, { int: true }),
    baseSpeed: optionalNumber(1, 10_000, { int: true }),
    growthRate: optionalNumber(0.001, 1),
    linearK: optionalNumber(0.001, 5),
    polyAlpha: optionalNumber(0.001, 5),
    polyBeta: optionalNumber(0.0001, 1),
    miniBossMultiplier: optionalNumber(0.1, 20),
    majorBossMultiplier: optionalNumber(0.1, 20),
    affixStartFloor: optionalNumber(1, 200, { int: true }),
    ...enrageFields,
  })
  .strict();

const BASE_STAT_FIELDS = ['baseHp', 'baseAttack', 'baseDefense', 'baseSpeed'] as const;

function checkSeason(season: z.infer<typeof seasonFields>, ctx: z.RefinementCtx): void {
  if (season.endsAt.getTime() <= season.startsAt.getTime()) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'End after the start date.' });
  }
  const setStats = BASE_STAT_FIELDS.filter((field) => season[field] !== null);
  if (setStats.length > 0 && setStats.length < BASE_STAT_FIELDS.length) {
    for (const field of BASE_STAT_FIELDS.filter((f) => season[f] === null)) {
      ctx.addIssue({
        code: 'custom',
        path: [field],
        message: 'Set all four base stats, or leave all four empty.',
      });
    }
  }
}

export const seasonUpdateInputSchema = seasonFields.superRefine(checkSeason);

export const seasonCreateInputSchema = seasonFields
  .extend({
    id: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
      z
        .string({ required_error: 'Use 2 to 32 lowercase letters, digits or underscores.' })
        .regex(SEASON_ID_PATTERN, 'Use 2 to 32 lowercase letters, digits or underscores.'),
    ),
  })
  .superRefine(checkSeason);

export type SeasonInput = z.infer<typeof seasonUpdateInputSchema>;

function enrageFrom(input: {
  enrageStartTurn: number | null;
  enragePerTurn: number | null;
  enrageTrueDamage: 'yes' | 'no' | null;
}): SeasonCurve['enrage'] {
  const enrage: NonNullable<SeasonCurve['enrage']> = {};
  if (input.enrageStartTurn !== null) enrage.startTurn = input.enrageStartTurn;
  if (input.enragePerTurn !== null) enrage.perTurn = input.enragePerTurn;
  if (input.enrageTrueDamage !== null) enrage.trueDamage = input.enrageTrueDamage === 'yes';
  return Object.keys(enrage).length > 0 ? enrage : undefined;
}

/** The season row fields an editor save writes. */
export function seasonRowFromInput(input: SeasonInput) {
  const curve: SeasonCurve = {};
  if (input.baseHp !== null) {
    curve.baseStats = {
      hp: input.baseHp,
      attack: input.baseAttack!,
      defense: input.baseDefense!,
      speed: input.baseSpeed!,
    };
  }
  for (const key of [
    'growthRate',
    'linearK',
    'polyAlpha',
    'polyBeta',
    'miniBossMultiplier',
    'majorBossMultiplier',
    'affixStartFloor',
  ] as const) {
    const value = input[key];
    if (value !== null) curve[key] = value;
  }
  const enrage = enrageFrom(input);
  if (enrage) curve.enrage = enrage;

  return {
    name: input.name,
    description: input.description,
    themeElement: input.themeElement,
    seasonalAffixes:
      input.affixSet === 'NONE' ? [] : [...SEASON_AFFIX_SETS[input.affixSet as SeasonAffixSet]],
    scalingModel: input.scalingModel,
    scalingParams: seasonCurveSchema.parse(curve) as Record<string, unknown>,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    isActive: input.isActive,
  } satisfies Partial<NewDungeonSeason>;
}

export type SeasonFormValues = {
  [K in keyof SeasonInput]: SeasonInput[K] extends Date ? string : SeasonInput[K];
} & { id: string };

function dayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function enrageValues(enrage: SeasonCurve['enrage']) {
  return {
    enrageStartTurn: enrage?.startTurn ?? null,
    enragePerTurn: enrage?.perTurn ?? null,
    enrageTrueDamage:
      enrage?.trueDamage === undefined
        ? null
        : enrage.trueDamage
          ? ('yes' as const)
          : ('no' as const),
  };
}

/** A stored season as editor fields. */
export function seasonFormValues(season: DungeonSeason): SeasonFormValues {
  const curve = parseSeasonCurve(season.scalingParams);
  const theme = resolveAffixTheme(season.seasonalAffixes);
  const element = SEASON_THEME_ELEMENTS.find((e) => e === season.themeElement) ?? 'ALL';
  const model = SCALING_MODELS.find((m) => m === season.scalingModel) ?? 'EXPONENTIAL';
  return {
    id: season.id,
    name: season.name,
    description: season.description,
    themeElement: element,
    affixSet: theme,
    scalingModel: model,
    startsAt: dayString(season.startsAt),
    endsAt: dayString(season.endsAt),
    isActive: season.isActive,
    baseHp: curve.baseStats?.hp ?? null,
    baseAttack: curve.baseStats?.attack ?? null,
    baseDefense: curve.baseStats?.defense ?? null,
    baseSpeed: curve.baseStats?.speed ?? null,
    growthRate: curve.growthRate ?? null,
    linearK: curve.linearK ?? null,
    polyAlpha: curve.polyAlpha ?? null,
    polyBeta: curve.polyBeta ?? null,
    miniBossMultiplier: curve.miniBossMultiplier ?? null,
    majorBossMultiplier: curve.majorBossMultiplier ?? null,
    affixStartFloor: curve.affixStartFloor ?? null,
    ...enrageValues(curve.enrage),
  };
}

/** Values for a new season: starts today and runs 90 days, on the default curve. */
export function newSeasonFormValues(now: Date = new Date()): SeasonFormValues {
  const start = new Date(`${dayString(now)}T00:00:00Z`);
  return {
    id: '',
    name: '',
    description: '',
    themeElement: 'ALL',
    affixSet: 'NONE',
    scalingModel: 'EXPONENTIAL',
    startsAt: dayString(start),
    endsAt: dayString(new Date(start.getTime() + 90 * DAY_MS)),
    isActive: true,
    baseHp: null,
    baseAttack: null,
    baseDefense: null,
    baseSpeed: null,
    growthRate: null,
    linearK: null,
    polyAlpha: null,
    polyBeta: null,
    miniBossMultiplier: null,
    majorBossMultiplier: null,
    affixStartFloor: null,
    enrageStartTurn: null,
    enragePerTurn: null,
    enrageTrueDamage: null,
  };
}

/** Form fields of each ward layer, in order. */
export const BOSS_WARD_FIELDS = [
  ['ward1Element', 'ward1Percent'],
  ['ward2Element', 'ward2Percent'],
  ['ward3Element', 'ward3Percent'],
] as const;

export const bossEditInputSchema = z
  .object({
    hpMultiplier: optionalNumber(0.1, 20),
    attackMultiplier: optionalNumber(0.1, 20),
    defenseMultiplier: optionalNumber(0.1, 20),
    speedMultiplier: optionalNumber(0.1, 20),
    critRatePercent: optionalNumber(0, 100, { int: true }),
    critDamage: optionalNumber(1, 5),
    skillName: optionalText(64),
    skillDescription: optionalText(300),
    skillMpCost: optionalNumber(1, 100, { int: true }),
    skillPower: optionalNumber(0.1, 10),
    maxTurns: optionalNumber(5, 50, { int: true }),
    signatureDropCode: z.preprocess(
      (value) => (typeof value === 'string' ? blankToNull(value.trim().toUpperCase()) : value),
      z.string().max(64).nullable().default(null),
    ),
    ...enrageFields,
    ward1Element: optionalChoice(DUNGEON_ELEMENTS),
    ward1Percent: optionalNumber(1, 200, { int: true }),
    ward2Element: optionalChoice(DUNGEON_ELEMENTS),
    ward2Percent: optionalNumber(1, 200, { int: true }),
    ward3Element: optionalChoice(DUNGEON_ELEMENTS),
    ward3Percent: optionalNumber(1, 200, { int: true }),
  })
  .strict()
  .superRefine((boss, ctx) => {
    const skillSet =
      boss.skillName !== null ||
      boss.skillDescription !== null ||
      boss.skillMpCost !== null ||
      boss.skillPower !== null;
    if (skillSet && boss.skillName === null) {
      ctx.addIssue({ code: 'custom', path: ['skillName'], message: 'Name the skill.' });
    }
    if (skillSet && boss.skillMpCost === null) {
      ctx.addIssue({ code: 'custom', path: ['skillMpCost'], message: 'Set the skill MP cost.' });
    }
    for (const [elementField, percentField] of BOSS_WARD_FIELDS) {
      const element = boss[elementField];
      const percent = boss[percentField];
      if ((element === null) !== (percent === null)) {
        ctx.addIssue({
          code: 'custom',
          path: [element === null ? elementField : percentField],
          message: 'Set both the element and the HP share, or neither.',
        });
      }
    }
  });

export type BossEditInput = z.infer<typeof bossEditInputSchema>;

/**
 * The boss definition after an editor save. Fields the editor does not show (such as
 * absolute `stats`) keep their stored values.
 */
export function bossDefinitionFromInput(
  input: BossEditInput,
  existing: BossDefinition,
): BossDefinition {
  const {
    statMultipliers: _m,
    critRate: _cr,
    critDamage: _cd,
    skill: _s,
    enrage: _e,
    wardLayers: _w,
    maxTurns: _t,
    ...kept
  } = existing;
  const def: BossDefinition = { ...kept };

  const multipliers: NonNullable<BossDefinition['statMultipliers']> = {};
  if (input.hpMultiplier !== null) multipliers.hp = input.hpMultiplier;
  if (input.attackMultiplier !== null) multipliers.attack = input.attackMultiplier;
  if (input.defenseMultiplier !== null) multipliers.defense = input.defenseMultiplier;
  if (input.speedMultiplier !== null) multipliers.speed = input.speedMultiplier;
  if (Object.keys(multipliers).length > 0) def.statMultipliers = multipliers;

  if (input.critRatePercent !== null) def.critRate = input.critRatePercent / 100;
  if (input.critDamage !== null) def.critDamage = input.critDamage;
  if (input.skillName !== null && input.skillMpCost !== null) {
    def.skill = { name: input.skillName, mpCost: input.skillMpCost };
    if (input.skillDescription !== null) def.skill.description = input.skillDescription;
    if (input.skillPower !== null) def.skill.powerMult = input.skillPower;
  }
  const enrage = enrageFrom(input);
  if (enrage) def.enrage = enrage;

  const wards: NonNullable<BossDefinition['wardLayers']> = [];
  for (const [elementField, percentField] of BOSS_WARD_FIELDS) {
    const element = input[elementField];
    const percent = input[percentField];
    if (element !== null && percent !== null) wards.push({ element, hpPercent: percent / 100 });
  }
  if (wards.length > 0) def.wardLayers = wards;
  if (input.maxTurns !== null) def.maxTurns = input.maxTurns;

  return bossDefinitionSchema.parse(def);
}

export type BossFormValues = BossEditInput;

/** A stored boss as editor fields. */
export function bossFormValues(boss: DungeonBoss): BossFormValues {
  const def = parseBossDefinition(boss.definition, `boss ${boss.id}`);
  const layer = (i: number) => def.wardLayers?.[i];
  const percent = (i: number) => {
    const ward = layer(i);
    return ward ? Math.round(ward.hpPercent * 100) : null;
  };
  return {
    hpMultiplier: def.statMultipliers?.hp ?? null,
    attackMultiplier: def.statMultipliers?.attack ?? null,
    defenseMultiplier: def.statMultipliers?.defense ?? null,
    speedMultiplier: def.statMultipliers?.speed ?? null,
    critRatePercent: def.critRate === undefined ? null : Math.round(def.critRate * 100),
    critDamage: def.critDamage ?? null,
    skillName: def.skill?.name ?? null,
    skillDescription: def.skill?.description ?? null,
    skillMpCost: def.skill?.mpCost ?? null,
    skillPower: def.skill?.powerMult ?? null,
    maxTurns: def.maxTurns ?? null,
    signatureDropCode: boss.signatureDropCode ?? null,
    ...enrageValues(def.enrage),
    ward1Element: layer(0)?.element ?? null,
    ward1Percent: percent(0),
    ward2Element: layer(1)?.element ?? null,
    ward2Percent: percent(1),
    ward3Element: layer(2)?.element ?? null,
    ward3Percent: percent(2),
  };
}

export interface CurvePoint extends MonsterStats {
  floor: number;
  type: DungeonFloorType;
}

/**
 * Enemy stats on floors 1 to `floors` from the season's curve, computed by the same
 * `ScalingEngine` a climb uses (bosses' own multipliers are not included).
 */
export function seasonCurvePoints(
  season: Pick<DungeonSeason, 'scalingModel' | 'scalingParams'>,
  floors: number,
): CurvePoint[] {
  const engine = new ScalingEngine(
    toScalingConfig(season.scalingModel, parseSeasonCurve(season.scalingParams)),
  );
  return Array.from({ length: floors }, (_, i) => ({
    floor: i + 1,
    type: engine.getFloorType(i + 1),
    ...engine.calculateFloorStats(i + 1),
  }));
}

/** Form fields of each first-clear item row, in order. */
export const FIRST_CLEAR_ITEM_FIELDS = Array.from(
  { length: MAX_FIRST_CLEAR_ITEMS },
  (_, i) => [`firstItem${i + 1}Code`, `firstItem${i + 1}Quantity`] as const,
);

/** Form fields of each repeat-clear pool row, in order. */
export const REPEAT_POOL_FIELDS = Array.from(
  { length: MAX_REPEAT_POOL_ENTRIES },
  (_, i) =>
    [`pool${i + 1}Code`, `pool${i + 1}Weight`, `pool${i + 1}Min`, `pool${i + 1}Max`] as const,
);

const itemCode = z.preprocess(
  (value) => (typeof value === 'string' ? blankToNull(value.trim().toUpperCase()) : value),
  z.string().max(64).nullable().default(null),
);

const lootCurrencyFields = (prefix: 'first' | 'repeat') => ({
  [`${prefix}Credits`]: optionalNumber(0, MAX_LOOT_CREDITS, { int: true }),
  [`${prefix}Exp`]: optionalNumber(0, MAX_LOOT_EXP, { int: true }),
  [`${prefix}Dust`]: optionalNumber(0, MAX_LOOT_DUST, { int: true }),
});

export const floorLootInputSchema = z
  .object({
    ...lootCurrencyFields('first'),
    ...lootCurrencyFields('repeat'),
    repeatDropChancePercent: optionalNumber(0, 100),
    ...Object.fromEntries(
      FIRST_CLEAR_ITEM_FIELDS.flatMap(([codeField, quantityField]) => [
        [codeField, itemCode],
        [quantityField, optionalNumber(1, MAX_LOOT_QUANTITY, { int: true })],
      ]),
    ),
    ...Object.fromEntries(
      REPEAT_POOL_FIELDS.flatMap(([codeField, weightField, minField, maxField]) => [
        [codeField, itemCode],
        [weightField, optionalNumber(1, MAX_LOOT_WEIGHT, { int: true })],
        [minField, optionalNumber(1, MAX_LOOT_QUANTITY, { int: true })],
        [maxField, optionalNumber(1, MAX_LOOT_QUANTITY, { int: true })],
      ]),
    ),
  })
  .strict()
  .superRefine((raw, ctx) => {
    const input = raw as FloorLootInput;
    const issue = (field: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [field], message });
    for (const [codeField, quantityField] of FIRST_CLEAR_ITEM_FIELDS) {
      if (input[codeField] === null && input[quantityField] !== null) {
        issue(codeField, 'Choose an item, or clear the quantity.');
      }
    }
    for (const [codeField, weightField, minField, maxField] of REPEAT_POOL_FIELDS) {
      const code = input[codeField];
      if (code === null) {
        if ([weightField, minField, maxField].some((f) => input[f] !== null)) {
          issue(codeField, 'Choose an item, or clear the row.');
        }
        continue;
      }
      if (input[weightField] === null) issue(weightField, 'Set a weight for this item.');
      const min = (input[minField] as number | null) ?? 1;
      const max = (input[maxField] as number | null) ?? min;
      if (min > max) issue(maxField, 'Use a maximum at least the minimum.');
    }
  });

/** Every loot form field, by name: a number, an item code, or `null` when empty. */
export type FloorLootInput = Record<string, number | string | null>;

/** The stored loot columns after an editor save; empty rows are dropped. */
export function floorLootFromInput(input: FloorLootInput): {
  firstClearRewards: FirstClearRewards;
  repeatRewardsTable: RepeatRewards;
} {
  const num = (field: string) => input[field] as number | null;
  const firstClear: FirstClearRewards = {};
  if (num('firstCredits') !== null) firstClear.credits = num('firstCredits')!;
  if (num('firstExp') !== null) firstClear.exp = num('firstExp')!;
  if (num('firstDust') !== null) firstClear.craftingDust = num('firstDust')!;
  const items = FIRST_CLEAR_ITEM_FIELDS.flatMap(([codeField, quantityField]) => {
    const code = input[codeField] as string | null;
    return code ? [{ code, quantity: num(quantityField) ?? 1 }] : [];
  });
  if (items.length > 0) firstClear.items = items;

  const repeat: RepeatRewards = {};
  if (num('repeatCredits') !== null) repeat.credits = num('repeatCredits')!;
  if (num('repeatExp') !== null) repeat.exp = num('repeatExp')!;
  if (num('repeatDust') !== null) repeat.craftingDust = num('repeatDust')!;
  if (num('repeatDropChancePercent') !== null) {
    repeat.dropChance = num('repeatDropChancePercent')! / 100;
  }
  const pool = REPEAT_POOL_FIELDS.flatMap(([codeField, weightField, minField, maxField]) => {
    const code = input[codeField] as string | null;
    if (!code) return [];
    const minQty = num(minField) ?? 1;
    return [{ code, weight: num(weightField)!, minQty, maxQty: num(maxField) ?? minQty }];
  });
  if (pool.length > 0) repeat.pool = pool;

  return {
    firstClearRewards: firstClearRewardsSchema.parse(firstClear),
    repeatRewardsTable: repeatRewardsSchema.parse(repeat),
  };
}

/** A floor's stored loot as editor fields. */
export function floorLootFormValues(floor: {
  id?: string;
  firstClearRewards?: unknown;
  repeatRewardsTable?: unknown;
}): FloorLootInput {
  const { firstClear, repeat } = parseFloorLoot(floor);
  const values: FloorLootInput = {
    firstCredits: firstClear.credits ?? null,
    firstExp: firstClear.exp ?? null,
    firstDust: firstClear.craftingDust ?? null,
    repeatCredits: repeat.credits ?? null,
    repeatExp: repeat.exp ?? null,
    repeatDust: repeat.craftingDust ?? null,
    repeatDropChancePercent:
      repeat.dropChance === undefined ? null : Math.round(repeat.dropChance * 1000) / 10,
  };
  FIRST_CLEAR_ITEM_FIELDS.forEach(([codeField, quantityField], i) => {
    const item = firstClear.items?.[i];
    values[codeField] = item?.code ?? null;
    values[quantityField] = item?.quantity ?? null;
  });
  REPEAT_POOL_FIELDS.forEach(([codeField, weightField, minField, maxField], i) => {
    const entry = repeat.pool?.[i];
    values[codeField] = entry?.code ?? null;
    values[weightField] = entry?.weight ?? null;
    values[minField] = entry?.minQty ?? null;
    values[maxField] = entry?.maxQty ?? null;
  });
  return values;
}

/** Every item code a loot save refers to, with the form field that holds it. */
export function floorLootCodeFields(input: FloorLootInput): Array<[field: string, code: string]> {
  return [...FIRST_CLEAR_ITEM_FIELDS, ...REPEAT_POOL_FIELDS].flatMap(([codeField]) => {
    const code = input[codeField];
    return typeof code === 'string' ? [[codeField, code] as [string, string]] : [];
  });
}
