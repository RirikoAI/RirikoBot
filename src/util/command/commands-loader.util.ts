import { readdirSync } from 'fs';
import { join } from 'path';
import { Command, CommandConstructor } from '#command/command.class';
import { Logger } from '@nestjs/common';
import { DiscordClient } from '#discord/discord.client';
import { Routes } from 'discord.js';
import { ConfigService } from '@nestjs/config';
import { SharedServices } from '#command/command.module';

const CommandList: Command[] = [];

/**
 * Utility class to load and instantiate commands
 * @author Earnest Angel (https://angel.net.my)
 */
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
  instantiateCommands: (commandList: any, commandServices: SharedServices) => {
    return instantiateCommands(commandList, commandServices);
  },
  /**
   * Register all slash commands in all guilds
   * @param commands
   * @param client
   * @param config
   */
  putInteractionCommandsInGuilds: async (
    commands: Command[],
    client: DiscordClient,
    config: ConfigService,
  ) => {
    await putInteractionCommandsInGuilds(commands, client, config);
  },
  /**
   * Register all commands in a specific guild
   * @param commands
   * @param client
   * @param config
   * @param guildId
   */
  putInteractionCommandsInAGuild: async (
    commands: Command[],
    client: DiscordClient,
    config: ConfigService,
    guildId: string,
  ) => {
    await putInteractionCommandsInAGuild(commands, client, config, guildId);
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
  commandServices: SharedServices,
) => {
  const instantiatedCommands: Command[] = [];
  for (const command of commandList as any as CommandConstructor[]) {
    const commandInstance: Command = new command(commandServices);

    const types = [];
    if (commandInstance.runPrefix) {
      types.push('prefix');
    }
    if (commandInstance.runSlash) {
      types.push('slash');
    }
    if (commandInstance.runUserMenu) {
      types.push('userMenu');
    }
    if (commandInstance.runChatMenu) {
      types.push('chatMenu');
    }

    Logger.log(
      `${commandInstance.name} registered (${types.join(',')}) => ${commandInstance.description}`,
      'Ririko CommandService',
    );
    instantiatedCommands.push(commandInstance);
  }
  return instantiatedCommands;
};

const putInteractionCommandsInGuilds = async (
  commands: Command[],
  client: DiscordClient,
  config: ConfigService,
) => {
  // Register the commands in the global scope
  await client?.restClient.put(
    Routes.applicationCommands(config.get('DISCORD_APPLICATION_ID')),
    {
      body: prepareInteractionCommands(commands),
    },
  );
};

const putInteractionCommandsInAGuild = async (
  commands: Command[],
  client: DiscordClient,
  config: ConfigService,
  guildId: string,
) => {
  // Delete commands in the guild scope, so that we can re-register them.
  await client?.restClient.put(
    Routes.applicationGuildCommands(
      config.get('DISCORD_APPLICATION_ID'),
      guildId,
    ),
    {
      body: [],
    },
  );

  await client?.restClient.put(
    Routes.applicationGuildCommands(
      config.get('DISCORD_APPLICATION_ID'),
      guildId,
    ),
    {
      body: prepareInteractionCommands(commands),
    },
  );
};

const prepareInteractionCommands = (commands: Command[]) => {
  const cmd: any[] = [];

  commands.forEach((command) => {
    if (command.runSlash) {
      cmd.push({
        name: command.name,
        description: command.description,
        type: 1,
        // Check if the command has slashOptions, otherwise don't pass "options"
        options: command.slashOptions
          ? command.slashOptions.map((option) => {
              return {
                type: option.type,
                name: option.name,
                description: option.description,
                required: option?.required,
                options: option?.options,
              };
            })
          : undefined,
      });
    }

    if (command.runUserMenu) {
      cmd.push({
        name: command.userMenuOption.name,
        type: 2,
      });
    }

    if (command.runChatMenu) {
      cmd.push({
        name: command.chatMenuOption.name,
        type: 3,
      });
    }
  });

  return cmd;
};

export default CommandsLoaderUtil;
