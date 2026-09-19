import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createDatabaseClient,
  GameItemRepository,
  UserInventoryItemRepository,
  UserDungeonProgressRepository,
  WaifuCardRepository,
} from '@ririko/database';
import type { SqliteDatabaseClient } from '@ririko/database';
import { CANONICAL_ITEMS } from '../equipment/catalog.js';
import { ItemGrantService } from '../equipment/item-grant.service.js';
import { EnhancementService } from '../equipment/enhancement-service.js';
import { LoadoutService } from '../equipment/loadout-service.js';
import { DungeonLootService } from '../dungeon/dungeon-loot.service.js';
import { TutorialService } from '../dungeon/tutorial-service.js';

describe('Catalog item grants (BUG-0010)', () => {
  let client: SqliteDatabaseClient;
  let itemRepo: GameItemRepository;
  let inventoryRepo: UserInventoryItemRepository;
  let grants: ItemGrantService;

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
    for (const item of CANONICAL_ITEMS) await itemRepo.create(item);
    grants = new ItemGrantService(itemRepo, inventoryRepo);
  });

  afterEach(async () => {
    await client.close();
  });

  async function catalogId(code: string): Promise<string> {
    const item = await itemRepo.findByCode(code);
    if (!item) throw new Error(`missing ${code}`);
    return item.id;
  }

  describe('ItemGrantService', () => {
    it('stacks consumables into one IDLE row', async () => {
      await grants.grant('u1', 'POTION_MINOR_HP', 2, 'TEST');
      await grants.grant('u1', 'POTION_MINOR_HP', 3, 'TEST');

      const rows = await inventoryRepo.findByUser('u1');
      expect(rows).toHaveLength(1);
      expect(rows[0]!.itemId).toBe(await catalogId('POTION_MINOR_HP'));
      expect(rows[0]!.quantity).toBe(5);
    });

    it('creates one row per equipment instance', async () => {
      const result = await grants.grant('u1', 'WEAPON_NOVICE_BLADE', 2, 'TEST');
      expect(result?.inventoryItems).toHaveLength(2);
      const rows = await inventoryRepo.findByUser('u1');
      expect(rows.map((r) => r.quantity)).toEqual([1, 1]);
      expect(rows.every((r) => r.slot === 'NONE' && r.state === 'IDLE')).toBe(true);
    });

    it('resolves legacy aliases and returns null for unknown keys', async () => {
      const legacy = await grants.grant('u1', 'potion_hp_minor', 1, 'TEST');
      expect(legacy?.item.code).toBe('POTION_MINOR_HP');
      expect(await grants.grant('u1', 'crafting_dust', 500, 'TEST')).toBeNull();
    });

    it('repairs legacy inventory rows once', async () => {
      await inventoryRepo.create({
        userId: 'u1',
        itemId: 'item_novice_blade',
        slot: 'WEAPON',
        state: 'IDLE',
        obtainedFrom: 'TUTORIAL',
      });
      await inventoryRepo.create({
        userId: 'u1',
        itemId: 'weap_iron_greatsword',
        slot: 'WEAPON',
        state: 'IDLE',
        obtainedFrom: 'DUNGEON',
      });
      await inventoryRepo.create({
        userId: 'u1',
        itemId: 'item_summon_ticket',
        slot: 'CONSUMABLE',
        state: 'IDLE',
        obtainedFrom: 'DUNGEON',
      });

      expect(await grants.repairLegacyInventoryRows()).toBe(2);
      expect(await grants.repairLegacyInventoryRows()).toBe(0);

      const itemIds = (await inventoryRepo.findByUser('u1')).map((r) => r.itemId).sort();
      expect(itemIds).toEqual(
        [
          await catalogId('WEAPON_NOVICE_BLADE'),
          await catalogId('WEAPON_OBSIDIAN_KATANA'),
          'item_summon_ticket',
        ].sort(),
      );
    });
  });

  describe('DungeonLootService', () => {
    it('grants the F10 first-clear weapon as a real catalog item', async () => {
      const loot = new DungeonLootService({ itemRepo, inventoryRepo });
      const result = await loot.generateAndDispatchLoot('u1', 10, true);

      expect(result.items).toEqual([
        {
          code: 'WEAPON_OBSIDIAN_KATANA',
          name: 'Obsidian Katana',
          type: 'EQUIPMENT',
          rarity: 'RARE',
          quantity: 1,
        },
      ]);
      const rows = await inventoryRepo.findByUser('u1');
      expect(rows.map((r) => r.itemId)).toEqual([await catalogId('WEAPON_OBSIDIAN_KATANA')]);
    });

    it('stacks repeat-clear potion drops', async () => {
      const loot = new DungeonLootService({ itemRepo, inventoryRepo, rng: () => 0 });
      await loot.generateAndDispatchLoot('u1', 3, false);
      await loot.generateAndDispatchLoot('u1', 3, false);

      const rows = await inventoryRepo.findByUser('u1');
      expect(rows).toHaveLength(1);
      expect(rows[0]!.quantity).toBe(2);
    });
  });

  describe('TutorialService.completeTutorial', () => {
    it('grants the Novice Blade equipped on the starter card plus 3 potions', async () => {
      const cardRepo = new WaifuCardRepository(client);
      const progressRepo = new UserDungeonProgressRepository(client);
      const starter = await cardRepo.createUserCard({
        userId: 'u1',
        cardId: 'card_x',
        serialNumber: 1,
        state: 'EQUIPPED',
      });
      const tutorial = new TutorialService(progressRepo, { cardRepo, inventoryRepo, itemRepo });

      const result = await tutorial.completeTutorial('u1');
      expect(result.isFirstCompletion).toBe(true);
      expect(result.equipmentGranted).toBe('Novice Blade (+25 ATK), equipped');
      expect(result.consumablesGranted).toBe('3x Minor HP Potion');

      const loadout = await new LoadoutService(
        itemRepo,
        inventoryRepo,
        cardRepo,
        new EnhancementService(itemRepo, inventoryRepo),
      ).getCardLoadout(starter.id);
      expect(loadout.aggregateStats.attack).toBe(25);

      const potionId = await catalogId('POTION_MINOR_HP');
      const potions = (await inventoryRepo.findByUser('u1', { state: 'IDLE' })).find(
        (r) => r.itemId === potionId,
      );
      expect(potions?.quantity).toBe(3);
    });

    it('leaves an occupied weapon slot alone', async () => {
      const cardRepo = new WaifuCardRepository(client);
      const progressRepo = new UserDungeonProgressRepository(client);
      const starter = await cardRepo.createUserCard({
        userId: 'u1',
        cardId: 'card_x',
        serialNumber: 1,
        state: 'EQUIPPED',
      });
      const katana = await grants.grant('u1', 'WEAPON_OBSIDIAN_KATANA', 1, 'TEST');
      await inventoryRepo.equipToCard('u1', katana!.inventoryItems[0]!.id, starter.id, 'WEAPON');

      const tutorial = new TutorialService(progressRepo, { cardRepo, inventoryRepo, itemRepo });
      const result = await tutorial.completeTutorial('u1');

      expect(result.equipmentGranted).toBe('Novice Blade (+25 ATK)');
      const weapon = await inventoryRepo.findCardSlot(starter.id, 'WEAPON');
      expect(weapon?.itemId).toBe(await catalogId('WEAPON_OBSIDIAN_KATANA'));
    });
  });
});
