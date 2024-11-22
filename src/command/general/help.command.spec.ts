import { Test, TestingModule } from '@nestjs/testing';
import HelpCommand from './help.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { Guild, User } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { SharedServicesMock, TestSharedService } from "../../../test/mocks/shared-services.mock";

describe('HelpCommand', () => {
  let command: HelpCommand;
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
    getGuildPrefix: jest.fn().mockResolvedValue('!'),
    getCommand: jest.fn(),
    getPrefixCommands: jest.fn().mockReturnValue([]),
    getSlashCommands: jest.fn().mockReturnValue([]),
  };
  const mockSharedServices: SharedServicesMock = {
    ...TestSharedService,
    discord: mockDiscordService as unknown as DiscordService,
    commandService: mockCommandService as unknown as CommandService,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: HelpCommand,
          useValue: new HelpCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<HelpCommand>(HelpCommand);

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
    it('should reply with the help embed for a specific command if mentioned', async () => {
      const mockMessage = {
        guild: mockGuild,
        author: mockUser,
        content: 'help test',
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      mockCommandService.getCommand.mockReturnValue({
        name: 'test',
        description: 'Test command',
        usageExamples: ['test'],
      });

      command.setParams('help test');
      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });
  });

  describe('runSlash', () => {
    it('should reply with the help embed for a specific command if provided', async () => {
      const mockInteraction = {
        guild: mockGuild,
        user: mockUser,
        options: {
          getString: jest.fn().mockReturnValue('test'),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      mockCommandService.getCommand.mockReturnValue({
        name: 'test',
        description: 'Test command',
        usageExamples: ['test'],
      });

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });
  });
});
