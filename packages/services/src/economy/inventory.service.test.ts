import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDatabaseClient,
  ItemRepository,
  InventoryRepository,
  EconomyRepository,
  PlayerEnergyRepository,
  XpRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { EventBus } from '@ririko/core';
import { InventoryService } from './inventory.service.js';
import { LevelingService } from './leveling.service.js';

describe('InventoryService', () => {
  let client: SqliteDatabaseClient;
  let itemRepo: ItemRepository;
  let inventoryRepo: InventoryRepository;
  let economyRepo: EconomyRepository;
  let playerEnergyRepo: PlayerEnergyRepository;
  let xpRepo: XpRepository;
  let levelingService: LevelingService;
  let eventBus: EventBus;
  let inventoryService: InventoryService;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    client.raw.exec(`
      CREATE TABLE economy_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        price INTEGER NOT NULL,
        rarity TEXT NOT NULL DEFAULT 'COMMON',
        category_id TEXT,
        icon_url TEXT,
        is_purchasable INTEGER NOT NULL DEFAULT 1,
        metadata TEXT DEFAULT '{}'
      );

      CREATE TABLE economy_inventories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        acquired_at INTEGER NOT NULL
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

      CREATE TABLE player_energy (
        user_id TEXT PRIMARY KEY,
        current_energy INTEGER NOT NULL DEFAULT 100,
        max_energy INTEGER NOT NULL DEFAULT 100,
        bonus_energy INTEGER NOT NULL DEFAULT 0,
        daily_energy_pots_used INTEGER NOT NULL DEFAULT 0,
        last_replenished_at INTEGER NOT NULL,
        last_reset_date TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE xp_accounts (
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        xp INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 0,
        karma INTEGER NOT NULL DEFAULT 0,
        last_xp_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, guild_id)
      );

      CREATE TABLE xp_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        xp_awarded INTEGER NOT NULL,
        source TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    itemRepo = new ItemRepository(client);
    inventoryRepo = new InventoryRepository(client);
    economyRepo = new EconomyRepository(client);
    playerEnergyRepo = new PlayerEnergyRepository(client);
    xpRepo = new XpRepository(client);
    levelingService = new LevelingService({ xpRepository: xpRepo });
    eventBus = new EventBus();

    await itemRepo.seedDefaultCatalog();

    inventoryService = new InventoryService({
      itemRepository: itemRepo,
      inventoryRepository: inventoryRepo,
      economyRepository: economyRepo,
      playerEnergyRepository: playerEnergyRepo,
      levelingService,
      eventBus,
    });
  });

  describe('Shop Catalog', () => {
    it('retrieves purchasable catalog items with category filters', async () => {
      const catalog = await inventoryService.getCatalog();
      expect(catalog.length).toBe(4);

      const consumables = await inventoryService.getCatalog('consumable');
      expect(consumables.length).toBe(3);
      expect(consumables.map((c) => c.id)).toContain('candy_minor');
      expect(consumables.map((c) => c.id)).toContain('stamina_potion');
      expect(consumables.map((c) => c.id)).toContain('exp_potion_small');

      const cosmetics = await inventoryService.getCatalog('cosmetic');
      expect(cosmetics.length).toBe(1);
      expect(cosmetics[0]?.id).toBe('profile_bg_voucher');
    });

    it('fetches single item by id', async () => {
      const item = await inventoryService.getItem('stamina_potion');
      expect(item).not.toBeNull();
      expect(item?.price).toBe(350);
      expect(item?.rarity).toBe('UNCOMMON');
    });
  });

  describe('buyItem (Deflationary Sinks & Daily Purchase Limits)', () => {
    it('fails purchase if wallet balance is insufficient', async () => {
      await economyRepo.modifyBalance({
        userId: 'poor_user',
        walletDelta: 50,
        type: 'INITIAL',
        source: 'SETUP',
      });

      const result = await inventoryService.buyItem({
        userId: 'poor_user',
        itemId: 'candy_minor', // costs 100
        quantity: 1,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Insufficient wallet balance');

      const qty = await inventoryService.getItemQuantity('poor_user', 'candy_minor');
      expect(qty).toBe(0);
    });

    it('successfully purchases item, deducts wallet balance, and adds to inventory bag', async () => {
      await economyRepo.modifyBalance({
        userId: 'buyer_1',
        walletDelta: 1000,
        type: 'INITIAL',
        source: 'SETUP',
      });

      const result = await inventoryService.buyItem({
        userId: 'buyer_1',
        itemId: 'exp_potion_small', // costs 250
        quantity: 2, // total 500
      });

      expect(result.success).toBe(true);
      expect(result.totalPrice).toBe(500);
      expect(result.walletBalanceAfter).toBe(500);
      expect(result.inventorySlot?.quantity).toBe(2);

      const bag = await inventoryService.getUserInventory('buyer_1');
      expect(bag.length).toBe(1);
      expect(bag[0]?.itemId).toBe('exp_potion_small');
      expect(bag[0]?.quantity).toBe(2);
      expect(bag[0]?.item?.name).toBe('Small EXP Potion');
    });

    it('enforces daily purchase limit on entry-level candy (1 per day)', async () => {
      await economyRepo.modifyBalance({
        userId: 'candy_buyer',
        walletDelta: 1000,
        type: 'INITIAL',
        source: 'SETUP',
      });

      // 1st candy purchase -> Success
      const firstBuy = await inventoryService.buyItem({
        userId: 'candy_buyer',
        itemId: 'candy_minor',
        quantity: 1,
      });
      expect(firstBuy.success).toBe(true);

      // 2nd candy purchase on same day -> Rejected by anti-abuse limit
      const secondBuy = await inventoryService.buyItem({
        userId: 'candy_buyer',
        itemId: 'candy_minor',
        quantity: 1,
      });
      expect(secondBuy.success).toBe(false);
      expect(secondBuy.reason).toContain('Daily purchase limit reached');

      const qty = await inventoryService.getItemQuantity('candy_buyer', 'candy_minor');
      expect(qty).toBe(1);
    });
  });

  describe('useItem (Consumable Effects & Anti-Abuse Ceilings)', () => {
    it('fails if user does not own item or quantity is insufficient', async () => {
      const result = await inventoryService.useItem({
        userId: 'empty_bag_user',
        itemId: 'stamina_potion',
        quantity: 1,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Insufficient item quantity');
    });

    it('consumes stamina potion and restores player energy', async () => {
      // Set user energy to 40/100
      await playerEnergyRepo.getOrCreate('stamina_user');
      await playerEnergyRepo.update('stamina_user', { currentEnergy: 40 });

      // Give 2 potions
      await inventoryRepo.addItem('stamina_user', 'stamina_potion', 2);

      const useRes = await inventoryService.useItem({
        userId: 'stamina_user',
        itemId: 'stamina_potion',
        quantity: 1,
      });

      expect(useRes.success).toBe(true);
      expect(useRes.remainingQuantity).toBe(1);
      expect(useRes.energyRestored).toBe(50);
      expect(useRes.currentEnergy).toBe(90);
      expect(useRes.dailyEnergyPotsUsed).toBe(1);
    });

    it('enforces hard ceiling of max 3 stamina potions per day', async () => {
      await playerEnergyRepo.getOrCreate('chugger');
      await playerEnergyRepo.update('chugger', { currentEnergy: 10 });
      await inventoryRepo.addItem('chugger', 'stamina_potion', 5);

      // Pot 1 -> OK (pots used = 1)
      const p1 = await inventoryService.useItem({ userId: 'chugger', itemId: 'stamina_potion' });
      expect(p1.success).toBe(true);

      // Pot 2 -> OK (pots used = 2)
      const p2 = await inventoryService.useItem({ userId: 'chugger', itemId: 'stamina_potion' });
      expect(p2.success).toBe(true);

      // Pot 3 -> OK (pots used = 3)
      const p3 = await inventoryService.useItem({ userId: 'chugger', itemId: 'stamina_potion' });
      expect(p3.success).toBe(true);

      // Pot 4 -> REJECTED (exceeds max 3/day ceiling)
      const p4 = await inventoryService.useItem({ userId: 'chugger', itemId: 'stamina_potion' });
      expect(p4.success).toBe(false);
      expect(p4.reason).toContain('Daily stamina potion ceiling reached');

      // Remaining inventory must NOT have been decremented on rejected 4th attempt
      const remaining = await inventoryService.getItemQuantity('chugger', 'stamina_potion');
      expect(remaining).toBe(2); // 5 - 3 = 2
    });

    it('consumes EXP potion and awards experience', async () => {
      await inventoryRepo.addItem('level_grinder', 'exp_potion_small', 1);

      const useRes = await inventoryService.useItem({
        userId: 'level_grinder',
        itemId: 'exp_potion_small',
        guildId: 'guild_level_1',
      });

      expect(useRes.success).toBe(true);
      expect(useRes.xpAwarded).toBe(150);
      expect(useRes.remainingQuantity).toBe(0);

      const xpAcc = await xpRepo.getAccount('level_grinder', 'guild_level_1');
      expect(xpAcc?.xp).toBe(150);
      expect(xpAcc?.level).toBe(1); // 150 >= 100 (Level 1 threshold)
    });

    it('consumes Profile Background Voucher', async () => {
      await inventoryRepo.addItem('cosmetic_fan', 'profile_bg_voucher', 1);

      const useRes = await inventoryService.useItem({
        userId: 'cosmetic_fan',
        itemId: 'profile_bg_voucher',
      });

      expect(useRes.success).toBe(true);
      expect(useRes.effectSummary).toContain('Profile Background Voucher redeemed');
      expect(useRes.remainingQuantity).toBe(0);

      const qty = await inventoryService.getItemQuantity('cosmetic_fan', 'profile_bg_voucher');
      expect(qty).toBe(0);
    });
  });
});
