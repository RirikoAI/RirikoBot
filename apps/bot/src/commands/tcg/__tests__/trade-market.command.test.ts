import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTradeCommand } from '../trade.command.js';
import { createMarketCommand } from '../market.command.js';
import type { BotServices } from '../../../services.js';
import type { CommandContext } from '@ririko/discord';

describe('TASK-1051: Trade & Market Command Suites', () => {
  let services: BotServices;
  let replyMock: any;

  beforeEach(() => {
    replyMock = vi.fn().mockResolvedValue(undefined);

    const mockTradeService: any = {
      createProposal: vi.fn().mockResolvedValue({
        id: 'trade_123',
        senderUserId: 'user_1',
        receiverUserId: 'user_2',
        offeredCardIds: ['card_a'],
        requestedCardIds: ['card_b'],
        offeredCredits: 500,
        requestedCredits: 0,
        status: 'PENDING',
      }),
      acceptTrade: vi.fn().mockResolvedValue({
        id: 'trade_123',
        status: 'ACCEPTED',
      }),
      rejectTrade: vi.fn().mockResolvedValue({
        id: 'trade_123',
        status: 'REJECTED',
      }),
      cancelTrade: vi.fn().mockResolvedValue({
        id: 'trade_123',
        status: 'CANCELLED',
      }),
      getTradeDetails: vi.fn().mockResolvedValue({
        trade: {
          id: 'trade_123',
          senderUserId: 'user_1',
          receiverUserId: 'user_2',
          offeredCardIds: ['card_a'],
          requestedCardIds: ['card_b'],
          offeredCredits: 500,
          requestedCredits: 0,
          status: 'PENDING',
        },
        offeredCards: [
          {
            userCard: { id: 'card_a', cardId: 'base_a', level: 1 },
            cardInfo: { name: 'Flame Novice', rarity: 'COMMON' },
          },
        ],
        requestedCards: [
          {
            userCard: { id: 'card_b', cardId: 'base_b', level: 5 },
            cardInfo: { name: 'Frost Archer', rarity: 'RARE' },
          },
        ],
      }),
      listPendingTrades: vi.fn().mockResolvedValue([
        {
          id: 'trade_123',
          senderUserId: 'user_1',
          receiverUserId: 'user_2',
          offeredCardIds: ['card_a'],
          requestedCardIds: ['card_b'],
          offeredCredits: 500,
          requestedCredits: 0,
          status: 'PENDING',
        },
      ]),
    };

    const mockMarketService: any = {
      listCard: vi.fn().mockResolvedValue({
        id: 'listing_123',
        sellerUserId: 'user_1',
        userCardId: 'card_a',
        price: 2000,
        taxPaid: 100,
        status: 'ACTIVE',
      }),
      buyListing: vi.fn().mockResolvedValue({
        listing: {
          id: 'listing_123',
          sellerUserId: 'user_2',
          userCardId: 'card_b',
          price: 1500,
          status: 'SOLD',
        },
        netPaid: 1500,
        taxDeducted: 75,
      }),
      cancelListing: vi.fn().mockResolvedValue({
        id: 'listing_123',
        status: 'CANCELLED',
      }),
      browseListings: vi.fn().mockResolvedValue({
        listings: [
          {
            listing: { id: 'listing_123', sellerUserId: 'user_2', price: 1500 },
            userCard: { id: 'card_b', level: 10 },
            cardInfo: { name: 'Thunder Spirit', rarity: 'SR', element: 'LIGHTNING' },
          },
        ],
        total: 1,
        page: 1,
        totalPages: 1,
      }),
      getUserListings: vi.fn().mockResolvedValue([
        {
          id: 'listing_123',
          sellerUserId: 'user_1',
          userCardId: 'card_a',
          price: 2000,
          taxPaid: 100,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 86400000),
        },
      ]),
    };

    services = {
      tradeService: mockTradeService,
      marketService: mockMarketService,
    } as unknown as BotServices;
  });

  function createMockContext(
    options: Record<string, any> = {},
    rawArgs: string[] = [],
  ): CommandContext {
    return {
      user: { id: 'user_1', username: 'Tester' },
      guild: { id: 'guild_1' },
      channel: { id: 'channel_1' },
      reply: replyMock,
      options: {
        getString: (name: string) => options[name] ?? null,
        getInteger: (name: string) => options[name] ?? null,
        getUser: (name: string) => options[name] ?? null,
        getRawArgs: () => rawArgs,
      },
    } as unknown as CommandContext;
  }

  describe('Trade Command (/trade)', () => {
    it('handles /trade request correctly', async () => {
      const cmd = createTradeCommand(services);
      const ctx = createMockContext(
        {
          action: 'request',
          user: { id: 'user_2' },
          offered_card_id: 'card_a',
          requested_card_id: 'card_b',
          offered_credits: 500,
        },
        ['request', 'user_2', 'card_a', 'card_b', '500'],
      );

      await cmd.execute(ctx);
      expect(services.tradeService.createProposal).toHaveBeenCalledWith({
        senderUserId: 'user_1',
        receiverUserId: 'user_2',
        offeredCardIds: ['card_a'],
        requestedCardIds: ['card_b'],
        offeredCredits: 500,
        requestedCredits: 0,
      });
      expect(replyMock).toHaveBeenCalled();
    });

    it('handles /trade accept correctly', async () => {
      const cmd = createTradeCommand(services);
      const ctx = createMockContext({ action: 'accept', trade_id: 'trade_123' }, [
        'accept',
        'trade_123',
      ]);

      await cmd.execute(ctx);
      expect(services.tradeService.acceptTrade).toHaveBeenCalledWith('trade_123', 'user_1');
      expect(replyMock).toHaveBeenCalled();
    });

    it('handles /trade reject and cancel', async () => {
      const cmd = createTradeCommand(services);
      const rejectCtx = createMockContext({ action: 'reject', trade_id: 'trade_123' }, [
        'reject',
        'trade_123',
      ]);
      await cmd.execute(rejectCtx);
      expect(services.tradeService.rejectTrade).toHaveBeenCalledWith('trade_123', 'user_1');

      const cancelCtx = createMockContext({ action: 'cancel', trade_id: 'trade_123' }, [
        'cancel',
        'trade_123',
      ]);
      await cmd.execute(cancelCtx);
      expect(services.tradeService.cancelTrade).toHaveBeenCalledWith('trade_123', 'user_1');
    });

    it('handles /trade view and list', async () => {
      const cmd = createTradeCommand(services);
      const viewCtx = createMockContext({ action: 'view', trade_id: 'trade_123' }, [
        'view',
        'trade_123',
      ]);
      await cmd.execute(viewCtx);
      expect(services.tradeService.getTradeDetails).toHaveBeenCalledWith('trade_123');

      const listCtx = createMockContext({ action: 'list' }, ['list']);
      await cmd.execute(listCtx);
      expect(services.tradeService.listPendingTrades).toHaveBeenCalledWith('user_1');
    });
  });

  describe('Market Command (/market)', () => {
    it('handles /market list correctly', async () => {
      const cmd = createMarketCommand(services);
      const ctx = createMockContext({ action: 'list', card_id: 'card_a', price: 2000 }, [
        'list',
        'card_a',
        '2000',
      ]);

      await cmd.execute(ctx);
      expect(services.marketService.listCard).toHaveBeenCalledWith({
        sellerUserId: 'user_1',
        userCardId: 'card_a',
        price: 2000,
      });
      expect(replyMock).toHaveBeenCalled();
    });

    it('handles /market buy correctly', async () => {
      const cmd = createMarketCommand(services);
      const ctx = createMockContext({ action: 'buy', listing_id: 'listing_123' }, [
        'buy',
        'listing_123',
      ]);

      await cmd.execute(ctx);
      expect(services.marketService.buyListing).toHaveBeenCalledWith({
        listingId: 'listing_123',
        buyerUserId: 'user_1',
      });
      expect(replyMock).toHaveBeenCalled();
    });

    it('handles /market cancel correctly', async () => {
      const cmd = createMarketCommand(services);
      const ctx = createMockContext({ action: 'cancel', listing_id: 'listing_123' }, [
        'cancel',
        'listing_123',
      ]);

      await cmd.execute(ctx);
      expect(services.marketService.cancelListing).toHaveBeenCalledWith({
        listingId: 'listing_123',
        sellerUserId: 'user_1',
      });
      expect(replyMock).toHaveBeenCalled();
    });

    it('handles /market browse and my-listings', async () => {
      const cmd = createMarketCommand(services);
      const browseCtx = createMockContext({ action: 'browse', page: 1 }, ['browse', '1']);
      await cmd.execute(browseCtx);
      expect(services.marketService.browseListings).toHaveBeenCalled();

      const myCtx = createMockContext({ action: 'my-listings' }, ['my-listings']);
      await cmd.execute(myCtx);
      expect(services.marketService.getUserListings).toHaveBeenCalledWith('user_1');
    });
  });
});
