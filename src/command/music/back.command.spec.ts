import { Test, TestingModule } from '@nestjs/testing';
import BackCommand from './back.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { SharedServicesMock } from '../../../test/mocks/shared-services.mock';

describe('BackCommand', () => {
  let command: BackCommand;
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
    previous: jest.fn(),
  };
  const mockPlayer = {
    getQueue: jest.fn(),
    previous: jest.fn(),
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
          provide: BackCommand,
          useValue: new BackCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<BackCommand>(BackCommand);
    command['player'] = mockPlayer as any; // Mock the player property
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should reply with "No queue found" if no queue exists', async () => {
      const mockMessage = {
        guild: { id: 'guildId' },
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      mockPlayer.getQueue.mockReturnValue(null);

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: 'No queue found',
      });
    });

    it('should play the previous song and reply with confirmation', async () => {
      const mockMessage = {
        guild: { id: 'guildId' },
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      const mockQueue = { previous: jest.fn() };
      mockPlayer.getQueue.mockReturnValue(mockQueue);

      await command.runPrefix(mockMessage);

      expect(mockQueue.previous).toHaveBeenCalled();
      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: 'Played the previous music',
      });
    });
  });

  describe('runSlash', () => {
    it('should reply with "No queue found" if no queue exists', async () => {
      const mockInteraction = {
        guild: { id: 'guildId' },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      mockPlayer.getQueue.mockReturnValue(null);

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'No queue found',
      });
    });

    it('should play the previous song and reply with confirmation', async () => {
      const mockInteraction = {
        guild: { id: 'guildId' },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      const mockQueue = { previous: jest.fn() };
      mockPlayer.getQueue.mockReturnValue(mockQueue);

      await command.runSlash(mockInteraction);

      expect(mockQueue.previous).toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Played the previous music',
      });
    });
  });

  describe('handleButton', () => {
    it('should reply with "No queue found" if no queue exists', async () => {
      const mockInteraction = {
        guild: { id: 'guildId' },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      mockPlayer.getQueue.mockReturnValue(null);

      await command.handleButton(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'No queue found',
      });
    });

    it('should play the previous song and reply with confirmation', async () => {
      const mockInteraction = {
        guild: { id: 'guildId' },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      const mockQueue = { previous: jest.fn() };
      mockPlayer.getQueue.mockReturnValue(mockQueue);

      await command.handleButton(mockInteraction);

      expect(mockQueue.previous).toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Played the previous music',
      });
    });
  });
});
