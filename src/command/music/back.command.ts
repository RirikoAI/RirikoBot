import { Injectable } from '@nestjs/common';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';

/**
 * BackCommand
 * @description Play the previous music
 * @category Command
 */
@Injectable()
export default class BackCommand extends Command implements CommandInterface {
  name = 'back';
  regex = new RegExp('^back$|^previous$', 'i');
  description = 'Play the previous music';
  category = 'music';
  usageExamples = ['back', 'previous'];

  buttons = {
    previous: this.handleButton,
  };

  async runPrefix(message: DiscordMessage): Promise<any> {
    const queue = this.player.getQueue(message.guild.id);
    if (!queue) return await message.reply({ content: 'No queue found' });
    await queue.previous();
    await message.reply({
      content: 'Played the previous music',
    });
  }

  async runSlash(interaction: DiscordInteraction): Promise<any> {
    const queue = this.player.getQueue(interaction.guild.id);
    if (!queue) return await interaction.reply({ content: 'No queue found' });
    await queue.previous();
    await interaction.reply({
      content: 'Played the previous music',
    });
  }

  async handleButton(interaction: DiscordInteraction): Promise<any> {
    const queue = this.player.getQueue(interaction.guild.id);
    if (!queue) return await interaction.reply({ content: 'No queue found' });
    await queue.previous();
    await interaction.reply({
      content: 'Played the previous music',
    });
  }
}
