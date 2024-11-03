import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { Message, EmbedBuilder, CommandInteraction } from 'discord.js';

import { join } from 'path';
import { CommandsLoaderUtil } from '#util/command/commands-loader.util';
import { ConfigService } from '@nestjs/config';
import { CommandInterface } from '#command/command.interface';
import { DiscordService } from '#discord/discord.service';
import { Command } from '#command/command.class';
import { DiscordClient } from '#discord/discord.client';
import RegexHelperUtil from '#util/command/regex-helper.util';

// Services for all commands
export interface CommandServices {
  config: ConfigService;
  discord: DiscordService;
  client: DiscordClient;
}

@Injectable()
export class CommandService {
  private static registeredCommands: Command[] = [];

  constructor(
    // Inject dependencies into CommandService
    readonly config: ConfigService,
    @Inject(forwardRef(() => DiscordService))
    readonly discord: DiscordService,
  ) {}

  async registerCommands(): Promise<Command[]> {
    // List of services that will be exposed to all commands
    const commandServices: CommandServices = {
      config: this.config,
      discord: this.discord,
      client: this.discord.client,
    };

    // Recursively load all commands in the current directory
    const commandList = CommandsLoaderUtil.loadCommandsInDirectory(
      // __dirname is the current directory (/src/command)
      join(__dirname),
    );

    // Instantiate all commands and register them in registeredCommands array
    CommandService.registeredCommands = CommandsLoaderUtil.instantiateCommands(
      commandList,
      commandServices,
    );

    // Register all slash commands in all guilds
    await CommandsLoaderUtil.putSlashCommandsInGuilds(CommandService.registeredCommands, this.discord.client, this.config);
    
    // Return the list of registered commands
    return CommandService.registeredCommands;
  }

  /**
   * Check if a command is prefixed with the guild prefix and execute it.
   *
   * This method is called by the MessageCreateEvent event handler.
   * @see MessageCreateEvent
   * @param message
   */
  async checkPrefixCommand(message: Message) {
    // Check if the guild has a custom prefix, if not use the default prefix
    // !todo: implement custom prefix
    const guildPrefix = this.config.get('discord.defaultPrefix');
    const prefixRegExp = RegexHelperUtil.getPrefixRegExp(guildPrefix);

    // Check a command is prefixed with the guild prefix otherwise ignore
    if (!prefixRegExp.test(message.content)) return;

    // Remove the prefix from the message content
    message.content = message.content.replace(guildPrefix, '').trim();

    // Loop through all registered commands and execute the first one that matches
    for (const command of CommandService.registeredCommands) {
      if (command.test(message.content)) {
        Logger.debug(
          `Executing prefix command: ${message.content}`,
          'Ririko CommandService',
        );
        await this.runPrefixCommand(command, message);
        return;
      } else {
        Logger.debug(
          `Prefix command not found: ${message.content}`,
          'Ririko CommandService',
        );
      }
    }
  }

  async checkSlashCommand(interaction: CommandInteraction) {
    // Loop through all registered commands and execute the first one that matches
    for (const command of CommandService.registeredCommands) {
      if (command.test(interaction.commandName)) {
        Logger.debug(
          `Executing slash command: ${interaction.commandName}`,
          'Ririko CommandService',
        );
        await this.runSlashCommand(command, interaction);
        return;
      } else {
        Logger.debug(
          `Slash command not found: ${interaction.commandName}`,
          'Ririko CommandService',
        );
      }
    }
  }

  /**
   * Execute a command that is prefixed with the guild prefix.
   * @param command {CommandInterface}
   * @param message {Message}
   * @private
   */
  private async runPrefixCommand(command: CommandInterface, message: Message) {
    try {
      Logger.debug(
        `executing prefix command [${command.name}] => ${message.content}`,
      );
      await command.runPrefix(message);
      return;
    } catch (error) {
      Logger.error(error.message, error.stack);
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setDescription(error.message);
      await message.reply({ embeds: [errorEmbed] });
    }
  }

  /**
   * Execute a command that is a slash command.
   * @param command {CommandInterface}
   * @param interaction {CommandInteraction}
   * @private
   */
  private async runSlashCommand(
    command: CommandInterface,
    interaction: CommandInteraction,
  ) {
    try {
      Logger.debug(
        `executing slash command [${command.name}] => ${interaction.commandName}`,
      );
      await command.runSlash(interaction);
      return;
    } catch (error) {
      Logger.error(error.message, error.stack);
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setDescription(error.message);
      await interaction.reply({ embeds: [errorEmbed] });
    }
  }
}
