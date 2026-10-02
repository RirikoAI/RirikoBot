import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { describeDialects } from '../testing/dialects.js';
import { CardTradeRepository } from './card-trade.repository.js';
import { MarketListingRepository } from './market-listing.repository.js';

const CARD_101 = randomUUID();
const CARD_EXPIRED = randomUUID();

describeDialects('Trade & Market Repositories (TASK-1051)', (db) => {
  let tradeRepo: CardTradeRepository;
  let marketRepo: MarketListingRepository;

  beforeEach(() => {
    tradeRepo = new CardTradeRepository(db.client);
    marketRepo = new MarketListingRepository(db.client);
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

    it('moves a trade only from the expected status', async () => {
      const trade = await tradeRepo.create({
        senderUserId: 'user-1',
        receiverUserId: 'user-2',
        offeredCardIds: [],
        requestedCardIds: [],
        offeredCredits: 10,
      });

      const accepted = await tradeRepo.transitionStatus(trade.id, 'PENDING', 'ACCEPTED');
      expect(accepted?.status).toBe('ACCEPTED');
      expect(accepted?.resolvedAt).toBeInstanceOf(Date);
      // Already resolved, and a missing trade: no row matches.
      expect(await tradeRepo.transitionStatus(trade.id, 'PENDING', 'CANCELLED')).toBeNull();
      expect(await tradeRepo.transitionStatus(CARD_EXPIRED, 'PENDING', 'ACCEPTED')).toBeNull();
      expect((await tradeRepo.findById(trade.id))?.status).toBe('ACCEPTED');
    });
  });

  describe('MarketListingRepository', () => {
    it('creates, retrieves, and lists active market listings', async () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const listing = await marketRepo.create({
        sellerUserId: 'user-1',
        userCardId: CARD_101,
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
      expect(activeList[0]!.userCardId).toBe(CARD_101);

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
        userCardId: CARD_EXPIRED,
        price: 500,
        expiresAt: pastDate,
      });

      await marketRepo.create({
        sellerUserId: 'user-2',
        userCardId: randomUUID(),
        price: 1500,
        expiresAt: futureDate,
      });

      const expired = await marketRepo.findExpiredListings();
      expect(expired.length).toBe(1);
      expect(expired[0]!.userCardId).toBe(CARD_EXPIRED);
    });

    it('moves a listing only from the expected status', async () => {
      const listing = await marketRepo.create({
        sellerUserId: 'user-1',
        userCardId: CARD_101,
        price: 300,
        expiresAt: new Date(Date.now() + 100000),
      });

      expect((await marketRepo.transitionStatus(listing.id, 'ACTIVE', 'SOLD'))?.status).toBe(
        'SOLD',
      );
      expect(await marketRepo.transitionStatus(listing.id, 'ACTIVE', 'EXPIRED')).toBeNull();
      expect(await marketRepo.transitionStatus(CARD_EXPIRED, 'ACTIVE', 'SOLD')).toBeNull();
      expect((await marketRepo.findById(listing.id))?.status).toBe('SOLD');
    });
  });
});
