import { RateLimiter, fetchWithRetry } from '../http/rate-limiter.js';

export interface WaifuImTag {
  name: string;
  slug: string;
}

export interface WaifuImArtist {
  name: string;
  pixiv: string | null;
  twitter: string | null;
  deviantArt: string | null;
  patreon: string | null;
}

export interface WaifuImImage {
  id: number;
  url: string;
  extension: string;
  source: string | null;
  isNsfw: boolean;
  width: number;
  height: number;
  dominantColor: string | null;
  favorites: number;
  tags: WaifuImTag[];
  artists: WaifuImArtist[];
}

export interface WaifuImSearchOptions {
  /** Tag slugs that every image must carry, e.g. `selfies`, `maid`. */
  tags?: string[];
  /** Images per call (default 1). */
  limit?: number;
  /** Adult images are excluded unless explicitly requested. */
  includeNsfw?: boolean;
}

export interface WaifuImClientOptions {
  baseUrl?: string;
  limiter?: RateLimiter;
  fetchFn?: typeof fetch;
  maxRetries?: number;
  timeoutMs?: number;
}

const USER_AGENT = 'RirikoBot/2.0 (+https://github.com/RirikoAI/RirikoBot)';

interface RawImage {
  id: number;
  url: string;
  extension: string;
  source: string | null;
  isNsfw: boolean;
  width: number;
  height: number;
  dominantColor: string | null;
  favorites: number | null;
  tags: Array<{ name: string; slug: string }> | null;
  artists: Array<{
    name: string;
    pixiv: string | null;
    twitter: string | null;
    deviantArt: string | null;
    patreon: string | null;
  }> | null;
}

/**
 * waifu.im REST client (https://docs.waifu.im, API v7). Read endpoints need no key.
 * The pre-2025 `/search` endpoint is gone (it answers with a Cloudflare challenge); this uses `/images`.
 */
export class WaifuImClient {
  private readonly baseUrl: string;
  private readonly limiter: RateLimiter;
  private readonly fetchFn: typeof fetch | undefined;
  private readonly maxRetries: number | undefined;
  private readonly timeoutMs: number;

  constructor(options: WaifuImClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'https://api.waifu.im').replace(/\/$/, '');
    this.limiter = options.limiter ?? new RateLimiter(500);
    this.fetchFn = options.fetchFn;
    this.maxRetries = options.maxRetries;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  /** Random images matching all `tags`. */
  async search(options: WaifuImSearchOptions = {}): Promise<WaifuImImage[]> {
    const params = new URLSearchParams({
      IsNsfw: options.includeNsfw ? 'All' : 'False',
      OrderBy: 'Random',
      PageSize: String(Math.min(Math.max(options.limit ?? 1, 1), 30)),
    });
    for (const tag of options.tags ?? []) params.append('IncludedTags', tag);

    const res = await this.fetch(`${this.baseUrl}/images?${params.toString()}`, 'application/json');
    if (!res.ok) throw new Error(`waifu.im search failed: HTTP ${res.status}`);

    const body = (await res.json()) as { items?: RawImage[] };
    return (body.items ?? []).map((raw) => ({
      id: raw.id,
      url: raw.url,
      extension: raw.extension,
      source: raw.source,
      isNsfw: raw.isNsfw,
      width: raw.width,
      height: raw.height,
      dominantColor: raw.dominantColor,
      favorites: raw.favorites ?? 0,
      tags: (raw.tags ?? []).map((t) => ({ name: t.name, slug: t.slug })),
      artists: (raw.artists ?? []).map((a) => ({
        name: a.name,
        pixiv: a.pixiv,
        twitter: a.twitter,
        deviantArt: a.deviantArt,
        patreon: a.patreon,
      })),
    }));
  }

  /** Downloads an image binary (used by Waifu TCG ingestion). */
  async downloadImage(imageUrl: string): Promise<Buffer> {
    const res = await this.fetch(imageUrl, 'image/*');
    if (!res.ok) throw new Error(`Failed to download waifu.im image: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  private fetch(url: string, accept: string): Promise<Response> {
    return fetchWithRetry(
      url,
      { headers: { 'User-Agent': USER_AGENT, Accept: accept } },
      {
        limiter: this.limiter,
        fetchFn: this.fetchFn,
        maxRetries: this.maxRetries,
        timeoutMs: this.timeoutMs,
      },
    );
  }
}
