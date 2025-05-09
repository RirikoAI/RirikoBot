import { Test, TestingModule } from '@nestjs/testing';
import SkipCommand from './skip.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { SharedServicesMock } from '../../../test/mocks/shared-services.mock';

describe('SkipCommand', () => {
  let command: SkipCommand;
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
    skip: jest.fn(),
  };
  const mockPlayer = {
    getQueue: jest.fn(),
    skip: jest.fn(),
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
          provide: SkipCommand,
          useValue: new SkipCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<SkipCommand>(SkipCommand);
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

    it('should skip the current song and reply with confirmation', async () => {
      const mockMessage = {
        guild: { id: 'guildId' },
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      mockPlayer.getQueue.mockReturnValue({});
      mockPlayer.skip.mockResolvedValue({});

      await command.runPrefix(mockMessage);

      expect(mockPlayer.skip).toHaveBeenCalled();
      expect(mockMessage.reply).toHaveBeenCalled();
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

    it('should skip the current song and reply with confirmation', async () => {
      const mockInteraction = {
        guild: { id: 'guildId' },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      mockPlayer.getQueue.mockReturnValue({});
      mockPlayer.skip.mockResolvedValue({});

      await command.runSlash(mockInteraction);

      expect(mockPlayer.skip).toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'Skipped the current song.',
      );
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

    it('should skip the current song and defer update', async () => {
      const mockInteraction = {
        guild: { id: 'guildId' },
        deferUpdate: jest.fn(),
      } as unknown as DiscordInteraction;

      mockPlayer.getQueue.mockReturnValue({});
      mockPlayer.skip.mockResolvedValue({});

      await command.handleButton(mockInteraction);

      expect(mockInteraction.deferUpdate).toHaveBeenCalled();
      expect(mockPlayer.skip).toHaveBeenCalled();
    });
  });
});
