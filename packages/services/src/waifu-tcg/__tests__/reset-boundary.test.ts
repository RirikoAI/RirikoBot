import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createDatabaseClient,
  GameItemRepository,
  PlayerEnergyRepository,
  UserInventoryItemRepository,
  EconomyRepository,
  ItemRepository,
  InventoryRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { DEFAULT_RESET_SCHEDULE, createResetSchedule, type ResetSchedule } from '@ririko/core';
import { EnergyLifecycleService } from '../energy/energy-lifecycle.service.js';
import { TcgShopService, shopDayKey } from '../equipment/tcg-shop.service.js';
import { InventoryService } from '../../economy/inventory.service.js';
import { CANONICAL_ITEMS } from '../equipment/catalog.js';

/**
 * Midnight GMT+8 falls at 16:00 UTC on the previous date, so these two instants are two
 * minutes apart yet belong to different reset days. Every assertion below leans on that gap:
 * under the old UTC-midnight behaviour both would share a day.
 */
const LATE_IN_RESET_DAY = new Date('2026-09-20T15:59:00.000Z');
const JUST_AFTER_BOUNDARY = new Date('2026-09-20T16:01:00.000Z');
/** Inside the same GMT+8 day as JUST_AFTER_BOUNDARY, but a new day in UTC terms. */
const AFTER_UTC_MIDNIGHT = new Date('2026-09-21T02:00:00.000Z');

/** 06:00 GMT+8 — used to prove features can flip independently of one another. */
const SIX_AM_GMT8: ResetSchedule = createResetSchedule(480, '06:00');

describe('STORY-161 shared reset boundary', () => {
  let client: SqliteDatabaseClient;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    client.raw.exec(`
      CREATE TABLE IF NOT EXISTS player_energy (
        user_id TEXT PRIMARY KEY,
        current_energy INTEGER NOT NULL DEFAULT 100,
        max_energy INTEGER NOT NULL DEFAULT 100,
        bonus_energy INTEGER NOT NULL DEFAULT 0,
        daily_energy_pots_used INTEGER NOT NULL DEFAULT 0,
        last_replenished_at INTEGER NOT NULL,
        last_reset_date TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS game_items (
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
      CREATE TABLE IF NOT EXISTS user_inventory_items (
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
      CREATE TABLE IF NOT EXISTS economy_balances (
        user_id TEXT PRIMARY KEY,
        wallet_balance INTEGER NOT NULL DEFAULT 0,
        bank_balance INTEGER NOT NULL DEFAULT 0,
        bank_capacity INTEGER NOT NULL DEFAULT 10000,
        net_worth INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS economy_transactions (
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
      CREATE TABLE IF NOT EXISTS economy_accounts (
        user_id TEXT PRIMARY KEY,
        is_frozen INTEGER NOT NULL DEFAULT 0,
        daily_streak INTEGER NOT NULL DEFAULT 0,
        last_daily_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS economy_items (
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
      CREATE TABLE IF NOT EXISTS economy_inventories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        acquired_at INTEGER NOT NULL
      );
    `);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await client.close();
  });

  describe('energy replenishment', () => {
    it('does not replenish across UTC midnight when the boundary is GMT+8', async () => {
      const energyRepo = new PlayerEnergyRepository(client, DEFAULT_RESET_SCHEDULE);
      const service = new EnergyLifecycleService(energyRepo, DEFAULT_RESET_SCHEDULE);

      await energyRepo.getOrCreate('user_energy');
      await energyRepo.update('user_energy', {
        currentEnergy: 10,
        lastResetDate: '2026-09-21', // the GMT+8 day containing AFTER_UTC_MIDNIGHT
      });

      // Crossing 00:00 UTC is not a boundary crossing under GMT+8.
      vi.useFakeTimers();
      vi.setSystemTime(AFTER_UTC_MIDNIGHT);

      const record = await service.getOrReconcileUserEnergy('user_energy', 1);
      expect(record.lastResetDate).toBe('2026-09-21');
      expect(record.currentEnergy).toBe(10);
    });

    it('replenishes to the level cap once the reset day key changes', async () => {
      const energyRepo = new PlayerEnergyRepository(client, DEFAULT_RESET_SCHEDULE);
      const service = new EnergyLifecycleService(energyRepo, DEFAULT_RESET_SCHEDULE);

      await energyRepo.getOrCreate('user_replenish');
      await energyRepo.update('user_replenish', {
        currentEnergy: 10,
        lastResetDate: '2000-01-01',
      });

      const record = await service.getOrReconcileUserEnergy('user_replenish', 10);

      expect(record.currentEnergy).toBe(123); // level 10 capacity
      expect(record.maxEnergy).toBe(123);
      expect(record.dailyEnergyPotsUsed).toBe(0);
    });
  });

  describe('energy potion daily ceiling', () => {
    it('keeps the ceiling within one GMT+8 day even after UTC midnight passes', async () => {
      const energyRepo = new PlayerEnergyRepository(client, DEFAULT_RESET_SCHEDULE);

      await energyRepo.getOrCreate('user_potions');
      await energyRepo.update('user_potions', {
        currentEnergy: 0,
        dailyEnergyPotsUsed: 3,
        // The GMT+8 day that spans both 16:01Z on the 20th and 02:00Z on the 21st.
        lastResetDate: '2026-09-21',
      });

      vi.useFakeTimers();
      vi.setSystemTime(AFTER_UTC_MIDNIGHT);

      const result = await energyRepo.consumeEnergyPotion('user_potions', 15, 3);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('ceiling');
      expect(result.potsUsedToday).toBe(3);
    });

    it('clears the ceiling once the reset day key changes', async () => {
      const energyRepo = new PlayerEnergyRepository(client, DEFAULT_RESET_SCHEDULE);

      await energyRepo.getOrCreate('user_potions_reset');
      await energyRepo.update('user_potions_reset', {
        currentEnergy: 0,
        dailyEnergyPotsUsed: 3,
        lastResetDate: '2000-01-01',
      });

      const result = await energyRepo.consumeEnergyPotion('user_potions_reset', 15, 3);

      expect(result.success).toBe(true);
      expect(result.potsUsedToday).toBe(1);
      expect(result.energyRestored).toBe(15);
    });
  });

  describe('TCG shop rotation', () => {
    it('keeps one rotation for a whole GMT+8 day, spanning UTC midnight', () => {
      expect(shopDayKey(JUST_AFTER_BOUNDARY, DEFAULT_RESET_SCHEDULE)).toBe(
        shopDayKey(AFTER_UTC_MIDNIGHT, DEFAULT_RESET_SCHEDULE),
      );
    });

    it('rotates at the GMT+8 boundary rather than at UTC midnight', () => {
      expect(shopDayKey(LATE_IN_RESET_DAY, DEFAULT_RESET_SCHEDULE)).not.toBe(
        shopDayKey(JUST_AFTER_BOUNDARY, DEFAULT_RESET_SCHEDULE),
      );
    });

    it('serves a stable rotation for every instant inside one reset day', async () => {
      const itemRepo = new GameItemRepository(client);
      const inventoryRepo = new UserInventoryItemRepository(client);
      const economyRepo = new EconomyRepository(client);
      for (const item of CANONICAL_ITEMS) await itemRepo.create(item);

      const shop = new TcgShopService(itemRepo, inventoryRepo, economyRepo, DEFAULT_RESET_SCHEDULE);

      const early = await shop.getDailyRotation(JUST_AFTER_BOUNDARY);
      const late = await shop.getDailyRotation(AFTER_UTC_MIDNIGHT);

      expect(early.map((i) => i.code)).toEqual(late.map((i) => i.code));
    });

    it('lets a feature on a different clock time flip independently', () => {
      // 2026-09-20T16:01Z is past midnight GMT+8 but before 06:00 GMT+8 (22:00Z).
      expect(shopDayKey(LATE_IN_RESET_DAY, SIX_AM_GMT8)).toBe(
        shopDayKey(JUST_AFTER_BOUNDARY, SIX_AM_GMT8),
      );
      expect(shopDayKey(LATE_IN_RESET_DAY, DEFAULT_RESET_SCHEDULE)).not.toBe(
        shopDayKey(JUST_AFTER_BOUNDARY, DEFAULT_RESET_SCHEDULE),
      );
    });
  });

  describe('economy shop daily purchase limit', () => {
    const CANDY_ID = 'item_candy';

    const seedCandy = (): void => {
      client.raw
        .prepare(
          `INSERT INTO economy_items (id, name, description, price, rarity, is_purchasable, metadata)
           VALUES (?, ?, ?, ?, ?, 1, ?)`,
        )
        .run(
          CANDY_ID,
          'Daily Energy Biscuit',
          'Restores +15 Energy.',
          10,
          'COMMON',
          JSON.stringify({ dailyPurchaseLimit: 1, energyRestore: 15 }),
        );
    };

    const buildInventoryService = (schedule: ResetSchedule): InventoryService =>
      new InventoryService({
        itemRepository: new ItemRepository(client),
        inventoryRepository: new InventoryRepository(client),
        economyRepository: new EconomyRepository(client),
        resetSchedule: schedule,
      });

    it('still blocks a repeat purchase after UTC midnight inside one GMT+8 day', async () => {
      seedCandy();
      const economyRepo = new EconomyRepository(client);
      await economyRepo.modifyBalance({
        userId: 'buyer',
        walletDelta: 1000,
        type: 'ADMIN_GRANT',
        source: 'TEST_SEED',
      });

      const service = buildInventoryService(DEFAULT_RESET_SCHEDULE);

      const first = await service.buyItem({ userId: 'buyer', itemId: CANDY_ID, quantity: 1 });
      expect(first.success).toBe(true);

      // The purchase transaction was just written, so it shares today's reset day.
      const second = await service.buyItem({ userId: 'buyer', itemId: CANDY_ID, quantity: 1 });
      expect(second.success).toBe(false);
      expect(second.reason).toContain('Daily purchase limit');
    });
  });
});
