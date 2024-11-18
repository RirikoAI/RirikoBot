import { Test, TestingModule } from '@nestjs/testing';
import StopCommand from './stop.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { SharedServicesMock } from '../../../test/mocks/shared-services.mock';

describe('StopCommand', () => {
  let command: StopCommand;
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
    stopMusic: jest.fn(),
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
          provide: StopCommand,
          useValue: new StopCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<StopCommand>(StopCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should stop the music and reply', async () => {
      const mockMessage = {
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockMusicService.stopMusic).toHaveBeenCalledWith(mockMessage);
      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: 'Music stopped',
      });
    });
  });

  describe('runSlash', () => {
    it('should stop the music and reply', async () => {
      const mockInteraction = {
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Music stopped',
      });
      expect(mockMusicService.stopMusic).toHaveBeenCalledWith(mockInteraction);
    });
  });

  describe('handleButton', () => {
    it('should defer update and stop the music', async () => {
      const mockInteraction = {
        deferUpdate: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.handleButton(mockInteraction);

      expect(mockInteraction.deferUpdate).toHaveBeenCalled();
      expect(mockMusicService.stopMusic).toHaveBeenCalledWith(mockInteraction);
    });
  });
});