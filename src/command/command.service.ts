import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { EmbedBuilder } from 'discord.js';

import { join } from 'path';
import { CommandsLoaderUtil } from '#util/command/commands-loader.util';
import { ConfigService } from '@nestjs/config';
import { DiscordService } from '#discord/discord.service';
import { Command } from '#command/command.class';
import RegexHelperUtil from '#util/command/regex-helper.util';
import { SharedServices } from '#command/command.module';
import { CommandInterface } from '#command/command.interface';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';

/**
 * Service for registering and executing commands.
 * @author Earnest Angel (https://angel.net.my)
 */
@Injectable()
export class CommandService {
  private static registeredCommands: Command[] = [];

  constructor(
    // Inject dependencies into CommandService
    readonly config: ConfigService,
    @Inject(forwardRef(() => DiscordService))
    readonly discord: DiscordService,
    // Inject the SHARED_SERVICES into CommandService. This will be used to pass services to all commands
    @Inject('SHARED_SERVICES')
    readonly services: SharedServices,
  ) {}

  /**
   * Register all commands in the current directory.
   * If guildId is provided, register the commands only in that guild.
   * @param guildId
   */
  async registerCommands(guildId: null | string = null): Promise<Command[]> {
    // Recursively load all commands in the current directory
    const commandList = CommandsLoaderUtil.loadCommandsInDirectory(
      // __dirname is the current directory (/src/command)
      join(__dirname),
    );

    // Instantiate all commands and register them in registeredCommands array
    CommandService.registeredCommands = CommandsLoaderUtil.instantiateCommands(
      commandList,
      // Pass the services to all commands when instantiating them
      this.services,
    );

    // If guildId is provided, register the commands only in that guild
    if (guildId) {
      await CommandsLoaderUtil.putSlashCommandsInAGuild(
        CommandService.registeredCommands,
        this.discord.client,
        this.config,
        guildId,
      );
      return CommandService.registeredCommands;
    } else {
      // Register all slash commands in all guilds
      await CommandsLoaderUtil.putSlashCommandsInGuilds(
        CommandService.registeredCommands,
        this.discord.client,
        this.config,
      );
    }

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
  async checkPrefixCommand(message: DiscordMessage) {
    // Check if the guild has a custom prefix, if not use the default prefix
    // !todo: implement custom prefix
    const guildPrefix = await this.getGuildPrefix(message);
    const prefixRegExp = RegexHelperUtil.getPrefixRegExp(guildPrefix);

    // Check a command is prefixed with the guild prefix otherwise ignore
    if (!prefixRegExp.test(message.content)) return;

    // ignore if the command is undefined
    if (!message.content) return;

    // Remove the prefix from the message content
    message.content = message.content.replace(guildPrefix, '').trim();

    // Loop through all registered commands and execute the first one that matches
    for (const command of CommandService.registeredCommands) {
      if (command.test(message.content)) {
        command.setParams(message.content);
        Logger.debug(
          `Received prefix command: ${message.content.substring(0, message.content.indexOf(' '))} Params: ${command.params.length > 0 ? command.params.join(', ') : 'None'}`,
          'Ririko CommandService',
        );

        await this.runPrefixCommand(command, message);
        return;
      }
    }

    Logger.debug(
      `Prefix command not found: ${message.content}`,
      'Ririko CommandService',
    );

    // If the command is not found, reply with an error message
    const errorEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('❌ Command not found')
      .setDescription(
        'Check if the command exists or if it requires arguments. Use `help` command to see all available commands.',
      );
    await message.reply({ embeds: [errorEmbed] });
  }

  /**
   * Check if a command is a slash command and execute it.
   *
   * This method is called by the InteractionCreateEvent event handler.
   * @see InteractionCreateEvent
   * @param interaction
   */
  async checkSlashCommand(interaction: DiscordInteraction) {
    // ignore if the commandName is undefined
    if (!interaction.commandName) return;

    // Loop through all registered commands and execute the first one that matches
    for (const command of CommandService.registeredCommands) {
      if (command.test(interaction.commandName)) {
        Logger.debug(
          `Received slash command: ${interaction.commandName}`,
          'Ririko CommandService',
        );
        await this.runSlashCommand(command, interaction);
        return;
      }
    }

    Logger.debug(
      `Slash command not found: ${interaction.commandName}`,
      'Ririko CommandService',
    );
  }

  getCommand(name: string): CommandInterface | undefined {
    return CommandService.registeredCommands.find(
      (command) => command.name === name,
    ) as any as CommandInterface;
  }

  get getAllCommands(): Command[] {
    return CommandService.registeredCommands;
  }

  get getPrefixCommands(): Command[] {
    return CommandService.registeredCommands.filter(
      (command) => command.runPrefix,
    );
  }

  get getSlashCommands(): Command[] {
    return CommandService.registeredCommands.filter(
      (command) => command.runSlash,
    );
  }

  async getGuildPrefix(message: DiscordMessage): Promise<string> {
    try {
      const guildId = message.guild.id;
      const guild = await this.services.guildRepository.findOne({
        where: {
          guildId,
        },
      });

      return guild.prefix;
    } catch (error) {
      return this.services.config.get('DEFAULT_PREFIX');
    }
  }

  /**
   * Execute a command that is prefixed with the guild prefix.
   * @param command {Command}
   * @param message {Message}
   * @private
   */
  private async runPrefixCommand(command: Command, message: DiscordMessage) {
    try {
      Logger.debug(
        `└─ executing prefix command [${command.name}] => ${message.content}`,
        'Ririko CommandService',
      );
      await command.runPrefix(message);
      return;
    } catch (error) {
      Logger.error(
        `[Ririko CommandService] └─ execution failed: ${error.message}`,
        error.stack,
      );
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Prefix Command Error')
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
    command: Command,
    interaction: DiscordInteraction,
  ) {
    try {
      Logger.debug(
        `└─ executing slash command [${command.name}] => ${interaction.commandName}`,
        'Ririko CommandService',
      );
      await command.runSlash(interaction);
      return;
    } catch (error) {
      Logger.error(
        `[Ririko CommandService] └─ execution failed: ${error.message}`,
        error.stack,
      );
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Slash Command Error')
        .setColor('#ff0000')
        .setDescription(error.message);
      await interaction.reply({ embeds: [errorEmbed] });
    }
  }
}
