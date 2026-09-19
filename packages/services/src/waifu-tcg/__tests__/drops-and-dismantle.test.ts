import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createDatabaseClient,
  WaifuCardRepository,
  WaifuAssetRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { DropManager } from '../drops/drop-manager.js';
import { CardDismantleService, CRAFTING_DUST_YIELD } from '../card/dismantle-service.js';
import { CardGenerator } from '../card/card-generator.js';

describe('Waifu Chat Drops & Dismantle Engine (TASK-1012)', () => {
  let client: SqliteDatabaseClient;
  let cardRepo: WaifuCardRepository;
  let assetRepo: WaifuAssetRepository;
  let dropManager: DropManager;
  let dismantleService: CardDismantleService;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    client.raw.exec(`
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
    `);

    cardRepo = new WaifuCardRepository(client);
    assetRepo = new WaifuAssetRepository(client);

    await assetRepo.upsertSource({
      id: 'WAIFU_IM',
      name: 'waifu.im',
      baseUrl: 'https://api.waifu.im',
      attributionText: 'Image source: waifu.im',
      isActive: true,
    });

    await assetRepo.create({
      sourceId: 'WAIFU_IM',
      sourceImageId: 'drop_asset_01',
      characterName: 'Power',
      animeTitle: 'Chainsaw Man',
      imageHash: 'power_blood_devil_hash',
      localStoragePath: '/assets/power.png',
      discordCdnUrl: null,
      tags: ['power', 'blood', 'fire'],
      isDeletedByRequest: false,
    });

    dropManager = new DropManager(cardRepo, assetRepo, new CardGenerator());
    dismantleService = new CardDismantleService(cardRepo);
  });

  afterEach(async () => {
    await client.close();
  });

  describe('Waifu Drop Engine (docs/waifu-tcg.md:L133-144)', () => {
    it('should trigger drop when unique member threshold is reached within active hours', async () => {
      const guildId = 'guild_1';
      const channelId = 'channel_drops';

      dropManager.setGuildConfig(guildId, {
        messageThreshold: 3,
        startHour: 8,
        endHour: 23,
      });

      // 14:00 (active hours)
      const activeTime = new Date('2026-09-19T14:00:00Z');

      // Sender 1
      const drop1 = await dropManager.recordMessage(guildId, channelId, 'user_1', activeTime);
      expect(drop1).toBeNull();

      // Sender 1 again (duplicate sender does not count towards threshold)
      const drop1Again = await dropManager.recordMessage(guildId, channelId, 'user_1', activeTime);
      expect(drop1Again).toBeNull();

      // Sender 2
      const drop2 = await dropManager.recordMessage(guildId, channelId, 'user_2', activeTime);
      expect(drop2).toBeNull();

      // Sender 3 (reaches threshold of 3 unique members)
      const drop3 = await dropManager.recordMessage(guildId, channelId, 'user_3', activeTime);
      expect(drop3).not.toBeNull();
      expect(drop3?.guildId).toBe(guildId);
      expect(drop3?.channelId).toBe(channelId);
      expect(drop3?.card.name).toBe('Power');
      expect(drop3?.serialNumber).toBe(1);
      expect(drop3?.formattedSerial).toBe('#0001/1000');
      expect(drop3?.claimed).toBe(false);
    });

    it('should not spawn drops outside active hours (08:00 - 23:00)', async () => {
      const guildId = 'guild_2';
      const channelId = 'channel_drops';

      dropManager.setGuildConfig(guildId, {
        messageThreshold: 1,
        startHour: 8,
        endHour: 23,
      });

      // 03:00 local time (night hours)
      const nocturnal = new Date('2026-09-19T03:00:00');
      const drop = await dropManager.recordMessage(guildId, channelId, 'user_night', nocturnal);
      expect(drop).toBeNull();
    });

    it('should allow first-come-first-served claim and block double claims', async () => {
      const guildId = 'guild_3';
      const channelId = 'channel_drops';

      const drop = await dropManager.spawnDrop(guildId, channelId);
      expect(drop).not.toBeNull();

      // User A claims first
      const claimResultA = await dropManager.claimDrop(drop!.id, 'user_a');
      expect(claimResultA.success).toBe(true);
      expect(claimResultA.userCard).toBeDefined();
      expect(claimResultA.userCard?.userId).toBe('user_a');
      expect(claimResultA.userCard?.serialNumber).toBe(1);

      // User B tries to claim already claimed drop
      const claimResultB = await dropManager.claimDrop(drop!.id, 'user_b');
      expect(claimResultB.success).toBe(false);
      expect(claimResultB.error).toContain('already been claimed');
    });

    it('should enforce 5-minute anti-sniping cooldown on consecutive drops for same claimant', async () => {
      const guildId = 'guild_4';
      const channelId = 'channel_drops';

      const now = Date.now();

      // First drop
      const drop1 = await dropManager.spawnDrop(guildId, channelId);
      const claim1 = await dropManager.claimDrop(drop1!.id, 'user_sniper', now);
      expect(claim1.success).toBe(true);

      // Second drop spawns 1 minute later
      const drop2 = await dropManager.spawnDrop(guildId, channelId);
      const claim2Sniper = await dropManager.claimDrop(drop2!.id, 'user_sniper', now + 60 * 1000);
      expect(claim2Sniper.success).toBe(false);
      expect(claim2Sniper.error).toContain('Anti-sniping cooldown active');

      // Another user claims second drop without cooldown
      const claim2Other = await dropManager.claimDrop(drop2!.id, 'user_fair', now + 60 * 1000);
      expect(claim2Other.success).toBe(true);
      expect(claim2Other.userCard?.userId).toBe('user_fair');
    });

    it('should reject claim if 60-second claim window has expired', async () => {
      const guildId = 'guild_5';
      const channelId = 'channel_drops';

      const now = Date.now();
      const drop = await dropManager.spawnDrop(guildId, channelId);

      // 61 seconds later
      const claimResult = await dropManager.claimDrop(drop!.id, 'user_late', now + 61 * 1000);
      expect(claimResult.success).toBe(false);
      expect(claimResult.error).toContain('expired');
    });
  });

  describe('Card Dismantling Engine (docs/waifu-tcg.md:L166)', () => {
    it('should dismantle idle card into crafting dust scaled by rarity', async () => {
      const card = await cardRepo.create({
        assetId: 'drop_asset_01',
        name: 'Power',
        rarity: 'RARE',
        element: 'FIRE',
        attack: 500,
        defense: 300,
        speed: 100,
        health: 2000,
        collectionNumber: 1,
      });

      const userCard = await cardRepo.createUserCard({
        userId: 'user_craft',
        cardId: card.id,
        serialNumber: 1,
        state: 'IDLE',
        isFavorite: false,
      });

      const result = await dismantleService.dismantleCard('user_craft', userCard.id);
      expect(result.success).toBe(true);
      expect(result.dustAwarded).toBe(CRAFTING_DUST_YIELD.RARE); // 75
      expect(result.cardName).toBe('Power');

      // Card must be deleted from user collection
      const check = await cardRepo.findUserCardById(userCard.id);
      expect(check).toBeNull();
    });

    it('should protect favorite cards from dismantling', async () => {
      const card = await cardRepo.create({
        assetId: 'drop_asset_01',
        name: 'Power Fav',
        rarity: 'MYTHIC',
        element: 'FIRE',
        attack: 2000,
        defense: 1200,
        speed: 250,
        health: 10000,
        collectionNumber: 1,
      });

      const userCard = await cardRepo.createUserCard({
        userId: 'user_craft',
        cardId: card.id,
        serialNumber: 1,
        state: 'IDLE',
        isFavorite: true,
      });

      const result = await dismantleService.dismantleCard('user_craft', userCard.id);
      expect(result.success).toBe(false);
      expect(result.error).toContain('favorite');

      // Card must still exist
      const check = await cardRepo.findUserCardById(userCard.id);
      expect(check).not.toBeNull();
    });

    it('should protect non-IDLE cards (e.g. EQUIPPED) from dismantling', async () => {
      const card = await cardRepo.create({
        assetId: 'drop_asset_01',
        name: 'Power Deck',
        rarity: 'COMMON',
        element: 'FIRE',
        attack: 200,
        defense: 100,
        speed: 50,
        health: 1000,
        collectionNumber: 1,
      });

      const userCard = await cardRepo.createUserCard({
        userId: 'user_craft',
        cardId: card.id,
        serialNumber: 1,
        state: 'EQUIPPED',
        isFavorite: false,
      });

      const result = await dismantleService.dismantleCard('user_craft', userCard.id);
      expect(result.success).toBe(false);
      expect(result.error).toContain('EQUIPPED');
    });
  });
});
