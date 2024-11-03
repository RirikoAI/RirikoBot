import { readdirSync } from 'fs';
import { join } from 'path';
import { Command, CommandConstructor } from '#command/command.class';
import { Logger } from '@nestjs/common';
import { CommandServices } from '#command/command.service';
import { DiscordClient } from '#discord/discord.client';
import { Routes } from 'discord.js';
import { ConfigService } from '@nestjs/config';

const CommandList: Command[] = [];

export const CommandsLoaderUtil = {
  /**
   * Recursively load all commands in a directory
   * @param dir
   */
  loadCommandsInDirectory: (dir: string): Command[] => {
    return loadCommandsInDirectory(dir);
  },
  /**
   * Instantiate all commands
   * @param commandList
   * @param commandServices
   */
  instantiateCommands: (commandList: any, commandServices: CommandServices) => {
    return instantiateCommands(commandList, commandServices);
  },
  /**
   * Register all slash commands in all guilds
   * @param commands
   * @param client
   * @param config
   */
  putSlashCommandsInGuilds: async (
    commands: Command[],
    client: DiscordClient,
    config: ConfigService,
  ) => {
    await putSlashCommandsInGuilds(commands, client, config);
  },
  /**
   * Register all slash commands in a specific guild
   * @param commands
   * @param client
   * @param config
   * @param guildId
   */
  putSlashCommandsInAGuild: async (
    commands: Command[],
    client: DiscordClient,
    config: ConfigService,
    guildId: string,
  ) => {
    await putSlashCommandsInAGuild(commands, client, config, guildId);
  },
};

const loadCommandsInDirectory = (dir: string): Command[] => {
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Recursively load commands from subdirectories
      loadCommandsInDirectory(fullPath);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.command.js') || entry.name.endsWith('.command.ts'))
    ) {
      // Dynamically require the command class
      const CommandClass = require(fullPath).default;

      // Check if the class extends the Command base class
      if (CommandClass && CommandClass.prototype instanceof Command) {
        CommandList.push(CommandClass); // Instantiate and add to the CommandList
      }
    }
  }

  return CommandList;
};

const instantiateCommands = (
  commandList: CommandConstructor[],
  commandServices: CommandServices,
) => {
  const instantiatedCommands: Command[] = [];
  for (const command of commandList as any as CommandConstructor[]) {
    const commandInstance: Command = new command(commandServices);
    Logger.log(
      `${commandInstance.name} registered => ${commandInstance.description}`,
      'Ririko CommandService',
    );
    instantiatedCommands.push(commandInstance);
  }
  return instantiatedCommands;
};

const putSlashCommandsInGuilds = async (
  commands: Command[],
  client: DiscordClient,
  config: ConfigService,
) => {
  await client?.restClient.put(
    Routes.applicationCommands(config.get('DISCORD_APPLICATION_ID')),
    {
      body: prepareSlashCommands(commands),
    },
  );
};

const putSlashCommandsInAGuild = async (
  commands: Command[],
  client: DiscordClient,
  config: ConfigService,
  guildId: string,
) => {
  await client?.restClient.put(
    Routes.applicationGuildCommands(
      config.get('DISCORD_APPLICATION_ID'),
      guildId,
    ),
    {
      body: prepareSlashCommands(commands),
    },
  );
};

const prepareSlashCommands = (commands: Command[]) => {
  return commands
    .map((command) => {
      // Only return the command if it has a runSlash method
      if (command.runSlash) {
        return {
          name: command.name,
          description: command.description,
        };
      }
    })
    .filter(Boolean);
};

export default CommandsLoaderUtil;
