import { Injectable, Logger } from '@nestjs/common';
import { Client, Message, EmbedBuilder } from 'discord.js';

import { ConfigService } from '#config/config.service';
import { join } from "path";
import { commandsLoaderUtil } from "#util/command/commands-loader.util";

@Injectable()
export class CommandService {
  private static registeredCommands: any = [];

  constructor(
    // command dependencies
    readonly configService: ConfigService,
  ) {}

  async registerPrefixCommand(client: Client) {
    const commandDirectory = join(__dirname);
    
    const commandList: any = commandsLoaderUtil(commandDirectory);
    for (const command of commandList) {
      const commandInstance = new command(this);
      Logger.log(
        `${commandInstance.name} registered => ${commandInstance.description}`,
        'Ririko CommandService',
      );
      CommandService.registeredCommands.push(commandInstance);
    }
  }

  getRegisteredCommands() {
    return CommandService.registeredCommands;
  }

  async checkPrefixCommand(message: Message) {
    // Check if the guild has a custom prefix, if not use the default prefix
    // !todo: implement custom prefix
    const guildPrefix = this.configService.defaultPrefix;

    const prefixRegexp = new RegExp(
      `^(${this.escapePrefixForRegexp(
        this.configService.adminPrefix,
      )}|${this.escapePrefixForRegexp(guildPrefix)})`,
      'i',
    );

    // Check the command if it starts with a prefix
    if (!prefixRegexp.test(message.content)) return;

    message.content = message.content.replace(guildPrefix, '').trim();

    for (const command of CommandService.registeredCommands) {
      if (command.test(message.content)) {
        try {
          Logger.debug(
            `executing command [${command.name}] => ${message.content}`,
          );
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
    }

    Logger.log(`${message.content}`, 'Ririko CommandService');
  }

  private escapePrefixForRegexp(serverPrefix: string): string {
    const char = serverPrefix[0];
    if ('./+\\*!?)([]{}^$'.split('').includes(char)) return `\\${serverPrefix}`;
    return serverPrefix;
  }
}
