import { describe, expect, it, vi } from 'vitest';
import type { UserAlbumEntry, WaifuCardRepository } from '@ririko/database';
import {
  ALBUM_PAGE_SIZE,
  CardAlbumService,
  parseAlbumQuery,
  type CardRenderer,
} from '../album/card-album.service.js';

function entry(n: number, overrides: { source?: UserAlbumEntry['source'] } = {}): UserAlbumEntry {
  return {
    userCard: {
      id: `uc-${n}`,
      userId: 'u1',
      cardId: `card-${n}`,
      serialNumber: n,
      level: 3,
      exp: 0,
      battlesWon: 0,
      state: 'IDLE',
      isFavorite: n === 1,
      obtainedAt: new Date(0),
    },
    card: {
      id: `card-${n}`,
      assetId: `asset-${n}`,
      name: `Card ${n}`,
      rarity: 'SUPER_RARE',
      element: 'ICE',
      attack: 1,
      defense: 1,
      speed: 1,
      health: 1,
      critRate: 0.05,
      skillName: null,
      skillDescription: null,
      passiveName: null,
      passiveDescription: null,
      collectionNumber: n,
      isActive: true,
    },
    asset: null,
    source: overrides.source ?? null,
  };
}

function fakeRepo(total: number, entries: UserAlbumEntry[]) {
  const listUserAlbum = vi.fn(async () => ({ total, entries }));
  // Like the repository: only the owner's own card is found.
  const findUserAlbumEntry = vi.fn(
    async (userId: string, userCardId: string) =>
      entries.find((e) => e.userCard.userId === userId && e.userCard.id === userCardId) ?? null,
  );
  const repo = {
    listUserAlbum,
    findUserAlbumEntry,
    count: vi.fn(async () => 120),
  } as unknown as WaifuCardRepository;
  return { repo, listUserAlbum, findUserAlbumEntry };
}

describe('parseAlbumQuery', () => {
  it('reads page, favourites and a known rarity', () => {
    expect(parseAlbumQuery({ page: '3', favorites: '1', rarity: 'MYTHIC' })).toEqual({
      page: 3,
      favoritesOnly: true,
      rarity: 'MYTHIC',
    });
  });

  it('falls back to defaults for missing or invalid values', () => {
    expect(parseAlbumQuery({ page: '-2', favorites: 'yes', rarity: 'LEGENDARY' })).toEqual({
      page: 1,
      favoritesOnly: false,
      rarity: null,
    });
    expect(parseAlbumQuery({ page: ['2', '9'] }).page).toBe(2);
    expect(parseAlbumQuery({}).page).toBe(1);
  });
});

describe('CardAlbumService', () => {
  it('lists one page for the given user without drawing any card', async () => {
    const { repo, listUserAlbum } = fakeRepo(30, [entry(1), entry(2)]);
    const loadRenderer = vi.fn();
    const album = new CardAlbumService({ cards: repo, loadRenderer });

    const result = await album.page('u1', { page: 2, favoritesOnly: true, rarity: 'SUPER_RARE' });

    expect(listUserAlbum).toHaveBeenCalledWith('u1', {
      favoritesOnly: true,
      rarity: 'SUPER_RARE',
      limit: ALBUM_PAGE_SIZE,
      offset: ALBUM_PAGE_SIZE,
    });
    expect(result).toMatchObject({ page: 2, totalPages: 2, total: 30 });
    expect(result.cards[0]).toEqual({
      id: 'uc-1',
      name: 'Card 1',
      rarity: 'SUPER_RARE',
      rarityName: 'Super Rare (SR)',
      element: 'ICE',
      level: 3,
      serialNumber: 1,
      collectionNumber: 1,
      isFavorite: true,
      state: 'IDLE',
    });
    expect(loadRenderer).not.toHaveBeenCalled();
  });

  it('moves a page past the end back to the last page', async () => {
    const { repo, listUserAlbum } = fakeRepo(25, [entry(25)]);
    const album = new CardAlbumService({ cards: repo });

    const result = await album.page('u1', { page: 9, favoritesOnly: false, rarity: null });

    expect(listUserAlbum).toHaveBeenLastCalledWith('u1', {
      favoritesOnly: false,
      limit: ALBUM_PAGE_SIZE,
      offset: ALBUM_PAGE_SIZE,
    });
    expect(result.page).toBe(2);
    expect(result.query.page).toBe(2);
  });

  it('returns an empty first page', async () => {
    const { repo } = fakeRepo(0, []);
    const album = new CardAlbumService({ cards: repo });

    const result = await album.page('u1', { page: 1, favoritesOnly: false, rarity: null });

    expect(result).toMatchObject({ cards: [], page: 1, totalPages: 1, total: 0 });
  });

  it("draws the owner's card with its attribution and collection size", async () => {
    const { repo, findUserAlbumEntry } = fakeRepo(2, [
      entry(1, {
        source: {
          id: 's',
          name: 'n',
          baseUrl: 'u',
          attributionText: 'Art: Danbooru',
          isActive: true,
        },
      }),
      entry(2),
    ]);
    const getCardImage = vi.fn(async () => Buffer.from('png'));
    const album = new CardAlbumService({
      cards: repo,
      loadRenderer: async () => ({ getCardImage }) satisfies CardRenderer,
    });

    expect(await album.cardImage('u1', 'uc-1')).toEqual(Buffer.from('png'));
    expect(await album.cardImage('u1', 'uc-2')).toEqual(Buffer.from('png'));

    expect(findUserAlbumEntry).toHaveBeenCalledWith('u1', 'uc-1');
    expect(getCardImage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 'card-1' }),
      null,
      { attributionText: 'Art: Danbooru', maxCollectionNumber: 120 },
    );
    expect(getCardImage).toHaveBeenNthCalledWith(2, expect.anything(), null, {
      attributionText: 'Image source: waifu.im',
      maxCollectionNumber: 120,
    });
  });

  it("returns null for another user's card without loading the renderer", async () => {
    const { repo } = fakeRepo(1, [entry(1)]);
    const loadRenderer = vi.fn();
    const album = new CardAlbumService({ cards: repo, loadRenderer });

    expect(await album.cardImage('intruder', 'uc-1')).toBeNull();
    expect(await album.cardImage('u1', 'uc-missing')).toBeNull();
    expect(loadRenderer).not.toHaveBeenCalled();
  });

  it('rejects when the card cannot be drawn, and draws the next card anyway', async () => {
    const { repo } = fakeRepo(2, [entry(1), entry(2)]);
    const getCardImage = vi.fn(async (card: { id: string }) => {
      if (card.id === 'card-1') throw new Error('canvas unavailable');
      return Buffer.from('png');
    });
    const album = new CardAlbumService({
      cards: repo,
      loadRenderer: async () => ({ getCardImage }),
    });

    const [failed, drawn] = await Promise.allSettled([
      album.cardImage('u1', 'uc-1'),
      album.cardImage('u1', 'uc-2'),
    ]);

    expect(failed).toMatchObject({ status: 'rejected', reason: new Error('canvas unavailable') });
    expect(drawn).toEqual({ status: 'fulfilled', value: Buffer.from('png') });
  });

  it("draws one user's cards one at a time", async () => {
    const { repo } = fakeRepo(3, [entry(1), entry(2), entry(3)]);
    let drawing = 0;
    let mostAtOnce = 0;
    const getCardImage = vi.fn(async () => {
      drawing += 1;
      mostAtOnce = Math.max(mostAtOnce, drawing);
      await new Promise((resolve) => setTimeout(resolve, 5));
      drawing -= 1;
      return Buffer.from('png');
    });
    const album = new CardAlbumService({
      cards: repo,
      loadRenderer: async () => ({ getCardImage }),
    });

    await Promise.all(['uc-1', 'uc-2', 'uc-3'].map((id) => album.cardImage('u1', id)));

    expect(getCardImage).toHaveBeenCalledTimes(3);
    expect(mostAtOnce).toBe(1);
  });
});
