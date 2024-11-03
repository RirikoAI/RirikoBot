import { Injectable } from '@nestjs/common';
import { Message, EmbedBuilder, CommandInteraction } from 'discord.js';
import { Command } from '#command/command.class';

@Injectable()
export default class HelpCommand extends Command {
  name = 'help';
  regex = new RegExp('^help$|^help ', 'i');
  description = 'display help message';
  category = 'general';

  async runPrefix(message: Message): Promise<void> {
    // In the near future, we will be able to set a custom prefix for each server
    const prefix = this.services.config.get('DEFAULT_PREFIX');
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

  async runSlash(interaction: CommandInteraction): Promise<any> {
    const embed = new EmbedBuilder()
      .setDescription(`Hello, I'm Ririko!`)
      .addFields([
        {
          name: `/help`,
          value: 'display this message',
        },
      ]);

    await interaction.reply({
      embeds: [embed],
    });
  }
}
