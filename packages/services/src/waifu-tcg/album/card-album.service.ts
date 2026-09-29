import type { UserAlbumEntry, WaifuAsset, WaifuCard, WaifuCardRepository } from '@ririko/database';
import { getCardAttribution } from '../attribution.js';
import { RARITY_TIERS } from '../rarity/rarity-engine.js';
import type { CardRarity } from '../types.js';

/** Cards per album page: a 4 × 6 grid on wide screens. */
export const ALBUM_PAGE_SIZE = 24;

export const ALBUM_RARITIES = Object.keys(RARITY_TIERS) as CardRarity[];

export interface AlbumQuery {
  page: number;
  favoritesOnly: boolean;
  rarity: CardRarity | null;
}

export interface AlbumCard {
  /** The owned copy (`user_cards.id`). */
  id: string;
  name: string;
  rarity: string;
  rarityName: string;
  element: string;
  level: number;
  serialNumber: number;
  collectionNumber: number;
  isFavorite: boolean;
  state: string;
  /** The full card as a PNG data URL, or null when it could not be drawn. */
  image: string | null;
}

export interface AlbumPage {
  cards: AlbumCard[];
  /** The page shown, moved back to the last page when the requested one is past the end. */
  page: number;
  totalPages: number;
  total: number;
  query: AlbumQuery;
}

/** What the album needs from `CardImageService`; loaded lazily as it pulls in the canvas. */
export interface CardRenderer {
  getCardImage(
    card: WaifuCard,
    asset: WaifuAsset | null,
    options: { attributionText?: string; maxCollectionNumber?: number },
  ): Promise<Buffer>;
}

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Reads the album filters from URL search params; anything invalid falls back to the default. */
export function parseAlbumQuery(params: SearchParams): AlbumQuery {
  const page = Number.parseInt(single(params.page) ?? '', 10);
  const rarity = single(params.rarity);
  return {
    page: Number.isSafeInteger(page) && page >= 1 ? page : 1,
    favoritesOnly: single(params.favorites) === '1',
    rarity: rarity && (ALBUM_RARITIES as string[]).includes(rarity) ? (rarity as CardRarity) : null,
  };
}

async function loadCardImageService(): Promise<CardRenderer> {
  const { CardImageService } = await import('../canvas/card-image.service.js');
  return new CardImageService();
}

/**
 * A user's card collection for the dashboard album. Cards are drawn by the bot's
 * `CardImageService`, whose `public/cards/` cache the bot and the dashboard share, so a card
 * the bot has shown before is read from disk rather than drawn again.
 */
export class CardAlbumService {
  private readonly cards: WaifuCardRepository;
  private readonly loadRenderer: () => Promise<CardRenderer>;
  private renderer: Promise<CardRenderer> | null = null;

  constructor(deps: { cards: WaifuCardRepository; loadRenderer?: () => Promise<CardRenderer> }) {
    this.cards = deps.cards;
    this.loadRenderer = deps.loadRenderer ?? loadCardImageService;
  }

  async page(userId: string, query: AlbumQuery): Promise<AlbumPage> {
    const filters = {
      favoritesOnly: query.favoritesOnly,
      ...(query.rarity ? { rarity: query.rarity } : {}),
      limit: ALBUM_PAGE_SIZE,
    };
    let page = query.page;
    let result = await this.cards.listUserAlbum(userId, {
      ...filters,
      offset: (page - 1) * ALBUM_PAGE_SIZE,
    });
    const totalPages = Math.max(1, Math.ceil(result.total / ALBUM_PAGE_SIZE));
    if (page > totalPages) {
      page = totalPages;
      result = await this.cards.listUserAlbum(userId, {
        ...filters,
        offset: (page - 1) * ALBUM_PAGE_SIZE,
      });
    }

    const cards = await this.render(result.entries);
    return { cards, page, totalPages, total: result.total, query: { ...query, page } };
  }

  /** One card at a time: an uncached card is a full canvas draw, so this caps the load. */
  private async render(entries: UserAlbumEntry[]): Promise<AlbumCard[]> {
    if (entries.length === 0) return [];
    const maxCollectionNumber = await this.cards.count();
    const cards: AlbumCard[] = [];
    for (const entry of entries) {
      cards.push({
        id: entry.userCard.id,
        name: entry.card.name,
        rarity: entry.card.rarity,
        rarityName: RARITY_TIERS[entry.card.rarity as CardRarity]?.name ?? entry.card.rarity,
        element: entry.card.element,
        level: entry.userCard.level,
        serialNumber: entry.userCard.serialNumber,
        collectionNumber: entry.card.collectionNumber,
        isFavorite: entry.userCard.isFavorite,
        state: entry.userCard.state,
        image: await this.image(entry, maxCollectionNumber),
      });
    }
    return cards;
  }

  private async image(entry: UserAlbumEntry, maxCollectionNumber: number): Promise<string | null> {
    try {
      this.renderer ??= this.loadRenderer();
      const png = await (
        await this.renderer
      ).getCardImage(entry.card, entry.asset, {
        attributionText: getCardAttribution(entry.source).footerText,
        maxCollectionNumber,
      });
      return `data:image/png;base64,${png.toString('base64')}`;
    } catch (error) {
      console.warn(`[album] Could not draw card ${entry.card.id}:`, error);
      return null;
    }
  }
}
