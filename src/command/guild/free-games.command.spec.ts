import { Test, TestingModule } from '@nestjs/testing';
import FreeGamesCommand from './free-games.command';
import { DiscordService } from '#discord/discord.service';
import { CommandService } from '#command/command.service';
import { FreeGamesService } from '#free-games/free-games.service';
import { Guild, User, Channel, TextChannel } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { EmbedBuilder } from 'discord.js';
import { Repository } from 'typeorm';
import { Guild as GuildEntity } from '#database/entities/guild.entity';
import { GuildConfig } from '#database/entities/guild-config.entity';
import { FreeGameNotification } from '#database/entities/free-game-notification.entity';

describe('FreeGamesCommand', () => {
  let command: FreeGamesCommand;
  let mockGuild: Guild;
  let mockUser: User;
  let mockChannel: Channel & TextChannel;

  // Mock services
  const mockDiscordService = {
    client: {
      channels: {
        fetch: jest.fn(),
      },
    },
  };

  const mockFreeGamesService = {
    getEpicFreeGames: jest.fn(),
    getSteamFreeGames: jest.fn(),
    createFreeGamesEmbed: jest.fn(),
  };

  const mockCommandService = {
    getCommand: jest.fn(),
  };

  // Mock repositories
  const mockGuildRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
  };

  const mockGuildConfigRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const mockFreeGameNotificationRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  // Mock shared services
  const mockSharedServices = {
    discord: mockDiscordService as unknown as DiscordService,
    commandService: mockCommandService as unknown as CommandService,
    freeGamesService: mockFreeGamesService as unknown as FreeGamesService,
    db: {
      guildRepository:
        mockGuildRepository as unknown as Repository<GuildEntity>,
      guildConfigRepository:
        mockGuildConfigRepository as unknown as Repository<GuildConfig>,
      freeGameNotificationRepository:
        mockFreeGameNotificationRepository as unknown as Repository<FreeGameNotification>,
    },
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: FreeGamesCommand,
          useValue: new FreeGamesCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<FreeGamesCommand>(FreeGamesCommand);

    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock objects
    mockUser = {
      id: '1234567890',
      username: 'TestUser',
    } as unknown as User;

    mockGuild = {
      id: '1234567890',
      name: 'Test Guild',
    } as unknown as Guild;

    mockChannel = {
      id: '9876543210',
      name: 'test-channel',
      isTextBased: jest.fn().mockReturnValue(true),
      send: jest.fn(),
    } as unknown as Channel & TextChannel;

    // Default mock implementations
    mockDiscordService.client.channels.fetch.mockResolvedValue(mockChannel);
    mockFreeGamesService.getEpicFreeGames.mockResolvedValue([
      { title: 'Epic Game 1', productSlug: 'epic-game-1' },
      { title: 'Epic Game 2', productSlug: 'epic-game-2' },
    ]);
    mockFreeGamesService.getSteamFreeGames.mockResolvedValue([
      { name: 'Steam Game 1', url: 'steam-game-1-url' },
      { name: 'Steam Game 2', url: 'steam-game-2-url' },
    ]);
    mockFreeGamesService.createFreeGamesEmbed.mockImplementation(
      (games, source) => {
        return new EmbedBuilder().setTitle(`Free Games on ${source}`);
      },
    );
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should call sendFreeGamesAlert when no subcommand is provided', async () => {
      const mockMessage = {
        content: 'freegames',
        guild: mockGuild,
        author: mockUser,
        reply: jest.fn(),
        mentions: {
          channels: {
            first: jest.fn().mockReturnValue(null),
          },
        },
      } as unknown as DiscordMessage;

      const spy = jest.spyOn(command as any, 'sendFreeGamesAlert');

      await command.runPrefix(mockMessage);

      expect(spy).toHaveBeenCalledWith(mockMessage);
    });

    it('should call setFreeGamesChannel when setchannel subcommand is provided with a channel mention', async () => {
      const mockChannelMention = {
        id: '9876543210',
      };

      const mockMessage = {
        content: 'freegames setchannel #test-channel',
        guild: mockGuild,
        author: mockUser,
        reply: jest.fn(),
        mentions: {
          channels: {
            first: jest.fn().mockReturnValue(mockChannelMention),
          },
        },
      } as unknown as DiscordMessage;

      const spy = jest.spyOn(command as any, 'setFreeGamesChannel');

      await command.runPrefix(mockMessage);

      expect(spy).toHaveBeenCalledWith(mockMessage, mockChannelMention.id);
    });

    it('should reply with an error when setchannel subcommand is provided without a channel mention', async () => {
      const mockMessage = {
        content: 'freegames setchannel',
        guild: mockGuild,
        author: mockUser,
        reply: jest.fn(),
        mentions: {
          channels: {
            first: jest.fn().mockReturnValue(null),
          },
        },
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith(
        'Please mention a channel to set for free games alerts.',
      );
    });

    it('should call removeFreeGamesChannel when remove subcommand is provided', async () => {
      const mockMessage = {
        content: 'freegames remove',
        guild: mockGuild,
        author: mockUser,
        reply: jest.fn(),
        mentions: {
          channels: {
            first: jest.fn().mockReturnValue(null),
          },
        },
      } as unknown as DiscordMessage;

      const spy = jest.spyOn(command as any, 'removeFreeGamesChannel');

      await command.runPrefix(mockMessage);

      expect(spy).toHaveBeenCalledWith(mockMessage);
    });
  });

  describe('runSlash', () => {
    it('should call sendFreeGamesAlert when show subcommand is provided', async () => {
      const mockInteraction = {
        options: {
          getSubcommand: jest.fn().mockReturnValue('show'),
        },
        guild: mockGuild,
        user: mockUser,
        deferReply: jest.fn(),
        editReply: jest.fn(),
      } as unknown as DiscordInteraction;

      const spy = jest.spyOn(command as any, 'sendFreeGamesAlert');

      await command.runSlash(mockInteraction);

      expect(mockInteraction.deferReply).toHaveBeenCalled();
      expect(spy).toHaveBeenCalledWith(mockInteraction);
    });

    it('should call setFreeGamesChannel when setchannel subcommand is provided', async () => {
      const mockChannel = {
        id: '9876543210',
      };

      const mockInteraction = {
        options: {
          getSubcommand: jest.fn().mockReturnValue('setchannel'),
          getChannel: jest.fn().mockReturnValue(mockChannel),
        },
        guild: mockGuild,
        user: mockUser,
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      const spy = jest.spyOn(command as any, 'setFreeGamesChannel');

      await command.runSlash(mockInteraction);

      expect(spy).toHaveBeenCalledWith(mockInteraction, mockChannel.id);
    });

    it('should call removeFreeGamesChannel when remove subcommand is provided', async () => {
      const mockInteraction = {
        options: {
          getSubcommand: jest.fn().mockReturnValue('remove'),
        },
        guild: mockGuild,
        user: mockUser,
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      const spy = jest.spyOn(command as any, 'removeFreeGamesChannel');

      await command.runSlash(mockInteraction);

      expect(spy).toHaveBeenCalledWith(mockInteraction);
    });
  });

  describe('removeFreeGamesChannel', () => {
    it('should reply with an error if not in a guild', async () => {
      const mockInteraction = {
        guild: null,
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await (command as any).removeFreeGamesChannel(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
    });

    it('should reply with an error if guild not found in database', async () => {
      const mockInteraction = {
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      mockGuildRepository.findOne.mockResolvedValueOnce(null);

      await (command as any).removeFreeGamesChannel(mockInteraction);

      expect(mockGuildRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockGuild.id },
      });
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'No configuration found for this server.',
        ephemeral: true,
      });
    });

    it('should reply with an error if no free games channel is configured', async () => {
      const mockInteraction = {
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      mockGuildRepository.findOne.mockResolvedValueOnce({ id: mockGuild.id });
      mockGuildConfigRepository.findOne.mockResolvedValueOnce(null);

      await (command as any).removeFreeGamesChannel(mockInteraction);

      expect(mockGuildConfigRepository.findOne).toHaveBeenCalledWith({
        where: { guild: { id: mockGuild.id }, name: 'freeGamesChannelId' },
      });
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'No free games channel is configured for this server.',
        ephemeral: true,
      });
    });

    it('should remove the free games channel configuration and reply with success', async () => {
      const mockInteraction = {
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      const mockGuildConfig = {
        id: '1',
        name: 'freeGamesChannelId',
        value: '9876543210',
      };

      mockGuildRepository.findOne.mockResolvedValueOnce({ id: mockGuild.id });
      mockGuildConfigRepository.findOne.mockResolvedValueOnce(mockGuildConfig);
      mockGuildConfigRepository.remove.mockResolvedValueOnce(mockGuildConfig);

      await (command as any).removeFreeGamesChannel(mockInteraction);

      expect(mockGuildConfigRepository.remove).toHaveBeenCalledWith(
        mockGuildConfig,
      );
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Free games alerts channel has been removed.',
        ephemeral: true,
      });
    });
  });

  describe('setFreeGamesChannel', () => {
    it('should reply with an error if not in a guild', async () => {
      const mockInteraction = {
        guild: null,
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await (command as any).setFreeGamesChannel(mockInteraction, '9876543210');

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
    });

    it('should reply with an error if channel is not a valid text channel', async () => {
      const mockInteraction = {
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      const invalidChannel = {
        isTextBased: jest.fn().mockReturnValue(false),
      };

      mockDiscordService.client.channels.fetch.mockResolvedValueOnce(
        invalidChannel,
      );

      await (command as any).setFreeGamesChannel(mockInteraction, '9876543210');

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'The specified channel is not a valid text channel.',
        ephemeral: true,
      });
    });

    it('should create a new guild if it does not exist', async () => {
      const mockInteraction = {
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      mockGuildRepository.findOne.mockResolvedValueOnce(null);
      mockGuildRepository.save.mockResolvedValueOnce({
        id: mockGuild.id,
        name: mockGuild.name,
      });
      mockGuildConfigRepository.findOne.mockResolvedValueOnce(null);
      mockGuildConfigRepository.save.mockResolvedValueOnce({});

      await (command as any).setFreeGamesChannel(mockInteraction, '9876543210');

      expect(mockGuildRepository.save).toHaveBeenCalledWith({
        guildId: mockGuild.id,
        name: mockGuild.name,
      });
      expect(mockGuildConfigRepository.save).toHaveBeenCalledWith({
        guild: { id: mockGuild.id, name: mockGuild.name },
        name: 'freeGamesChannelId',
        value: '9876543210',
      });
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Free games alerts will now be sent to <#9876543210>.',
        ephemeral: true,
      });
    });

    it('should update existing config if it exists', async () => {
      const mockInteraction = {
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      const mockGuildEntity = { id: mockGuild.id, name: mockGuild.name };
      const mockGuildConfig = {
        id: '1',
        name: 'freeGamesChannelId',
        value: '1111111111',
      };

      mockGuildRepository.findOne.mockResolvedValueOnce(mockGuildEntity);
      mockGuildConfigRepository.findOne.mockResolvedValueOnce(mockGuildConfig);
      mockGuildConfigRepository.save.mockResolvedValueOnce({});

      await (command as any).setFreeGamesChannel(mockInteraction, '9876543210');

      expect(mockGuildConfigRepository.save).toHaveBeenCalledWith({
        id: '1',
        name: 'freeGamesChannelId',
        value: '9876543210',
      });
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Free games alerts will now be sent to <#9876543210>.',
        ephemeral: true,
      });
    });
  });

  describe('sendFreeGamesAlert', () => {
    it('should fetch free games and send embeds', async () => {
      const mockInteraction = {
        author: mockUser,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      const epicEmbed = new EmbedBuilder().setTitle('Free Games on Epic');
      const steamEmbed = new EmbedBuilder().setTitle('Free Games on Steam');

      mockFreeGamesService.createFreeGamesEmbed
        .mockReturnValueOnce(epicEmbed)
        .mockReturnValueOnce(steamEmbed);

      await (command as any).sendFreeGamesAlert(mockInteraction);

      expect(mockFreeGamesService.getEpicFreeGames).toHaveBeenCalled();
      expect(mockFreeGamesService.getSteamFreeGames).toHaveBeenCalled();
      expect(mockFreeGamesService.createFreeGamesEmbed).toHaveBeenCalledWith(
        expect.any(Array),
        'Epic',
      );
      expect(mockFreeGamesService.createFreeGamesEmbed).toHaveBeenCalledWith(
        expect.any(Array),
        'Steam',
      );
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [epicEmbed, steamEmbed],
      });
    });

    it('should handle errors and send an error embed', async () => {
      const mockInteraction = {
        author: mockUser,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      mockFreeGamesService.getEpicFreeGames.mockRejectedValueOnce(
        new Error('Test error'),
      );

      await (command as any).sendFreeGamesAlert(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });
  });

  describe('sendAlertToConfiguredChannel', () => {
    it('should do nothing if no guilds are found', async () => {
      mockGuildRepository.find.mockResolvedValueOnce([]);

      await command.sendAlertToConfiguredChannel();

      expect(mockFreeGamesService.getEpicFreeGames).not.toHaveBeenCalled();
      expect(mockFreeGamesService.getSteamFreeGames).not.toHaveBeenCalled();
    });

    it('should do nothing if no free games are found', async () => {
      mockGuildRepository.find.mockResolvedValueOnce([
        { id: mockGuild.id, name: mockGuild.name },
      ]);
      mockFreeGamesService.getEpicFreeGames.mockResolvedValueOnce([]);
      mockFreeGamesService.getSteamFreeGames.mockResolvedValueOnce([]);

      await command.sendAlertToConfiguredChannel();

      expect(mockGuildConfigRepository.findOne).not.toHaveBeenCalled();
    });

    it('should skip guilds without a configured channel', async () => {
      mockGuildRepository.find.mockResolvedValueOnce([
        { id: mockGuild.id, name: mockGuild.name },
      ]);
      mockGuildConfigRepository.findOne.mockResolvedValueOnce(null);

      await command.sendAlertToConfiguredChannel();

      expect(mockDiscordService.client.channels.fetch).not.toHaveBeenCalled();
    });

    it('should skip guilds with invalid channels', async () => {
      mockGuildRepository.find.mockResolvedValueOnce([
        { id: mockGuild.id, name: mockGuild.name },
      ]);
      mockGuildConfigRepository.findOne.mockResolvedValueOnce({
        value: '9876543210',
      });

      const invalidChannel = {
        isTextBased: jest.fn().mockReturnValue(false),
      };

      mockDiscordService.client.channels.fetch.mockResolvedValueOnce(
        invalidChannel,
      );

      await command.sendAlertToConfiguredChannel();

      expect(mockChannel.send).not.toHaveBeenCalled();
    });

    it('should skip games that have already been notified', async () => {
      const mockGuildEntity = { id: mockGuild.id, name: mockGuild.name };

      mockGuildRepository.find.mockResolvedValueOnce([mockGuildEntity]);
      mockGuildConfigRepository.findOne.mockResolvedValueOnce({
        value: '9876543210',
      });

      // Mock that all games have already been notified
      mockFreeGameNotificationRepository.findOne.mockResolvedValue({
        id: '1',
        notified: true,
      });

      await command.sendAlertToConfiguredChannel();

      expect(mockChannel.send).not.toHaveBeenCalled();
    });

    it('should send notifications for new games', async () => {
      const mockGuildEntity = { id: mockGuild.id, name: mockGuild.name };

      mockGuildRepository.find.mockResolvedValueOnce([mockGuildEntity]);
      mockGuildConfigRepository.findOne.mockResolvedValueOnce({
        value: '9876543210',
      });

      // Mock that no games have been notified yet
      mockFreeGameNotificationRepository.findOne.mockResolvedValue(null);

      const epicEmbed = new EmbedBuilder().setTitle('Free Games on Epic');
      const steamEmbed = new EmbedBuilder().setTitle('Free Games on Steam');

      mockFreeGamesService.createFreeGamesEmbed
        .mockReturnValueOnce(epicEmbed)
        .mockReturnValueOnce(steamEmbed);

      await command.sendAlertToConfiguredChannel();

      expect(mockChannel.send).toHaveBeenCalledWith({
        content: expect.stringContaining('Free Games Alert'),
        embeds: [epicEmbed, steamEmbed],
      });

      // Should save notifications for all games
      expect(mockFreeGameNotificationRepository.save).toHaveBeenCalledTimes(4);
    });
  });
});
