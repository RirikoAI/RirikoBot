import { RateLimiter, fetchWithRetry } from '../http/rate-limiter.js';

/** Subset of the Jikan v4 schemas that Ririko reads. See https://docs.api.jikan.moe. */
export interface JikanNamedEntry {
  mal_id: number;
  name: string;
}

export interface JikanImages {
  jpg?: { image_url?: string | null; large_image_url?: string | null } | null;
  webp?: { image_url?: string | null; large_image_url?: string | null } | null;
}

export interface JikanDateRange {
  from: string | null;
  to: string | null;
}

interface JikanMediaBase {
  mal_id: number;
  url: string;
  images: JikanImages;
  title: string;
  title_english: string | null;
  title_japanese: string | null;
  type: string | null;
  status: string | null;
  score: number | null;
  /** MAL popularity rank (1 = most popular). */
  popularity: number | null;
  members: number | null;
  synopsis: string | null;
  genres: JikanNamedEntry[];
}

export interface JikanAnime extends JikanMediaBase {
  episodes: number | null;
  aired: JikanDateRange | null;
  rating: string | null;
  studios: JikanNamedEntry[];
  producers: JikanNamedEntry[];
}

export interface JikanManga extends JikanMediaBase {
  chapters: number | null;
  volumes: number | null;
  published: JikanDateRange | null;
  authors: JikanNamedEntry[];
  serializations: JikanNamedEntry[];
}

export interface JikanCharacter {
  mal_id: number;
  url: string;
  images: JikanImages;
  name: string;
  name_kanji: string | null;
  nicknames: string[];
  favorites: number;
  about: string | null;
}

export interface JikanCharacterFull extends JikanCharacter {
  anime: Array<{ role: string; anime: { mal_id: number; title: string } }>;
  manga: Array<{ role: string; manga: { mal_id: number; title: string } }>;
  voices: Array<{ language: string; person: { mal_id: number; name: string } }>;
}

export interface JikanClientOptions {
  /** Share one limiter per process: Jikan limits by IP (3 req/s, 60 req/min). */
  limiter?: RateLimiter;
  fetchFn?: typeof fetch;
  maxRetries?: number;
  timeoutMs?: number;
  baseUrl?: string;
}

export interface JikanSearchOptions {
  limit?: number;
  /** Adult entries are filtered by Jikan's SFW policy unless explicitly requested. */
  includeAdult?: boolean;
}

/**
 * Jikan v4 REST client (unofficial MyAnimeList API, no key required).
 * The default 1 s spacing stays inside the published 60 req/min limit.
 */
export class JikanClient {
  private readonly baseUrl: string;
  private readonly limiter: RateLimiter;
  private readonly fetchFn: typeof fetch | undefined;
  private readonly maxRetries: number | undefined;
  private readonly timeoutMs: number | undefined;

  constructor(options: JikanClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'https://api.jikan.moe/v4').replace(/\/$/, '');
    this.limiter = options.limiter ?? new RateLimiter(1000);
    this.fetchFn = options.fetchFn;
    this.maxRetries = options.maxRetries;
    this.timeoutMs = options.timeoutMs;
  }

  searchAnime(query: string, options: JikanSearchOptions = {}): Promise<JikanAnime[]> {
    return this.search<JikanAnime>('anime', query, options);
  }

  searchManga(query: string, options: JikanSearchOptions = {}): Promise<JikanManga[]> {
    return this.search<JikanManga>('manga', query, options);
  }

  /** Jikan has no SFW filter for characters; they are ordered by favourites. */
  searchCharacters(
    query: string,
    options: Pick<JikanSearchOptions, 'limit'> = {},
  ): Promise<JikanCharacter[]> {
    return this.search<JikanCharacter>('characters', query, options);
  }

  getAnime(id: number): Promise<JikanAnime | null> {
    return this.getFull<JikanAnime>('anime', id);
  }

  getManga(id: number): Promise<JikanManga | null> {
    return this.getFull<JikanManga>('manga', id);
  }

  getCharacter(id: number): Promise<JikanCharacterFull | null> {
    return this.getFull<JikanCharacterFull>('characters', id);
  }

  private async search<T>(
    resource: 'anime' | 'manga' | 'characters',
    query: string,
    options: JikanSearchOptions,
  ): Promise<T[]> {
    const params = new URLSearchParams({
      q: query,
      limit: String(Math.min(Math.max(options.limit ?? 10, 1), 25)),
    });
    if (resource === 'characters') {
      params.set('order_by', 'favorites');
      params.set('sort', 'desc');
    } else if (!options.includeAdult) {
      // `sfw` is a presence flag; its value is ignored.
      params.set('sfw', '');
    }

    const body = await this.getJson<{ data?: T[] }>(`/${resource}?${params.toString()}`, query);
    return body?.data ?? [];
  }

  private async getFull<T>(
    resource: 'anime' | 'manga' | 'characters',
    id: number,
  ): Promise<T | null> {
    const body = await this.getJson<{ data?: T }>(`/${resource}/${id}/full`, `${resource} ${id}`);
    return body?.data ?? null;
  }

  /** Returns null on 404; throws on other failures so callers can fall back. */
  private async getJson<T>(pathAndQuery: string, label: string): Promise<T | null> {
    const res = await fetchWithRetry(
      `${this.baseUrl}${pathAndQuery}`,
      { headers: { Accept: 'application/json' } },
      {
        limiter: this.limiter,
        fetchFn: this.fetchFn,
        maxRetries: this.maxRetries,
        timeoutMs: this.timeoutMs,
      },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Jikan request failed for "${label}": HTTP ${res.status}`);
    return (await res.json()) as T;
  }
}
