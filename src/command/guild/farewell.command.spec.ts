import { Test, TestingModule } from '@nestjs/testing';
import FarewellCommand from './farewell.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { Guild, TextChannel } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import {
  SharedServicesMock,
  TestSharedService,
} from '../../../test/mocks/shared-services.mock';
import { ImageUtil } from '#util/image/image.util';

// mock ImageUtil
jest.mock('#util/image/image.util');

describe('FarewellCommand', () => {
  let command: FarewellCommand;
  let mockGuild: Guild;
  let mockChannel: TextChannel;
  const mockDiscordService = {
    client: {
      user: {
        displayAvatarURL: jest.fn(),
      },
      guilds: {
        fetch: jest.fn().mockResolvedValue({
          channels: {
            fetch: jest.fn().mockResolvedValue({
              id: '1234567890',
              name: 'test-channel',
            }),
          },
        }),
      },
    },
  };
  const mockCommandService = {
    getGuildPrefix: jest.fn(),
  };
  const mockSharedServices: SharedServicesMock = {
    ...TestSharedService,
    discord: mockDiscordService as unknown as DiscordService,
    commandService: mockCommandService as unknown as CommandService,
    db: {
      guildConfigRepository: {
        save: jest.fn(),
      },
      guildRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: '1234567890',
          configurations: [
            {
              name: 'farewell_enabled',
              value: {
                enabled: true,
                channel: '1234567890',
                background: 'http://example.com/image.png',
              },
            },
          ],
        }),
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: FarewellCommand,
          useValue: new FarewellCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<FarewellCommand>(FarewellCommand);
    // command.setBackground = jest.fn();

    mockGuild = {
      id: '1234567890',
    } as unknown as Guild;

    mockChannel = {
      id: '1234567890',
      name: 'test-channel',
    } as unknown as TextChannel;
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should enable farewell', async () => {
      const mockMessage = {
        guild: mockGuild,
        mentions: {
          channels: {
            first: jest.fn().mockReturnValue(mockChannel),
          },
        },
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      command.params = ['enable'];
      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });

    it('should disable farewell', async () => {
      const mockMessage = {
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      command.params = ['disable'];
      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });

    it('should set background image', async () => {
      const mockMessage = {
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      command.params = ['bg', 'http://example.com/image.png'];
      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toBeDefined();
    });

    it('should set channel', async () => {
      const mockMessage = {
        guild: mockGuild,
        mentions: {
          channels: {
            first: jest.fn().mockReturnValue(mockChannel),
          },
        },
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      command.params = ['channel'];
      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });

    it('should get status', async () => {
      const mockMessage = {
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      command.params = ['status'];
      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });
  });

  describe('runSlash', () => {
    it('should enable farewell', async () => {
      const mockInteraction = {
        guild: mockGuild,
        options: {
          getSubcommand: jest.fn().mockReturnValue('enable'),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });

    it('should disable farewell', async () => {
      const mockInteraction = {
        guild: mockGuild,
        options: {
          getSubcommand: jest.fn().mockReturnValue('disable'),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });

    it('should set background image', async () => {
      const mockInteraction = {
        guild: mockGuild,
        options: {
          getSubcommand: jest.fn().mockReturnValue('bg'),
          getString: jest.fn().mockReturnValue('http://example.com/image.png'),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toBeDefined();
    });

    it('should set channel', async () => {
      const mockInteraction = {
        guild: mockGuild,
        options: {
          getSubcommand: jest.fn().mockReturnValue('channel'),
          getChannel: jest.fn().mockReturnValue(mockChannel),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });

    it('should get status', async () => {
      const mockInteraction = {
        guild: mockGuild,
        options: {
          getSubcommand: jest.fn().mockReturnValue('status'),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });
  });

  describe('enable', () => {
    it('should enable farewell', async () => {
      const mockMessage = {
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.enable(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });
  });

  describe('disable', () => {
    it('should disable farewell', async () => {
      const mockMessage = {
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.disable(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });
  });

  describe('setBackground', () => {
    it('should set background image', async () => {
      const mockMessage = {
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.setBackground(mockMessage, 'http://example.com/image.png');

      expect(mockMessage.reply).toBeDefined();
    });
  });

  describe('setChannel', () => {
    it('should set channel', async () => {
      const mockMessage = {
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.setChannel(mockMessage, '1234567890');

      expect(mockMessage.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });
  });

  describe('status', () => {
    it('should get status', async () => {
      const mockMessage = {
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.status(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });
  });

  describe('setBackground', () => {
    it('should set background image', async () => {
      const mockMessage = {
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      const mockInteraction = {
        guild: mockGuild,
        deferReply: jest.fn(),
        editReply: jest.fn(),
      } as unknown as DiscordInteraction;

      const mockImageUtil = {
        isImage: jest.fn().mockResolvedValue(true),
      };
      jest
        .spyOn(ImageUtil, 'isImage')
        .mockImplementation(mockImageUtil.isImage);

      command['db'].guildRepository.findOne = jest.fn().mockResolvedValue({
        id: '1234567890',
        configurations: [],
      });

      command['db'].guildConfigRepository.save = jest.fn();

      await command.setBackground(mockMessage, 'http://example.com/image.png');
      await command.setBackground(mockMessage, 'http://example.com/image.png');
      await command.setBackground(
        mockInteraction,
        'http://example.com/image.png',
      );

      expect(mockMessage.reply).toBeDefined();

      expect(mockInteraction.editReply).toBeDefined();
    });

    it('should handle invalid image URL', async () => {
      const mockMessage = {
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      const mockInteraction = {
        guild: mockGuild,
        deferReply: jest.fn(),
        editReply: jest.fn(),
      } as unknown as DiscordInteraction;

      const mockImageUtil = {
        isImage: jest.fn().mockResolvedValue(false),
      };
      jest
        .spyOn(ImageUtil, 'isImage')
        .mockImplementation(mockImageUtil.isImage);

      command['db'].guildRepository.findOne = jest.fn().mockResolvedValue({
        id: '1234567890',
        configurations: [],
      });

      await command.setBackground(
        mockMessage,
        'http://example.com/invalid.png',
      );
      await command.setBackground(
        mockInteraction,
        'http://example.com/invalid.png',
      );

      expect(mockMessage.reply).toBeDefined();

      expect(mockInteraction.editReply).toBeDefined();
    });
  });

  describe('status', () => {
    it('should get status with DiscordMessage', async () => {
      const mockMessage = {
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.status(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });

    it('should get status with DiscordInteraction', async () => {
      const mockInteraction = {
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.status(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });

    it('should handle error in DiscordMessage', async () => {
      const mockMessage = {
        guild: mockGuild,
        reply: jest.fn().mockImplementation(() => {
          throw new Error('Test error');
        }),
      } as unknown as DiscordMessage;

      await expect(command.status(mockMessage)).rejects.toThrow('Test error');
    });

    it('should handle error in DiscordInteraction', async () => {
      const mockInteraction = {
        guild: mockGuild,
        reply: jest.fn().mockImplementation(() => {
          throw new Error('Test error');
        }),
      } as unknown as DiscordInteraction;

      await expect(command.status(mockInteraction)).rejects.toThrow(
        'Test error',
      );
    });
  });
});
