import { readdirSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { Command } from '#command/command.class';
import { CommandsLoaderUtil } from '#util/command/commands-loader.util';

jest.mock('fs');
jest.mock('path');
jest.mock('@nestjs/common', () => ({
  Logger: {
    log: jest.fn(),
  },
}));
jest.mock('@nestjs/config');
jest.mock('@nestjs/Injectable');
jest.mock('#discord/discord.client');
jest.mock('#command/command.class');

describe('CommandsLoaderUtil', () => {
  describe('loadCommandsInDirectory', () => {
    it('should load commands from a directory', () => {
      const dir = 'testDir';
      const entries = [
        {
          name: 'test.command.ts',
          isFile: () => true,
          isDirectory: () => false,
        },
        { name: 'subDir', isFile: () => false, isDirectory: () => true },
      ];
      const fullPath = 'testDir/test.command.ts';
      const CommandClass = jest.fn().mockImplementation(() => ({
        prototype: Command.prototype,
      }));

      (readdirSync as jest.Mock).mockReturnValue(entries);
      (join as jest.Mock).mockReturnValue(fullPath);
      jest.mock(fullPath, () => CommandClass, { virtual: true });

      const result = CommandsLoaderUtil.loadCommandsInDirectory(dir);

      expect(readdirSync).toHaveBeenCalledWith(dir, { withFileTypes: true });
      expect(join).toHaveBeenCalledWith(dir, 'test.command.ts');
      expect(result).toContain(CommandClass);
    });
  });

  describe('instantiateCommands', () => {
    it('should instantiate commands', () => {
      const commandList = [jest.fn()];
      const commandServices = {};
      const commandInstance = {
        name: 'test',
        description: 'test description',
        runPrefix: jest.fn(),
        runSlash: jest.fn(),
      };

      commandList[0].mockImplementation(() => commandInstance);

      const result = CommandsLoaderUtil.instantiateCommands(
        commandList,
        commandServices as any,
      );

      expect(result).toContain(commandInstance);
      expect(Logger.log).toHaveBeenCalledWith(
        'test registered (prefix,slash) => test description',
        'Ririko CommandService',
      );
    });
  });

  describe('putSlashCommandsInGuilds', () => {
    it('should register slash commands in all guilds', async () => {
      const commands = [{ runSlash: jest.fn() }];
      const client = { restClient: { put: jest.fn() } };
      const config = { get: jest.fn().mockReturnValue('appId') };

      await CommandsLoaderUtil.putSlashCommandsInGuilds(
        commands as any,
        client as any,
        config as any,
      );

      expect(client.restClient.put).toHaveBeenCalledWith(expect.any(String), {
        body: expect.any(Array),
      });
    });
  });

  describe('putSlashCommandsInAGuild', () => {
    it('should register slash commands in a specific guild', async () => {
      const commands = [{ runSlash: jest.fn() }];
      const client = { restClient: { put: jest.fn() } };
      const config = { get: jest.fn().mockReturnValue('appId') };
      const guildId = 'guildId';

      await CommandsLoaderUtil.putSlashCommandsInAGuild(
        commands as any,
        client as any,
        config as any,
        guildId,
      );

      expect(client.restClient.put).toHaveBeenCalledWith(expect.any(String), {
        body: expect.any(Array),
      });
    });
  });
});