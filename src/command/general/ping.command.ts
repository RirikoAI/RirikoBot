import { Injectable } from '@nestjs/common';
import { CommandInteraction, EmbedBuilder, Message } from 'discord.js';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';

@Injectable()
export default class PingCommand extends Command implements CommandInterface {
  name = 'ping';
  regex = new RegExp('^ping$', 'i');
  description =
    'Display response time I took to reply to your message/interaction';
  category = 'general';
  usageExamples = ['ping'];

  async runPrefix(message: Message): Promise<void> {
    const delay = this.calculateDelay(message.createdTimestamp);

    await message.reply({
      embeds: [this.prepareEmbed(delay)],
    });
  }

  async runSlash(interaction: CommandInteraction): Promise<void> {
    const delay = this.calculateDelay(interaction.createdTimestamp);

    await interaction.reply({
      embeds: [this.prepareEmbed(delay)],
    });
  }

  private calculateDelay(timestamp: number): number {
    return Math.abs(Date.now() - timestamp);
  }

  private prepareEmbed(delay: number): EmbedBuilder {
    return new EmbedBuilder().addFields([
      {
        name: `Ping`,
        value: `I took ${delay}ms to reply to your message/interaction`,
      },
    ]);
  }
}
