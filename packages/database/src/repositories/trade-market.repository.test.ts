import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { SqliteDatabaseClient } from '../client/types.js';
import { CardTradeRepository } from './card-trade.repository.js';
import { MarketListingRepository } from './market-listing.repository.js';

describe('Trade & Market Repositories (TASK-1051)', () => {
  let client: SqliteDatabaseClient;
  let tradeRepo: CardTradeRepository;
  let marketRepo: MarketListingRepository;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    // Create tables in memory
    client.raw.exec(`
      CREATE TABLE card_trades (
        id TEXT PRIMARY KEY,
        sender_user_id TEXT NOT NULL,
        receiver_user_id TEXT NOT NULL,
        offered_card_ids TEXT NOT NULL DEFAULT '[]',
        requested_card_ids TEXT NOT NULL DEFAULT '[]',
        offered_credits INTEGER NOT NULL DEFAULT 0,
        requested_credits INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'PENDING',
        created_at INTEGER NOT NULL,
        resolved_at INTEGER
      );
      CREATE INDEX idx_card_trades_users ON card_trades (sender_user_id, receiver_user_id);

      CREATE TABLE market_listings (
        id TEXT PRIMARY KEY,
        seller_user_id TEXT NOT NULL,
        user_card_id TEXT NOT NULL,
        price INTEGER NOT NULL,
        tax_paid INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX idx_market_listings_status ON market_listings (status);
      CREATE INDEX idx_market_listings_seller ON market_listings (seller_user_id);
    `);

    tradeRepo = new CardTradeRepository(client);
    marketRepo = new MarketListingRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  describe('CardTradeRepository', () => {
    it('creates, retrieves, and updates card trades', async () => {
      const trade = await tradeRepo.create({
        senderUserId: 'user-1',
        receiverUserId: 'user-2',
        offeredCardIds: ['card-a', 'card-b'],
        requestedCardIds: ['card-c'],
        offeredCredits: 500,
        requestedCredits: 0,
      });

      expect(trade.id).toBeDefined();
      expect(trade.status).toBe('PENDING');
      expect(trade.offeredCredits).toBe(500);
      expect(trade.offeredCardIds).toEqual(['card-a', 'card-b']);

      const found = await tradeRepo.findById(trade.id);
      expect(found).not.toBeNull();
      expect(found?.senderUserId).toBe('user-1');

      const updated = await tradeRepo.updateStatus(trade.id, 'ACCEPTED');
      expect(updated.status).toBe('ACCEPTED');
      expect(updated.resolvedAt).toBeInstanceOf(Date);
    });

    it('finds active trade between two users and lists pending trades', async () => {
      await tradeRepo.create({
        senderUserId: 'user-1',
        receiverUserId: 'user-2',
        offeredCardIds: ['card-a'],
        requestedCardIds: ['card-b'],
        status: 'PENDING',
      });

      const active = await tradeRepo.findActiveTradeBetween('user-1', 'user-2');
      expect(active).not.toBeNull();
      expect(active?.senderUserId).toBe('user-1');

      // reverse query order
      const reverse = await tradeRepo.findActiveTradeBetween('user-2', 'user-1');
      expect(reverse).not.toBeNull();
      expect(reverse?.id).toBe(active?.id);

      const pendingList = await tradeRepo.listPendingTradesForUser('user-1');
      expect(pendingList.length).toBe(1);
    });
  });

  describe('MarketListingRepository', () => {
    it('creates, retrieves, and lists active market listings', async () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const listing = await marketRepo.create({
        sellerUserId: 'user-1',
        userCardId: 'card-101',
        price: 2000,
        taxPaid: 100, // 5% of 2000
        expiresAt,
      });

      expect(listing.id).toBeDefined();
      expect(listing.price).toBe(2000);
      expect(listing.taxPaid).toBe(100);
      expect(listing.status).toBe('ACTIVE');

      const activeList = await marketRepo.listActiveListings();
      expect(activeList.length).toBe(1);
      expect(activeList[0]!.userCardId).toBe('card-101');

      const updated = await marketRepo.updateStatus(listing.id, 'SOLD');
      expect(updated.status).toBe('SOLD');

      const remainingActive = await marketRepo.listActiveListings();
      expect(remainingActive.length).toBe(0);
    });

    it('identifies expired listings correctly', async () => {
      const pastDate = new Date(Date.now() - 10000);
      const futureDate = new Date(Date.now() + 100000);

      await marketRepo.create({
        sellerUserId: 'user-1',
        userCardId: 'card-expired',
        price: 500,
        expiresAt: pastDate,
      });

      await marketRepo.create({
        sellerUserId: 'user-2',
        userCardId: 'card-valid',
        price: 1500,
        expiresAt: futureDate,
      });

      const expired = await marketRepo.findExpiredListings();
      expect(expired.length).toBe(1);
      expect(expired[0]!.userCardId).toBe('card-expired');
    });
  });
});
