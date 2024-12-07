import { Test, TestingModule } from '@nestjs/testing';
import { CommandService } from './command.service';
import { ConfigService } from '@nestjs/config';
import { DiscordService } from '#discord/discord.service';
import { DatabaseService } from '#database/database.service';
import { SharedServices } from '#command/command.module';
import { Command } from '#command/command.class';
import { DiscordMessage, DiscordInteraction } from '#command/command.types';
import CommandsLoaderUtil from '#util/command/commands-loader.util';

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
});
