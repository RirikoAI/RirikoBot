import { it, expect, vi } from 'vitest';
import {
  CardTradeRepository,
  EconomyRepository,
  MarketListingRepository,
  UserInventoryItemRepository,
  WaifuCardRepository,
  type DatabaseClient,
} from '@ririko/database';
import { describeDialects } from '@ririko/database/testing';
import { TradeService } from '../trading/trade-service.js';
import { MarketService } from '../market/market-service.js';

function services(client: DatabaseClient) {
  const cards = new WaifuCardRepository(client);
  const economy = new EconomyRepository(client);
  const inventory = new UserInventoryItemRepository(client);
  return {
    cards,
    economy,
    trades: new TradeService(new CardTradeRepository(client), cards, economy, client, inventory),
    market: new MarketService(
      new MarketListingRepository(client),
      cards,
      economy,
      client,
      inventory,
      { marketTaxRate: 0.1 },
    ),
  };
}

const wallet = async (economy: EconomyRepository, userId: string) =>
  Number((await economy.getOrCreateBalance(userId)).walletBalance);

describeDialects('Trade accepts and market purchases under concurrency', (db) => {
  /** Two service sets: on Postgres each runs on its own connection pool, as two bot shards would. */
  async function race() {
    const first = services(db.client);
    const second = db.dialect === 'postgres' ? services(await db.openClient()) : first;
    return { first, second };
  }

  async function mintCard(owner: string) {
    const { cards } = services(db.client);
    const definition = await cards.create({
      assetId: crypto.randomUUID(),
      name: 'Megumin',
      rarity: 'RARE',
      element: 'FIRE',
      attack: 100,
      defense: 100,
      speed: 100,
      health: 1000,
      collectionNumber: 1,
    });
    return cards.mintUserCard({ userId: owner, cardId: definition.id });
  }

  it('accepts a trade exactly once when the receiver accepts twice at the same time', async () => {
    const { first, second } = await race();
    const card = await mintCard('sender');
    // Enough credits for two transfers, so a double accept would go through without the claim.
    await first.economy.modifyBalance({
      userId: 'sender',
      walletDelta: 1000,
      type: 'TEST',
      source: 'TEST',
    });
    await first.economy.modifyBalance({
      userId: 'receiver',
      walletDelta: 1000,
      type: 'TEST',
      source: 'TEST',
    });
    const trade = await first.trades.createProposal({
      senderUserId: 'sender',
      receiverUserId: 'receiver',
      offeredCardIds: [card.id],
      offeredCredits: 300,
      requestedCredits: 100,
    });

    const results = await Promise.allSettled([
      first.trades.acceptTrade(trade.id, 'receiver'),
      second.trades.acceptTrade(trade.id, 'receiver'),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find((r) => r.status === 'rejected');
    expect(String(failure?.reason)).toContain('is not pending (status: ACCEPTED)');
    expect((await first.cards.findUserCardById(card.id))?.userId).toBe('receiver');
    expect(await wallet(first.economy, 'sender')).toBe(800);
    expect(await wallet(first.economy, 'receiver')).toBe(1200);
  });

  it('sells a listing exactly once when two buyers pay at the same time', async () => {
    const { first, second } = await race();
    const card = await mintCard('seller');
    await first.economy.modifyBalance({
      userId: 'buyer-a',
      walletDelta: 1000,
      type: 'TEST',
      source: 'TEST',
    });
    await first.economy.modifyBalance({
      userId: 'buyer-b',
      walletDelta: 1000,
      type: 'TEST',
      source: 'TEST',
    });
    const listing = await first.market.listCard({
      sellerUserId: 'seller',
      userCardId: card.id,
      price: 500,
    });

    const results = await Promise.allSettled([
      first.market.buyListing({ listingId: listing.id, buyerUserId: 'buyer-a' }),
      second.market.buyListing({ listingId: listing.id, buyerUserId: 'buyer-b' }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find((r) => r.status === 'rejected');
    expect(String(failure?.reason)).toContain('is no longer active (status: SOLD)');
    const owner = (await first.cards.findUserCardById(card.id))?.userId;
    expect(['buyer-a', 'buyer-b']).toContain(owner);
    const loser = owner === 'buyer-a' ? 'buyer-b' : 'buyer-a';
    expect(await wallet(first.economy, owner!)).toBe(500);
    expect(await wallet(first.economy, loser)).toBe(1000);
    // The seller gets the price less the 10% tax, once; the tax leaves circulation.
    expect(await wallet(first.economy, 'seller')).toBe(450);
  });

  it('does not expire a listing that was bought after the expiry scan', async () => {
    const { first } = await race();
    const card = await mintCard('seller');
    const listing = await first.market.listCard({
      sellerUserId: 'seller',
      userCardId: card.id,
      price: 100,
    });
    await first.economy.modifyBalance({
      userId: 'buyer',
      walletDelta: 100,
      type: 'TEST',
      source: 'TEST',
    });
    await first.market.buyListing({ listingId: listing.id, buyerUserId: 'buyer' });

    // processExpiredListings scans first; the scan returned this listing before the sale.
    const repo = new MarketListingRepository(db.client);
    const stale = { ...listing, expiresAt: new Date(0) };
    vi.spyOn(repo, 'findExpiredListings').mockResolvedValue([stale]);
    const { cards, economy } = services(db.client);
    const market = new MarketService(
      repo,
      cards,
      economy,
      db.client,
      new UserInventoryItemRepository(db.client),
    );

    expect(await market.processExpiredListings()).toBe(0);
    expect((await repo.findById(listing.id))?.status).toBe('SOLD');
    expect((await cards.findUserCardById(card.id))?.userId).toBe('buyer');
  });
});
