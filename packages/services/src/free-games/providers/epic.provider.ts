import type { FreeGameItem, FreeGameProvider, FreeGameProviderType } from '../types.js';

export interface EpicProviderOptions {
  fetchFn?: typeof fetch | undefined;
}

const HEX_ID = /^[0-9a-f]{32}$/i;

function productHomeSlug(mappings: unknown): string | null {
  if (!Array.isArray(mappings)) return null;
  const hit = mappings.find(
    (m: any) => m?.pageType === 'productHome' && typeof m.pageSlug === 'string' && m.pageSlug,
  );
  return hit ? hit.pageSlug : null;
}

/**
 * Resolves the Epic store page slug: productHome offerMappings, then productHome
 * catalogNs.mappings, then productSlug (without "/home"), then a non-hex urlSlug.
 * Returns null when no valid page slug exists (the caller links the free-games page).
 */
export function resolveEpicPageSlug(game: any): string | null {
  const mapped = productHomeSlug(game?.offerMappings) ?? productHomeSlug(game?.catalogNs?.mappings);
  if (mapped) return mapped;

  if (typeof game?.productSlug === 'string') {
    const product = game.productSlug.replace(/\/home$/, '');
    if (product) return product;
  }

  if (typeof game?.urlSlug === 'string' && game.urlSlug && !HEX_ID.test(game.urlSlug)) {
    return game.urlSlug;
  }
  return null;
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

        const slug = resolveEpicPageSlug(game);
        const storeUrl = slug
          ? `https://store.epicgames.com/p/${slug}`
          : 'https://store.epicgames.com/free-games';

        // Select best high-res key image
        const keyImages: any[] = game.keyImages ?? [];
        const image =
          keyImages.find((img: any) => img.type === 'OfferImageWide') ??
          keyImages.find((img: any) => img.type === 'DieselStoreFrontWide') ??
          keyImages.find((img: any) => img.type === 'Thumbnail') ??
          keyImages[0];

        const originalPrice = game.price?.totalPrice?.fmtPrice?.originalPrice;

        freeGames.push({
          id: `epic-${game.id || slug || game.title}`,
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
