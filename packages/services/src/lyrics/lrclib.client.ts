import { RateLimiter, fetchWithRetry } from '../http/rate-limiter.js';

export interface LrclibClientOptions {
  baseUrl?: string;
  limiter?: RateLimiter;
  fetchFn?: typeof fetch;
  maxRetries?: number;
  timeoutMs?: number;
}

/** One LRCLIB record, with the raw field names mapped to the ones this codebase uses. */
export interface LrclibLyrics {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string | null;
  durationSeconds: number;
  instrumental: boolean;
  /** Lyrics without timestamps; null for instrumentals and for entries that only have synced text. */
  plainLyrics: string | null;
  /** Lyrics with `[mm:ss.xx]` line prefixes. */
  syncedLyrics: string | null;
}

export interface LrclibTrackQuery {
  title: string;
  artist: string;
  /** Track length in seconds; 0 or missing means unknown. */
  durationSeconds?: number | undefined;
}

interface RawLyrics {
  id?: number;
  name?: string | null;
  trackName?: string | null;
  artistName?: string | null;
  albumName?: string | null;
  duration?: number | null;
  instrumental?: boolean | null;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

const USER_AGENT = 'RirikoBot/2.0 (+https://github.com/RirikoAI/RirikoBot)';

/** A search hit counts as the same recording when its length is within this many seconds. */
const DURATION_TOLERANCE_SECONDS = 3;

/**
 * LRCLIB client (https://lrclib.net/docs). The API is free and needs no key; it asks clients to
 * name themselves in the User-Agent. A miss is `null`; every other failure status throws, so a
 * caller can tell "no lyrics" from "LRCLIB is down".
 */
export class LrclibClient {
  private readonly baseUrl: string;
  private readonly limiter: RateLimiter;
  private readonly fetchFn: typeof fetch | undefined;
  private readonly maxRetries: number | undefined;
  private readonly timeoutMs: number;

  constructor(options: LrclibClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'https://lrclib.net').replace(/\/$/, '');
    this.limiter = options.limiter ?? new RateLimiter(500);
    this.fetchFn = options.fetchFn;
    this.maxRetries = options.maxRetries;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  /**
   * Looks up the lyrics of a known track: an exact `/api/get` match first, then the first
   * `/api/search` hit whose length is within 3 seconds (any hit when the length is unknown).
   */
  async findForTrack(query: LrclibTrackQuery): Promise<LrclibLyrics | null> {
    const title = query.title.trim();
    const artist = query.artist.trim();
    if (!title) return null;
    const duration = Math.round(query.durationSeconds ?? 0);
    const knownDuration = Number.isFinite(duration) && duration > 0;

    const exactParams = new URLSearchParams({ track_name: title });
    if (artist) exactParams.set('artist_name', artist);
    if (knownDuration) exactParams.set('duration', String(duration));
    const exact = await this.getJson<RawLyrics>(`/api/get?${exactParams.toString()}`);
    if (exact && typeof exact === 'object' && !Array.isArray(exact)) return mapLyrics(exact);

    const searchParams = new URLSearchParams({ track_name: title });
    if (artist) searchParams.set('artist_name', artist);
    const hits = await this.searchRaw(searchParams);
    const hit = knownDuration
      ? hits.find(
          (h) =>
            typeof h.duration === 'number' &&
            Math.abs(h.duration - duration) <= DURATION_TOLERANCE_SECONDS,
        )
      : hits[0];
    return hit ? mapLyrics(hit) : null;
  }

  /** Free-text lookup (`/api/search?q=`); returns the first hit. */
  async search(text: string): Promise<LrclibLyrics | null> {
    const q = text.trim();
    if (!q) return null;
    const hits = await this.searchRaw(new URLSearchParams({ q }));
    return hits[0] ? mapLyrics(hits[0]) : null;
  }

  private async searchRaw(params: URLSearchParams): Promise<RawLyrics[]> {
    const body = await this.getJson<RawLyrics[]>(`/api/search?${params.toString()}`);
    return Array.isArray(body) ? body.filter((h) => h && typeof h === 'object') : [];
  }

  /** GET and parse JSON. 404 is `null`; any other non-2xx status throws. */
  private async getJson<T>(pathAndQuery: string): Promise<T | null> {
    const res = await fetchWithRetry(
      `${this.baseUrl}${pathAndQuery}`,
      { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } },
      {
        limiter: this.limiter,
        fetchFn: this.fetchFn,
        maxRetries: this.maxRetries,
        timeoutMs: this.timeoutMs,
      },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`LRCLIB request failed: HTTP ${res.status}`);
    return (await res.json()) as T;
  }
}

function mapLyrics(raw: RawLyrics): LrclibLyrics {
  return {
    id: raw.id ?? 0,
    trackName: raw.trackName ?? raw.name ?? '',
    artistName: raw.artistName ?? '',
    albumName: raw.albumName ?? null,
    durationSeconds: raw.duration ?? 0,
    instrumental: raw.instrumental === true,
    plainLyrics: raw.plainLyrics ?? null,
    syncedLyrics: raw.syncedLyrics ?? null,
  };
}
