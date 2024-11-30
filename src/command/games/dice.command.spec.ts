import { Test, TestingModule } from '@nestjs/testing';
import DiceCommand from './dice.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { Guild, User } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { SharedServicesMock, TestSharedService } from '../../../test/mocks/shared-services.mock';

describe('DiceCommand', () => {
  let command: DiceCommand;
  let mockGuild: Guild;
  let mockUser: User;
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
  const mockSharedServices: SharedServicesMock = {
    ...TestSharedService,
    discord: mockDiscordService as unknown as DiscordService,
    commandService: mockCommandService as unknown as CommandService,
    autoVoiceChannelService: {} as any,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: DiceCommand,
          useValue: new DiceCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<DiceCommand>(DiceCommand);

    mockUser = {
      id: '1234567890',
      username: 'TestUser',
      displayAvatarURL: jest.fn().mockReturnValue('http://avatar.url'),
    } as unknown as User;

    mockGuild = {
      id: '1234567890',
      name: 'Test Guild',
    } as unknown as Guild;
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should reply with the dice roll result', async () => {
      const mockMessage = {
        guild: mockGuild,
        author: mockUser,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalled();
    });
  });

  describe('runSlash', () => {
    it('should reply with the dice roll result', async () => {
      const mockInteraction = {
        guild: mockGuild,
        user: mockUser,
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalled();
    });
  });
});