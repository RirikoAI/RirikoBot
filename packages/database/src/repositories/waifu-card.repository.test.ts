import { randomUUID } from 'node:crypto';
import { it, expect, beforeEach } from 'vitest';
import { describeDialects } from '../testing/dialects.js';
import { WaifuAssetRepository } from './waifu-asset.repository.js';
import { WaifuCardRepository } from './waifu-card.repository.js';

// Postgres ids are uuids, so every fixture id is one.
const id = {
  rias: randomUUID(),
  asset01: randomUUID(),
  asset02: randomUUID(),
  asset03: randomUUID(),
  asset04: randomUUID(),
  missingAsset: randomUUID(),
  deletedDefinition: randomUUID(),
  missing: randomUUID(),
};

describeDialects('WaifuCardRepository (Dual-Dialect)', (db) => {
  let repo: WaifuCardRepository;

  beforeEach(() => {
    repo = new WaifuCardRepository(db.client);
  });

  /** Seeds the waifu.im source and one Aqua asset, returning the asset id. */
  async function seedAqua(): Promise<string> {
    const assets = new WaifuAssetRepository(db.client);
    await assets.createSource({
      id: 'src',
      name: 'waifu.im',
      baseUrl: 'https://api.waifu.im',
      attributionText: 'Image source: waifu.im',
    });
    const asset = await assets.create({
      sourceId: 'src',
      sourceImageId: '1',
      characterName: 'Aqua',
      animeTitle: 'Konosuba',
      imageHash: 'hash_a',
    });
    return asset.id;
  }

  it('should create and retrieve a waifu card definition', async () => {
    const card = await repo.create({
      assetId: id.rias,
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

    const byAsset = await repo.findByAssetId(id.rias);
    expect(byAsset).not.toBeNull();
    expect(byAsset?.id).toBe(card.id);
  });

  it('should list cards filtered by rarity and element', async () => {
    await repo.create({
      assetId: id.asset01,
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
      assetId: id.asset02,
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
      assetId: id.asset03,
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
      assetId: id.asset04,
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

    // Battles won increment
    const won1 = await repo.incrementUserCardBattlesWon(userCard.id, 1);
    expect(won1?.battlesWon).toBe(1);

    const won2 = await repo.incrementUserCardBattlesWon(userCard.id, 3);
    expect(won2?.battlesWon).toBe(4);

    // Dismantle / delete
    const deleted = await repo.deleteUserCard(userCard.id);
    expect(deleted).toBe(true);

    const check = await repo.findUserCardById(userCard.id);
    expect(check).toBeNull();
  });

  it('lists one album page with definitions, assets and sources, filtered and counted', async () => {
    const assetA = await seedAqua();
    const aqua = await repo.create({
      assetId: assetA,
      name: 'Aqua',
      rarity: 'RARE',
      element: 'WATER',
      attack: 100,
      defense: 100,
      speed: 100,
      health: 1000,
      collectionNumber: 1,
    });
    const orphanArt = await repo.create({
      assetId: id.missingAsset,
      name: 'Darkness',
      rarity: 'COMMON',
      element: 'EARTH',
      attack: 100,
      defense: 100,
      speed: 100,
      health: 1000,
      collectionNumber: 2,
    });
    const mint = (cardId: string, serialNumber: number, isFavorite: boolean, userId = 'u1') =>
      repo.createUserCard({
        userId,
        cardId,
        serialNumber,
        isFavorite,
        obtainedAt: new Date(1_000 * serialNumber),
      });
    await mint(aqua.id, 1, false);
    await mint(aqua.id, 2, true);
    await mint(orphanArt.id, 3, false);
    await mint(aqua.id, 4, false, 'someone-else');
    await mint(id.deletedDefinition, 5, false);

    const all = await repo.listUserAlbum('u1', { limit: 2, offset: 0 });
    expect(all.total).toBe(3);
    expect(all.entries.map((e) => e.userCard.serialNumber)).toEqual([3, 2]);
    expect(all.entries[0]?.card.name).toBe('Darkness');
    expect(all.entries[0]?.asset).toBeNull();
    expect(all.entries[1]?.asset?.animeTitle).toBe('Konosuba');
    expect(all.entries[1]?.source?.attributionText).toBe('Image source: waifu.im');

    const second = await repo.listUserAlbum('u1', { limit: 2, offset: 2 });
    expect(second.entries.map((e) => e.userCard.serialNumber)).toEqual([1]);

    const favorites = await repo.listUserAlbum('u1', { favoritesOnly: true, limit: 10, offset: 0 });
    expect(favorites.total).toBe(1);
    expect(favorites.entries[0]?.userCard.serialNumber).toBe(2);

    const commons = await repo.listUserAlbum('u1', { rarity: 'COMMON', limit: 10, offset: 0 });
    expect(commons.total).toBe(1);
    expect(commons.entries[0]?.card.id).toBe(orphanArt.id);
  });

  it('finds one album entry only for the user who owns the card', async () => {
    const assetA = await seedAqua();
    const aqua = await repo.create({
      assetId: assetA,
      name: 'Aqua',
      rarity: 'RARE',
      element: 'WATER',
      attack: 100,
      defense: 100,
      speed: 100,
      health: 1000,
      collectionNumber: 1,
    });
    const owned = await repo.createUserCard({ userId: 'u1', cardId: aqua.id, serialNumber: 1 });
    const orphan = await repo.createUserCard({
      userId: 'u1',
      cardId: id.deletedDefinition,
      serialNumber: 2,
    });

    const entry = await repo.findUserAlbumEntry('u1', owned.id);
    expect(entry?.userCard.id).toBe(owned.id);
    expect(entry?.card.name).toBe('Aqua');
    expect(entry?.asset?.animeTitle).toBe('Konosuba');
    expect(entry?.source?.attributionText).toBe('Image source: waifu.im');

    expect(await repo.findUserAlbumEntry('someone-else', owned.id)).toBeNull();
    expect(await repo.findUserAlbumEntry('u1', orphan.id)).toBeNull();
    expect(await repo.findUserAlbumEntry('u1', id.missing)).toBeNull();
  });
});
