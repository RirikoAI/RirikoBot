import { Test, TestingModule } from '@nestjs/testing';
import VolumeCommand from './volume.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { SharedServicesMock } from '../../../test/mocks/shared-services.mock';

describe('VolumeCommand', () => {
  let command: VolumeCommand;
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
    setVolume: jest.fn(),
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
          provide: VolumeCommand,
          useValue: new VolumeCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<VolumeCommand>(VolumeCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should set the volume and reply', async () => {
      const mockMessage = {
        reply: jest.fn(),
        content: 'volume 50',
      } as unknown as DiscordMessage;

      command.params = ['50'];

      await command.runPrefix(mockMessage);

      expect(mockMusicService.setVolume).toHaveBeenCalledWith(mockMessage, 50);
      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: 'Volume set to 50',
      });
    });

    it('should reply with an error if volume is out of range', async () => {
      const mockMessage = {
        reply: jest.fn(),
        content: 'volume 150',
      } as unknown as DiscordMessage;

      command.params = ['150'];

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: 'Volume cannot be more than 100 and less than 0',
      });
    });
  });

  describe('runSlash', () => {
    it('should set the volume and reply', async () => {
      const mockInteraction = {
        options: {
          getInteger: jest.fn().mockReturnValue(50),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockMusicService.setVolume).toHaveBeenCalledWith(mockInteraction, 50);
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Volume set to 50',
      });
    });

    it('should reply with an error if volume is out of range', async () => {
      const mockInteraction = {
        options: {
          getInteger: jest.fn().mockReturnValue(150),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Volume cannot be more than 100 and less than 0',
      });
    });
  });
});