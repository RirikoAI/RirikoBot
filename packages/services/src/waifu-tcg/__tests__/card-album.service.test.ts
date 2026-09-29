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
  const repo = { listUserAlbum, count: vi.fn(async () => 120) } as unknown as WaifuCardRepository;
  return { repo, listUserAlbum };
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
  it('loads one page for the given user and draws each card with attribution', async () => {
    const { repo, listUserAlbum } = fakeRepo(30, [
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

    const result = await album.page('u1', { page: 2, favoritesOnly: true, rarity: 'SUPER_RARE' });

    expect(listUserAlbum).toHaveBeenCalledWith('u1', {
      favoritesOnly: true,
      rarity: 'SUPER_RARE',
      limit: ALBUM_PAGE_SIZE,
      offset: ALBUM_PAGE_SIZE,
    });
    expect(result).toMatchObject({ page: 2, totalPages: 2, total: 30 });
    expect(result.cards[0]).toMatchObject({
      id: 'uc-1',
      name: 'Card 1',
      rarityName: 'Super Rare (SR)',
      isFavorite: true,
      image: `data:image/png;base64,${Buffer.from('png').toString('base64')}`,
    });
    expect(getCardImage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 'card-1' }),
      null,
      {
        attributionText: 'Art: Danbooru',
        maxCollectionNumber: 120,
      },
    );
    expect(getCardImage).toHaveBeenNthCalledWith(2, expect.anything(), null, {
      attributionText: 'Image source: waifu.im',
      maxCollectionNumber: 120,
    });
  });

  it('moves a page past the end back to the last page', async () => {
    const { repo, listUserAlbum } = fakeRepo(25, [entry(25)]);
    const album = new CardAlbumService({
      cards: repo,
      loadRenderer: async () => ({ getCardImage: async () => Buffer.from('') }),
    });

    const result = await album.page('u1', { page: 9, favoritesOnly: false, rarity: null });

    expect(listUserAlbum).toHaveBeenLastCalledWith('u1', {
      favoritesOnly: false,
      limit: ALBUM_PAGE_SIZE,
      offset: ALBUM_PAGE_SIZE,
    });
    expect(result.page).toBe(2);
    expect(result.query.page).toBe(2);
  });

  it('returns an empty first page without loading the renderer', async () => {
    const { repo } = fakeRepo(0, []);
    const loadRenderer = vi.fn();
    const album = new CardAlbumService({ cards: repo, loadRenderer });

    const result = await album.page('u1', { page: 1, favoritesOnly: false, rarity: null });

    expect(result).toMatchObject({ cards: [], page: 1, totalPages: 1, total: 0 });
    expect(loadRenderer).not.toHaveBeenCalled();
  });

  it('shows a card without an image when drawing fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { repo } = fakeRepo(1, [entry(1)]);
    const album = new CardAlbumService({
      cards: repo,
      loadRenderer: async () => ({
        getCardImage: async () => {
          throw new Error('canvas unavailable');
        },
      }),
    });

    const result = await album.page('u1', { page: 1, favoritesOnly: false, rarity: null });

    expect(result.cards[0]?.image).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
