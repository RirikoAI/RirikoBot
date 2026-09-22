import { RateLimiter, fetchWithRetry } from '../http/rate-limiter.js';
import type { Wallpaper } from './types.js';

export interface WallhavenClientOptions {
  baseUrl?: string;
  limiter?: RateLimiter;
  fetchFn?: typeof fetch;
  maxRetries?: number;
  timeoutMs?: number;
}

interface RawWallpaper {
  id: string;
  url: string;
  path: string;
  thumbs: { large?: string | null; original?: string | null } | null;
  resolution: string;
  favorites: number | null;
  views: number | null;
  source: string | null;
  purity: string;
}

/**
 * Wallhaven REST client (https://wallhaven.cc/help/api). Anonymous access is SFW-only, which is all
 * Ririko asks for: every search is pinned to the Anime category and the SFW purity level.
 * Wallhaven allows 45 req/min, so the default interval is 1.4 s.
 */
export class WallhavenClient {
  private readonly baseUrl: string;
  private readonly limiter: RateLimiter;
  private readonly fetchFn: typeof fetch | undefined;
  private readonly maxRetries: number | undefined;
  private readonly timeoutMs: number | undefined;

  constructor(options: WallhavenClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'https://wallhaven.cc/api/v1').replace(/\/$/, '');
    this.limiter = options.limiter ?? new RateLimiter(1400);
    this.fetchFn = options.fetchFn;
    this.maxRetries = options.maxRetries;
    this.timeoutMs = options.timeoutMs;
  }

  /** One page (up to 24) of SFW anime wallpapers, most relevant first. */
  async search(query: string, page = 1): Promise<Wallpaper[]> {
    const params = new URLSearchParams({
      q: query.trim(),
      categories: '010',
      purity: '100',
      sorting: 'relevance',
      page: String(Math.max(page, 1)),
    });

    const res = await fetchWithRetry(
      `${this.baseUrl}/search?${params.toString()}`,
      { headers: { Accept: 'application/json' } },
      {
        limiter: this.limiter,
        fetchFn: this.fetchFn,
        maxRetries: this.maxRetries,
        timeoutMs: this.timeoutMs,
      },
    );
    if (!res.ok) throw new Error(`Wallhaven search failed: HTTP ${res.status}`);

    const body = (await res.json()) as { data?: RawWallpaper[] };
    return (body.data ?? [])
      .filter((w) => w.purity === 'sfw')
      .map((w) => ({
        id: w.id,
        pageUrl: w.url,
        imageUrl: w.path,
        thumbnailUrl: w.thumbs?.large ?? w.thumbs?.original ?? null,
        resolution: w.resolution,
        favorites: w.favorites ?? 0,
        views: w.views ?? 0,
        source: w.source || null,
      }));
  }
}
