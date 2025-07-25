import { Test } from '@nestjs/testing';
import { FreeGamesService } from './free-games.service';
import axios from 'axios';
import { EmbedBuilder } from 'discord.js';
import * as cheerio from 'cheerio';

jest.mock('axios');
jest.mock('cheerio');
jest.mock('discord.js');

describe('FreeGamesService', () => {
  let service: FreeGamesService;
  const mockAxios = axios as jest.Mocked<typeof axios>;
  const mockEmbedBuilder = EmbedBuilder as jest.MockedClass<
    typeof EmbedBuilder
  >;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [FreeGamesService],
    }).compile();

    service = module.get<FreeGamesService>(FreeGamesService);
    jest.clearAllMocks();
  });

  describe('getEpicFreeGames', () => {
    it('should return currently free games', async () => {
      const mockResponse = {
        data: {
          data: {
            Catalog: {
              searchStore: {
                elements: [
                  {
                    title: 'Test Game',
                    promotions: {
                      promotionalOffers: [
                        {
                          promotionalOffers: [
                            {
                              discountSetting: { discountPercentage: 0 },
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
        },
      };
      mockAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await service.getEpicFreeGames();
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Test Game');
    });

    it('should return upcoming free games', async () => {
      const mockResponse = {
        data: {
          data: {
            Catalog: {
              searchStore: {
                elements: [
                  {
                    title: 'Test Game',
                    promotions: {
                      upcomingPromotionalOffers: [
                        {
                          promotionalOffers: [
                            {
                              discountSetting: { discountPercentage: 0 },
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
        },
      };
      mockAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await service.getEpicFreeGames();
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Test Game (Coming Soon)');
    });

    it('should handle errors', async () => {
      mockAxios.get.mockRejectedValueOnce(new Error('Network error'));
      const result = await service.getEpicFreeGames();
      expect(result).toEqual([]);
    });
  });

  describe('getSteamFreeGames', () => {
    it('should return free games', async () => {
      const mockHtml =
        '<div id="search_resultsRows"><a class="search_result_row" href="test-url"><div class="title">Test Game</div></a></div>';
      mockAxios.get.mockResolvedValueOnce({ data: mockHtml });

      // Create a function that returns jQuery-like chained functions
      const mockCheerioApi = {
        attr: jest.fn().mockReturnValue('test-url'),
        find: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnValue('Test Game'),
        trim: jest.fn().mockReturnValue('Test Game'),
        each: jest.fn().mockImplementation((fn) => {
          fn(0, mockCheerioApi);
        }),
      };

      // Mock the selector function to return the mockCheerioApi
      const mockSelector = jest.fn().mockReturnValue(mockCheerioApi);

      // Mock cheerio.load to return the selector function
      (cheerio.load as jest.Mock).mockReturnValue(mockSelector);

      const result = await service.getSteamFreeGames();
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ name: 'Test Game', url: 'test-url' });
    });

    it('should handle errors', async () => {
      mockAxios.get.mockRejectedValueOnce(new Error('Network error'));
      const result = await service.getSteamFreeGames();
      expect(result).toEqual([]);
    });
  });

  describe('createFreeGamesEmbed', () => {
    beforeEach(() => {
      mockEmbedBuilder.mockClear();
      mockEmbedBuilder.prototype.setColor.mockReturnThis();
      mockEmbedBuilder.prototype.setTitle.mockReturnThis();
      mockEmbedBuilder.prototype.setDescription.mockReturnThis();
      mockEmbedBuilder.prototype.setTimestamp.mockReturnThis();
      mockEmbedBuilder.prototype.setFooter.mockReturnThis();
      mockEmbedBuilder.prototype.addFields.mockReturnThis();
    });

    it('should create embed for Epic games', () => {
      const games = [{ title: 'Test Game', productSlug: 'test-game' }];
      const embed = service.createFreeGamesEmbed(games, 'Epic');
      console.log(embed);

      expect(mockEmbedBuilder.prototype.setTitle).toHaveBeenCalledWith(
        'Free Games on Epic',
      );
      expect(mockEmbedBuilder.prototype.addFields).toHaveBeenCalledWith({
        name: 'Test Game',
        value: expect.stringContaining('test-game'),
      });
    });

    it('should create embed for Steam games', () => {
      const games = [{ name: 'Test Game', url: 'test-url' }];
      const embed = service.createFreeGamesEmbed(games, 'Steam');
      console.log(embed);
      expect(mockEmbedBuilder.prototype.setTitle).toHaveBeenCalledWith(
        'Free Games on Steam',
      );
      expect(mockEmbedBuilder.prototype.addFields).toHaveBeenCalledWith({
        name: 'Test Game',
        value: expect.stringContaining('test-url'),
      });
    });

    it('should handle empty games array', () => {
      const embed = service.createFreeGamesEmbed([], 'Epic');
      console.log(embed);
      expect(mockEmbedBuilder.prototype.setDescription).toHaveBeenCalledWith(
        'No free games found on Epic at the moment.',
      );
    });
  });
});
