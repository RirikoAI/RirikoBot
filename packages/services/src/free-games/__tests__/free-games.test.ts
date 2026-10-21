import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EpicGamesProvider, resolveEpicPageSlug } from '../providers/epic.provider.js';
import { SteamFreeGamesProvider } from '../providers/steam.provider.js';
import { FreeGamesEngine } from '../engine.js';
import type { FreeGameRepository } from '@ririko/database';
import type { FreeGameItem } from '../types.js';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
}

describe('EpicGamesProvider', () => {
  it('links store page slugs for the live 2026-10-21 promotions fixture', async () => {
    const payload = fixture('epic-promotions.json');
    const mockFetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => payload } as Response);
    const games = await new EpicGamesProvider({ fetchFn: mockFetch as any }).fetchFreeGames();

    expect(games.map((g) => [g.title, g.storeUrl, g.isUpcoming])).toEqual(
      expect.arrayContaining([
        ['Bad Cheese', 'https://store.epicgames.com/p/bad-cheese-4256d9', false],
        [
          'Agent A: A puzzle in disguise',
          'https://store.epicgames.com/p/agent-a-a-puzzle-in-disguise-42fe5f',
          false,
        ],
        ['Sker Ritual (Coming Soon)', 'https://store.epicgames.com/p/sker-ritual-aac702', true],
        [
          'Home - A Unique Horror Adventure (Coming Soon)',
          'https://store.epicgames.com/p/home-19212a',
          true,
        ],
      ]),
    );
    expect(games).toHaveLength(4);
    for (const g of games) expect(g.storeUrl).not.toMatch(/[0-9a-f]{32}/i);
  });

  describe('resolveEpicPageSlug', () => {
    it('strips /home from productSlug', () => {
      expect(resolveEpicPageSlug({ productSlug: 'thems-fightin-herds/home' })).toBe(
        'thems-fightin-herds',
      );
    });
    it('rejects a hex urlSlug with no mappings', () => {
      expect(
        resolveEpicPageSlug({ urlSlug: 'ae5d8fc5541f42eea105f64121dba382', id: 'x' }),
      ).toBeNull();
    });
    it('accepts a non-hex urlSlug', () => {
      expect(resolveEpicPageSlug({ urlSlug: 'some-game' })).toBe('some-game');
    });
    it('skips non-productHome mappings in favour of a later productHome', () => {
      expect(
        resolveEpicPageSlug({
          productSlug: 'ignored',
          offerMappings: [
            { pageType: 'offer', pageSlug: 'wrong' },
            { pageType: 'productHome', pageSlug: 'right-1a2b3c' },
          ],
        }),
      ).toBe('right-1a2b3c');
    });
    it('falls back to catalogNs productHome mappings', () => {
      expect(
        resolveEpicPageSlug({
          offerMappings: [{ pageType: 'offer', pageSlug: 'dlc' }],
          catalogNs: { mappings: [{ pageType: 'productHome', pageSlug: 'base-game' }] },
        }),
      ).toBe('base-game');
    });
  });

  it('links the free-games page when no slug resolves', async () => {
    const payload = {
      data: {
        Catalog: {
          searchStore: {
            elements: [
              {
                id: 'g1',
                title: 'Mystery',
                urlSlug: 'ae5d8fc5541f42eea105f64121dba382',
                promotions: {
                  promotionalOffers: [
                    { promotionalOffers: [{ discountSetting: { discountPercentage: 0 } }] },
                  ],
                },
              },
            ],
          },
        },
      },
    };
    const mockFetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => payload } as Response);
    const games = await new EpicGamesProvider({ fetchFn: mockFetch as any }).fetchFreeGames();
    expect(games[0]).toMatchObject({
      id: 'epic-g1',
      storeUrl: 'https://store.epicgames.com/free-games',
    });
  });

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

  it('returns no items for the live steam-featured.json fixture (no 100% discount)', async () => {
    const payload = fixture('steam-featured.json');
    const mockFetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => payload } as Response);
    const games = await new SteamFreeGamesProvider({ fetchFn: mockFetch as any }).fetchFreeGames();
    expect(games).toEqual([]);
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
      { guildId: 'guild-1', channelId: 'channel-1', mentionRoleId: 'role-1' },
      { guildId: 'guild-2', channelId: 'channel-2', mentionRoleId: null },
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
    expect(onAnnounce).toHaveBeenCalledWith(
      { guildId: 'guild-1', channelId: 'channel-1', mentionRoleId: 'role-1' },
      sampleGame,
    );
    expect(mockRepo.recordAnnouncement).toHaveBeenCalledWith({
      gameId: 'epic-free-1',
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageId: 'msg-12345',
    });
  });

  it('mentions only the ping role above the embed (TASK-1662)', () => {
    const game: FreeGameItem = {
      id: 'steam-1',
      provider: 'STEAM',
      title: '@everyone Free Title',
      storeUrl: 'https://store.steampowered.com/app/1',
      thumbnailUrl: null,
      startDate: new Date(1789700000000),
      endDate: new Date(1790300000000),
      isUpcoming: false,
    };
    const engine = new FreeGamesEngine(mockRepo as FreeGameRepository);

    const withRole = engine.formatAnnouncement(game, '123');
    expect(withRole.content).toBe('<@&123>');
    expect(withRole.allowedMentions).toEqual({ parse: [], roles: ['123'] });
    expect(withRole.embeds).toHaveLength(1);

    const withoutRole = engine.formatAnnouncement(game, null);
    expect(withoutRole).not.toHaveProperty('content');
    expect(withoutRole.allowedMentions).toEqual({ parse: [], roles: [] });
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
