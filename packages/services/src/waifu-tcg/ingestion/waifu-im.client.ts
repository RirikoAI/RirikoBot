import type {
  WaifuImImage,
  WaifuImSearchOptions,
  WaifuImSearchResponse,
} from '../types.js';

export interface WaifuImClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchFn?: typeof fetch;
}

export class WaifuImClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetch: typeof fetch;

  constructor(options?: WaifuImClientOptions) {
    this.baseUrl = options?.baseUrl ?? 'https://api.waifu.im';
    this.timeoutMs = options?.timeoutMs ?? 10000;
    this.maxRetries = options?.maxRetries ?? 3;
    this.fetch = options?.fetchFn ?? globalThis.fetch;
  }

  /**
   * Searches waifu.im API for safe-for-work character assets.
   */
  async search(options?: WaifuImSearchOptions): Promise<WaifuImImage[]> {
    const url = new URL('/search', this.baseUrl);
    url.searchParams.set('is_nsfw', 'false');

    if (options?.many ?? true) {
      url.searchParams.set('many', 'true');
    }

    if (options?.tags && options.tags.length > 0) {
      for (const tag of options.tags) {
        url.searchParams.append('included_tags', tag);
      }
    }

    let attempt = 0;
    let delayMs = 500;

    while (attempt <= this.maxRetries) {
      attempt++;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await this.fetch(url.toString(), {
          signal: controller.signal,
          headers: {
            'User-Agent': 'RirikoBot-TCG/2.0 (+https://github.com/RirikoAI/RirikoBot)',
            Accept: 'application/json',
          },
        });

        clearTimeout(timer);

        if (response.status === 429) {
          if (attempt > this.maxRetries) {
            throw new Error(`waifu.im rate limit exceeded after ${this.maxRetries} retries`);
          }
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          delayMs *= 2;
          continue;
        }

        if (!response.ok) {
          throw new Error(`waifu.im API responded with status ${response.status}`);
        }

        const data = (await response.json()) as WaifuImSearchResponse;
        return data.images ?? [];
      } catch (err: unknown) {
        if (attempt > this.maxRetries) {
          throw err instanceof Error ? err : new Error(String(err));
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs *= 2;
      }
    }

    return [];
  }

  /**
   * Downloads raw image binary from provided URL.
   */
  async downloadImage(imageUrl: string): Promise<Buffer> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const response = await this.fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'RirikoBot-TCG/2.0',
      },
    });

    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`Failed to download waifu asset binary: HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Extracts character name, anime title, and tag labels from waifu.im metadata.
   */
  extractMetadata(image: WaifuImImage): {
    characterName: string;
    animeTitle: string;
    tags: string[];
  } {
    const rawTags = (image.tags ?? []).map((t) => (typeof t === 'string' ? t : t.name));
    let characterName = 'Unknown Waifu';
    const animeTitle = 'Anime Collection';

    // Heuristic tag matching
    for (const tag of rawTags) {
      const lower = tag.toLowerCase();
      if (lower.includes('maid') || lower.includes('waifu') || lower.includes('uniform')) {
        continue;
      }
      if (!characterName || characterName === 'Unknown Waifu') {
        characterName = tag
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
      }
    }

    if (image.signature) {
      if (characterName === 'Unknown Waifu') {
        characterName = `Waifu #${String(image.image_id).slice(-4)}`;
      }
    }

    return {
      characterName,
      animeTitle,
      tags: rawTags,
    };
  }
}
