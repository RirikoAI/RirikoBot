import { Test, TestingModule } from '@nestjs/testing';
import JoinCommand from './join.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { SharedServicesMock } from '../../../test/mocks/shared-services.mock';

describe('JoinCommand', () => {
  let command: JoinCommand;
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
      join: jest.fn(),
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
          provide: JoinCommand,
          useValue: new JoinCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<JoinCommand>(JoinCommand);
    command['player'] = mockPlayer as any; // Mock the player property
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should join the voice channel and reply with confirmation', async () => {
      const mockMessage = {
        member: {
          voice: {
            channel: 'voiceChannel',
          },
        },
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockPlayer.voices.join).toHaveBeenCalledWith('voiceChannel');
      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: 'Joined the voice channel',
      });
    });
  });

  describe('runSlash', () => {
    it('should join the voice channel and reply with confirmation', async () => {
      const mockInteraction = {
        member: {
          voice: {
            channel: 'voiceChannel',
          },
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockPlayer.voices.join).toHaveBeenCalledWith('voiceChannel');
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Joined the voice channel',
      });
    });
  });
});
