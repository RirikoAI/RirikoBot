import type { FreeGameItem, FreeGameProvider, FreeGameProviderType } from '../types.js';

export interface EpicProviderOptions {
  fetchFn?: typeof fetch | undefined;
}

export class EpicGamesProvider implements FreeGameProvider {
  readonly id: FreeGameProviderType = 'EPIC';
  readonly name = 'Epic Games Store';

  private readonly fetch: typeof fetch;

  constructor(options: EpicProviderOptions = {}) {
    this.fetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async fetchFreeGames(): Promise<FreeGameItem[]> {
    try {
      const url =
        'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US';
      const response = await this.fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RirikoBot/2.0)' },
      });

      if (!response.ok) {
        console.warn(`[EpicGamesProvider] Request failed with HTTP ${response.status}`);
        return [];
      }

      const data = (await response.json()) as any;
      const elements: any[] = data?.data?.Catalog?.searchStore?.elements ?? [];
      const freeGames: FreeGameItem[] = [];

      const now = new Date();

      for (const game of elements) {
        const promotions = game.promotions;
        if (!promotions) continue;

        const activeOffers: any[] = promotions.promotionalOffers?.[0]?.promotionalOffers ?? [];
        const upcomingOffers: any[] =
          promotions.upcomingPromotionalOffers?.[0]?.promotionalOffers ?? [];

        // Check if currently free (discountPercentage === 0)
        const currentPromo = activeOffers.find(
          (o: any) => o.discountSetting?.discountPercentage === 0,
        );

        // Check if upcoming free soon
        const upcomingPromo = upcomingOffers.find(
          (o: any) => o.discountSetting?.discountPercentage === 0,
        );

        const promo = currentPromo || upcomingPromo;
        if (!promo) continue;

        const isUpcoming = Boolean(!currentPromo && upcomingPromo);
        const startDate = promo.startDate ? new Date(promo.startDate) : now;
        const endDate = promo.endDate
          ? new Date(promo.endDate)
          : new Date(now.getTime() + 7 * 86_400_000);

        // Resolve product slug
        let slug = game.productSlug || game.urlSlug;
        if (!slug && game.offerMappings && game.offerMappings.length > 0) {
          slug = game.offerMappings[0]?.pageSlug;
        }
        if (!slug && game.catalogNs?.mappings && game.catalogNs.mappings.length > 0) {
          slug = game.catalogNs.mappings[0]?.pageSlug;
        }
        if (!slug) {
          slug = game.id;
        }

        const storeUrl = `https://store.epicgames.com/p/${slug}`;

        // Select best high-res key image
        const keyImages: any[] = game.keyImages ?? [];
        const image =
          keyImages.find((img: any) => img.type === 'OfferImageWide') ??
          keyImages.find((img: any) => img.type === 'DieselStoreFrontWide') ??
          keyImages.find((img: any) => img.type === 'Thumbnail') ??
          keyImages[0];

        const originalPrice = game.price?.totalPrice?.fmtPrice?.originalPrice;

        freeGames.push({
          id: `epic-${game.id || slug}`,
          provider: 'EPIC',
          title: game.title + (isUpcoming ? ' (Coming Soon)' : ''),
          storeUrl,
          thumbnailUrl: image?.url ?? null,
          startDate,
          endDate,
          originalPrice: originalPrice || undefined,
          isUpcoming,
        });
      }

      return freeGames;
    } catch (err) {
      console.error('[EpicGamesProvider] Error fetching Epic free games:', err);
      return [];
    }
  }
}
