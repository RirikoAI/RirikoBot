import { Injectable } from '@nestjs/common';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';

/**
 * Ping command.
 * @description Use this as a template for creating new commands.
 * @category Command
 */
@Injectable()
export default class RewindCommand extends Command implements CommandInterface {
  name = 'rewind';
  regex = new RegExp('^rewind$|^rewind ', 'i');
  description = 'Rewind the music for an amount of time';
  category = 'music';
  usageExamples = ['rewind', 'rewind <time in second>'];

  slashOptions = [
    {
      name: 'time',
      description: 'The amount of time (in seconds) to rewind',
      type: SlashCommandOptionTypes.Integer,
      required: true,
    },
  ];

  async runPrefix(message: DiscordMessage): Promise<any> {
    const time = this.allParams;

    if (!time) {
      return message.reply(`Please enter a valid number!`);
    }

    await this.rewind(time, message);
  }

  async runSlash(interaction: DiscordInteraction): Promise<any> {
    const time = interaction.options.getInteger('time');
    if (interaction.deferReply) {
      await interaction.deferReply();
    }

    // if no time is provided
    if (!time) {
      return interaction.editReply(`Please enter a valid number!`);
    }

    const loading = await interaction.editReply({
      content: 'Rewinding...',
    });
    await this.rewind(time, interaction);

    await loading.delete();
  }

  async rewind(time, message): Promise<void> {
    const queue = this.player.getQueue(message);
    if (!queue)
      return message.channel.send(`There is nothing in the queue right now!`);

    if (isNaN(time))
      return message.channel.send(`Please enter a valid number!`);
    queue.seek(queue.currentTime - time);
    message.channel.send(`Rewinded the song for ${time}s!`);
  }
}
