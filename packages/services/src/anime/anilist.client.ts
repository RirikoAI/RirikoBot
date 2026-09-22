import { RateLimiter, fetchWithRetry } from '../http/rate-limiter.js';
import { titlesMatch } from './titles.js';

export interface AniListCharacter {
  id: number;
  name: string;
  imageUrl: string | null;
  favourites: number;
  mediaTitles: string[];
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
  episodes: number | null;
  chapters: number | null;
  volumes: number | null;
  status: string | null;
  format: string | null;
  genres: string[];
  startYear: number | null;
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

interface RawCharacterPage {
  Page?: {
    characters?: Array<{
      id: number;
      name: { full: string | null };
      image: { large: string | null } | null;
      favourites: number | null;
      media: {
        nodes: Array<{ title: { romaji: string | null; english: string | null } }>;
      } | null;
    }>;
  };
}

interface RawMediaPage {
  Page?: {
    media?: Array<{
      id: number;
      idMal: number | null;
      type: AniListMediaType;
      title: { romaji: string | null; english: string | null; native: string | null };
      description: string | null;
      averageScore: number | null;
      episodes: number | null;
      chapters: number | null;
      volumes: number | null;
      status: string | null;
      format: string | null;
      genres: string[] | null;
      startDate: { year: number | null } | null;
      coverImage: { large: string | null } | null;
      siteUrl: string | null;
      isAdult: boolean | null;
    }>;
  };
}

const CHARACTER_SEARCH_QUERY = `
query ($search: String) {
  Page(perPage: 8) {
    characters(search: $search, sort: [SEARCH_MATCH, FAVOURITES_DESC]) {
      id
      name { full }
      image { large }
      favourites
      media(perPage: 6, sort: [POPULARITY_DESC]) { nodes { title { romaji english } } }
    }
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
      episodes
      chapters
      volumes
      status
      format
      genres
      startDate { year }
      coverImage { large }
      siteUrl
      isAdult
    }
  }
}`;

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
    const data = await this.query<RawCharacterPage>(CHARACTER_SEARCH_QUERY, { search: name }, name);

    const results = (data.Page?.characters ?? []).map((c) => ({
      id: c.id,
      name: c.name.full ?? name,
      imageUrl: c.image?.large ?? null,
      favourites: c.favourites ?? 0,
      mediaTitles: (c.media?.nodes ?? []).flatMap((n) =>
        [n.title.romaji, n.title.english].filter((t): t is string => Boolean(t)),
      ),
    }));
    if (results.length === 0) return null;

    if (animeTitle) {
      const byAnime = results.find((c) => c.mediaTitles.some((t) => titlesMatch(t, animeTitle)));
      if (byAnime) return byAnime;
    }
    return results[0]!;
  }

  /** Searches anime or manga, best match first. */
  async searchMedia(search: string, options: AniListMediaSearchOptions = {}): Promise<AniListMedia[]> {
    const data = await this.query<RawMediaPage>(
      MEDIA_SEARCH_QUERY,
      {
        search,
        type: options.type ?? 'ANIME',
        perPage: Math.min(Math.max(options.perPage ?? 10, 1), 25),
        // AniList treats a null filter as "any", so only send false to exclude adult media.
        isAdult: options.includeAdult ? null : false,
      },
      search,
    );

    return (data.Page?.media ?? []).map((m) => ({
      id: m.id,
      idMal: m.idMal,
      type: m.type,
      title: m.title,
      description: m.description,
      averageScore: m.averageScore,
      episodes: m.episodes,
      chapters: m.chapters,
      volumes: m.volumes,
      status: m.status,
      format: m.format,
      genres: m.genres ?? [],
      startYear: m.startDate?.year ?? null,
      coverImageUrl: m.coverImage?.large ?? null,
      siteUrl: m.siteUrl,
      isAdult: m.isAdult ?? false,
    }));
  }

  private async query<T>(query: string, variables: Record<string, unknown>, label: string): Promise<T> {
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
    if (!res.ok) throw new Error(`AniList search failed for "${label}": HTTP ${res.status}`);

    const body = (await res.json()) as GraphQLResponse<T>;
    if (body.errors?.length) {
      throw new Error(`AniList search failed for "${label}": ${body.errors[0]!.message}`);
    }
    return body.data ?? ({} as T);
  }
}
