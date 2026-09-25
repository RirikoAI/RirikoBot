import type { AniListCharacter, AniListClient, AniListMedia } from './anilist.client.js';
import type {
  JikanAnime,
  JikanCharacter,
  JikanCharacterFull,
  JikanClient,
  JikanImages,
  JikanManga,
} from './jikan.client.js';
import type {
  AnimeCharacterDetails,
  AnimeCharacterSummary,
  AnimeDataSource,
  AnimeMediaDetails,
  AnimeMediaKind,
  AnimeSearchResult,
} from './types.js';

export interface AnimeSearchServiceOptions {
  jikan: JikanClient;
  anilist: AniListClient;
  /** Results per search (Discord select menus hold at most 25). */
  resultLimit?: number;
  cacheTtlMs?: number;
  cacheMaxEntries?: number;
  /** After a Jikan failure, skip it for this long and answer from AniList directly. */
  jikanCooldownMs?: number;
  now?: () => number;
}

export interface AnimeMediaSearchOptions {
  includeAdult?: boolean;
}

/** Bounded map whose entries expire; oldest entries are evicted first. */
class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly now: () => number,
  ) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value!);
    }
  }
}

/**
 * Converts upstream markup (AniList markdown/HTML, spoiler tags) into plain text for embeds.
 * Spoilers become Discord spoilers.
 */
export function toPlainText(text: string | null | undefined): string | null {
  if (!text) return null;
  const plain = text
    .replace(/~!([\s\S]*?)!~/g, '||$1||')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return plain || null;
}

function jikanImage(images: JikanImages | null | undefined): string | null {
  return (
    images?.jpg?.large_image_url ??
    images?.jpg?.image_url ??
    images?.webp?.large_image_url ??
    images?.webp?.image_url ??
    null
  );
}

const isoDay = (value: string | null | undefined) => (value ? value.slice(0, 10) : null);
const names = (entries: Array<{ name: string }> | null | undefined) =>
  (entries ?? []).map((e) => e.name);

function fromJikanAnime(a: JikanAnime): AnimeMediaDetails {
  return {
    ...fromJikanMediaBase(a, 'ANIME'),
    startDate: isoDay(a.aired?.from),
    endDate: isoDay(a.aired?.to),
    ageRating: a.rating,
    isAdult: a.rating?.startsWith('Rx') ?? false,
    episodes: a.episodes,
    studios: names(a.studios),
    producers: names(a.producers),
  };
}

function fromJikanManga(m: JikanManga): AnimeMediaDetails {
  return {
    ...fromJikanMediaBase(m, 'MANGA'),
    startDate: isoDay(m.published?.from),
    endDate: isoDay(m.published?.to),
    chapters: m.chapters,
    volumes: m.volumes,
    producers: names(m.serializations),
    authors: names(m.authors),
  };
}

function fromJikanMediaBase(m: JikanAnime | JikanManga, kind: AnimeMediaKind): AnimeMediaDetails {
  return {
    source: 'myanimelist',
    id: m.mal_id,
    kind,
    title: m.title,
    englishTitle: m.title_english,
    nativeTitle: m.title_japanese,
    synopsis: toPlainText(m.synopsis),
    url: m.url,
    imageUrl: jikanImage(m.images),
    score: m.score,
    popularityRank: m.popularity,
    members: m.members ?? null,
    format: m.type,
    status: m.status,
    startDate: null,
    endDate: null,
    genres: names(m.genres),
    ageRating: null,
    isAdult: false,
    episodes: null,
    chapters: null,
    volumes: null,
    studios: [],
    producers: [],
    authors: [],
  };
}

function fromAniListMedia(m: AniListMedia): AnimeMediaDetails {
  return {
    source: 'anilist',
    id: m.id,
    kind: m.type,
    title: m.title.romaji ?? m.title.english ?? m.title.native ?? `#${m.id}`,
    englishTitle: m.title.english,
    nativeTitle: m.title.native,
    synopsis: toPlainText(m.description),
    url: m.siteUrl,
    imageUrl: m.coverImageUrl,
    score: m.averageScore === null ? null : m.averageScore / 10,
    popularityRank: null,
    members: m.popularity,
    format: m.format,
    status: m.status,
    startDate: m.startDate,
    endDate: m.endDate,
    genres: m.genres,
    ageRating: null,
    isAdult: m.isAdult,
    episodes: m.episodes,
    chapters: m.chapters,
    volumes: m.volumes,
    studios: m.studios,
    producers: m.producers,
    authors: m.authors,
  };
}

function fromJikanCharacter(c: JikanCharacter): AnimeCharacterSummary {
  return {
    source: 'myanimelist',
    id: c.mal_id,
    name: c.name,
    nativeName: c.name_kanji,
    imageUrl: jikanImage(c.images),
    favourites: c.favorites,
  };
}

function fromJikanCharacterFull(c: JikanCharacterFull): AnimeCharacterDetails {
  return {
    ...fromJikanCharacter(c),
    nicknames: c.nicknames ?? [],
    about: toPlainText(c.about),
    url: c.url,
    animeTitles: (c.anime ?? []).map((a) => a.anime.title),
    mangaTitles: (c.manga ?? []).map((m) => m.manga.title),
    voiceActors: (c.voices ?? [])
      .filter((v) => v.language === 'Japanese')
      .map((v) => v.person.name),
  };
}

function fromAniListCharacter(c: AniListCharacter): AnimeCharacterDetails {
  return {
    source: 'anilist',
    id: c.id,
    name: c.name,
    nativeName: c.nativeName,
    imageUrl: c.imageUrl,
    favourites: c.favourites,
    nicknames: c.alternativeNames,
    about: toPlainText(c.description),
    url: c.siteUrl,
    animeTitles: c.animeTitles,
    mangaTitles: c.mangaTitles,
    voiceActors: c.voiceActors,
  };
}

/**
 * Anime, manga and character search for commands. MyAnimeList (via Jikan) answers first to keep
 * 1.4.0 parity; AniList answers when Jikan fails, and Jikan is skipped for a cooldown afterwards
 * so an outage does not make every search wait for it to time out.
 */
export class AnimeSearchService {
  private readonly jikan: JikanClient;
  private readonly anilist: AniListClient;
  private readonly resultLimit: number;
  private readonly jikanCooldownMs: number;
  private readonly now: () => number;
  private readonly cache: TtlCache<unknown>;
  private jikanSkipUntil = 0;

  constructor(options: AnimeSearchServiceOptions) {
    this.jikan = options.jikan;
    this.anilist = options.anilist;
    this.resultLimit = Math.min(Math.max(options.resultLimit ?? 10, 1), 25);
    this.jikanCooldownMs = options.jikanCooldownMs ?? 60_000;
    this.now = options.now ?? Date.now;
    this.cache = new TtlCache(
      options.cacheTtlMs ?? 10 * 60_000,
      options.cacheMaxEntries ?? 500,
      this.now,
    );
  }

  searchAnime(
    query: string,
    options: AnimeMediaSearchOptions = {},
  ): Promise<AnimeSearchResult<AnimeMediaDetails>> {
    const includeAdult = options.includeAdult ?? false;
    const limit = this.resultLimit;
    return this.cached(`anime:${includeAdult}:${normalizeQuery(query)}`, () =>
      this.withFallback(
        async () =>
          (await this.jikan.searchAnime(query, { limit, includeAdult })).map(fromJikanAnime),
        async () =>
          (
            await this.anilist.searchMedia(query, { type: 'ANIME', perPage: limit, includeAdult })
          ).map(fromAniListMedia),
      ),
    );
  }

  searchManga(
    query: string,
    options: AnimeMediaSearchOptions = {},
  ): Promise<AnimeSearchResult<AnimeMediaDetails>> {
    const includeAdult = options.includeAdult ?? false;
    const limit = this.resultLimit;
    return this.cached(`manga:${includeAdult}:${normalizeQuery(query)}`, () =>
      this.withFallback(
        async () =>
          (await this.jikan.searchManga(query, { limit, includeAdult })).map(fromJikanManga),
        async () =>
          (
            await this.anilist.searchMedia(query, { type: 'MANGA', perPage: limit, includeAdult })
          ).map(fromAniListMedia),
      ),
    );
  }

  searchCharacters(query: string): Promise<AnimeSearchResult<AnimeCharacterSummary>> {
    const limit = this.resultLimit;
    return this.cached(`characters:${normalizeQuery(query)}`, () =>
      this.withFallback<AnimeCharacterSummary>(
        async () => (await this.jikan.searchCharacters(query, { limit })).map(fromJikanCharacter),
        async () =>
          (await this.anilist.searchCharacters(query, { perPage: limit })).map(
            fromAniListCharacter,
          ),
      ),
    );
  }

  /** Loads full character details from the source that produced the search hit. */
  async getCharacter(source: AnimeDataSource, id: number): Promise<AnimeCharacterDetails | null> {
    const key = `character:${source}:${id}`;
    const hit = this.cache.get(key) as AnimeCharacterDetails | null | undefined;
    if (hit !== undefined) return hit;

    const details =
      source === 'myanimelist'
        ? await this.jikan.getCharacter(id).then((c) => (c ? fromJikanCharacterFull(c) : null))
        : await this.anilist.getCharacter(id).then((c) => (c ? fromAniListCharacter(c) : null));
    this.cache.set(key, details);
    return details;
  }

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key) as T | undefined;
    if (hit !== undefined) return hit;
    const value = await load();
    this.cache.set(key, value);
    return value;
  }

  private async withFallback<T>(
    fromJikan: () => Promise<T[]>,
    fromAniList: () => Promise<T[]>,
  ): Promise<AnimeSearchResult<T>> {
    if (this.now() >= this.jikanSkipUntil) {
      try {
        return { source: 'myanimelist', items: await fromJikan() };
      } catch {
        this.jikanSkipUntil = this.now() + this.jikanCooldownMs;
      }
    }
    return { source: 'anilist', items: await fromAniList() };
  }
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}
