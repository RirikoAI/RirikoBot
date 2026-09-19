import fs from 'node:fs';
import path from 'node:path';
import type { CardElement, CardRarity } from '../types.js';
import { ORDERED_RARITY_TIERS } from '../rarity/rarity-engine.js';
import { titlesMatch } from './anilist.client.js';

/** Asset tag marking a character's card as part of the random starter pool. */
export const STARTER_POOL_TAG = 'starter_pool';

export const CARD_ELEMENTS: readonly CardElement[] = [
  'FIRE',
  'ICE',
  'WATER',
  'EARTH',
  'LIGHTNING',
  'LIGHT',
  'SHADOW',
];

/** Rarities from lowest (COMMON) to highest (MYTHIC). */
export const RARITIES_ASCENDING: readonly CardRarity[] = [...ORDERED_RARITY_TIERS].reverse();

export type CharacterImageSource = 'DANBOORU' | 'ANILIST' | 'MANUAL';

/**
 * `waifu_sources` rows for builder assets (asset.sourceId). NONE marks a character without art.
 * The attribution text is the embed footer; the artist credit is printed on the card itself.
 */
export const CARD_IMAGE_SOURCES: Record<
  CharacterImageSource | 'NONE',
  { name: string; baseUrl: string; attributionText: string }
> = {
  DANBOORU: {
    name: 'Danbooru',
    baseUrl: 'https://danbooru.donmai.us',
    attributionText: 'Art via Danbooru (artist credited on card)',
  },
  ANILIST: {
    name: 'AniList',
    baseUrl: 'https://anilist.co',
    attributionText: 'Image source: AniList',
  },
  MANUAL: { name: 'Manual upload', baseUrl: '', attributionText: 'Image: manual upload' },
  NONE: { name: 'Ririko TCG', baseUrl: '', attributionText: 'Ririko TCG' },
};

export interface CatalogCharacterImage {
  url: string;
  source: CharacterImageSource;
  /** Source-specific id, e.g. Danbooru post id or AniList character id. */
  sourceId: string;
  /** Credit line printed on the card. */
  credit: string;
}

/**
 * One real character. Hand-edited fields: key, name, anime, element, tags, danbooruTag (override).
 * Filled by catalog sync: anilistId, favourites, danbooruTag, image.
 */
export interface CatalogCharacter {
  key: string;
  name: string;
  anime: string;
  element: CardElement;
  tags: string[];
  anilistId?: number;
  favourites?: number;
  danbooruTag?: string;
  image?: CatalogCharacterImage;
}

export interface CardManifestAsset {
  assetId: string;
  imageHash: string;
}

/** Everything needed to re-render a card and re-sync its DB rows without new randomness. */
export interface CardManifestCard {
  id: string;
  characterKey: string;
  name: string;
  animeTitle: string;
  element: CardElement;
  rarity: CardRarity;
  stats: { hp: number; attack: number; defense: number; speed: number; critRate: number };
  skill: { name: string; description: string; mpCost: number };
  passive: { name: string; description: string };
  collectionNumber: number;
  isStarter: boolean;
  textScale: number;
  createdAt: string;
}

export interface CardManifest {
  version: 1;
  /** Keyed by character key: one DB asset (image) per character, shared by all of its cards. */
  assets: Record<string, CardManifestAsset>;
  cards: CardManifestCard[];
}

export function slugifyCharacterKey(name: string, anime: string): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/\(.*?\)/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  return `${slug(name)}__${slug(anime)}`;
}

function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

/** Writes via a temp file so an interrupted run never leaves half-written JSON. */
function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tmp, filePath);
}

export function loadCatalog(filePath: string): CatalogCharacter[] {
  const catalog = readJson<CatalogCharacter[]>(filePath, []);
  const seen = new Set<string>();
  for (const c of catalog) {
    if (seen.has(c.key)) throw new Error(`Duplicate character key in catalog: ${c.key}`);
    if (!CARD_ELEMENTS.includes(c.element)) {
      throw new Error(`Character ${c.key} has invalid element: ${c.element}`);
    }
    seen.add(c.key);
  }
  return catalog;
}

export function saveCatalog(filePath: string, catalog: CatalogCharacter[]): void {
  writeJson(filePath, catalog);
}

export function loadManifest(filePath: string): CardManifest {
  const manifest = readJson<CardManifest>(filePath, { version: 1, assets: {}, cards: [] });
  if (manifest.version !== 1)
    throw new Error(`Unsupported card manifest version: ${manifest.version}`);
  return manifest;
}

export function saveManifest(filePath: string, manifest: CardManifest): void {
  writeJson(filePath, manifest);
}

/**
 * Popularity bias per rarity: COMMON leans toward less-favourited characters, MYTHIC toward
 * the most-favourited ones. Returns the exponent applied to (favourites + 100).
 */
export function popularityExponent(rarity: CardRarity): number {
  const tier = RARITIES_ASCENDING.indexOf(rarity); // 0..7
  return (tier - 3.5) / 7; // -0.5 .. +0.5
}

export interface PickCharactersOptions {
  rarity: CardRarity;
  count: number;
  element?: CardElement;
  random?: () => number;
}

/**
 * Weighted sampling without replacement.
 * - Characters in the starter pool are reserved and never picked for normal cards.
 * - Characters that already have a card of this rarity are skipped until every candidate has one.
 */
export function pickCharacters(
  catalog: readonly CatalogCharacter[],
  manifest: CardManifest,
  options: PickCharactersOptions,
): CatalogCharacter[] {
  const random = options.random ?? Math.random;
  const starterKeys = new Set(manifest.cards.filter((c) => c.isStarter).map((c) => c.characterKey));
  const pool = catalog.filter(
    (c) => !starterKeys.has(c.key) && (!options.element || c.element === options.element),
  );
  if (pool.length === 0) return [];

  const usedCount = new Map<string, number>();
  for (const card of manifest.cards) {
    if (card.rarity === options.rarity) {
      usedCount.set(card.characterKey, (usedCount.get(card.characterKey) ?? 0) + 1);
    }
  }

  const exponent = popularityExponent(options.rarity);
  const picked: CatalogCharacter[] = [];
  while (picked.length < options.count) {
    // Prefer characters with the fewest cards at this rarity (0 first).
    const minUsed = Math.min(...pool.map((c) => usedCount.get(c.key) ?? 0));
    const candidates = pool.filter((c) => (usedCount.get(c.key) ?? 0) === minUsed);
    const weights = candidates.map((c) => Math.pow((c.favourites ?? 0) + 100, exponent));
    const total = weights.reduce((a, b) => a + b, 0);

    let roll = random() * total;
    let index = candidates.length - 1;
    for (let i = 0; i < candidates.length; i++) {
      roll -= weights[i]!;
      if (roll < 0) {
        index = i;
        break;
      }
    }

    const choice = candidates[index]!;
    picked.push(choice);
    usedCount.set(choice.key, minUsed + 1);
  }
  return picked;
}

/**
 * Picks starter characters: never used before (so each starter owns its asset exclusively),
 * spread round-robin across elements.
 */
export function pickStarterCharacters(
  catalog: readonly CatalogCharacter[],
  manifest: CardManifest,
  count: number,
  random: () => number = Math.random,
): CatalogCharacter[] {
  const usedKeys = new Set(manifest.cards.map((c) => c.characterKey));
  const byElement = new Map<CardElement, CatalogCharacter[]>();
  for (const c of catalog) {
    if (usedKeys.has(c.key)) continue;
    const list = byElement.get(c.element) ?? [];
    list.push(c);
    byElement.set(c.element, list);
  }

  const picked: CatalogCharacter[] = [];
  let progressed = true;
  while (picked.length < count && progressed) {
    progressed = false;
    for (const element of CARD_ELEMENTS) {
      if (picked.length >= count) break;
      const list = byElement.get(element);
      if (!list?.length) continue;
      const [choice] = list.splice(Math.floor(random() * list.length), 1);
      picked.push(choice!);
      progressed = true;
    }
  }
  return picked;
}

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/**
 * Maps an existing card (e.g. from the old bulk generator: "Saber (Artoria) #2",
 * "Sailor Jupiter") to a catalog character of the same anime. Scores word overlap with the
 * catalog name (x2) and tags (x1). Returns null when nothing overlaps or the best score is tied.
 */
export function matchCatalogCharacter(
  catalog: readonly CatalogCharacter[],
  cardName: string,
  animeTitle: string,
): CatalogCharacter | null {
  const cardWords = new Set(words(cardName.replace(/#\d+/g, ' ')));
  let best: CatalogCharacter | null = null;
  let bestScore = 0;
  let tied = false;

  for (const c of catalog) {
    if (!titlesMatch(c.anime, animeTitle)) continue;
    const nameScore = words(c.name).filter((w) => cardWords.has(w)).length * 2;
    const tagScore = words(c.tags.join(' ')).filter((w) => cardWords.has(w)).length;
    const score = nameScore + tagScore;
    if (score > bestScore) {
      best = c;
      bestScore = score;
      tied = false;
    } else if (score === bestScore && score > 0) {
      tied = true;
    }
  }
  return tied ? null : best;
}
