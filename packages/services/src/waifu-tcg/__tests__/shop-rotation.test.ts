import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createDatabaseClient,
  EconomyRepository,
  GameItemRepository,
  UserInventoryItemRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { CANONICAL_ITEMS, DAILY_ROTATION_POOL } from '../equipment/catalog.js';
import {
  DAILY_ROTATION_MARKUP,
  DAILY_ROTATION_SIZE,
  pickDailyRotation,
  TcgShopService,
} from '../equipment/tcg-shop.service.js';

describe('Town shop daily rotation (STORY-158)', () => {
  let client: SqliteDatabaseClient;
  let shop: TcgShopService;
  let economyRepo: EconomyRepository;

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = raw;
    const itemRepo = new GameItemRepository(client);
    for (const item of CANONICAL_ITEMS) await itemRepo.create(item);
    economyRepo = new EconomyRepository(client);
    shop = new TcgShopService(itemRepo, new UserInventoryItemRepository(client), economyRepo);
  });

  afterEach(async () => {
    await client.close();
  });

  it('picks the same distinct stock for everyone on a day and changes over days', () => {
    const today = pickDailyRotation('2026-09-20', DAILY_ROTATION_POOL, DAILY_ROTATION_SIZE);
    expect(today).toEqual(
      pickDailyRotation('2026-09-20', DAILY_ROTATION_POOL, DAILY_ROTATION_SIZE),
    );
    expect(new Set(today).size).toBe(DAILY_ROTATION_SIZE);
    for (const code of today) expect(DAILY_ROTATION_POOL).toContain(code);

    const week = new Set(
      Array.from({ length: 7 }, (_, d) =>
        pickDailyRotation(`2026-09-${20 + d}`, DAILY_ROTATION_POOL, DAILY_ROTATION_SIZE).join(','),
      ),
    );
    expect(week.size).toBeGreaterThan(1);
  });

  it('sells rotation gear at a markup, one per order, and only on its day', async () => {
    const day = new Date('2026-09-20T12:00:00Z');
    const [deal] = await shop.getDailyRotation(day);
    const base = CANONICAL_ITEMS.find((i) => i.code === deal!.code)!;
    expect(deal!.shopPrice).toBe(Math.round(base.shopPrice! * DAILY_ROTATION_MARKUP));
    expect(deal!.maxDailyPurchases).toBe(1);

    await economyRepo.modifyBalance({
      userId: 'u1',
      walletDelta: 100_000,
      type: 'ADMIN_GRANT',
      source: 'TEST',
    });
    await expect(shop.buyItem('u1', deal!.code, 2, undefined, day)).rejects.toThrow(/daily limit/);

    const receipt = await shop.buyItem('u1', deal!.code, 1, undefined, day);
    expect(receipt.totalPrice).toBe(deal!.shopPrice);
    expect(receipt.inventoryItemIds).toHaveLength(1);

    const otherDay = [...Array(30).keys()]
      .map((d) => new Date(Date.UTC(2026, 9, d + 1)))
      .find(
        (d) =>
          !pickDailyRotation(
            d.toISOString().slice(0, 10),
            DAILY_ROTATION_POOL,
            DAILY_ROTATION_SIZE,
          ).includes(deal!.code),
      )!;
    await expect(shop.buyItem('u1', deal!.code, 1, undefined, otherDay)).rejects.toThrow(
      /superior drop/,
    );
  });

  it('never rotates boss signature gear into the shop', () => {
    for (const code of DAILY_ROTATION_POOL) {
      expect(CANONICAL_ITEMS.find((i) => i.code === code)?.description).not.toMatch(
        /^Signature of/,
      );
    }
  });
});
