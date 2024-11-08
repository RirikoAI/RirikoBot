import { Injectable } from '@nestjs/common';
import { CommandInteraction, EmbedBuilder, Message } from 'discord.js';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';

/**
 * Ping command.
 * @description Use this as a template for creating new commands.
 * @category Command
 */
@Injectable()
export default class PingCommand extends Command implements CommandInterface {
  name = 'ping';
  regex = new RegExp('^ping$', 'i');
  description = 'Display time I took to reply to this request';
  category = 'general';
  usageExamples = ['ping'];

  async runPrefix(message: Message): Promise<void> {
    const delay = this.calculateDelay(message.createdTimestamp);

    const embed = new EmbedBuilder().addFields([
      {
        name: `Ping`,
        value: `I took ${delay}ms to reply to your message/interaction`,
      },
    ]);

    await message.reply({
      embeds: [embed],
    });
  }

  async runSlash(interaction: CommandInteraction): Promise<void> {
    const delay = this.calculateDelay(interaction.createdTimestamp);

    const embed = new EmbedBuilder().addFields([
      {
        name: `Ping`,
        value: `I took ${delay}ms to reply to your message/interaction`,
      },
    ]);

    await interaction.reply({
      embeds: [embed],
    });
  }

  private calculateDelay(timestamp: number): number {
    return Math.abs(Date.now() - timestamp);
  }
}
