import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient } from '@ririko/database';
import type { SqliteDatabaseClient } from '@ririko/database';
import {
  GameItemRepository,
  UserInventoryItemRepository,
  PlayerEnergyRepository,
  EconomyRepository,
} from '@ririko/database';
import {
  CANONICAL_ITEMS,
  EnergyLifecycleService,
  TcgShopService,
  calculateMaxEnergy,
} from '../index.js';

describe('Waifu TCG: Energy Lifecycle & Town Item Shop (STORY-103 / TASK-1032)', () => {
  let client: SqliteDatabaseClient;
  let itemRepo: GameItemRepository;
  let inventoryRepo: UserInventoryItemRepository;
  let energyRepo: PlayerEnergyRepository;
  let economyRepo: EconomyRepository;
  let energyLifecycle: EnergyLifecycleService;
  let shopService: TcgShopService;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    client.raw.exec(`
      CREATE TABLE game_items (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        type TEXT NOT NULL,
        subtype TEXT NOT NULL,
        rarity TEXT NOT NULL DEFAULT 'COMMON',
        base_stats TEXT DEFAULT '{}',
        battle_perks TEXT DEFAULT '[]',
        consumable_effect TEXT DEFAULT '{}',
        is_shop_buyable INTEGER NOT NULL DEFAULT 1,
        shop_price INTEGER NOT NULL DEFAULT 100,
        max_daily_purchases INTEGER NOT NULL DEFAULT 5,
        is_tradeable INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
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
        source TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'CREDITS',
        balance_before INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    itemRepo = new GameItemRepository(client);
    inventoryRepo = new UserInventoryItemRepository(client);
    energyRepo = new PlayerEnergyRepository(client);
    economyRepo = new EconomyRepository(client);

    energyLifecycle = new EnergyLifecycleService(energyRepo);
    shopService = new TcgShopService(itemRepo, inventoryRepo, economyRepo);

    // Seed canonical catalog
    for (const item of CANONICAL_ITEMS) {
      await itemRepo.create(item);
    }
  });

  afterEach(async () => {
    await client.close();
  });

  describe('1. Energy Formula & Progression Math', () => {
    it('calculates exact energy capacities matching Section 12.2 table', () => {
      expect(calculateMaxEnergy(1)).toBe(100);
      expect(calculateMaxEnergy(10)).toBe(123); // 100 + 18 + 5
      expect(calculateMaxEnergy(20)).toBe(143); // 100 + 38 + 5
      expect(calculateMaxEnergy(25)).toBe(163); // 100 + 48 + 15
      expect(calculateMaxEnergy(40)).toBe(193); // 100 + 78 + 15
      expect(calculateMaxEnergy(50)).toBe(228); // 100 + 98 + 30
      expect(calculateMaxEnergy(60)).toBe(248); // 100 + 118 + 30
      expect(calculateMaxEnergy(75)).toBe(298); // 100 + 148 + 50
      expect(calculateMaxEnergy(90)).toBe(300); // capped at default 300
      expect(calculateMaxEnergy(90, 500)).toBe(328); // 100 + 178 + 50
      expect(calculateMaxEnergy(100, 500)).toBe(373); // 100 + 198 + 75
    });
  });

  describe('2. Energy Daily Lifecycle & Rollover', () => {
    it('reconciles energy on daily rollover, resetting potion limits and refilling pool', async () => {
      // Setup user record from yesterday with depleted energy and 2 used potions
      const pastDate = '2020-01-01';
      await energyRepo.create({
        userId: 'summoner_daily',
        currentEnergy: 15,
        maxEnergy: 100,
        dailyEnergyPotsUsed: 2,
        lastResetDate: pastDate,
      });

      // Today's login at level 25
      const reconciled = await energyLifecycle.getOrReconcileUserEnergy('summoner_daily', 25);
      expect(reconciled.maxEnergy).toBe(163);
      expect(reconciled.currentEnergy).toBe(163);
      expect(reconciled.dailyEnergyPotsUsed).toBe(0);
      expect(reconciled.lastResetDate).toBe(new Date().toISOString().slice(0, 10));
    });

    it('preserves energy overflow above max capacity during rollover', async () => {
      const pastDate = '2020-01-01';
      await energyRepo.create({
        userId: 'summoner_overflow',
        currentEnergy: 250, // overflow from ambrosia
        maxEnergy: 143,
        dailyEnergyPotsUsed: 3,
        lastResetDate: pastDate,
      });

      const reconciled = await energyLifecycle.getOrReconcileUserEnergy('summoner_overflow', 20);
      expect(reconciled.currentEnergy).toBe(250); // Not reduced!
      expect(reconciled.dailyEnergyPotsUsed).toBe(0); // Potions reset
    });
  });

  describe('3. Town Item Shop & Ledger Transactions', () => {
    it('retrieves shop catalog filtered by type', async () => {
      const weapons = await shopService.getCatalog('EQUIPMENT');
      expect(weapons.length).toBeGreaterThan(0);
      for (const w of weapons) {
        expect(w.isShopBuyable).toBe(true);
        expect(w.type).toBe('EQUIPMENT');
      }
    });

    it('rejects purchase of non-buyable superior gear outside the daily rotation', async () => {
      // The rotation is seeded from the reset-day key, so the date must be pinned: on days when
      // WEAPON_OBSIDIAN_KATANA rotates in it becomes purchasable and this guard never fires.
      // 2026-03-01 (GMT+8) rotates RING_BLAZING_SUN + ARMOR_MAGMA_MAIL.
      const katanaOutOfRotation = new Date('2026-02-28T16:00:00.000Z');
      await expect(
        shopService.buyItem('user_buyer', 'WEAPON_OBSIDIAN_KATANA', 1, undefined, katanaOutOfRotation),
      ).rejects.toThrow(/cannot be purchased with credits/);
    });

    it('allows purchase of drop-only gear while it is in the daily rotation', async () => {
      // 2026-03-02 (GMT+8) rotates WEAPON_OBSIDIAN_KATANA + TALISMAN_WINDWALKER.
      const katanaInRotation = new Date('2026-03-01T16:00:00.000Z');
      const rotation = await shopService.getDailyRotation(katanaInRotation);
      expect(rotation.map((i) => i.code)).toContain('WEAPON_OBSIDIAN_KATANA');

      // Rejected for price, not for being drop-only: the rotation guard let it through.
      await expect(
        shopService.buyItem('user_buyer', 'WEAPON_OBSIDIAN_KATANA', 1, undefined, katanaInRotation),
      ).rejects.toThrow(/Insufficient wallet balance/);
    });

    it('rejects purchase if daily quantity limit is exceeded', async () => {
      await expect(
        shopService.buyItem('user_buyer', 'RESTORE_DAILY_ENERGY_BISCUIT', 2),
      ).rejects.toThrow(/exceeds daily limit of 1/);
    });

    it('buys an item, debits wallet credits via double-entry ledger, and provisions inventory', async () => {
      // Credit wallet with 1,000 coins
      await economyRepo.modifyBalance({
        userId: 'user_buyer',
        walletDelta: 1000,
        type: 'ADMIN_GRANT',
        source: 'TEST_HARNESS',
      });

      // Buy 1x Novice Blade (100 credits)
      const receipt = await shopService.buyItem('user_buyer', 'WEAPON_NOVICE_BLADE', 1);
      expect(receipt.success).toBe(true);
      expect(receipt.totalPrice).toBe(100);
      expect(receipt.walletBalanceAfter).toBe(900);

      // Verify item in user inventory
      const inv = await inventoryRepo.findByUser('user_buyer');
      expect(inv).toHaveLength(1);
      expect(inv[0]?.itemId).toBe(receipt.item.id);
      expect(inv[0]?.state).toBe('IDLE');

      // Buy 2x Minor HP Potion (50 credits each = 100 credits)
      const receipt2 = await shopService.buyItem('user_buyer', 'POTION_MINOR_HP', 2);
      expect(receipt2.totalPrice).toBe(100);
      expect(receipt2.walletBalanceAfter).toBe(800);

      // Verify potions stacked into single inventory slot with quantity = 2
      const invAfterPotions = await inventoryRepo.findByUser('user_buyer');
      expect(invAfterPotions).toHaveLength(2);
      const potionSlot = invAfterPotions.find((i) => i.itemId === receipt2.item.id);
      expect(potionSlot?.quantity).toBe(2);
    });
  });
});
