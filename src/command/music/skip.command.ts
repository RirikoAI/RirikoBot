import { Injectable } from '@nestjs/common';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import {
  CommandButtons,
  DiscordInteraction,
  DiscordMessage,
} from '#command/command.types';

/**
 * Ping command.
 * @description Use this as a template for creating new commands.
 * @category Command
 */
@Injectable()
export default class SkipCommand extends Command implements CommandInterface {
  name = 'skip';
  regex = new RegExp('^skip$', 'i');
  description = 'Skip the current song';
  category = 'music';
  usageExamples = ['skip'];

  buttons: CommandButtons = {
    skip: this.handleButton,
  };

  async runPrefix(message: DiscordMessage): Promise<any> {
    const queue = this.player.getQueue(message.guild.id);
    if (!queue) return await message.reply({ content: 'No queue found' });

    await this.player.skip(message.guildId);

    await message.reply('Skipped the current song.');
  }

  async runSlash(interaction: DiscordInteraction): Promise<any> {
    const queue = this.player.getQueue(interaction.guild.id);
    if (!queue) return await interaction.reply({ content: 'No queue found' });

    await this.player.skip(interaction.guildId);
    await interaction.reply('Skipped the current song.');
  }

  async handleButton(interaction: DiscordInteraction): Promise<any> {
    const queue = this.player.getQueue(interaction.guild.id);
    if (!queue) return await interaction.reply({ content: 'No queue found' });

    await interaction?.deferUpdate();
    await this.player.skip(interaction.guildId);
  }
}
