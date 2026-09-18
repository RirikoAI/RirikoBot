import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { SqliteDatabaseClient } from '../client/types.js';
import { GameItemRepository, UserInventoryItemRepository } from './tcg-item.repository.js';

describe('GameItemRepository & UserInventoryItemRepository', () => {
  let client: SqliteDatabaseClient;
  let itemRepo: GameItemRepository;
  let inventoryRepo: UserInventoryItemRepository;

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
    `);

    itemRepo = new GameItemRepository(client);
    inventoryRepo = new UserInventoryItemRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  describe('GameItemRepository', () => {
    it('creates and finds an item by id and code', async () => {
      const item = await itemRepo.create({
        code: 'WEAPON_NOVICE_BLADE',
        name: 'Novice Blade',
        description: 'A standard starter training sword.',
        type: 'EQUIPMENT',
        subtype: 'WEAPON',
        rarity: 'COMMON',
        baseStats: { attack: 25, critRate: 0.02 },
        battlePerks: [],
        shopPrice: 150,
        isShopBuyable: true,
      });

      expect(item.id).toBeDefined();
      expect(item.code).toBe('WEAPON_NOVICE_BLADE');

      const foundById = await itemRepo.findById(item.id);
      expect(foundById?.name).toBe('Novice Blade');

      const foundByCode = await itemRepo.findByCode('WEAPON_NOVICE_BLADE');
      expect(foundByCode?.id).toBe(item.id);
    });

    it('filters items by type and shop status', async () => {
      await itemRepo.create({
        code: 'WEAPON_1',
        name: 'Weapon 1',
        description: 'W1',
        type: 'EQUIPMENT',
        subtype: 'WEAPON',
        rarity: 'COMMON',
        isShopBuyable: true,
      });
      await itemRepo.create({
        code: 'POTION_1',
        name: 'Minor HP Potion',
        description: 'P1',
        type: 'CONSUMABLE',
        subtype: 'HP_POTION',
        rarity: 'COMMON',
        isShopBuyable: true,
      });
      await itemRepo.create({
        code: 'RELIC_SECRET',
        name: 'Secret Relic',
        description: 'S1',
        type: 'EQUIPMENT',
        subtype: 'RELIC',
        rarity: 'SECRET_RARE',
        isShopBuyable: false,
      });

      const shopItems = await itemRepo.findAll({ isShopBuyable: true });
      expect(shopItems).toHaveLength(2);

      const consumables = await itemRepo.findAll({ type: 'CONSUMABLE' });
      expect(consumables).toHaveLength(1);
      expect(consumables[0]?.code).toBe('POTION_1');
    });

    it('updates and deletes an item', async () => {
      const item = await itemRepo.create({
        code: 'ARMOR_TEST',
        name: 'Test Armor',
        description: 'Testing',
        type: 'EQUIPMENT',
        subtype: 'ARMOR',
      });

      const updated = await itemRepo.update(item.id, { name: 'Reinforced Test Armor' });
      expect(updated.name).toBe('Reinforced Test Armor');

      const deleted = await itemRepo.delete(item.id);
      expect(deleted).toBe(true);

      const found = await itemRepo.findById(item.id);
      expect(found).toBeNull();
    });
  });

  describe('UserInventoryItemRepository', () => {
    it('creates and retrieves items by user with slot/state filtering', async () => {
      const invItem = await inventoryRepo.create({
        userId: 'user_123',
        itemId: 'item_blade_1',
        quantity: 1,
        slot: 'NONE',
        state: 'IDLE',
      });

      expect(invItem.id).toBeDefined();
      expect(invItem.userId).toBe('user_123');

      const userItems = await inventoryRepo.findByUser('user_123');
      expect(userItems).toHaveLength(1);
      expect(userItems[0]?.id).toBe(invItem.id);
    });

    it('equips an item to a card and unequips any item occupying that slot', async () => {
      const item1 = await inventoryRepo.create({
        userId: 'user_123',
        itemId: 'item_weapon_1',
      });
      const item2 = await inventoryRepo.create({
        userId: 'user_123',
        itemId: 'item_weapon_2',
      });

      // Equip item 1 to card in WEAPON slot
      const { equippedItem: eq1 } = await inventoryRepo.equipToCard(
        'user_123',
        item1.id,
        'card_999',
        'WEAPON',
      );
      expect(eq1.state).toBe('EQUIPPED');
      expect(eq1.slot).toBe('WEAPON');
      expect(eq1.equippedToCardId).toBe('card_999');

      // Now equip item 2 to the same slot on the same card
      const { equippedItem: eq2, unequippedItem: un1 } = await inventoryRepo.equipToCard(
        'user_123',
        item2.id,
        'card_999',
        'WEAPON',
      );

      expect(eq2.id).toBe(item2.id);
      expect(eq2.state).toBe('EQUIPPED');
      expect(un1).toBeDefined();
      expect(un1?.id).toBe(item1.id);
      expect(un1?.state).toBe('IDLE');
      expect(un1?.slot).toBe('NONE');
      expect(un1?.equippedToCardId).toBeNull();

      // Check equipped on card
      const equippedList = await inventoryRepo.findEquippedByCard('card_999');
      expect(equippedList).toHaveLength(1);
      expect(equippedList[0]?.id).toBe(item2.id);

      // Unequip item 2
      const unequipped2 = await inventoryRepo.unequipFromCard('user_123', item2.id);
      expect(unequipped2.state).toBe('IDLE');
      expect(unequipped2.equippedToCardId).toBeNull();
    });
  });
});
