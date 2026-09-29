import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createDatabaseClient,
  GameItemRepository,
  UserInventoryItemRepository,
  type SqliteDatabaseClient,
  type NewGameItem,
} from '@ririko/database';
import { syncCanonicalItems, CANONICAL_ITEMS, CANONICAL_ITEM_IDS } from '../equipment/catalog.js';

describe('Catalog Seed Upsert (BUG-0015)', () => {
  let client: SqliteDatabaseClient;
  let itemRepo: GameItemRepository;
  let inventoryRepo: UserInventoryItemRepository;

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = raw;
    itemRepo = new GameItemRepository(client);
    inventoryRepo = new UserInventoryItemRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it('creates all items when database is empty', async () => {
    const result = await syncCanonicalItems(itemRepo);
    expect(result.created).toBe(CANONICAL_ITEMS.length);
    expect(result.updated).toBe(0);

    const all = await itemRepo.findAll();
    expect(all.length).toBe(CANONICAL_ITEMS.length);
  });

  it('updates existing item fields while preserving item id and foreign keys', async () => {
    // 1. Initial sync
    const firstSync = await syncCanonicalItems(itemRepo);
    expect(firstSync.created).toBe(CANONICAL_ITEMS.length);

    // 2. Look up an item (e.g. CRAFTING_DUST)
    const originalItem = await itemRepo.findByCode('CRAFTING_DUST');
    expect(originalItem).toBeDefined();
    const originalId = originalItem!.id;

    // 3. User obtains this item in inventory
    const inventoryEntry = await inventoryRepo.create({
      userId: 'user-123',
      itemId: originalId,
      quantity: 50,
      enhancementLevel: 0,
    });
    expect(inventoryEntry.itemId).toBe(originalId);

    // 4. Catalog changes (e.g. new description, new shop price)
    const testCatalog: NewGameItem[] = CANONICAL_ITEMS.map((item) => {
      if (item.code === 'CRAFTING_DUST') {
        return {
          ...item,
          name: 'Crafting Dust (Updated)',
          description: 'Refined crystal powder for gear enhancement and tier upgrades.',
          shopPrice: 42,
          maxDailyPurchases: 20,
        };
      }
      return item;
    });

    // 5. Run syncCanonicalItems with modified catalog
    const secondSync = await syncCanonicalItems(itemRepo, testCatalog);
    expect(secondSync.created).toBe(0);
    expect(secondSync.updated).toBe(testCatalog.length);

    // 6. Verify item was updated, but id was preserved
    const updatedItem = await itemRepo.findByCode('CRAFTING_DUST');
    expect(updatedItem).toBeDefined();
    expect(updatedItem!.id).toBe(originalId);
    expect(updatedItem!.name).toBe('Crafting Dust (Updated)');
    expect(updatedItem!.description).toBe(
      'Refined crystal powder for gear enhancement and tier upgrades.',
    );
    expect(updatedItem!.shopPrice).toBe(42);
    expect(updatedItem!.maxDailyPurchases).toBe(20);

    // 7. Verify user's inventory still references this exact item
    const userItems = await inventoryRepo.findByUser('user-123');
    expect(userItems.length).toBe(1);
    expect(userItems[0]!.itemId).toBe(originalId);
    expect(userItems[0]!.quantity).toBe(50);
  });

  it('handles partial additions (creates new, updates existing)', async () => {
    // Start with small subset
    const subset: NewGameItem[] = [CANONICAL_ITEMS[0]!, CANONICAL_ITEMS[1]!];
    const firstSync = await syncCanonicalItems(itemRepo, subset);
    expect(firstSync.created).toBe(2);
    expect(firstSync.updated).toBe(0);

    // Full catalog sync
    const secondSync = await syncCanonicalItems(itemRepo);
    expect(secondSync.created).toBe(CANONICAL_ITEMS.length - 2);
    expect(secondSync.updated).toBe(2);

    const total = await itemRepo.findAll();
    expect(total.length).toBe(CANONICAL_ITEMS.length);
  });

  it('keeps shop fields the owner console overrode and still updates catalog-owned fields', async () => {
    await syncCanonicalItems(itemRepo);
    const katana = await itemRepo.findByCode('WEAPON_OBSIDIAN_KATANA');
    await itemRepo.update(katana!.id, {
      isShopBuyable: true,
      shopPrice: 777,
      maxDailyPurchases: 2,
      ownerOverridden: true,
    });
    const blade = await itemRepo.findByCode('WEAPON_NOVICE_BLADE');
    await itemRepo.update(blade!.id, { shopPrice: 9 });

    const renamed = CANONICAL_ITEMS.map((item) =>
      item.code === 'WEAPON_OBSIDIAN_KATANA' ? { ...item, name: 'Obsidian Katana II' } : item,
    );
    await syncCanonicalItems(itemRepo, renamed);

    const keptKatana = await itemRepo.findByCode('WEAPON_OBSIDIAN_KATANA');
    expect(keptKatana).toMatchObject({
      name: 'Obsidian Katana II',
      isShopBuyable: true,
      shopPrice: 777,
      maxDailyPurchases: 2,
      ownerOverridden: true,
    });
    // Not overridden: the catalog price wins again.
    expect((await itemRepo.findByCode('WEAPON_NOVICE_BLADE'))?.shopPrice).toBe(100);
  });

  it('assigns deterministic stable UUIDs to canonical items on creation', async () => {
    await syncCanonicalItems(itemRepo);

    for (const [code, expectedId] of Object.entries(CANONICAL_ITEM_IDS)) {
      const item = await itemRepo.findByCode(code);
      expect(item).toBeDefined();
      expect(item?.id).toBe(expectedId);
    }
  });
});
