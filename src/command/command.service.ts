import { Injectable, Logger } from '@nestjs/common';
import { Client, Message, EmbedBuilder } from 'discord.js';

import { ConfigService } from '../config/config.service';
import { CommandList } from './command.list';
import { Command } from "./command.class";

@Injectable()
export class CommandService {
  private static registeredCommands: any = [];

  constructor(
    // command dependencies
    readonly configService: ConfigService,
  ) {}

  registerPrefixCommand(client: Client) {
    const commandList: any = [...CommandList];
    for (const command of commandList) {
      Logger.log(
        `${command.name} registered => ${command.description}`,
        'Ririko CommandService',
      );
      CommandService.registeredCommands.push(new command(this));
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
