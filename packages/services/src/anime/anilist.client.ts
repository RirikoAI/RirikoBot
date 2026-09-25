import { RateLimiter, fetchWithRetry } from '../http/rate-limiter.js';
import { titlesMatch } from './titles.js';

export interface AniListCharacter {
  id: number;
  name: string;
  nativeName: string | null;
  alternativeNames: string[];
  description: string | null;
  imageUrl: string | null;
  siteUrl: string | null;
  favourites: number;
  /** Romaji and English titles of the character's most popular media (anime and manga). */
  mediaTitles: string[];
  animeTitles: string[];
  mangaTitles: string[];
  /** Japanese voice actors. */
  voiceActors: string[];
}

export type AniListMediaType = 'ANIME' | 'MANGA';

export interface AniListMedia {
  id: number;
  idMal: number | null;
  type: AniListMediaType;
  title: { romaji: string | null; english: string | null; native: string | null };
  description: string | null;
  /** 0-100 community score. */
  averageScore: number | null;
  /** Number of AniList users with the entry on their list. */
  popularity: number | null;
  episodes: number | null;
  chapters: number | null;
  volumes: number | null;
  status: string | null;
  format: string | null;
  genres: string[];
  /** Partial ISO date: `YYYY-MM-DD`, `YYYY-MM` or `YYYY`. */
  startDate: string | null;
  endDate: string | null;
  /** Main animation studios. */
  studios: string[];
  /** Other main studios and licensors credited on the entry. */
  producers: string[];
  /** Staff credited for story or art (manga authors). */
  authors: string[];
  coverImageUrl: string | null;
  siteUrl: string | null;
  isAdult: boolean;
}

export interface AniListClientOptions {
  /** Share one limiter per process: AniList limits by IP, not by caller. */
  limiter?: RateLimiter;
  fetchFn?: typeof fetch;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface AniListMediaSearchOptions {
  type?: AniListMediaType;
  perPage?: number;
  /** Adult media is excluded unless explicitly requested. */
  includeAdult?: boolean;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface RawTitle {
  romaji: string | null;
  english: string | null;
}

interface RawFuzzyDate {
  year: number | null;
  month: number | null;
  day: number | null;
}

interface RawCharacter {
  id: number;
  name: { full: string | null; native: string | null; alternative: string[] | null };
  image: { large: string | null } | null;
  favourites: number | null;
  description: string | null;
  siteUrl: string | null;
  media: {
    edges: Array<{
      node: { type: AniListMediaType; title: RawTitle };
      voiceActors: Array<{ name: { full: string | null } }> | null;
    }>;
  } | null;
}

interface RawMedia {
  id: number;
  idMal: number | null;
  type: AniListMediaType;
  title: { romaji: string | null; english: string | null; native: string | null };
  description: string | null;
  averageScore: number | null;
  popularity: number | null;
  episodes: number | null;
  chapters: number | null;
  volumes: number | null;
  status: string | null;
  format: string | null;
  genres: string[] | null;
  startDate: RawFuzzyDate | null;
  endDate: RawFuzzyDate | null;
  studios: {
    edges: Array<{ isMain: boolean; node: { name: string; isAnimationStudio: boolean } }>;
  } | null;
  staff: { edges: Array<{ role: string | null; node: { name: { full: string | null } } }> } | null;
  coverImage: { large: string | null } | null;
  siteUrl: string | null;
  isAdult: boolean | null;
}

const CHARACTER_FIELDS = `
  id
  name { full native alternative }
  image { large }
  favourites
  description(asHtml: false)
  siteUrl
  media(perPage: 6, sort: [POPULARITY_DESC]) {
    edges {
      node { type title { romaji english } }
      voiceActors(language: JAPANESE, sort: [RELEVANCE]) { name { full } }
    }
  }`;

const CHARACTER_SEARCH_QUERY = `
query ($search: String, $perPage: Int) {
  Page(perPage: $perPage) {
    characters(search: $search, sort: [SEARCH_MATCH, FAVOURITES_DESC]) {${CHARACTER_FIELDS}
    }
  }
}`;

const CHARACTER_BY_ID_QUERY = `
query ($id: Int) {
  Character(id: $id) {${CHARACTER_FIELDS}
  }
}`;

const MEDIA_SEARCH_QUERY = `
query ($search: String, $type: MediaType, $perPage: Int, $isAdult: Boolean) {
  Page(perPage: $perPage) {
    media(search: $search, type: $type, isAdult: $isAdult, sort: [SEARCH_MATCH, POPULARITY_DESC]) {
      id
      idMal
      type
      title { romaji english native }
      description(asHtml: false)
      averageScore
      popularity
      episodes
      chapters
      volumes
      status
      format
      genres
      startDate { year month day }
      endDate { year month day }
      studios { edges { isMain node { name isAnimationStudio } } }
      staff(perPage: 6, sort: [RELEVANCE]) { edges { role node { name { full } } } }
      coverImage { large }
      siteUrl
      isAdult
    }
  }
}`;

// Matches "Story", "Art", "Story & Art", "Original Creator"; excludes assistants.
const isAuthorRole = (role: string) =>
  /^(story|art|original creator)\b/i.test(role) && !/assist/i.test(role);

function fuzzyDate(date: RawFuzzyDate | null): string | null {
  if (!date?.year) return null;
  const parts = [String(date.year)];
  if (date.month) {
    parts.push(String(date.month).padStart(2, '0'));
    if (date.day) parts.push(String(date.day).padStart(2, '0'));
  }
  return parts.join('-');
}

function titlesOf(title: RawTitle): string[] {
  return [title.romaji, title.english].filter((t): t is string => Boolean(t));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function mapCharacter(c: RawCharacter, fallbackName: string): AniListCharacter {
  const edges = c.media?.edges ?? [];
  const displayTitle = (t: RawTitle) => t.english ?? t.romaji;
  return {
    id: c.id,
    name: c.name.full ?? fallbackName,
    nativeName: c.name.native,
    alternativeNames: c.name.alternative?.filter(Boolean) ?? [],
    description: c.description,
    imageUrl: c.image?.large ?? null,
    siteUrl: c.siteUrl,
    favourites: c.favourites ?? 0,
    mediaTitles: edges.flatMap((e) => titlesOf(e.node.title)),
    animeTitles: unique(
      edges
        .filter((e) => e.node.type === 'ANIME')
        .map((e) => displayTitle(e.node.title))
        .filter((t): t is string => Boolean(t)),
    ),
    mangaTitles: unique(
      edges
        .filter((e) => e.node.type === 'MANGA')
        .map((e) => displayTitle(e.node.title))
        .filter((t): t is string => Boolean(t)),
    ),
    voiceActors: unique(
      edges.flatMap((e) =>
        (e.voiceActors ?? []).map((va) => va.name.full).filter((n): n is string => Boolean(n)),
      ),
    ),
  };
}

function mapMedia(m: RawMedia): AniListMedia {
  const mainStudios = (m.studios?.edges ?? []).filter((e) => e.isMain);
  return {
    id: m.id,
    idMal: m.idMal,
    type: m.type,
    title: m.title,
    description: m.description,
    averageScore: m.averageScore,
    popularity: m.popularity,
    episodes: m.episodes,
    chapters: m.chapters,
    volumes: m.volumes,
    status: m.status,
    format: m.format,
    genres: m.genres ?? [],
    startDate: fuzzyDate(m.startDate),
    endDate: fuzzyDate(m.endDate),
    studios: mainStudios.filter((e) => e.node.isAnimationStudio).map((e) => e.node.name),
    producers: mainStudios.filter((e) => !e.node.isAnimationStudio).map((e) => e.node.name),
    authors: unique(
      (m.staff?.edges ?? [])
        .filter((e) => e.role !== null && isAuthorRole(e.role))
        .map((e) => e.node.name.full)
        .filter((n): n is string => Boolean(n)),
    ),
    coverImageUrl: m.coverImage?.large ?? null,
    siteUrl: m.siteUrl,
    isAdult: m.isAdult ?? false,
  };
}

/**
 * AniList GraphQL client (https://docs.anilist.co). No API key required.
 * AniList allows 90 req/min (currently degraded to 30), so the default interval is 2.5 s.
 */
export class AniListClient {
  private readonly endpoint = 'https://graphql.anilist.co';
  private readonly limiter: RateLimiter;
  private readonly fetchFn: typeof fetch | undefined;
  private readonly maxRetries: number | undefined;
  private readonly timeoutMs: number | undefined;

  constructor(options: AniListClientOptions = {}) {
    this.limiter = options.limiter ?? new RateLimiter(2500);
    this.fetchFn = options.fetchFn;
    this.maxRetries = options.maxRetries;
    this.timeoutMs = options.timeoutMs;
  }

  /**
   * Finds the character whose media list matches `animeTitle`, falling back to the best search match.
   */
  async findCharacter(name: string, animeTitle?: string): Promise<AniListCharacter | null> {
    const results = await this.searchCharacters(name, { perPage: 8 });
    if (results.length === 0) return null;

    if (animeTitle) {
      const byAnime = results.find((c) => c.mediaTitles.some((t) => titlesMatch(t, animeTitle)));
      if (byAnime) return byAnime;
    }
    return results[0]!;
  }

  /** Searches characters, best match first, then by favourites. */
  async searchCharacters(
    search: string,
    options: { perPage?: number } = {},
  ): Promise<AniListCharacter[]> {
    const data = await this.query<{ Page?: { characters?: RawCharacter[] } }>(
      CHARACTER_SEARCH_QUERY,
      { search, perPage: clampPerPage(options.perPage) },
      search,
    );
    return (data.Page?.characters ?? []).map((c) => mapCharacter(c, search));
  }

  async getCharacter(id: number): Promise<AniListCharacter | null> {
    const data = await this.query<{ Character?: RawCharacter | null }>(
      CHARACTER_BY_ID_QUERY,
      { id },
      `character ${id}`,
      { notFoundAsNull: true },
    );
    return data.Character ? mapCharacter(data.Character, String(id)) : null;
  }

  /** Searches anime or manga, best match first. */
  async searchMedia(
    search: string,
    options: AniListMediaSearchOptions = {},
  ): Promise<AniListMedia[]> {
    const data = await this.query<{ Page?: { media?: RawMedia[] } }>(
      MEDIA_SEARCH_QUERY,
      {
        search,
        type: options.type ?? 'ANIME',
        perPage: clampPerPage(options.perPage),
        // AniList treats a null filter as "any", so only send false to exclude adult media.
        isAdult: options.includeAdult ? null : false,
      },
      search,
    );
    return (data.Page?.media ?? []).map(mapMedia);
  }

  private async query<T>(
    query: string,
    variables: Record<string, unknown>,
    label: string,
    options: { notFoundAsNull?: boolean } = {},
  ): Promise<T> {
    const res = await fetchWithRetry(
      this.endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables }),
      },
      {
        limiter: this.limiter,
        fetchFn: this.fetchFn,
        maxRetries: this.maxRetries,
        timeoutMs: this.timeoutMs,
      },
    );
    // AniList answers a missing single entity with HTTP 404 and a "Not Found." error.
    if (res.status === 404 && options.notFoundAsNull) return {} as T;
    if (!res.ok) throw new Error(`AniList search failed for "${label}": HTTP ${res.status}`);

    const body = (await res.json()) as GraphQLResponse<T>;
    if (body.errors?.length) {
      throw new Error(`AniList search failed for "${label}": ${body.errors[0]!.message}`);
    }
    return body.data ?? ({} as T);
  }
}

function clampPerPage(perPage: number | undefined): number {
  return Math.min(Math.max(perPage ?? 10, 1), 25);
}
