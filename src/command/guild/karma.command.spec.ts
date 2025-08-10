import { Test, TestingModule } from '@nestjs/testing';
import KarmaCommand from './karma.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { Guild, User } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import {
  SharedServicesMock,
  TestSharedService,
} from '../../../test/mocks/shared-services.mock';

describe('KarmaCommand', () => {
  let command: KarmaCommand;
  let mockGuild: Guild;
  let mockUser: User;

  const mockDiscordService = {
    client: {
      user: {
        displayAvatarURL: jest.fn(),
      },
    },
  };

  const mockCommandService = {
    getGuildPrefix: jest.fn(),
  };

  const mockEconomyService = {
    getUser: jest.fn(),
  };

  const mockSharedServices: SharedServicesMock = {
    ...TestSharedService,
    discord: mockDiscordService as unknown as DiscordService,
    commandService: mockCommandService as unknown as CommandService,
    economy: mockEconomyService,
    db: {
      userRepository: {
        save: jest.fn(),
      },
      guildRepository: {
        findOne: jest.fn(),
      },
      guildConfigRepository: {
        save: jest.fn(),
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: KarmaCommand,
          useValue: new KarmaCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<KarmaCommand>(KarmaCommand);

    mockUser = {
      id: '123456789',
      username: 'TestUser',
    } as unknown as User;

    mockGuild = {
      id: '987654321',
    } as unknown as Guild;

    // Reset all mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should handle view karma without parameters', async () => {
      const mockMessage = {
        content: 'karma',
        author: mockUser,
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      mockEconomyService.getUser.mockResolvedValueOnce({
        karma: 100,
        doNotNotifyOnLevelUp: false,
      });

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith(
        'Your current karma is: 100. You have notifications enabled.',
      );
    });

    it('should handle enable profile notifications', async () => {
      const mockMessage = {
        content: 'karma enable',
        author: mockUser,
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      mockEconomyService.getUser.mockResolvedValueOnce({
        doNotNotifyOnLevelUp: true,
      });

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith(
        'Karma notifications have been enabled for your profile.',
      );
    });

    it('should handle server-wide enable with admin permissions', async () => {
      const mockMessage = {
        content: 'karma enable server',
        author: mockUser,
        guild: mockGuild,
        member: {
          permissions: {
            has: jest.fn().mockReturnValue(true),
          },
        },
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      mockSharedServices.db.guildRepository.findOne.mockResolvedValueOnce({
        configurations: [],
      });

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith(
        'Karma notifications have been enabled for the server.',
      );
    });

    it('should handle server-wide enable without admin permissions', async () => {
      const mockMessage = {
        content: 'karma enable server',
        author: mockUser,
        guild: mockGuild,
        member: {
          permissions: {
            has: jest.fn().mockReturnValue(false),
          },
        },
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: 'You need Administrator permission to use this command.',
      });
    });
  });

  describe('runSlash', () => {
    it('should handle view karma subcommand', async () => {
      const mockInteraction = {
        options: {
          getSubcommand: jest.fn().mockReturnValue('view'),
        },
        user: mockUser,
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      mockEconomyService.getUser.mockResolvedValueOnce({
        karma: 100,
        doNotNotifyOnLevelUp: false,
      });

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Your current karma is: 100. You have notifications enabled.',
        ephemeral: true,
      });
    });

    it('should handle enable server subcommand with admin permissions', async () => {
      const mockInteraction = {
        options: {
          getSubcommand: jest.fn().mockReturnValue('enable-server'),
        },
        member: {
          permissions: {
            has: jest.fn().mockReturnValue(true),
          },
        },
        user: mockUser,
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      mockSharedServices.db.guildRepository.findOne.mockResolvedValueOnce({
        configurations: [],
      });

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Karma notifications have been enabled for the server.',
        ephemeral: true,
      });
    });

    it('should handle invalid subcommand', async () => {
      const mockInteraction = {
        options: {
          getSubcommand: jest.fn().mockReturnValue('invalid'),
        },
        member: {
          permissions: {
            has: jest.fn().mockReturnValue(true),
          },
        },
        user: mockUser,
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Invalid subcommand.',
        ephemeral: true,
      });
    });
  });

  describe('getKarmaProfile', () => {
    it('should return karma profile', async () => {
      mockEconomyService.getUser.mockResolvedValueOnce({
        karma: 100,
        doNotNotifyOnLevelUp: false,
      });

      const profile = await command.getKarmaProfile(mockUser);

      expect(profile).toEqual({
        karma: 100,
        enabled: true,
      });
    });
  });

  describe('setGuildConfig', () => {
    it('should create new karma configuration if not exists', async () => {
      mockSharedServices.db.guildRepository.findOne.mockResolvedValueOnce({
        configurations: [],
      });

      await command.setGuildConfig(mockGuild, true);

      expect(
        mockSharedServices.db.guildConfigRepository.save,
      ).toHaveBeenCalledWith({
        name: 'karma-notification-enabled',
        value: 'enabled',
        guild: expect.any(Object),
      });
    });

    it('should update existing karma configuration', async () => {
      const existingConfig = {
        name: 'karma-notification-enabled',
        value: 'disabled',
      };

      mockSharedServices.db.guildRepository.findOne.mockResolvedValueOnce({
        configurations: [existingConfig],
      });

      await command.setGuildConfig(mockGuild, true);

      expect(
        mockSharedServices.db.guildConfigRepository.save,
      ).toHaveBeenCalledWith({
        ...existingConfig,
        value: 'enabled',
      });
    });

    it('should handle database errors', async () => {
      mockSharedServices.db.guildRepository.findOne.mockRejectedValueOnce(
        new Error('Database error'),
      );

      const result = await command.setGuildConfig(mockGuild, true);

      expect(result).toBeNull();
    });
  });
});
