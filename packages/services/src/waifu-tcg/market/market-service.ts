import type {
  MarketListingRepository,
  WaifuCardRepository,
  UserInventoryItemRepository,
  EconomyRepository,
  DatabaseClient,
  MarketListing,
  UserCard,
  WaifuCard,
} from '@ririko/database';
import { withTransaction } from '@ririko/database';
import { assertCardHasNoGear } from '../equipment/gear-lock.js';

export interface ListCardParams {
  sellerUserId: string;
  userCardId: string;
  price: number;
}

export interface BuyListingParams {
  listingId: string;
  buyerUserId: string;
}

export interface CancelListingParams {
  listingId: string;
  sellerUserId: string;
}

export interface EnrichedMarketListing {
  listing: MarketListing;
  userCard: UserCard;
  cardInfo: WaifuCard | null;
}

export interface MarketServiceOptions {
  marketTaxRate?: number;
  listingDurationDays?: number;
}

export class MarketService {
  private readonly marketTaxRate: number;
  private readonly listingDurationDays: number;

  constructor(
    private readonly marketRepo: MarketListingRepository,
    private readonly waifuCardRepo: WaifuCardRepository,
    private readonly economyRepo: EconomyRepository,
    private readonly dbClient: DatabaseClient,
    private readonly inventoryRepo: UserInventoryItemRepository,
    options?: MarketServiceOptions,
  ) {
    this.marketTaxRate = options?.marketTaxRate ?? 0.05; // 5% default market tax
    this.listingDurationDays = options?.listingDurationDays ?? 7; // 7 days expiration
  }

  async listCard(params: ListCardParams): Promise<MarketListing> {
    const { sellerUserId, userCardId, price } = params;

    if (!Number.isInteger(price) || price <= 0) {
      throw new Error('Listing price must be a positive integer.');
    }

    const card = await this.waifuCardRepo.findUserCardById(userCardId);
    if (!card) {
      throw new Error(`Card ${userCardId} not found.`);
    }

    if (card.userId !== sellerUserId) {
      throw new Error(`You do not own card ${userCardId}.`);
    }

    if (card.state !== 'IDLE') {
      throw new Error(`Card ${userCardId} is currently ${card.state} and cannot be listed.`);
    }

    if (card.isFavorite) {
      throw new Error(`Card ${userCardId} is marked as favorite. Unfavorite it before listing on the market.`);
    }

    const cardName = (await this.waifuCardRepo.findById(card.cardId))?.name;
    await assertCardHasNoGear(this.inventoryRepo, card, 'sold', cardName);

    const taxPaid = Math.floor(price * this.marketTaxRate);
    const expiresAt = new Date(Date.now() + this.listingDurationDays * 24 * 60 * 60 * 1000);

    return withTransaction(this.dbClient, async (tx) => {
      // Lock card to IN_MARKET
      await this.waifuCardRepo.updateUserCardState(userCardId, 'IN_MARKET', tx);

      // Create market listing
      return this.marketRepo.create(
        {
          sellerUserId,
          userCardId,
          price,
          taxPaid,
          status: 'ACTIVE',
          expiresAt,
        },
        tx,
      );
    });
  }

  async buyListing(params: BuyListingParams): Promise<{ listing: MarketListing; netPaid: number; taxDeducted: number }> {
    const { listingId, buyerUserId } = params;

    const listing = await this.marketRepo.findById(listingId);
    if (!listing) {
      throw new Error(`Market listing ${listingId} not found.`);
    }

    if (listing.status !== 'ACTIVE') {
      throw new Error(`Listing ${listingId} is no longer active (status: ${listing.status}).`);
    }

    if (listing.sellerUserId === buyerUserId) {
      throw new Error('You cannot buy your own market listing.');
    }

    const buyerBalance = await this.economyRepo.findById(buyerUserId);
    const buyerWallet = Number(buyerBalance?.walletBalance ?? 0);
    if (buyerWallet < listing.price) {
      throw new Error(
        `Insufficient credits. You have ${buyerWallet} credits, but the listing price is ${listing.price} credits.`,
      );
    }

    const taxDeducted = listing.taxPaid;
    const netSellerCredit = listing.price - taxDeducted;

    const updatedListing = await withTransaction(this.dbClient, async (tx) => {
      // Listings made before gear locking may still carry gear: never sell it along with the card.
      const card = await this.waifuCardRepo.findUserCardById(listing.userCardId, tx);
      if (card) {
        const cardName = (await this.waifuCardRepo.findById(card.cardId, tx))?.name;
        await assertCardHasNoGear(this.inventoryRepo, card, 'sold', cardName, tx);
      }

      // Deduct full price from buyer
      await this.economyRepo.modifyBalance(
        {
          userId: buyerUserId,
          walletDelta: -listing.price,
          type: 'MARKET_BUY',
          source: 'TCG_MARKETPLACE',
          metadata: { listingId: listing.id, cardId: listing.userCardId },
        },
        tx,
      );

      // Credit net amount to seller (sink retains taxDeducted)
      await this.economyRepo.modifyBalance(
        {
          userId: listing.sellerUserId,
          walletDelta: netSellerCredit,
          type: 'MARKET_SELL',
          source: 'TCG_MARKETPLACE',
          metadata: { listingId: listing.id, cardId: listing.userCardId, taxPaid: taxDeducted },
        },
        tx,
      );

      // Transfer card ownership to buyer and set IDLE
      await this.waifuCardRepo.updateUserCardOwner(listing.userCardId, buyerUserId, 'IDLE', tx);

      // Mark listing as SOLD
      return this.marketRepo.updateStatus(listing.id, 'SOLD', tx);
    });

    return { listing: updatedListing, netPaid: listing.price, taxDeducted };
  }

  async cancelListing(params: CancelListingParams): Promise<MarketListing> {
    const { listingId, sellerUserId } = params;

    const listing = await this.marketRepo.findById(listingId);
    if (!listing) {
      throw new Error(`Market listing ${listingId} not found.`);
    }

    if (listing.status !== 'ACTIVE') {
      throw new Error(`Listing ${listingId} is not active (status: ${listing.status}).`);
    }

    if (listing.sellerUserId !== sellerUserId) {
      throw new Error('You can only cancel your own market listings.');
    }

    return withTransaction(this.dbClient, async (tx) => {
      // Revert card state back to IDLE
      await this.waifuCardRepo.updateUserCardState(listing.userCardId, 'IDLE', tx);

      // Mark listing as CANCELLED
      return this.marketRepo.updateStatus(listing.id, 'CANCELLED', tx);
    });
  }

  async processExpiredListings(): Promise<number> {
    const expiredListings = await this.marketRepo.findExpiredListings();
    if (expiredListings.length === 0) return 0;

    let count = 0;
    for (const listing of expiredListings) {
      await withTransaction(this.dbClient, async (tx) => {
        // Revert card back to IDLE
        await this.waifuCardRepo.updateUserCardState(listing.userCardId, 'IDLE', tx);
        // Mark listing EXPIRED
        await this.marketRepo.updateStatus(listing.id, 'EXPIRED', tx);
      });
      count++;
    }

    return count;
  }

  async browseListings(options?: {
    page?: number;
    limit?: number;
    sellerUserId?: string;
  }): Promise<{ listings: EnrichedMarketListing[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(50, Math.max(1, options?.limit ?? 10));
    const offset = (page - 1) * limit;

    const [rawListings, total] = await Promise.all([
      this.marketRepo.listActiveListings({ sellerUserId: options?.sellerUserId, limit, offset }),
      this.marketRepo.countActiveListings({ sellerUserId: options?.sellerUserId }),
    ]);

    const enriched: EnrichedMarketListing[] = [];
    for (const listing of rawListings) {
      const userCard = await this.waifuCardRepo.findUserCardById(listing.userCardId);
      if (userCard) {
        const cardInfo = await this.waifuCardRepo.findById(userCard.cardId);
        enriched.push({ listing, userCard, cardInfo });
      }
    }

    return {
      listings: enriched,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async getUserListings(sellerUserId: string): Promise<MarketListing[]> {
    return this.marketRepo.listUserListings(sellerUserId);
  }
}
