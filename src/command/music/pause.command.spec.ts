import { Test, TestingModule } from '@nestjs/testing';
import PauseCommand from './pause.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { SharedServicesMock, TestSharedService } from '../../../test/mocks/shared-services.mock';

describe('PauseCommand', () => {
  let command: PauseCommand;
  const mockDiscordService = {
    client: {
      user: {
        displayAvatarURL: jest.fn(),
      },
      musicPlayer: {
        getQueue: jest.fn(),
        setVolume: jest.fn(),
      },
    },
  };
  const mockCommandService = {
    getGuildPrefix: jest.fn(),
  };
  const mockMusicService = {
    pauseMusic: jest.fn(),
  };
  const mockSharedServices: SharedServicesMock = {
    ...TestSharedService,
    discord: mockDiscordService as unknown as DiscordService,
    commandService: mockCommandService as unknown as CommandService,
    musicService: mockMusicService,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: PauseCommand,
          useValue: new PauseCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<PauseCommand>(PauseCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should pause/unpause the music and reply with a confirmation message', async () => {
      const mockMessage = {
        guild: { id: '1234567890' },
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      jest.spyOn(command.services.musicService, 'pauseMusic').mockResolvedValue();

      await command.runPrefix(mockMessage);

      expect(command.services.musicService.pauseMusic).toHaveBeenCalledWith(mockMessage);
      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: 'Music paused/unpaused',
      });
    });
  });

  describe('runSlash', () => {
    it('should pause/unpause the music and reply with a confirmation message', async () => {
      const mockInteraction = {
        guild: { id: '1234567890' },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      jest.spyOn(command.services.musicService, 'pauseMusic').mockResolvedValue();

      await command.runSlash(mockInteraction);

      expect(command.services.musicService.pauseMusic).toHaveBeenCalledWith(mockInteraction);
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Music paused/unpaused',
      });
    });
  });

  describe('handleButton', () => {
    it('should defer the update and pause/unpause the music', async () => {
      const mockInteraction = {
        guild: { id: '1234567890' },
        deferUpdate: jest.fn(),
      } as unknown as DiscordInteraction;

      jest.spyOn(command.services.musicService, 'pauseMusic').mockResolvedValue();

      await command.handleButton(mockInteraction);

      expect(mockInteraction.deferUpdate).toHaveBeenCalled();
      expect(command.services.musicService.pauseMusic).toHaveBeenCalledWith(mockInteraction);
    });
  });
});