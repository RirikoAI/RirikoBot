import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createDatabaseClient,
  UserInventoryItemRepository,
  type SqliteDatabaseClient,
  CardTradeRepository,
  MarketListingRepository,
  WaifuCardRepository,
  EconomyRepository,
} from '@ririko/database';
import { TradeService } from '../trading/trade-service.js';
import { MarketService } from '../market/market-service.js';

describe('TradeService & MarketService (TASK-1051)', () => {
  let client: SqliteDatabaseClient;
  let tradeRepo: CardTradeRepository;
  let marketRepo: MarketListingRepository;
  let cardRepo: WaifuCardRepository;
  let economyRepo: EconomyRepository;
  let tradeService: TradeService;
  let marketService: MarketService;
  let inventoryRepo: UserInventoryItemRepository;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    // Create required tables in SQLite memory
    client.raw.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        discriminator TEXT NOT NULL DEFAULT '0000',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE economy_balances (
        user_id TEXT PRIMARY KEY,
        wallet_balance INTEGER NOT NULL DEFAULT 0,
        bank_balance INTEGER NOT NULL DEFAULT 0,
        bank_capacity INTEGER NOT NULL DEFAULT 10000,
        net_worth INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE economy_transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        guild_id TEXT,
        type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'CREDITS',
        balance_before INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        source TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL
      );

      CREATE TABLE waifu_cards (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL,
        name TEXT NOT NULL,
        rarity TEXT NOT NULL,
        element TEXT NOT NULL,
        attack INTEGER NOT NULL,
        defense INTEGER NOT NULL,
        speed INTEGER NOT NULL,
        health INTEGER NOT NULL,
        crit_rate REAL NOT NULL DEFAULT 0.05,
        skill_name TEXT,
        skill_description TEXT,
        passive_name TEXT,
        passive_description TEXT,
        collection_number INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE user_cards (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        card_id TEXT NOT NULL,
        serial_number INTEGER NOT NULL,
        level INTEGER NOT NULL DEFAULT 1,
        exp INTEGER NOT NULL DEFAULT 0,
        battles_won INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL DEFAULT 'IDLE',
        is_favorite INTEGER NOT NULL DEFAULT 0,
        obtained_at INTEGER NOT NULL
      );

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

      CREATE TABLE user_inventory_items (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        enhancement_level INTEGER NOT NULL DEFAULT 0,
        equipped_to_card_id TEXT,
        slot TEXT NOT NULL DEFAULT 'NONE',
        state TEXT NOT NULL DEFAULT 'IDLE',
        obtained_from TEXT NOT NULL DEFAULT 'SHOP',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

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
    `);

    tradeRepo = new CardTradeRepository(client);
    marketRepo = new MarketListingRepository(client);
    cardRepo = new WaifuCardRepository(client);
    economyRepo = new EconomyRepository(client);

    inventoryRepo = new UserInventoryItemRepository(client);
    tradeService = new TradeService(tradeRepo, cardRepo, economyRepo, client, inventoryRepo);
    marketService = new MarketService(marketRepo, cardRepo, economyRepo, client, inventoryRepo, {
      marketTaxRate: 0.05,
      listingDurationDays: 7,
    });

    // Seed base card metadata
    await cardRepo.create({
      id: 'base-card-fire',
      assetId: 'asset-1',
      name: 'Flame Dancer',
      rarity: 'RARE',
      element: 'FIRE',
      attack: 500,
      defense: 300,
      speed: 120,
      health: 2000,
      collectionNumber: 1,
    });

    await cardRepo.create({
      id: 'base-card-ice',
      assetId: 'asset-2',
      name: 'Frost Archer',
      rarity: 'SUPER_RARE',
      element: 'ICE',
      attack: 750,
      defense: 400,
      speed: 150,
      health: 2500,
      collectionNumber: 2,
    });

    // Seed economy balances
    await economyRepo.create({
      userId: 'user-alice',
      walletBalance: 5000,
      bankBalance: 0,
      netWorth: 5000,
      updatedAt: new Date(),
    });

    await economyRepo.create({
      userId: 'user-bob',
      walletBalance: 3000,
      bankBalance: 0,
      netWorth: 3000,
      updatedAt: new Date(),
    });
  });

  afterEach(async () => {
    await client.close();
  });

  describe('TradeService', () => {
    it('creates trade proposal and locks cards to IN_TRADE', async () => {
      const aliceCard = await cardRepo.createUserCard({
        userId: 'user-alice',
        cardId: 'base-card-fire',
        serialNumber: 1,
      });

      const bobCard = await cardRepo.createUserCard({
        userId: 'user-bob',
        cardId: 'base-card-ice',
        serialNumber: 2,
      });

      const trade = await tradeService.createProposal({
        senderUserId: 'user-alice',
        receiverUserId: 'user-bob',
        offeredCardIds: [aliceCard.id],
        requestedCardIds: [bobCard.id],
        offeredCredits: 500,
        requestedCredits: 0,
      });

      expect(trade.id).toBeDefined();
      expect(trade.status).toBe('PENDING');

      // Verify cards are locked in IN_TRADE
      const updatedAliceCard = await cardRepo.findUserCardById(aliceCard.id);
      const updatedBobCard = await cardRepo.findUserCardById(bobCard.id);

      expect(updatedAliceCard?.state).toBe('IN_TRADE');
      expect(updatedBobCard?.state).toBe('IN_TRADE');
    });

    it('rejects trade if user trades with self or cards not owned', async () => {
      const aliceCard = await cardRepo.createUserCard({
        userId: 'user-alice',
        cardId: 'base-card-fire',
        serialNumber: 1,
      });

      await expect(
        tradeService.createProposal({
          senderUserId: 'user-alice',
          receiverUserId: 'user-alice',
          offeredCardIds: [aliceCard.id],
        }),
      ).rejects.toThrow(/trade with yourself/);

      await expect(
        tradeService.createProposal({
          senderUserId: 'user-bob',
          receiverUserId: 'user-alice',
          offeredCardIds: [aliceCard.id], // Bob doesn't own this
        }),
      ).rejects.toThrow(/do not own offered card/);
    });

    it('accepts trade atomically swapping card ownership and transferring credits', async () => {
      const aliceCard = await cardRepo.createUserCard({
        userId: 'user-alice',
        cardId: 'base-card-fire',
        serialNumber: 1,
      });

      const bobCard = await cardRepo.createUserCard({
        userId: 'user-bob',
        cardId: 'base-card-ice',
        serialNumber: 2,
      });

      const trade = await tradeService.createProposal({
        senderUserId: 'user-alice',
        receiverUserId: 'user-bob',
        offeredCardIds: [aliceCard.id],
        requestedCardIds: [bobCard.id],
        offeredCredits: 1000,
      });

      const accepted = await tradeService.acceptTrade(trade.id, 'user-bob');
      expect(accepted.status).toBe('ACCEPTED');

      // Verify cards swapped and state returned to IDLE
      const newAliceCard = await cardRepo.findUserCardById(aliceCard.id);
      const newBobCard = await cardRepo.findUserCardById(bobCard.id);

      expect(newAliceCard?.userId).toBe('user-bob');
      expect(newAliceCard?.state).toBe('IDLE');

      expect(newBobCard?.userId).toBe('user-alice');
      expect(newBobCard?.state).toBe('IDLE');

      // Verify balances: Alice gave 1000 credits to Bob
      const aliceBalance = await economyRepo.findById('user-alice');
      const bobBalance = await economyRepo.findById('user-bob');

      expect(Number(aliceBalance?.walletBalance)).toBe(4000); // 5000 - 1000
      expect(Number(bobBalance?.walletBalance)).toBe(4000); // 3000 + 1000
    });

    it('rejects trade and unlocks cards back to IDLE', async () => {
      const aliceCard = await cardRepo.createUserCard({
        userId: 'user-alice',
        cardId: 'base-card-fire',
        serialNumber: 1,
      });

      const trade = await tradeService.createProposal({
        senderUserId: 'user-alice',
        receiverUserId: 'user-bob',
        offeredCardIds: [aliceCard.id],
        requestedCredits: 200,
      });

      const rejected = await tradeService.rejectTrade(trade.id, 'user-bob');
      expect(rejected.status).toBe('REJECTED');

      const card = await cardRepo.findUserCardById(aliceCard.id);
      expect(card?.state).toBe('IDLE');
      expect(card?.userId).toBe('user-alice');
    });

    it('cancels trade from sender and unlocks cards', async () => {
      const aliceCard = await cardRepo.createUserCard({
        userId: 'user-alice',
        cardId: 'base-card-fire',
        serialNumber: 1,
      });

      const trade = await tradeService.createProposal({
        senderUserId: 'user-alice',
        receiverUserId: 'user-bob',
        offeredCardIds: [aliceCard.id],
        requestedCredits: 200,
      });

      const cancelled = await tradeService.cancelTrade(trade.id, 'user-alice');
      expect(cancelled.status).toBe('CANCELLED');

      const card = await cardRepo.findUserCardById(aliceCard.id);
      expect(card?.state).toBe('IDLE');
    });
  });

  describe('MarketService', () => {
    it('lists a card with 5% tax and locks state to IN_MARKET', async () => {
      const card = await cardRepo.createUserCard({
        userId: 'user-alice',
        cardId: 'base-card-fire',
        serialNumber: 1,
      });

      const listing = await marketService.listCard({
        sellerUserId: 'user-alice',
        userCardId: card.id,
        price: 2000,
      });

      expect(listing.id).toBeDefined();
      expect(listing.price).toBe(2000);
      expect(listing.taxPaid).toBe(100); // 5% of 2000
      expect(listing.status).toBe('ACTIVE');

      const updatedCard = await cardRepo.findUserCardById(card.id);
      expect(updatedCard?.state).toBe('IN_MARKET');
    });

    it('allows buyer to purchase listing and seller receives net amount', async () => {
      const card = await cardRepo.createUserCard({
        userId: 'user-alice',
        cardId: 'base-card-fire',
        serialNumber: 1,
      });

      const listing = await marketService.listCard({
        sellerUserId: 'user-alice',
        userCardId: card.id,
        price: 1000,
      });

      const result = await marketService.buyListing({
        listingId: listing.id,
        buyerUserId: 'user-bob',
      });

      expect(result.listing.status).toBe('SOLD');
      expect(result.netPaid).toBe(1000);
      expect(result.taxDeducted).toBe(50); // 5% of 1000

      // Verify card ownership changed and state returned to IDLE
      const boughtCard = await cardRepo.findUserCardById(card.id);
      expect(boughtCard?.userId).toBe('user-bob');
      expect(boughtCard?.state).toBe('IDLE');

      // Verify balances
      // Bob started with 3000, paid 1000 -> 2000
      const bobBalance = await economyRepo.findById('user-bob');
      expect(Number(bobBalance?.walletBalance)).toBe(2000);

      // Alice started with 5000, receives net 950 (1000 - 50 tax sink) -> 5950
      const aliceBalance = await economyRepo.findById('user-alice');
      expect(Number(aliceBalance?.walletBalance)).toBe(5950);
    });

    it('seller can cancel active listing and card is returned to IDLE', async () => {
      const card = await cardRepo.createUserCard({
        userId: 'user-alice',
        cardId: 'base-card-fire',
        serialNumber: 1,
      });

      const listing = await marketService.listCard({
        sellerUserId: 'user-alice',
        userCardId: card.id,
        price: 1500,
      });

      const cancelled = await marketService.cancelListing({
        listingId: listing.id,
        sellerUserId: 'user-alice',
      });

      expect(cancelled.status).toBe('CANCELLED');

      const updatedCard = await cardRepo.findUserCardById(card.id);
      expect(updatedCard?.state).toBe('IDLE');
    });

    it('processes expired listings and returns cards to IDLE', async () => {
      const card = await cardRepo.createUserCard({
        userId: 'user-alice',
        cardId: 'base-card-fire',
        serialNumber: 1,
      });

      // Insert directly an expired listing
      const past = new Date(Date.now() - 60000);
      const listing = await marketRepo.create({
        sellerUserId: 'user-alice',
        userCardId: card.id,
        price: 800,
        expiresAt: past,
      });
      await cardRepo.updateUserCardState(card.id, 'IN_MARKET');

      const expiredCount = await marketService.processExpiredListings();
      expect(expiredCount).toBe(1);

      const updatedListing = await marketRepo.findById(listing.id);
      expect(updatedListing?.status).toBe('EXPIRED');

      const updatedCard = await cardRepo.findUserCardById(card.id);
      expect(updatedCard?.state).toBe('IDLE');
    });
  });

  describe('Gear lock: only empty cards change hands (BUG-0014)', () => {
    async function equipGear(userId: string, cardId: string, slot = 'WEAPON') {
      return inventoryRepo.create({
        userId,
        itemId: 'item-blade',
        quantity: 1,
        enhancementLevel: 0,
        equippedToCardId: cardId,
        slot,
        state: 'EQUIPPED',
        obtainedFrom: 'SHOP',
      });
    }

    it('refuses to list a card with gear and names the occupied slots', async () => {
      const card = await cardRepo.createUserCard({
        userId: 'user-alice',
        cardId: 'base-card-fire',
        serialNumber: 1,
      });
      await equipGear('user-alice', card.id, 'WEAPON');
      await equipGear('user-alice', card.id, 'RING');

      await expect(
        marketService.listCard({ sellerUserId: 'user-alice', userCardId: card.id, price: 1000 }),
      ).rejects.toThrow(/Flame Dancer .*still has gear equipped in: Weapon, Ring.*unequip-all/);
      expect((await cardRepo.findUserCardById(card.id))?.state).toBe('IDLE');
    });

    it('lists the card once its gear is unequipped', async () => {
      const card = await cardRepo.createUserCard({
        userId: 'user-alice',
        cardId: 'base-card-fire',
        serialNumber: 1,
      });
      await equipGear('user-alice', card.id);
      await inventoryRepo.unequipAllForUser('user-alice', card.id);

      const listing = await marketService.listCard({
        sellerUserId: 'user-alice',
        userCardId: card.id,
        price: 1000,
      });
      expect(listing.status).toBe('ACTIVE');
    });

    it('refuses a purchase when a listed card still carries gear (listing made before the lock)', async () => {
      const card = await cardRepo.createUserCard({
        userId: 'user-alice',
        cardId: 'base-card-fire',
        serialNumber: 1,
      });
      const listing = await marketService.listCard({
        sellerUserId: 'user-alice',
        userCardId: card.id,
        price: 1000,
      });
      await equipGear('user-alice', card.id);

      await expect(
        marketService.buyListing({ listingId: listing.id, buyerUserId: 'user-bob' }),
      ).rejects.toThrow(/still has gear equipped/);
      expect((await cardRepo.findUserCardById(card.id))?.userId).toBe('user-alice');
      expect(Number((await economyRepo.findById('user-bob'))?.walletBalance)).toBe(3000);
    });

    it('refuses to offer or request a card with gear in a trade', async () => {
      const aliceCard = await cardRepo.createUserCard({
        userId: 'user-alice',
        cardId: 'base-card-fire',
        serialNumber: 1,
      });
      const bobCard = await cardRepo.createUserCard({
        userId: 'user-bob',
        cardId: 'base-card-ice',
        serialNumber: 2,
      });
      await equipGear('user-alice', aliceCard.id);
      await equipGear('user-bob', bobCard.id, 'ARMOR');

      await expect(
        tradeService.createProposal({
          senderUserId: 'user-alice',
          receiverUserId: 'user-bob',
          offeredCardIds: [aliceCard.id],
        }),
      ).rejects.toThrow(/Flame Dancer .*Weapon.*can be traded/);
      await expect(
        tradeService.createProposal({
          senderUserId: 'user-alice',
          receiverUserId: 'user-bob',
          requestedCardIds: [bobCard.id],
        }),
      ).rejects.toThrow(/Requested card Frost Archer .*Armor.*Ask its owner/);
      expect((await cardRepo.findUserCardById(aliceCard.id))?.state).toBe('IDLE');
    });

    it('refuses to accept a trade whose card gained gear after the proposal', async () => {
      const aliceCard = await cardRepo.createUserCard({
        userId: 'user-alice',
        cardId: 'base-card-fire',
        serialNumber: 1,
      });
      const trade = await tradeService.createProposal({
        senderUserId: 'user-alice',
        receiverUserId: 'user-bob',
        offeredCardIds: [aliceCard.id],
      });
      await equipGear('user-alice', aliceCard.id);

      await expect(tradeService.acceptTrade(trade.id, 'user-bob')).rejects.toThrow(
        /still has gear equipped/,
      );
      expect((await cardRepo.findUserCardById(aliceCard.id))?.userId).toBe('user-alice');
    });
  });
});
