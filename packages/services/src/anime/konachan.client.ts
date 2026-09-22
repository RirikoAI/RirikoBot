import { RateLimiter, fetchWithRetry } from '../http/rate-limiter.js';
import type { Wallpaper } from './types.js';

export interface KonachanClientOptions {
  /** konachan.net is Konachan's SFW-only mirror; do not point this at konachan.com. */
  baseUrl?: string;
  limiter?: RateLimiter;
  fetchFn?: typeof fetch;
  maxRetries?: number;
  timeoutMs?: number;
}

interface RawPost {
  id: number;
  rating: string;
  jpeg_url: string | null;
  file_url: string | null;
  width: number;
  height: number;
  score: number | null;
  source: string | null;
}

const PAGE_SIZE = 24;

/**
 * Konachan (Moebooru) JSON API client for anime wallpapers. Searches konachan.net and also
 * filters on `rating:safe`, keeping only posts rated `s`.
 */
export class KonachanClient {
  private readonly baseUrl: string;
  private readonly limiter: RateLimiter;
  private readonly fetchFn: typeof fetch | undefined;
  private readonly maxRetries: number | undefined;
  private readonly timeoutMs: number | undefined;

  constructor(options: KonachanClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'https://konachan.net').replace(/\/$/, '');
    this.limiter = options.limiter ?? new RateLimiter(1000);
    this.fetchFn = options.fetchFn;
    this.maxRetries = options.maxRetries;
    this.timeoutMs = options.timeoutMs;
  }

  /** `query` becomes one tag: `raiden shogun` → `raiden_shogun`. */
  async search(query: string, page = 1): Promise<Wallpaper[]> {
    const tag = query.trim().toLowerCase().replace(/\s+/g, '_');
    const params = new URLSearchParams({
      tags: `${tag} rating:safe`,
      limit: String(PAGE_SIZE),
      page: String(Math.max(page, 1)),
    });

    const res = await fetchWithRetry(
      `${this.baseUrl}/post.json?${params.toString()}`,
      { headers: { Accept: 'application/json' } },
      {
        limiter: this.limiter,
        fetchFn: this.fetchFn,
        maxRetries: this.maxRetries,
        timeoutMs: this.timeoutMs,
      },
    );
    if (!res.ok) throw new Error(`Konachan search failed: HTTP ${res.status}`);

    const posts = (await res.json()) as RawPost[];
    return posts
      .filter((p) => p.rating === 's' && (p.jpeg_url || p.file_url))
      .map((p) => ({
        id: String(p.id),
        pageUrl: `${this.baseUrl}/post/show/${p.id}`,
        imageUrl: (p.jpeg_url ?? p.file_url)!,
        thumbnailUrl: null,
        resolution: `${p.width}x${p.height}`,
        favorites: p.score,
        views: null,
        source: p.source || null,
      }));
  }
}
