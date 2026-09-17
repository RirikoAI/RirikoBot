import type { FreeGameItem, FreeGameProvider, FreeGameProviderType } from '../types.js';

export interface SteamProviderOptions {
  fetchFn?: typeof fetch | undefined;
}

export class SteamFreeGamesProvider implements FreeGameProvider {
  readonly id: FreeGameProviderType = 'STEAM';
  readonly name = 'Steam Store';

  private readonly fetch: typeof fetch;

  constructor(options: SteamProviderOptions = {}) {
    this.fetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async fetchFreeGames(): Promise<FreeGameItem[]> {
    try {
      const url = 'https://store.steampowered.com/api/featuredcategories/?l=english';
      const response = await this.fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RirikoBot/2.0)' },
      });

      if (!response.ok) {
        console.warn(`[SteamFreeGamesProvider] Request failed with HTTP ${response.status}`);
        return [];
      }

      const data = (await response.json()) as any;
      const specials = data?.specials?.items ?? [];
      const freeGames: FreeGameItem[] = [];

      const now = new Date();

      for (const item of specials) {
        // Look for 100% discount specials (giveaway promotions)
        const isFreeDiscount =
          item.discount_percent === 100 || (item.final_price === 0 && item.original_price > 0);

        if (!isFreeDiscount) {
          continue;
        }

        const appId = String(item.id);
        const storeUrl = `https://store.steampowered.com/app/${appId}/`;
        const thumbnailUrl = item.header_image || item.large_capsule_image || null;

        // discount_expiration is unix seconds
        const endDate = item.discount_expiration
          ? new Date(item.discount_expiration * 1000)
          : new Date(now.getTime() + 7 * 86_400_000);

        const originalPrice =
          item.original_price && item.currency
            ? `${(item.original_price / 100).toFixed(2)} ${item.currency}`
            : undefined;

        freeGames.push({
          id: `steam-${appId}`,
          provider: 'STEAM',
          title: item.name,
          storeUrl,
          thumbnailUrl,
          startDate: now,
          endDate,
          originalPrice,
          isUpcoming: false,
        });
      }

      return freeGames;
    } catch (err) {
      console.error('[SteamFreeGamesProvider] Error fetching Steam specials:', err);
      return [];
    }
  }
}
