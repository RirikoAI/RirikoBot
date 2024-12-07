import { Test, TestingModule } from '@nestjs/testing';
import HelpCommand from './help.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { Guild, User } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import {
  SharedServicesMock,
  TestSharedService,
} from '../../../test/mocks/shared-services.mock';

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
    getPrefixCommands: jest.fn().mockReturnValue(['a', 'b']),
    getSlashCommands: jest.fn().mockReturnValue(['a', 'b']),
    getCliCommands: jest.fn().mockReturnValue(['a', 'b']),
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
    it('should reply with the help embed for all commands if no parameters are provided', async () => {
      const mockMessage = {
        guild: mockGuild,
        author: mockUser,
        content: 'help',
        reply: jest.fn(),
      } as unknown as DiscordMessage;
      (command as any).services.commandService.getPrefixCommands = [];
      command.setParams('');

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });

    it('should reply with the help embed for a specific command if a valid command is provided', async () => {
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

    it('should not reply if an invalid command is provided', async () => {
      const mockMessage = {
        guild: mockGuild,
        author: mockUser,
        content: 'help invalid',
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      mockCommandService.getCommand.mockReturnValue(null);

      command.setParams('help invalid');
      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).not.toHaveBeenCalled();
    });
  });

  describe('runSlash', () => {
    it('should reply with the help embed for all commands if no command name is provided', async () => {
      (command as any).services.commandService.getSlashCommands = [];
      const mockInteraction = {
        guild: mockGuild,
        user: mockUser,
        options: {
          getString: jest.fn().mockReturnValue(null),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });

    it('should reply with the help embed for a specific command if a valid command name is provided', async () => {
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

    it('should reply with an error message if an invalid command name is provided', async () => {
      const mockInteraction = {
        guild: mockGuild,
        user: mockUser,
        options: {
          getString: jest.fn().mockReturnValue('invalid'),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      mockCommandService.getCommand.mockReturnValue(null);

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Command not found',
        ephemeral: true,
      });
    });
  });

  describe('runCli', () => {
    it('should display a table of all commands if no parameters are provided', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      (command as any).services.commandService.getCliCommands = [];
      await command.runCli('help');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should display the help for a specific command if a valid command is provided', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      mockCommandService.getCommand.mockReturnValue({
        name: 'test',
        description: 'Test command',
        usageExamples: ['test'],
      });

      await command.runCli('help test');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should not display anything if an invalid command is provided', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      mockCommandService.getCommand.mockReturnValue(null);

      await command.runCli('help invalid');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
