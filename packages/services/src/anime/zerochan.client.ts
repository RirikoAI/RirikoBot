import { RateLimiter, fetchWithRetry } from '../http/rate-limiter.js';
import type { Wallpaper } from './types.js';

export interface ZerochanClientOptions {
  baseUrl?: string;
  /** Zerochan asks API clients to identify themselves as `<app> - <username>`. */
  userAgent?: string;
  limiter?: RateLimiter;
  fetchFn?: typeof fetch;
  maxRetries?: number;
  timeoutMs?: number;
}

interface RawListItem {
  id: number;
  width: number;
  height: number;
  source: string | null;
  tag: string;
}

interface RawDetail {
  id: number;
  large?: string | null;
  full?: string | null;
}

const PAGE_SIZE = 24;

/**
 * Zerochan JSON API client (https://www.zerochan.net/api). Zerochan is an SFW image board.
 * Tag pages answer JSON with `?json`; alias tags redirect to the canonical tag and lose the query,
 * so the client re-requests JSON from the redirect target.
 */
export class ZerochanClient {
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly limiter: RateLimiter;
  private readonly fetchFn: typeof fetch | undefined;
  private readonly maxRetries: number | undefined;
  private readonly timeoutMs: number | undefined;

  constructor(options: ZerochanClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'https://www.zerochan.net').replace(/\/$/, '');
    this.userAgent = options.userAgent ?? 'RirikoBot - RirikoAI';
    this.limiter = options.limiter ?? new RateLimiter(1000);
    this.fetchFn = options.fetchFn;
    this.maxRetries = options.maxRetries;
    this.timeoutMs = options.timeoutMs;
  }

  /** One page of images for the tag closest to `query` (Zerochan resolves aliases). */
  async search(query: string, page = 1): Promise<Wallpaper[]> {
    const params = `json&l=${PAGE_SIZE}&p=${Math.max(page, 1)}`;
    let res = await this.get(`${this.baseUrl}/${encodeURIComponent(query.trim())}?${params}`);
    if (res.ok && !isJson(res) && res.url && !res.url.includes('json')) {
      res = await this.get(`${res.url}?${params}`);
    }
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`Zerochan search failed: HTTP ${res.status}`);
    // Unknown tags render an HTML search page instead of JSON.
    if (!isJson(res)) return [];

    const body = (await res.json()) as { items?: RawListItem[] };
    return (body.items ?? []).map((item) => ({
      id: String(item.id),
      pageUrl: `${this.baseUrl}/${item.id}`,
      imageUrl: derivedLargeUrl(item),
      thumbnailUrl: null,
      resolution: `${item.width}x${item.height}`,
      favorites: null,
      views: null,
      source: item.source || null,
    }));
  }

  /** Looks up the 600px image URL when it cannot be derived from the tag name. */
  async resolveImageUrl(id: string): Promise<string | null> {
    const res = await this.get(`${this.baseUrl}/${encodeURIComponent(id)}?json`);
    if (!res.ok || !isJson(res)) return null;
    const detail = (await res.json()) as RawDetail;
    return detail.large ?? detail.full ?? null;
  }

  private get(url: string): Promise<Response> {
    return fetchWithRetry(
      url,
      { headers: { 'User-Agent': this.userAgent, Accept: 'application/json' } },
      {
        limiter: this.limiter,
        fetchFn: this.fetchFn,
        maxRetries: this.maxRetries,
        timeoutMs: this.timeoutMs,
      },
    );
  }
}

function isJson(res: Response): boolean {
  return (res.headers.get('content-type') ?? '').includes('json');
}

/**
 * Zerochan serves a 600px JPEG at `s1.zerochan.net/<Tag.With.Dots>.600.<id>.jpg`. Only plain tag
 * names are derived; anything else is resolved through the detail endpoint (empty URL here).
 */
function derivedLargeUrl(item: RawListItem): string {
  if (!/^[A-Za-z0-9 '-]+$/.test(item.tag)) return '';
  return `https://s1.zerochan.net/${item.tag.trim().replace(/\s+/g, '.')}.600.${item.id}.jpg`;
}
