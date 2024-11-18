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
      musicPlayer: {
        skip: jest.fn(),
      },
    },
  };
  const mockCommandService = {
    getGuildPrefix: jest.fn(),
  };
  const mockMusicService = {
    getControlButtons: jest.fn(),
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
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should skip the current song and reply', async () => {
      const mockMessage = {
        guildId: '1234567890',
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockDiscordService.client.musicPlayer.skip).toHaveBeenCalledWith('1234567890');
      expect(mockMessage.reply).toHaveBeenCalledWith('Skipped the current song.');
    });
  });

  describe('runSlash', () => {
    it('should skip the current song and reply', async () => {
      const mockInteraction = {
        guildId: '1234567890',
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockDiscordService.client.musicPlayer.skip).toHaveBeenCalledWith('1234567890');
      expect(mockInteraction.reply).toHaveBeenCalledWith('Skipped the current song.');
    });
  });

  describe('handleButton', () => {
    it('should defer update and skip the current song', async () => {
      const mockInteraction = {
        deferUpdate: jest.fn(),
        guildId: '1234567890',
      } as unknown as DiscordInteraction;

      await command.handleButton(mockInteraction);

      expect(mockInteraction.deferUpdate).toHaveBeenCalled();
      expect(mockDiscordService.client.musicPlayer.skip).toHaveBeenCalledWith('1234567890');
    });
  });
});