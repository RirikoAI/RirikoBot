import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { Message, EmbedBuilder } from 'discord.js';

import { join } from 'path';
import { commandsLoaderUtil } from '#util/command/commands-loader.util';
import { ConfigService } from '@nestjs/config';
import { CommandInterface } from '#command/command.interface';
import { DiscordService } from '#discord/discord.service';
import { Command, CommandConstructor } from '#command/command.class';

export interface CommandServices {
  config: ConfigService;
  discord: DiscordService;
}

@Injectable()
export class CommandService {
  private static registeredCommands: Command[] = [];

  private readonly services: CommandServices;

  constructor(
    // Inject dependencies into CommandService
    readonly config: ConfigService,
    @Inject(forwardRef(() => DiscordService))
    readonly discord: DiscordService,
  ) {
    // Services to be exposed to all commands
    this.services = {
      config,
      discord,
    };
  }

  async registerCommands(): Promise<Command[]> {
    const commandDirectory = join(__dirname);

    const commandList = commandsLoaderUtil(commandDirectory);
    for (const command of commandList as any as CommandConstructor[]) {
      const commandInstance: Command = new command(this.services);
      Logger.log(
        `${commandInstance.name} registered => ${commandInstance.description}`,
        'Ririko CommandService',
      );
      CommandService.registeredCommands.push(commandInstance);
    }
    return CommandService.registeredCommands;
  }

  getRegisteredCommands(): Command[] {
    return CommandService.registeredCommands;
  }

  async checkPrefixCommand(message: Message) {
    // Check if the guild has a custom prefix, if not use the default prefix
    // !todo: implement custom prefix
    const guildPrefix = this.config.get('discord.defaultPrefix');

    const prefixRegexp = new RegExp(
      `^(${this.escapePrefixForRegexp(this.config.get('discord.adminPrefix'))}|${this.escapePrefixForRegexp(guildPrefix)})`,
      'i',
    );

    // Check the command if it starts with a prefix
    if (!prefixRegexp.test(message.content)) return;

    message.content = message.content.replace(guildPrefix, '').trim();

    for (const command of CommandService.registeredCommands) {
      if (command.test(message.content)) {
        Logger.debug(
          `Executing command: ${message.content}`,
          'Ririko CommandService',
        );
        await this.executePrefixCommand(command, message);
        return;
      } else {
        Logger.debug(
          `Command not found: ${message.content}`,
          'Ririko CommandService',
        );
      }
    }
  }

  private async executePrefixCommand(
    command: CommandInterface,
    message: Message,
  ) {
    try {
      Logger.debug(`executing command [${command.name}] => ${message.content}`);
      await command.execute(message);
      return;
    } catch (error) {
      Logger.error(error.message, error.stack);
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setDescription(error.message);
      await message.reply({ embeds: [errorEmbed] });
    }
  }

  private escapePrefixForRegexp(serverPrefix: string): string {
    const char = serverPrefix[0];
    if ('./+\\*!?)([]{}^$'.split('').includes(char)) return `\\${serverPrefix}`;
    return serverPrefix;
  }
}
