import { CommandsLoaderUtil } from '#util/command/commands-loader.util';
import { SharedServiceUtil } from '#util/command/shared-service.util';

jest.mock('fs');
jest.mock('path');
jest.mock('@nestjs/config');
jest.mock('#discord/discord.client');
jest.mock('#command/command.class');

describe('CommandsLoaderUtil', () => {
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
    });
  });

  describe('putSlashCommandsInGuilds', () => {
    it('should register slash commands in all guilds', async () => {
      const commands = [{ runSlash: jest.fn() }];
      const client = { restClient: { put: jest.fn() } };
      const config = { get: jest.fn().mockReturnValue('appId') };

      await CommandsLoaderUtil.putInteractionCommandsInGuilds(
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

      await CommandsLoaderUtil.putInteractionCommandsInAGuild(
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

  describe('getFactory', () => {
    it('should create a factory with the correct services', () => {
      class MockService {
        serviceA = 'Service A';
        serviceB = 'Service B';
      }

      const factory = SharedServiceUtil.getFactory('MockService', MockService);

      expect(factory.provide).toBe('MockService');
      expect(factory.inject).toEqual(['Service A', 'Service B']);

      const createdServices = factory.useFactory(
        'Service A Instance',
        'Service B Instance',
      );
      expect(createdServices).toEqual({
        serviceA: 'Service A Instance',
        serviceB: 'Service B Instance',
      });
    });
  });
});
