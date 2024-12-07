import { Test, TestingModule } from '@nestjs/testing';
import { TwitchService } from './twitch.service';
import { DatabaseService } from '#database/database.service';
import { DiscordService } from '#discord/discord.service';
import { ConfigService as RirikoConfigService } from '#config/config.service';
import axios from 'axios';

jest.mock('axios');

describe('TwitchService', () => {
  let service: TwitchService;
  let dbService: DatabaseService;
  let discordService: DiscordService;
  let configService: RirikoConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwitchService,
        {
          provide: DatabaseService,
          useValue: {
            streamSubscriptionRepository: {
              find: jest.fn(),
            },
            streamNotificationRepository: {
              find: jest.fn(),
              insert: jest.fn(),
            },
          },
        },
        {
          provide: DiscordService,
          useValue: {
            client: {
              channels: {
                cache: {
                  get: jest.fn(),
                },
              },
            },
          },
        },
        {
          provide: RirikoConfigService,
          useValue: {
            getAllConfig: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TwitchService>(TwitchService);
    dbService = module.get<DatabaseService>(DatabaseService);
    discordService = module.get<DiscordService>(DiscordService);
    configService = module.get<RirikoConfigService>(RirikoConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('should login successfully', async () => {
      const mockConfig = {
        twitchClientId: 'testClientId',
        twitchClientSecret: 'testClientSecret',
      };
      const mockTokenResponse = {
        data: {
          access_token: 'testAccessToken',
        },
      };

      jest
        .spyOn(configService, 'getAllConfig')
        .mockResolvedValue(mockConfig as any);
      (axios.post as jest.Mock).mockResolvedValue(mockTokenResponse);

      const result = await service.login();

      expect(result).toBe(true);
      expect(service.accessToken).toBe('testAccessToken');
      expect((service as any).loggedIn).toBe(true);
    });

    it('should fail to login after retries', async () => {
      const mockConfig = {
        twitchClientId: 'testClientId',
        twitchClientSecret: 'testClientSecret',
      };

      jest
        .spyOn(configService, 'getAllConfig')
        .mockResolvedValue(mockConfig as any);
      (axios.post as jest.Mock).mockRejectedValue(new Error('Login failed'));

      service['retriesLeft'] = 1;
      const result = await service.login();

      expect(result).toBe(false);
      expect((service as any).loggedIn).toBe(false);
    });
  });

  describe('checkStreamers', () => {
    it('should return streamer status', async () => {
      const mockStreamers = [
        { user_login: 'streamer1', type: 'live', id: '1' },
        { user_login: 'streamer2', type: 'offline', id: '2' },
      ];
      const mockResponse = { data: { data: mockStreamers } };

      (axios.get as jest.Mock).mockResolvedValue(mockResponse);
      service.accessToken = 'testAccessToken';

      const result = await service.checkStreamers(['streamer1', 'streamer2']);

      expect(result.onlineStreamersArray).toEqual(['streamer1']);
      expect(result.offlineStreamersArray).toEqual(['streamer2']);
      expect(result.onlineStreamers).toBeDefined();
      expect(result.streamIdsArray).toEqual(['1', '2']);
    });
  });

  describe('checkGuildSubscriptions', () => {
    it('should return queued messages', async () => {
      const mockSubscriptions = [
        {
          twitchUserId: 'streamer1',
          guild: { id: 'guild1' },
          channelId: 'channel1',
        },
      ];
      const mockStreamers = {
        onlineStreamersArray: ['streamer1'],
        onlineStreamers: [
          {
            user_login: 'streamer1',
            id: '1',
            title: 'Live',
            user_name: 'Streamer1',
            thumbnail_url: 'url',
          },
        ],
      };
      const mockNotifications = [];

      jest
        .spyOn(dbService.streamSubscriptionRepository, 'find')
        .mockResolvedValue(mockSubscriptions as any);
      jest
        .spyOn(dbService.streamNotificationRepository, 'find')
        .mockResolvedValue(mockNotifications);
      jest.spyOn(service, 'checkStreamers').mockResolvedValue(mockStreamers);

      const result = await service.checkGuildSubscriptions();

      expect(result).toEqual([
        {
          message: 'streamer1 is online',
          streamer: mockStreamers.onlineStreamers[0],
          guild: 'guild1',
          channelId: 'channel1',
        },
      ]);
    });
  });

  describe('sendNotification', () => {
    it('should send notifications', async () => {
      const mockMessage = {
        message: 'streamer1 is online',
        streamer: {
          id: '1',
          title: 'Live',
          user_name: 'Streamer1',
          thumbnail_url: 'url',
        },
        guild: 'guild1',
        channelId: 'channel1',
      };
      const mockChannel = {
        send: jest.fn(),
      };

      (discordService.client.channels.cache.get as jest.Mock).mockReturnValue(
        mockChannel,
      );

      await service.sendNotification([mockMessage]);

      expect(mockChannel.send).toHaveBeenCalledWith({
        content: 'streamer1 is online',
        embeds: [
          {
            title: 'Live',
            description: 'Streamer1',
            url: 'https://twitch.tv/Streamer1',
            image: {
              url: 'url'.replace('{width}', '1280').replace('{height}', '720'),
            },
          },
        ],
      });
      expect(
        dbService.streamNotificationRepository.insert,
      ).toHaveBeenCalledWith({
        twitchUserId: 'Streamer1',
        streamId: '1',
        guild: { id: 'guild1' },
        channelId: 'channel1',
        notified: true,
      });
    });
  });
});
