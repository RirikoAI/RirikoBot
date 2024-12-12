import { Test, TestingModule } from '@nestjs/testing';
import RewindCommand from './rewind.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { SharedServicesMock } from '../../../test/mocks/shared-services.mock';

describe('RewindCommand', () => {
  let command: RewindCommand;
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
  const mockPlayer = {
    getQueue: jest.fn(),
  };
  const mockQueue = {
    seek: jest.fn(),
    currentTime: 100,
  };
  const mockSharedServices: SharedServicesMock = {
    config: {} as ConfigService,
    discord: mockDiscordService as unknown as DiscordService,
    commandService: mockCommandService as unknown as CommandService,
    musicService: {} as any,
    autoVoiceChannelService: {} as any,
    guildRepository: {} as any,
    voiceChannelRepository: {} as any,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: RewindCommand,
          useValue: new RewindCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<RewindCommand>(RewindCommand);
    command['player'] = mockPlayer as any; // Mock the player property
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should reply with "Please enter a valid number!" if no time is provided', async () => {
      const mockMessage = {
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      command['allParams'] = '';

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith(
        'Please enter a valid number!',
      );
    });

    it('should rewind the song and reply with confirmation', async () => {
      const mockMessage = {
        reply: jest.fn(),
        channel: { send: jest.fn() },
      } as unknown as DiscordMessage;

      command['allParams'] = '10';
      mockPlayer.getQueue.mockReturnValue(mockQueue);

      await command.runPrefix(mockMessage);

      expect(mockQueue.seek).toHaveBeenCalledWith(90);
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        'Rewinded the song for 10s!',
      );
    });
  });

  describe('runSlash', () => {
    it('should reply with "Please enter a valid number!" if no time is provided', async () => {
      const mockInteraction = {
        options: { getInteger: jest.fn().mockReturnValue(null) },
        reply: jest.fn(),
        editReply: jest.fn().mockResolvedValue({ delete: jest.fn() }),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        'Please enter a valid number!',
      );
    });

    it('should rewind the song and reply with confirmation', async () => {
      const mockInteraction = {
        options: { getInteger: jest.fn().mockReturnValue(10) },
        reply: jest.fn(),
        editReply: jest.fn().mockResolvedValue({ delete: jest.fn() }),
        channel: { send: jest.fn().mockResolvedValue({ delete: jest.fn() }) },
      } as unknown as DiscordInteraction;

      mockPlayer.getQueue.mockReturnValue(mockQueue);

      await command.runSlash(mockInteraction);

      expect(mockQueue.seek).toHaveBeenCalledWith(90);
      expect(mockInteraction.channel.send).toHaveBeenCalledWith(
        'Rewinded the song for 10s!',
      );
    });
  });
});
