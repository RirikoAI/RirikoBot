import type { SeasonTheme } from './seasonal-affixes.js';

/** Affix themes the combat engine implements, and the affix names each season row stores. */
export const SEASON_AFFIX_SETS = {
  INFERNAL_CRUCIBLE: ['SCORCHED_EARTH', 'HEAT_HAZE'],
  ABYSSAL_MAELSTROM: ['TORRENTIAL_DELUGE', 'TIDAL_BARRIER'],
  CELESTIAL_TWILIGHT: ['RADIANT_FLARE', 'VOID_DRAIN'],
} as const satisfies Record<Exclude<SeasonTheme, 'NONE'>, readonly string[]>;

export type SeasonAffixSet = keyof typeof SEASON_AFFIX_SETS;

export const SEASON_AFFIX_SET_KEYS = Object.keys(SEASON_AFFIX_SETS) as SeasonAffixSet[];

/** Words older season rows used for each theme. */
const LEGACY_KEYWORDS: ReadonlyArray<[SeasonAffixSet, readonly string[]]> = [
  ['INFERNAL_CRUCIBLE', ['INFERNAL', 'SCORCHED']],
  ['ABYSSAL_MAELSTROM', ['ABYSSAL', 'TORRENTIAL']],
  ['CELESTIAL_TWILIGHT', ['CELESTIAL', 'TWILIGHT']],
];

/**
 * The affix theme a season fights under, read from its stored affixes only.
 * A season with no affixes fights without them, whatever its theme element.
 */
export function resolveAffixTheme(affixes: readonly string[] | null | undefined): SeasonTheme {
  const words = (affixes ?? []).map((a) => a.toUpperCase());
  for (const key of SEASON_AFFIX_SET_KEYS) {
    const set: readonly string[] = SEASON_AFFIX_SETS[key];
    if (words.some((w) => set.includes(w))) return key;
  }
  for (const [key, keywords] of LEGACY_KEYWORDS) {
    if (words.some((w) => keywords.some((k) => w.includes(k)))) return key;
  }
  return 'NONE';
}
