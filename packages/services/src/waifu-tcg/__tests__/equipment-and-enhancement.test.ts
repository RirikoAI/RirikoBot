import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient } from '@ririko/database';
import type { SqliteDatabaseClient } from '@ririko/database';
import {
  GameItemRepository,
  UserInventoryItemRepository,
  WaifuCardRepository,
  PlayerEnergyRepository,
} from '@ririko/database';
import {
  CANONICAL_ITEMS,
  EnhancementService,
  LoadoutService,
  ConsumableService,
} from '../equipment/index.js';
import type { Combatant } from '../combat/types.js';

describe('Waifu TCG: Equipment, Loadouts, Enhancement & Consumables (STORY-103 / TASK-1031)', () => {
  let client: SqliteDatabaseClient;
  let itemRepo: GameItemRepository;
  let inventoryRepo: UserInventoryItemRepository;
  let cardRepo: WaifuCardRepository;
  let energyRepo: PlayerEnergyRepository;
  let enhancementService: EnhancementService;
  let loadoutService: LoadoutService;
  let consumableService: ConsumableService;

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

      CREATE TABLE waifu_sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        attribution_text TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE waifu_assets (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        source_image_id TEXT NOT NULL,
        character_name TEXT NOT NULL,
        anime_title TEXT NOT NULL,
        image_hash TEXT NOT NULL UNIQUE,
        local_storage_path TEXT,
        discord_cdn_url TEXT,
        is_deleted_by_request INTEGER NOT NULL DEFAULT 0,
        tags TEXT NOT NULL DEFAULT '[]',
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
    `);

    itemRepo = new GameItemRepository(client);
    inventoryRepo = new UserInventoryItemRepository(client);
    cardRepo = new WaifuCardRepository(client);
    energyRepo = new PlayerEnergyRepository(client);

    enhancementService = new EnhancementService(itemRepo, inventoryRepo);
    loadoutService = new LoadoutService(itemRepo, inventoryRepo, cardRepo, enhancementService);
    consumableService = new ConsumableService(itemRepo, inventoryRepo, energyRepo);

    // Seed canonical catalog
    for (const item of CANONICAL_ITEMS) {
      await itemRepo.create(item);
    }
  });

  afterEach(async () => {
    await client.close();
  });

  describe('1. Canonical Catalog Validation', () => {
    it('seeds all 25 canonical items covering all 6 gear slots and consumables', async () => {
      const allItems = await itemRepo.findAll();
      expect(allItems.length).toBe(CANONICAL_ITEMS.length);

      // Verify specific slot items exist
      const katana = await itemRepo.findByCode('WEAPON_OBSIDIAN_KATANA');
      expect(katana?.rarity).toBe('RARE');
      expect(katana?.subtype).toBe('WEAPON');
      expect(katana?.battlePerks).toContain('SHARPENED_EDGE');

      const solarLance = await itemRepo.findByCode('WEAPON_SOLAR_LANCE');
      expect(solarLance?.rarity).toBe('SUPER_RARE');
      expect(solarLance?.battlePerks).toContain('VAMPIRIC_TOUCH');

      const aegis = await itemRepo.findByCode('ARMOR_AEGIS_BARRIER');
      expect(aegis?.subtype).toBe('ARMOR');
      expect(aegis?.battlePerks).toContain('GLACIAL_COUNTER');

      const elixir = await itemRepo.findByCode('POTION_ELIXIR_VITALITY');
      expect(elixir?.type).toBe('CONSUMABLE');
      expect(elixir?.subtype).toBe('HP_POTION');
    });
  });

  describe('2. Enhancement Engine (+0 to +10 & Perk Scaling)', () => {
    it('calculates enhancement costs based on rarity multiplier', () => {
      const commonCost = enhancementService.getEnhancementCost('COMMON', 0);
      expect(commonCost.dustCost).toBe(25);
      expect(commonCost.creditCost).toBe(200);

      const mythicCost = enhancementService.getEnhancementCost('MYTHIC', 4);
      // target level 5: 5 * 25 * 8 = 1000 dust, 5 * 200 * 8 = 8000 credits
      expect(mythicCost.dustCost).toBe(1000);
      expect(mythicCost.creditCost).toBe(8000);
    });

    it('scales stats by +8% per level up to +10', () => {
      const baseStats = { attack: 100, health: 500 };

      const lv1 = enhancementService.getScaledStats(baseStats, 1);
      expect(lv1.attack).toBe(108);
      expect(lv1.health).toBe(540);

      const lv10 = enhancementService.getScaledStats(baseStats, 10);
      expect(lv10.attack).toBe(180); // +80%
      expect(lv10.health).toBe(900);
    });

    it('scales battle perks at +5 and +10 breakpoints', () => {
      const perks = ['VAMPIRIC_TOUCH'];

      const lv4 = enhancementService.getScaledPerks(perks, 4);
      expect(lv4).toEqual(['VAMPIRIC_TOUCH']);

      const lv5 = enhancementService.getScaledPerks(perks, 5);
      expect(lv5).toEqual(['VAMPIRIC_TOUCH_T2']);

      const lv10 = enhancementService.getScaledPerks(perks, 10);
      expect(lv10).toEqual(['VAMPIRIC_TOUCH_T3']);
    });

    it('enhances an equipment piece in database and checks balance', async () => {
      const katanaDef = await itemRepo.findByCode('WEAPON_OBSIDIAN_KATANA');
      expect(katanaDef).toBeDefined();

      const userItem = await inventoryRepo.create({
        userId: 'user_test',
        itemId: katanaDef!.id,
        enhancementLevel: 0,
      });

      const dustDef = await itemRepo.findByCode('CRAFTING_DUST');
      await inventoryRepo.create({ userId: 'user_test', itemId: dustDef!.id, quantity: 10 });

      // Attempt enhance with insufficient dust (10 held, 38 needed)
      await expect(enhancementService.enhance('user_test', userItem.id, 500)).rejects.toThrow(
        /Insufficient Crafting Dust/,
      );

      // Enhance +0 -> +1 (cost: target 1 * 25 * 1.5 = 38 dust, 1 * 200 * 1.5 = 300 credits)
      await inventoryRepo.create({ userId: 'user_test', itemId: dustDef!.id, quantity: 90 });
      const res = await enhancementService.enhance('user_test', userItem.id, 1000);
      expect(res.success).toBe(true);
      expect(res.newLevel).toBe(1);
      expect(res.dustSpent).toBe(38);
      expect(res.creditsSpent).toBe(300);
      expect(res.scaledStats.attack).toBe(119); // 110 * 1.08 = 118.8 -> 119
      expect(await enhancementService.getDustBalance('user_test')).toBe(62); // 100 - 38
    });
  });

  describe('3. 6-Slot Combat Loadouts', () => {
    it('equips items to valid slots and rejects slot mismatch', async () => {
      const userCard = await cardRepo.createUserCard({
        userId: 'user_test',
        cardId: 'card_def_1',
        serialNumber: 1,
        level: 10,
      });

      const bladeDef = await itemRepo.findByCode('WEAPON_NOVICE_BLADE');
      const blade = await inventoryRepo.create({
        userId: 'user_test',
        itemId: bladeDef!.id,
      });

      // Attempt to equip weapon into ARMOR slot -> reject
      await expect(
        loadoutService.equip('user_test', userCard.id, blade.id, 'ARMOR'),
      ).rejects.toThrow(/Slot mismatch/);

      // Equip into WEAPON slot -> success
      const { loadout } = await loadoutService.equip('user_test', userCard.id, blade.id, 'WEAPON');
      expect(loadout.weapon).toBeDefined();
      expect(loadout.weapon?.item.code).toBe('WEAPON_NOVICE_BLADE');
      expect(loadout.aggregateStats.attack).toBe(25);
    });

    it('applies full 6-slot loadout to a Combatant instance for battle', async () => {
      const userCard = await cardRepo.createUserCard({
        userId: 'user_test',
        cardId: 'card_def_2',
        serialNumber: 2,
        level: 25,
      });

      // Equip weapon (Obsidian Katana)
      const katanaDef = await itemRepo.findByCode('WEAPON_OBSIDIAN_KATANA');
      const katana = await inventoryRepo.create({
        userId: 'user_test',
        itemId: katanaDef!.id,
        enhancementLevel: 5, // +5 gives T2 perk
      });
      await loadoutService.equip('user_test', userCard.id, katana.id, 'WEAPON');

      // Equip armor (Dragonscale Plate)
      const armorDef = await itemRepo.findByCode('ARMOR_DRAGONSCALE_PLATE');
      const armor = await inventoryRepo.create({
        userId: 'user_test',
        itemId: armorDef!.id,
        enhancementLevel: 0,
      });
      await loadoutService.equip('user_test', userCard.id, armor.id, 'ARMOR');

      const loadout = await loadoutService.getCardLoadout(userCard.id);
      expect(loadout.weapon).toBeDefined();
      expect(loadout.armor).toBeDefined();
      expect(loadout.activePerks).toContain('SHARPENED_EDGE_T2');
      expect(loadout.activePerks).toContain('VAMPIRIC_TOUCH');

      // Create base combatant
      const combatant: Combatant = {
        id: userCard.id,
        name: 'Test Hero',
        team: 'TEAM_A',
        element: 'FIRE',
        rarity: 'RARE',
        level: 25,
        currentHealth: 1000,
        maxHealth: 1000,
        attack: 100,
        defense: 50,
        speed: 30,
        critRate: 0.05,
        critDamage: 0.5,
        currentMp: 100,
        maxMp: 100,
        skillManaCost: 30,
        shield: 0,
        hasUsedPhoenixWard: false,
        isAlive: true,
        perks: [],
        statusEffects: [],
      };

      loadoutService.applyLoadoutToCombatant(combatant, loadout);

      // Verify stats and perks applied
      expect(combatant.maxHealth).toBe(1800); // 1000 + 800 from armor
      expect(combatant.attack).toBeGreaterThan(100); // base + scaled katana attack
      expect(combatant.defense).toBe(140); // 50 + 90
      expect(combatant.perks).toContain('SHARPENED_EDGE');
      expect(combatant.perks).toContain('VAMPIRIC_TOUCH');
    });
  });

  describe('4. Consumables & Anti-Abuse Daily Potion Ceiling', () => {
    it('restores energy and enforces daily 3/3 potion ceiling', async () => {
      const candyDef = await itemRepo.findByCode('RESTORE_STAMINA_CANDY');
      const candy = await inventoryRepo.create({
        userId: 'summoner_1',
        itemId: candyDef!.id,
        quantity: 5,
      });

      // Consume potion 1
      const res1 = await consumableService.useItem('summoner_1', candy.id);
      expect(res1.success).toBe(true);
      expect(res1.potsUsedToday).toBe(1);

      // Consume potion 2
      const res2 = await consumableService.useItem('summoner_1', candy.id);
      expect(res2.success).toBe(true);
      expect(res2.potsUsedToday).toBe(2);

      // Consume potion 3
      const res3 = await consumableService.useItem('summoner_1', candy.id);
      expect(res3.success).toBe(true);
      expect(res3.potsUsedToday).toBe(3);

      // Consume potion 4 -> Rejection!
      const res4 = await consumableService.useItem('summoner_1', candy.id);
      expect(res4.success).toBe(false);
      expect(res4.reason).toMatch(/Daily stamina potion ceiling reached/);
    });

    it('uses HP potions and Elixir of Full Vitality to heal and cleanse', async () => {
      const elixirDef = await itemRepo.findByCode('POTION_ELIXIR_VITALITY');
      const elixir = await inventoryRepo.create({
        userId: 'summoner_2',
        itemId: elixirDef!.id,
        quantity: 1,
      });

      const woundedHero: Combatant = {
        id: 'hero_1',
        name: 'Wounded Hero',
        team: 'TEAM_A',
        element: 'WATER',
        rarity: 'RARE',
        level: 25,
        currentHealth: 200,
        maxHealth: 1000,
        attack: 100,
        defense: 50,
        speed: 30,
        critRate: 0.05,
        critDamage: 0.5,
        currentMp: 10,
        maxMp: 100,
        skillManaCost: 30,
        shield: 0,
        hasUsedPhoenixWard: false,
        isAlive: true,
        perks: [],
        statusEffects: [{ type: 'BURN', duration: 2, sourceElement: 'FIRE' }],
      };

      const result = await consumableService.useItem('summoner_2', elixir.id, woundedHero);
      expect(result.success).toBe(true);
      expect(result.restoredAmount).toBe(800); // 200 -> 1000
      expect(result.cleansedDebuffs).toBe(true);
      expect(woundedHero.currentHealth).toBe(1000);
      expect(woundedHero.statusEffects).toHaveLength(0); // Cleaned!

      // Item should be deleted from inventory after consuming
      const exists = await inventoryRepo.findById(elixir.id);
      expect(exists).toBeNull();
    });
  });
});
