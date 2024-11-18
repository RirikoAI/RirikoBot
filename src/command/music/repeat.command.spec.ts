import { Test, TestingModule } from '@nestjs/testing';
import RepeatCommand from './repeat.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { SharedServicesMock } from '../../../test/mocks/shared-services.mock';

describe('RepeatCommand', () => {
  let command: RepeatCommand;
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
    repeatQueue: jest.fn(),
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
          provide: RepeatCommand,
          useValue: new RepeatCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<RepeatCommand>(RepeatCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should reply with toggle message and call repeatQueue', async () => {
      const mockMessage = {
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: 'Queue repeat setting toggled',
      });
      expect(mockMusicService.repeatQueue).toHaveBeenCalledWith(mockMessage);
    });
  });

  describe('runSlash', () => {
    it('should reply with toggle message and call repeatQueue', async () => {
      const mockInteraction = {
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Queue repeat setting toggled',
      });
      expect(mockMusicService.repeatQueue).toHaveBeenCalledWith(mockInteraction);
    });
  });

  describe('handleButton', () => {
    it('should defer update and call repeatQueue', async () => {
      const mockInteraction = {
        deferUpdate: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.handleButton(mockInteraction);

      expect(mockInteraction.deferUpdate).toHaveBeenCalled();
      expect(mockMusicService.repeatQueue).toHaveBeenCalledWith(mockInteraction);
    });
  });
});