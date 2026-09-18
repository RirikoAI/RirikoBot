import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { SqliteDatabaseClient } from '../client/types.js';
import { WaifuCardRepository } from './waifu-card.repository.js';

describe('WaifuCardRepository (Dual-Dialect)', () => {
  let client: SqliteDatabaseClient;
  let repo: WaifuCardRepository;

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
        state TEXT NOT NULL DEFAULT 'IDLE',
        is_favorite INTEGER NOT NULL DEFAULT 0,
        obtained_at INTEGER NOT NULL
      );
    `);

    repo = new WaifuCardRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it('should create and retrieve a waifu card definition', async () => {
    const card = await repo.create({
      assetId: 'asset_rias_01',
      name: 'Rias Gremory',
      rarity: 'MYTHIC',
      element: 'FIRE',
      attack: 1800,
      defense: 1200,
      speed: 210,
      health: 9500,
      critRate: 0.25,
      skillName: 'Extinction Ray',
      skillDescription: 'Deals 250% Fire damage to all enemies.',
      passiveName: 'Crimson Ruin',
      passiveDescription: '+20% Fire ATK when below 50% HP.',
      collectionNumber: 1,
      isActive: true,
    });

    expect(card.id).toBeDefined();
    expect(card.name).toBe('Rias Gremory');
    expect(card.rarity).toBe('MYTHIC');

    const found = await repo.findById(card.id);
    expect(found).not.toBeNull();
    expect(found?.name).toBe('Rias Gremory');
    expect(found?.critRate).toBeCloseTo(0.25);

    const byAsset = await repo.findByAssetId('asset_rias_01');
    expect(byAsset).not.toBeNull();
    expect(byAsset?.id).toBe(card.id);
  });

  it('should list cards filtered by rarity and element', async () => {
    await repo.create({
      assetId: 'asset_01',
      name: 'Card Fire SR',
      rarity: 'SUPER_RARE',
      element: 'FIRE',
      attack: 800,
      defense: 600,
      speed: 120,
      health: 3000,
      collectionNumber: 1,
    });
    await repo.create({
      assetId: 'asset_02',
      name: 'Card Ice R',
      rarity: 'RARE',
      element: 'ICE',
      attack: 500,
      defense: 400,
      speed: 100,
      health: 2000,
      collectionNumber: 2,
    });

    const fireCards = await repo.listCards({ element: 'FIRE' });
    expect(fireCards).toHaveLength(1);
    expect(fireCards[0]?.name).toBe('Card Fire SR');

    const rareCards = await repo.listCards({ rarity: 'RARE' });
    expect(rareCards).toHaveLength(1);
    expect(rareCards[0]?.name).toBe('Card Ice R');

    const totalCount = await repo.countCards();
    expect(totalCount).toBe(2);
  });

  it('should create user card instances with serial numbers and query by user', async () => {
    const card = await repo.create({
      assetId: 'asset_03',
      name: 'Megumin',
      rarity: 'ULTRA_RARE',
      element: 'FIRE',
      attack: 1200,
      defense: 400,
      speed: 150,
      health: 4000,
      collectionNumber: 3,
    });

    const userCard1 = await repo.createUserCard({
      userId: 'user_123',
      cardId: card.id,
      serialNumber: 1,
      level: 1,
      exp: 0,
      state: 'IDLE',
      isFavorite: false,
    });

    const userCard2 = await repo.createUserCard({
      userId: 'user_123',
      cardId: card.id,
      serialNumber: 2,
      level: 5,
      exp: 350,
      state: 'EQUIPPED',
      isFavorite: true,
    });

    expect(userCard1.serialNumber).toBe(1);
    expect(userCard2.serialNumber).toBe(2);

    const highestSerial = await repo.getHighestSerialNumber(card.id);
    expect(highestSerial).toBe(2);

    const userCards = await repo.listUserCards('user_123');
    expect(userCards).toHaveLength(2);

    const equippedCards = await repo.listUserCards('user_123', { state: 'EQUIPPED' });
    expect(equippedCards).toHaveLength(1);
    expect(equippedCards[0]?.id).toBe(userCard2.id);

    const favorites = await repo.listUserCards('user_123', { isFavorite: true });
    expect(favorites).toHaveLength(1);
    expect(favorites[0]?.id).toBe(userCard2.id);
  });

  it('should update level, exp, state, favorite, and delete user card', async () => {
    const card = await repo.create({
      assetId: 'asset_04',
      name: 'Esdeath',
      rarity: 'SECRET_RARE',
      element: 'ICE',
      attack: 1600,
      defense: 900,
      speed: 180,
      health: 6500,
      collectionNumber: 4,
    });

    const userCard = await repo.createUserCard({
      userId: 'user_456',
      cardId: card.id,
      serialNumber: 1,
      level: 1,
      exp: 0,
    });

    // Level up
    const leveled = await repo.updateUserCardLevelAndExp(userCard.id, 10, 450);
    expect(leveled?.level).toBe(10);
    expect(leveled?.exp).toBe(450);

    // State change (e.g. IN_TRADE)
    const traded = await repo.updateUserCardState(userCard.id, 'IN_TRADE');
    expect(traded?.state).toBe('IN_TRADE');

    // Toggle favorite
    const fav = await repo.toggleUserCardFavorite(userCard.id, true);
    expect(fav?.isFavorite).toBe(true);

    // Dismantle / delete
    const deleted = await repo.deleteUserCard(userCard.id);
    expect(deleted).toBe(true);

    const check = await repo.findUserCardById(userCard.id);
    expect(check).toBeNull();
  });
});
