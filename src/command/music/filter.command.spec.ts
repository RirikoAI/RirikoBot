import { Test, TestingModule } from '@nestjs/testing';
import FilterCommand from './filter.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { SharedServicesMock } from '../../../test/mocks/shared-services.mock';

describe('FilterCommand', () => {
  let command: FilterCommand;
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
    getQueue: jest.fn(),
  };
  const mockPlayer = {
    getQueue: jest.fn(),
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
          provide: FilterCommand,
          useValue: new FilterCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<FilterCommand>(FilterCommand);
    command['player'] = mockPlayer as any; // Mock the player property
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should reply with "No music is currently playing." if no queue exists', async () => {
      const mockMessage = {
        guild: { id: 'guildId' },
        reply: jest.fn().mockResolvedValue({
          createMessageComponentCollector: jest.fn().mockReturnValue({
            on: jest.fn(),
          }),
        }),
      } as unknown as DiscordMessage;

      mockPlayer.getQueue.mockReturnValue(null);

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: 'No music is currently playing.',
        ephemeral: true,
      });
    });

    it('should load filters and send filter selection message', async () => {
      const mockMessage = {
        guild: { id: 'guildId' },
        reply: jest.fn().mockResolvedValue({
          createMessageComponentCollector: jest.fn().mockReturnValue({
            on: jest.fn(),
          }),
        }),
      } as unknown as DiscordMessage;

      const mockQueue = {
        playing: true,
        filters: { toString: jest.fn().mockReturnValue('None') },
      };
      mockPlayer.getQueue.mockReturnValue(mockQueue);

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalled();
    });
  });

  describe('runSlash', () => {
    it('should reply with "No music is currently playing." if no queue exists', async () => {
      const mockInteraction = {
        guild: { id: 'guildId' },
        reply: jest.fn().mockResolvedValue({
          createMessageComponentCollector: jest.fn().mockReturnValue({
            on: jest.fn(),
          }),
        }),
      } as unknown as DiscordInteraction;

      mockPlayer.getQueue.mockReturnValue(null);

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'No music is currently playing.',
        ephemeral: true,
      });
    });

    it('should load filters and send filter selection message', async () => {
      const mockInteraction = {
        guild: { id: 'guildId' },
        reply: jest.fn().mockResolvedValue({
          createMessageComponentCollector: jest.fn().mockReturnValue({
            on: jest.fn(),
          }),
        }),
      } as unknown as DiscordInteraction;

      const mockQueue = {
        playing: true,
        filters: { toString: jest.fn().mockReturnValue('None') },
      };
      mockPlayer.getQueue.mockReturnValue(mockQueue);

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalled();
    });
  });
});
