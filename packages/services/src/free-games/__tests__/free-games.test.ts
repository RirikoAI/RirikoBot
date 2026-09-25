import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EpicGamesProvider } from '../providers/epic.provider.js';
import { SteamFreeGamesProvider } from '../providers/steam.provider.js';
import { FreeGamesEngine } from '../engine.js';
import type { FreeGameRepository } from '@ririko/database';
import type { FreeGameItem } from '../types.js';

describe('EpicGamesProvider', () => {
  it('parses active and upcoming free games from Epic promotions API', async () => {
    const mockPayload = {
      data: {
        Catalog: {
          searchStore: {
            elements: [
              {
                id: 'game-1',
                title: 'Test Free Game',
                productSlug: 'test-free-game',
                keyImages: [{ type: 'OfferImageWide', url: 'https://example.com/epic-image.jpg' }],
                price: {
                  totalPrice: {
                    fmtPrice: { originalPrice: '$29.99' },
                  },
                },
                promotions: {
                  promotionalOffers: [
                    {
                      promotionalOffers: [
                        {
                          startDate: '2026-09-17T00:00:00.000Z',
                          endDate: '2026-09-24T00:00:00.000Z',
                          discountSetting: { discountPercentage: 0 },
                        },
                      ],
                    },
                  ],
                },
              },
              {
                id: 'game-2',
                title: 'Upcoming Game',
                urlSlug: 'upcoming-game',
                keyImages: [],
                promotions: {
                  upcomingPromotionalOffers: [
                    {
                      promotionalOffers: [
                        {
                          startDate: '2026-09-24T00:00:00.000Z',
                          endDate: '2026-10-01T00:00:00.000Z',
                          discountSetting: { discountPercentage: 0 },
                        },
                      ],
                    },
                  ],
                },
              },
              {
                id: 'game-3',
                title: 'Discounted But Not Free Game',
                promotions: {
                  promotionalOffers: [
                    {
                      promotionalOffers: [
                        {
                          startDate: '2026-09-17T00:00:00.000Z',
                          discountSetting: { discountPercentage: 50 },
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPayload,
    } as Response);

    const provider = new EpicGamesProvider({ fetchFn: mockFetch as any });
    const games = await provider.fetchFreeGames();

    expect(games).toHaveLength(2);

    expect(games[0]).toMatchObject({
      id: 'epic-game-1',
      provider: 'EPIC',
      title: 'Test Free Game',
      storeUrl: 'https://store.epicgames.com/p/test-free-game',
      thumbnailUrl: 'https://example.com/epic-image.jpg',
      originalPrice: '$29.99',
      isUpcoming: false,
    });

    expect(games[1]).toMatchObject({
      id: 'epic-game-2',
      provider: 'EPIC',
      title: 'Upcoming Game (Coming Soon)',
      storeUrl: 'https://store.epicgames.com/p/upcoming-game',
      isUpcoming: true,
    });
  });

  it('handles HTTP error gracefully without throwing', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    const provider = new EpicGamesProvider({ fetchFn: mockFetch as any });
    const games = await provider.fetchFreeGames();

    expect(games).toEqual([]);
  });
});

describe('SteamFreeGamesProvider', () => {
  it('parses 100% discount specials from Steam featured categories', async () => {
    const mockPayload = {
      specials: {
        id: 'cat_specials',
        name: 'Specials',
        items: [
          {
            id: 123456,
            name: 'Awesome Free Indie Game',
            discount_percent: 100,
            original_price: 1999,
            final_price: 0,
            currency: 'USD',
            header_image: 'https://example.com/steam-header.jpg',
            discount_expiration: 1789800000,
          },
          {
            id: 999999,
            name: 'Half Price Game',
            discount_percent: 50,
            original_price: 5999,
            final_price: 2999,
            currency: 'USD',
          },
        ],
      },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPayload,
    } as Response);

    const provider = new SteamFreeGamesProvider({ fetchFn: mockFetch as any });
    const games = await provider.fetchFreeGames();

    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({
      id: 'steam-123456',
      provider: 'STEAM',
      title: 'Awesome Free Indie Game',
      storeUrl: 'https://store.steampowered.com/app/123456/',
      thumbnailUrl: 'https://example.com/steam-header.jpg',
      originalPrice: '19.99 USD',
      isUpcoming: false,
    });
  });

  it('handles fetch failures safely', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const provider = new SteamFreeGamesProvider({ fetchFn: mockFetch as any });
    const games = await provider.fetchFreeGames();
    expect(games).toEqual([]);
  });
});

describe('FreeGamesEngine', () => {
  let mockRepo: Partial<FreeGameRepository>;
  let mockProvider: {
    id: 'EPIC';
    name: 'Epic Games';
    fetchFreeGames: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockRepo = {
      upsertFreeGame: vi.fn().mockResolvedValue({} as any),
      isGameAnnounced: vi.fn().mockResolvedValue(false),
      recordAnnouncement: vi.fn().mockResolvedValue({} as any),
    };

    mockProvider = {
      id: 'EPIC',
      name: 'Epic Games',
      fetchFreeGames: vi.fn(),
    };
  });

  it('polls free games and upserts active games to repository', async () => {
    const sampleGame: FreeGameItem = {
      id: 'epic-free-1',
      provider: 'EPIC',
      title: 'Free Title',
      storeUrl: 'https://example.com',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      startDate: new Date('2026-09-17T00:00:00.000Z'),
      endDate: new Date('2026-09-24T00:00:00.000Z'),
      isUpcoming: false,
    };

    mockProvider.fetchFreeGames.mockResolvedValue([sampleGame]);

    const engine = new FreeGamesEngine(mockRepo as FreeGameRepository, {
      providers: [mockProvider as any],
    });

    const games = await engine.pollFreeGames();

    expect(games).toHaveLength(1);
    expect(mockRepo.upsertFreeGame).toHaveBeenCalledWith({
      id: 'epic-free-1',
      provider: 'EPIC',
      title: 'Free Title',
      storeUrl: 'https://example.com',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      startDate: sampleGame.startDate,
      endDate: sampleGame.endDate,
    });
  });

  it('announces new free games to subscribed guilds without duplicates', async () => {
    const sampleGame: FreeGameItem = {
      id: 'epic-free-1',
      provider: 'EPIC',
      title: 'Free Title',
      storeUrl: 'https://example.com',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      startDate: new Date('2026-09-17T00:00:00.000Z'),
      endDate: new Date('2026-09-24T00:00:00.000Z'),
      isUpcoming: false,
    };

    mockProvider.fetchFreeGames.mockResolvedValue([sampleGame]);

    const onAnnounce = vi.fn().mockResolvedValue('msg-12345');
    const getTargets = vi.fn().mockResolvedValue([
      { guildId: 'guild-1', channelId: 'channel-1' },
      { guildId: 'guild-2', channelId: 'channel-2' },
    ]);

    // Guild-2 already had this game announced
    (mockRepo.isGameAnnounced as any).mockImplementation(
      async (gameId: string, guildId: string) => guildId === 'guild-2',
    );

    const engine = new FreeGamesEngine(mockRepo as FreeGameRepository, {
      providers: [mockProvider as any],
      onAnnounceGame: onAnnounce,
      getGuildAnnounceTargets: getTargets,
    });

    const result = await engine.checkAndAnnounce();

    expect(result.discovered).toBe(1);
    expect(result.announced).toBe(1);
    expect(onAnnounce).toHaveBeenCalledTimes(1);
    expect(onAnnounce).toHaveBeenCalledWith('guild-1', 'channel-1', sampleGame);
    expect(mockRepo.recordAnnouncement).toHaveBeenCalledWith({
      gameId: 'epic-free-1',
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageId: 'msg-12345',
    });
  });

  it('formats Discord embed with correct markdown and timestamps', () => {
    const sampleGame: FreeGameItem = {
      id: 'epic-free-1',
      provider: 'EPIC',
      title: 'Free Title',
      storeUrl: 'https://store.epicgames.com/p/free-title',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      startDate: new Date(1789700000000),
      endDate: new Date(1790300000000),
      originalPrice: '$19.99',
      isUpcoming: false,
    };

    const engine = new FreeGamesEngine(mockRepo as FreeGameRepository);
    const embed = engine.formatGameEmbed(sampleGame);

    expect(embed.title).toContain('Free Title');
    expect(embed.url).toBe('https://store.epicgames.com/p/free-title');
    expect(embed.description).toContain('~~$19.99~~ **FREE!**');
    expect(embed.thumbnail?.url).toBe('https://example.com/thumb.jpg');
    expect(embed.footer?.text).toContain('EPIC');
  });
});
