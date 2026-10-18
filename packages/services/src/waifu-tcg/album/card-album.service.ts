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
 * A user's card collection for the dashboard album. A page lists the cards only; each card image
 * is fetched separately (`cardImage`), so the page HTML stays small. Cards are drawn by the bot's
 * `CardImageService`, whose `public/cards/` cache the bot and the dashboard share, so a card the
 * bot has shown before is read from disk rather than drawn again.
 */
export class CardAlbumService {
  private readonly cards: WaifuCardRepository;
  private readonly loadRenderer: () => Promise<CardRenderer>;
  private renderer: Promise<CardRenderer> | null = null;
  /** Each user's latest queued draw; see `oneAtATime`. */
  private readonly draws = new Map<string, Promise<unknown>>();

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

    const cards = result.entries.map(toAlbumCard);
    return { cards, page, totalPages, total: result.total, query: { ...query, page } };
  }

  /**
   * The full card PNG of one of `userId`'s own cards, or null when `userCardId` is not theirs.
   * Rejects when the card cannot be drawn.
   */
  async cardImage(userId: string, userCardId: string): Promise<Buffer | null> {
    const entry = await this.cards.findUserAlbumEntry(userId, userCardId);
    if (!entry) return null;
    return this.oneAtATime(userId, async () => {
      this.renderer ??= this.loadRenderer();
      const renderer = await this.renderer;
      return renderer.getCardImage(entry.card, entry.asset, {
        attributionText: getCardAttribution(entry.source).footerText,
        maxCollectionNumber: await this.cards.count(),
      });
    });
  }

  /**
   * Runs a user's draws one at a time. An uncached card is a full canvas draw and the browser
   * requests a page's images in parallel, so this caps the load one viewer can cause.
   */
  private oneAtATime<T>(userId: string, draw: () => Promise<T>): Promise<T> {
    const result = (this.draws.get(userId) ?? Promise.resolve()).then(nextTurn).then(draw);
    const settled = result.catch(() => undefined);
    this.draws.set(userId, settled);
    void settled.then(() => {
      if (this.draws.get(userId) === settled) this.draws.delete(userId);
    });
    return result;
  }
}

/**
 * Waits for the next event-loop turn. A canvas draw blocks the event loop for about 0.1 s, so
 * queued draws must not run back to back as promise callbacks: pending requests, such as the
 * album page the user just navigated to, are served between draws.
 */
function nextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function toAlbumCard(entry: UserAlbumEntry): AlbumCard {
  return {
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
  };
}
