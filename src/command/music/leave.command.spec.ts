import { Test, TestingModule } from '@nestjs/testing';
import LeaveCommand from './leave.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { SharedServicesMock } from '../../../test/mocks/shared-services.mock';

describe('LeaveCommand', () => {
  let command: LeaveCommand;
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
    voices: {
      leave: jest.fn(),
    },
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
          provide: LeaveCommand,
          useValue: new LeaveCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<LeaveCommand>(LeaveCommand);
    command['player'] = mockPlayer as any; // Mock the player property
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should leave the voice channel and reply with confirmation', async () => {
      const mockMessage = {
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockPlayer.voices.leave).toHaveBeenCalledWith(mockMessage);
      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: 'Left the voice channel',
      });
    });
  });

  describe('runSlash', () => {
    it('should leave the voice channel and reply with confirmation', async () => {
      const mockInteraction = {
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockPlayer.voices.leave).toHaveBeenCalledWith(mockInteraction);
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Left the voice channel',
      });
    });
  });
});
