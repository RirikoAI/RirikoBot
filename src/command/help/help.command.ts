import { Injectable } from '@nestjs/common';
import { Message, EmbedBuilder } from 'discord.js';
import { Command } from '#command/command.class';
import {CommandServices} from '#command/command.service';

@Injectable()
export default class HelpCommand extends Command {
  constructor(private readonly app: CommandServices) {
    super();
  }

  name = 'help';
  regex = new RegExp('^help', 'i');
  description = 'display help message';

  async execute(message: Message): Promise<void> {
    // In the near future, we will be able to set a custom prefix for each server
    const prefix = this.app.config.get('DEFAULT_PREFIX');

    const embed = new EmbedBuilder()
      .setDescription(`Hello, I'm Ririko!`)
      .addFields([
        {
          name: `${prefix}help`,
          value: 'display this message',
        },
      ]);
    
    await message.reply({
      embeds: [embed],
    });
  }
}
