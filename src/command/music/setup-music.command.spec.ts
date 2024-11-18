import { Test, TestingModule } from '@nestjs/testing';
import SetupMusicCommand from './setup-music.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { SharedServicesMock } from '../../../test/mocks/shared-services.mock';
import { ChannelType } from "discord.js";

describe('SetupMusicCommand', () => {
  let command: SetupMusicCommand;
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
  const mockMusicService = {
    setupMusicChannel: jest.fn(),
  };
  const mockSharedServices: SharedServicesMock = {
    config: {} as ConfigService,
    discord: mockDiscordService as unknown as DiscordService,
    commandService: mockCommandService as unknown as CommandService,
    musicService: mockMusicService,
    autoVoiceChannelService: {} as any,
    guildRepository: {} as any,
    voiceChannelRepository: {} as any,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: SetupMusicCommand,
          useValue: new SetupMusicCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<SetupMusicCommand>(SetupMusicCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should call setupMusicChannel', async () => {
      const mockMessage = {
        member: {
          permissions: {
            has: jest.fn().mockReturnValue(true),
          },
        },
        guild: {
          channels: {
            cache: {
              find: jest.fn().mockReturnValue(null),
            },
            create: jest.fn().mockResolvedValue({}),
          },
        },
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockMusicService.setupMusicChannel).toHaveBeenCalled();
    });
  });

  describe('runSlash', () => {
    it('should call setupMusicChannel', async () => {
      const mockInteraction = {
        member: {
          permissions: {
            has: jest.fn().mockReturnValue(true),
          },
        },
        guild: {
          channels: {
            cache: {
              find: jest.fn().mockReturnValue(null),
            },
            create: jest.fn().mockResolvedValue({}),
          },
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockMusicService.setupMusicChannel).toHaveBeenCalled();
    });
  });

  describe('handleButton', () => {
    it('should reply with button clicked message', async () => {
      const mockInteraction = {
        customId: 'testButton',
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.handleButton(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Button testButton clicked',
        ephemeral: false,
      });
    });
  });

  describe('setupMusicChannel', () => {
    it('should create a new music channel if not exists', async () => {
      const mockInteraction = {
        member: {
          permissions: {
            has: jest.fn().mockReturnValue(true),
          },
        },
        guild: {
          channels: {
            cache: {
              find: jest.fn().mockReturnValue(null),
            },
            create: jest.fn().mockResolvedValue({}),
          },
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.setupMusicChannel(mockInteraction);

      expect(mockInteraction.guild.channels.create).toHaveBeenCalledWith({
        name: 'music-channel',
        type: ChannelType.GuildText,
      });
      expect(mockMusicService.setupMusicChannel).toHaveBeenCalled();
    });

    it('should delete all messages in the existing music channel', async () => {
      const mockChannel = {
        messages: {
          fetch: jest.fn().mockResolvedValue([
            { delete: jest.fn() },
            { delete: jest.fn() },
          ]),
        },
      };
      const mockInteraction = {
        member: {
          permissions: {
            has: jest.fn().mockReturnValue(true),
          },
        },
        guild: {
          channels: {
            cache: {
              find: jest.fn().mockReturnValue(mockChannel),
            },
          },
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.setupMusicChannel(mockInteraction);

      expect(mockChannel.messages.fetch).toHaveBeenCalled();
      expect(mockMusicService.setupMusicChannel).toHaveBeenCalled();
    });
  });
});