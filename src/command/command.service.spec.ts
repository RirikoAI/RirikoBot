import { Test, TestingModule } from '@nestjs/testing';
import { CommandService } from './command.service';
import { ConfigService } from '@nestjs/config';
import { DiscordService } from '#discord/discord.service';
import { DatabaseService } from '#database/database.service';
import { SharedServices } from '#command/command.module';
import { Command } from '#command/command.class';
import { DiscordMessage, DiscordInteraction } from '#command/command.types';
import CommandsLoaderUtil from '#util/command/commands-loader.util';
import { Logger } from '@nestjs/common';

describe('CommandService', () => {
  let service: CommandService;
  let configService: ConfigService;
  let databaseService: DatabaseService;
  let sharedServices: SharedServices;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommandService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: DiscordService,
          useValue: { client: { musicPlayer: {} } },
        },
        {
          provide: DatabaseService,
          useValue: { guildRepository: { findOne: jest.fn() } },
        },
        {
          provide: 'SHARED_SERVICES',
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<CommandService>(CommandService);
    configService = module.get<ConfigService>(ConfigService);
    databaseService = module.get<DatabaseService>(DatabaseService);
    sharedServices = module.get<SharedServices>('SHARED_SERVICES');

    jest.spyOn(Logger, 'error').mockImplementation(() => {});
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerCommands', () => {
    it('should register commands', async () => {
      jest
        .spyOn(CommandsLoaderUtil, 'loadCommandsInDirectory')
        .mockReturnValue([]);
      jest.spyOn(CommandsLoaderUtil, 'instantiateCommands').mockReturnValue([]);
      jest
        .spyOn(CommandsLoaderUtil, 'putInteractionCommandsInGuilds')
        .mockResolvedValue(undefined);

      const result = await service.registerCommands();

      expect(result).toEqual([]);
    });
  });

  describe('checkPrefixCommand', () => {
    it('should execute a prefix command', async () => {
      const message = {
        content: '!test',
        guild: { id: '123' },
        reply: jest.fn(),
      } as unknown as DiscordMessage;
      const command = new Command(sharedServices);
      command.test = jest.fn().mockReturnValue(true);
      command.setParams = jest.fn();
      command.runPrefix = jest.fn();

      CommandService['registeredCommands'] = [command];
      jest.spyOn(service, 'getGuildPrefix').mockResolvedValue('!');

      await service.checkPrefixCommand(message);

      expect(command.test).toHaveBeenCalledWith('test');
      expect(command.setParams).toHaveBeenCalledWith('test');
      expect(command.runPrefix).toHaveBeenCalledWith(message);
    });
  });

  describe('checkSlashCommand', () => {
    it('should execute a slash command', async () => {
      const interaction = {
        commandName: 'test',
        isMessageContextMenuCommand: jest.fn().mockReturnValue(false),
        isContextMenuCommand: jest.fn().mockReturnValue(false),
      } as unknown as DiscordInteraction;
      const command = new Command(sharedServices);
      command.test = jest.fn().mockReturnValue(true);
      command.runSlash = jest.fn();

      CommandService['registeredCommands'] = [command];

      await service.checkInteractionCommand(interaction);

      expect(command.test).toHaveBeenCalledWith('test');
      expect(command.runSlash).toHaveBeenCalledWith(interaction);
    });
  });

  describe('getGuildPrefix', () => {
    it('should return the guild prefix', async () => {
      const message = { guild: { id: '123' } } as unknown as DiscordMessage;
      const guild = { prefix: '!' };
      jest
        .spyOn(databaseService.guildRepository, 'findOne')
        .mockResolvedValue(guild as any);

      const result = await service.getGuildPrefix(message);

      expect(result).toBe('!');
    });

    it('should return the default prefix if an error occurs', async () => {
      const message = { guild: { id: '123' } } as unknown as DiscordMessage;
      jest
        .spyOn(databaseService.guildRepository, 'findOne')
        .mockRejectedValue(new Error('Error'));
      jest.spyOn(configService, 'get').mockReturnValue('!');

      const result = await service.getGuildPrefix(message);

      expect(result).toBe('!');
    });
  });

  describe('checkButton', () => {
    it('should execute a button command', async () => {
      const interaction = {
        customId: 'testButton',
      } as unknown as DiscordInteraction;
      const command = new Command(sharedServices);
      command.buttons = {
        testButton: jest.fn(),
      };

      CommandService['registeredCommands'] = [command];

      await service.checkButton(interaction);

      expect(command.buttons.testButton).toHaveBeenCalledWith(interaction);
    });

    it('should not execute if button command is not found', async () => {
      const interaction = {
        customId: 'unknownButton',
      } as unknown as DiscordInteraction;
      const command = new Command(sharedServices);
      command.buttons = {
        testButton: jest.fn(),
      };

      CommandService['registeredCommands'] = [command];

      await service.checkButton(interaction);

      expect(command.buttons.testButton).not.toHaveBeenCalled();
    });
  });

  describe('checkCliCommand', () => {
    it('should execute a CLI command', async () => {
      const input = 'test';
      const command = new Command(sharedServices);
      command.test = jest.fn().mockReturnValue(true);
      command.runCli = jest.fn();

      CommandService['registeredCommands'] = [command];

      await service.checkCliCommand(input);

      expect(command.test).toHaveBeenCalledWith(input);
      expect(command.runCli).toHaveBeenCalledWith(input);
    });

    it('should not execute if CLI command is not found', async () => {
      const input = 'unknown';
      const command = new Command(sharedServices);
      command.test = jest.fn().mockReturnValue(false);
      command.runCli = jest.fn();

      CommandService['registeredCommands'] = [command];

      await service.checkCliCommand(input);

      expect(command.test).toHaveBeenCalledWith(input);
      expect(command.runCli).not.toHaveBeenCalled();
    });
  });

  describe('getCommand', () => {
    it('should return the command if found', () => {
      const command = new Command(sharedServices);
      command.name = 'test';

      CommandService['registeredCommands'] = [command];

      const result = service.getCommand('test');

      expect(result).toBe(command);
    });

    it('should return undefined if command is not found', () => {
      const command = new Command(sharedServices);
      command.name = 'test';

      CommandService['registeredCommands'] = [command];

      const result = service.getCommand('unknown');

      expect(result).toBeUndefined();
    });
  });

  describe('getAllCommands', () => {
    it('should return all registered commands', () => {
      const command1 = new Command(sharedServices);
      const command2 = new Command(sharedServices);

      CommandService['registeredCommands'] = [command1, command2];

      const result = service.getAllCommands;

      expect(result).toEqual([command1, command2]);
    });
  });

  describe('getPrefixCommands', () => {
    it('should return all commands that run with a prefix', () => {
      const command1 = new Command(sharedServices);
      command1.runPrefix = jest.fn();
      const command2 = new Command(sharedServices);

      CommandService['registeredCommands'] = [command1, command2];

      const result = service.getPrefixCommands;

      expect(result).toEqual([command1]);
    });
  });

  describe('getSlashCommands', () => {
    it('should return all commands that run as slash commands', () => {
      const command1 = new Command(sharedServices);
      command1.runSlash = jest.fn();
      const command2 = new Command(sharedServices);

      CommandService['registeredCommands'] = [command1, command2];

      const result = service.getSlashCommands;

      expect(result).toEqual([command1]);
    });
  });

  describe('getCliCommands', () => {
    it('should return all commands that run as CLI commands', () => {
      const command1 = new Command(sharedServices);
      command1.runCli = jest.fn();
      const command2 = new Command(sharedServices);

      CommandService['registeredCommands'] = [command1, command2];

      const result = service.getCliCommands;

      expect(result).toEqual([command1]);
    });
  });

  describe('registerCommands', () => {
    it('should handle errors', async () => {
      jest
        .spyOn(CommandsLoaderUtil, 'loadCommandsInDirectory')
        .mockImplementation(() => {
          throw new Error('Error loading commands');
        });

      await expect(service.registerCommands()).rejects.toThrow(
        'Error loading commands',
      );
    });
  });

  describe('checkButton', () => {
    it('should handle errors', async () => {
      const interaction = {
        customId: 'testButton',
      } as unknown as DiscordInteraction;
      const command = new Command(sharedServices);
      command.buttons = {
        testButton: jest.fn().mockImplementation(() => {
          throw new Error('Error');
        }),
      };

      CommandService['registeredCommands'] = [command];

      await service.checkButton(interaction);

      expect(Logger.error).toHaveBeenCalledWith(
        `[Ririko CommandService] └─ execution failed: Error`,
        expect.any(String),
      );
    });
  });

  describe('checkCliCommand', () => {
    it('should handle errors', async () => {
      const input = 'test';
      const command = new Command(sharedServices);
      command.test = jest.fn().mockReturnValue(true);
      command.runCli = jest.fn().mockImplementation(() => {
        throw new Error('Error');
      });

      CommandService['registeredCommands'] = [command];

      await service.checkCliCommand(input);

      expect(Logger.error).toHaveBeenCalledWith(
        `[Ririko CommandService] └─ execution failed: Error`,
        expect.any(String),
      );
    });
  });

  describe('runChatMenuCommand', () => {
    it('should handle errors', async () => {
      const command = new Command(sharedServices);
      const interaction = {
        reply: jest.fn(),
      } as unknown as DiscordInteraction;
      command.runChatMenu = jest.fn().mockImplementation(() => {
        throw new Error('Error');
      });

      await service['runChatMenuCommand'](command, interaction);

      expect(Logger.error).toHaveBeenCalledWith(
        `[Ririko CommandService] └─ execution failed: Error`,
        expect.any(String),
      );
    });
  });

  describe('runUserMenuCommand', () => {
    it('should handle errors', async () => {
      const command = new Command(sharedServices);
      const interaction = {
        reply: jest.fn(),
      } as unknown as DiscordInteraction;
      command.runUserMenu = jest.fn().mockImplementation(() => {
        throw new Error('Error');
      });

      await service['runUserMenuCommand'](command, interaction);

      expect(Logger.error).toHaveBeenCalledWith(
        `[Ririko CommandService] └─ execution failed: Error`,
        expect.any(String),
      );
    });
  });

  describe('runButtonCommand', () => {
    it('should handle errors', async () => {
      const command = new Command(sharedServices);
      const interaction = {
        customId: 'testButton',
      } as unknown as DiscordInteraction;
      command.buttons = {
        testButton: jest.fn().mockImplementation(() => {
          throw new Error('Error');
        }),
      };

      await service['runButtonCommand'](
        command,
        interaction,
        command.buttons.testButton,
      );

      expect(Logger.error).toHaveBeenCalledWith(
        `[Ririko CommandService] └─ execution failed: Error`,
        expect.any(String),
      );
    });
  });

  describe('runCliCommand', () => {
    it('should handle errors', async () => {
      const command = new Command(sharedServices);
      command.runCli = jest.fn().mockImplementation(() => {
        throw new Error('Error');
      });

      await service['runCliCommand'](command, 'test');

      expect(Logger.error).toHaveBeenCalledWith(
        `[Ririko CommandService] └─ execution failed: Error`,
        expect.any(String),
      );
    });
  });

  describe('checkPermissions', () => {
    it('should return true if the user has the required permissions', async () => {
      const command = new Command(sharedServices);
      command.permissions = ['BanMembers'];
      const message = {
        member: {
          permissions: {
            has: jest.fn().mockReturnValue(true),
          },
        },
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      const result = await service['checkPermissions'](command, message);

      expect(result).toBe(true);
    });

    it('should return false if the user does not have the required permissions', async () => {
      const command = new Command(sharedServices);
      command.permissions = ['BanMembers'];
      const message = {
        member: {
          permissions: {
            has: jest.fn().mockReturnValue(false),
          },
        },
        guild: {
          id: '123',
          name: 'test',
        },
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      const result = await service['checkPermissions'](command, message);

      expect(result).toBe(false);
      expect(message.reply).toHaveBeenCalledWith(
        'You have no permission to run this command',
      );
    });

    it('should handle errors and return false', async () => {
      const command = new Command(sharedServices);
      command.permissions = ['BanMembers'];
      const message = {
        member: {
          permissions: {
            has: jest.fn().mockImplementation(() => {
              throw new Error('Error');
            }),
          },
        },
        guild: {
          id: '123',
          name: 'test',
        },
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      const result = await service['checkPermissions'](command, message);

      expect(result).toBe(false);
      expect(message.reply).toHaveBeenCalledWith(
        'You have no permission to run this command',
      );
    });
  });
});
