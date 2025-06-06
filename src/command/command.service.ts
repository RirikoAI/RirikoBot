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
import { DatabaseService } from '#database/database.service';

export const guildCommandCategories = [
  'ai',
  'economy',
  'games',
  'general',
  'giveaway',
  'guild',
  'moderation',
  'music',
  'stablediffusion',
  'twitch',
];

/**
 * Service for registering and executing commands.
 * @author Earnest Angel (https://angel.net.my)
 */
@Injectable()
export class CommandService {
  private static registeredGlobalCommands: Command[] = [];
  private static registeredGuildCommands: Command[] = [];

  constructor(
    // Inject dependencies into CommandService
    readonly config: ConfigService,
    @Inject(forwardRef(() => DiscordService))
    readonly discord: DiscordService,
    // Inject the SHARED_SERVICES into CommandService. This will be used to pass services to all commands
    @Inject('SHARED_SERVICES')
    readonly services: SharedServices,
    @Inject(DatabaseService)
    readonly db: DatabaseService,
  ) {}

  /**
   * Register all commands in the current directory.
   */
  async registerInteractionCommands(): Promise<{
    registeredGlobalCommands: Command[];
    registeredGuildCommands: Command[];
  }> {
    // Recursively load all commands in the current directory
    const commandList = CommandsLoaderUtil.loadCommandsInDirectory(
      // __dirname is the current directory (/src/command)
      join(__dirname),
    );

    // Instantiate global commands and register them in registeredGlobalCommands array
    CommandService.registeredGlobalCommands =
      CommandsLoaderUtil.instantiateCommands(
        commandList.globalCommandList,
        // Pass the services to all commands when instantiating them
        { ...this.services, db: this.db },
      );

    // Instantiate guild commands and register them in registeredGuildCommands array
    CommandService.registeredGuildCommands =
      CommandsLoaderUtil.instantiateCommands(
        commandList.guildCommandList,
        // Pass the services to all commands when instantiating them
        { ...this.services, db: this.db },
      );

    Logger.log(
      `Registering ${CommandService.registeredGlobalCommands.length} global commands`,
      'Ririko CommandService',
    );

    await CommandsLoaderUtil.registerInteractionCommands(
      CommandService.registeredGlobalCommands,
      this.discord.client,
      this.config,
    );

    // foreach guilds, register guild commands
    const guilds = this.discord.client.guilds.cache;

    guilds.forEach((guild) => {
      Logger.log(
        `Registering ${CommandService.registeredGuildCommands.length} guild commands for: ${guild.name}`,
        'Ririko CommandService',
      );
      CommandsLoaderUtil.registerInteractionCommandsInAGuild(
        CommandService.registeredGuildCommands,
        this.discord.client,
        this.config,
        guild.id,
      );
    });

    // Return the list of registered commands
    return {
      registeredGlobalCommands: CommandService.registeredGlobalCommands,
      registeredGuildCommands: CommandService.registeredGuildCommands,
    };
  }

  get registeredCommands() {
    return CommandService.registeredGlobalCommands.concat(
      CommandService.registeredGuildCommands,
    );
  }

  get registeredGlobalCommands() {
    return CommandService.registeredGlobalCommands;
  }

  get registeredGuildCommands() {
    return CommandService.registeredGuildCommands;
  }

  /**
   * Check if a command is prefixed with the guild prefix and execute it.
   *
   * This method is called by the MessageCreateEvent event handler.
   * @see MessageCreateEvent
   * @param message
   */
  async checkPrefixCommand(message: DiscordMessage) {
    // check if user is messaging from a guild, if not ignore
    if (!message.guild) return;

    // Check if the guild has a custom prefix, if not use the default prefix
    const guildPrefix = await this.getGuildPrefix(message);
    const prefixRegExp = RegexHelperUtil.getPrefixRegExp(guildPrefix);

    // Check a command is prefixed with the guild prefix otherwise ignore
    if (!prefixRegExp.test(message.content)) return;

    // ignore if the command is undefined
    if (!message.content) return;

    // Remove the prefix from the message content
    message.content = message.content.replace(guildPrefix, '').trim();

    // Loop through all registered commands and execute the first one that matches
    for (const command of this.registeredCommands) {
      if (command.test(message.content)) {
        command.setParams(message.content);

        if (!command.runPrefix) continue;

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
  async checkInteractionCommand(interaction: DiscordInteraction) {
    // ignore if the commandName is undefined
    if (!interaction.commandName) return;

    // Loop through all registered commands and execute the first one that matches
    for (const command of this.registeredCommands) {
      if (command.test(interaction.commandName)) {
        // check if the interaction is a message command
        if (interaction.isMessageContextMenuCommand()) {
          Logger.debug(
            `Received message context menu command: ${(interaction as any).commandName}`,
            'Ririko CommandService',
          );
          await this.runChatMenuCommand(command, interaction);
          return command;
        } else if ((interaction as any).isContextMenuCommand()) {
          // check if the interaction is a context menu command
          Logger.debug(
            `Received user context menu command: ${(interaction as any).commandName}`,
            'Ririko CommandService',
          );
          await this.runUserMenuCommand(command, interaction);
          return command;
        } else {
          // check if the interaction is a slash command
          Logger.debug(
            `Received slash command: ${(interaction as any).commandName}`,
            'Ririko CommandService',
          );
          await this.runSlashCommand(command, interaction);
          return command;
        }
      }
    }

    Logger.debug(
      `Interaction command not found: ${interaction.commandName}`,
      'Ririko CommandService',
    );
  }

  /**
   * Check if a command is a button and execute
   * @param interaction
   */
  async checkButton(interaction: DiscordInteraction) {
    // Loop through all registered commands and execute the first one that matches
    for (const command of this.registeredCommands) {
      // check if the command has buttons
      if (command.buttons) {
        const button = command.buttons[interaction.customId];
        if (button) {
          Logger.debug(
            `Received button interaction: ${interaction.customId}`,
            'Ririko CommandService',
          );
          await this.runButtonCommand(command, interaction, button);
        }
      }
    }
  }

  /**
   * Check if a command is a modal interaction and execute
   * @param interaction
   */
  async checkModal(interaction: DiscordInteraction) {
    // Loop through all registered commands and execute the first one that matches
    for (const command of this.registeredCommands) {
      // check if the command has modals
      if (command.modals) {
        const modal = command.modals[interaction.customId];
        if (modal) {
          Logger.debug(
            `Received modal interaction: ${interaction.customId}`,
            'Ririko CommandService',
          );
          await this.runModalCommand(command, interaction, modal);
        }
      }
    }
  }

  async checkCliCommand(input: string) {
    // Loop through all registered commands and execute the first one that matches
    for (const command of this.registeredCommands) {
      if (command.test(input)) {
        if (command?.runCli) {
          await this.runCliCommand(command, input);
          return command;
        }
      }
    }

    Logger.error(`CLI command not found: ${input}`, 'Ririko CommandService');
  }

  getCommand(name: string): CommandInterface | undefined {
    return this.registeredCommands.find(
      (command) => command.name === name,
    ) as any as CommandInterface;
  }

  get getAllCommands(): Command[] {
    return this.registeredCommands;
  }

  get getPrefixCommands(): Command[] {
    return this.registeredCommands.filter((command) => command.runPrefix);
  }

  get getSlashCommands(): Command[] {
    return this.registeredCommands.filter((command) => command.runSlash);
  }

  get getCliCommands(): Command[] {
    return this.registeredCommands.filter((command) => command.runCli);
  }

  async getGuildPrefix(message: DiscordMessage): Promise<string> {
    try {
      const guildId = message.guild.id;
      const guild = await this.db.guildRepository.findOne({
        where: {
          id: guildId,
        },
      });

      return guild.prefix;
    } catch (error) {
      return this?.services?.config?.get('DEFAULT_PREFIX') || '!';
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
      if (!(await this.checkPermissions(command, message))) return false;
      Logger.debug(
        `└─ executing prefix command [${command.name}] => ${message.content}`,
        'Ririko CommandService',
      );
      command.runPrefix(message);
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
      await message.channel.send({ embeds: [errorEmbed] });
    }
  }

  /**
   * Execute a command that is a slash command.
   * @param command {CommandInterface}
   * @param interaction {DiscordInteraction}
   * @private
   */
  private async runSlashCommand(
    command: Command,
    interaction: DiscordInteraction,
  ) {
    try {
      if (!(await this.checkPermissions(command, interaction))) return false;
      Logger.debug(
        `└─ executing slash command [${command.name}] => ${interaction.commandName}`,
        'Ririko CommandService',
      );
      command.runSlash(interaction);
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
      await interaction.channel.send({ embeds: [errorEmbed] });
    }
  }

  private async runChatMenuCommand(
    command: Command,
    interaction: DiscordInteraction,
  ) {
    try {
      if (!(await this.checkPermissions(command, interaction))) return false;
      Logger.debug(
        `└─ executing chat menu command [${command.name}] => ${interaction.commandName}`,
        'Ririko CommandService',
      );
      command.runChatMenu(interaction);
      return;
    } catch (error) {
      Logger.error(
        `[Ririko CommandService] └─ execution failed: ${error.message}`,
        error.stack,
      );
    }
  }

  private async runUserMenuCommand(
    command: Command,
    interaction: DiscordInteraction,
  ) {
    try {
      if (!(await this.checkPermissions(command, interaction))) return false;
      Logger.debug(
        `└─ executing user menu command [${command.name}] => ${interaction.commandName}`,
        'Ririko CommandService',
      );
      command.runUserMenu(interaction);
      return;
    } catch (error) {
      Logger.error(
        `[Ririko CommandService] └─ execution failed: ${error.message}`,
        error.stack,
      );
    }
  }

  private async runButtonCommand(
    command: Command,
    interaction: DiscordInteraction,
    button: any,
  ) {
    try {
      if (!(await this.checkPermissions(command, interaction))) return false;
      Logger.debug(
        `└─ executing button command [${command.name}] => ${interaction.customId}`,
        'Ririko CommandService',
      );
      const promise = button.bind(command);
      promise.call(command, interaction);
      return;
    } catch (error) {
      Logger.error(
        `[Ririko CommandService] └─ execution failed: ${error.message}`,
        error.stack,
      );
    }
  }

  private async runModalCommand(
    command: Command,
    interaction: DiscordInteraction,
    modal: any,
  ) {
    try {
      if (!(await this.checkPermissions(command, interaction))) return false;
      Logger.debug(
        `└─ executing modal command [${command.name}] => ${interaction.customId}`,
        'Ririko CommandService',
      );
      const promise = modal.bind(command);
      promise.call(command, interaction);
      return;
    } catch (error) {
      Logger.error(
        `[Ririko CommandService] └─ execution failed: ${error.message}`,
        error.stack,
      );
    }
  }

  private async runCliCommand(command: Command, input: string) {
    try {
      command.runCli(input);
      return;
    } catch (error) {
      Logger.error(
        `[Ririko CommandService] └─ execution failed: ${error.message}`,
        error.stack,
      );
    }
  }

  private async checkPermissions(
    command: Command,
    message: DiscordMessage | DiscordInteraction,
  ) {
    try {
      const hasPermissions = await command.hasPermissions(
        message.member,
        command.permissions,
      );
      if (!hasPermissions) {
        Logger.error(
          `${message.member.user.displayName} has no permission to run command ${command.name} in ${message.guild.name}. Permissions needed: ${command.permissions.join(', ')}`,
          'Ririko CommandService',
        );
        await message.reply(`You have no permission to run this command`);
        return false;
      }
      return true;
    } catch (e) {
      Logger.error(
        `Error checking permissions / User has no permission to run command ${command.name} in ${message.guild.name}. Permissions needed: ${command.permissions.join(', ')}`,
        'Ririko CommandService',
      );
      await message.reply('You have no permission to run this command');
      return false;
    }
  }
}
