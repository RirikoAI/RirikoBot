import { Injectable } from '@nestjs/common';
import { CommandInteraction, EmbedBuilder, Message } from 'discord.js';
import { Command } from '#command/command.class';

@Injectable()
export default class PingCommand extends Command {
  name = 'ping';
  regex = new RegExp('^ping$', 'i');
  description =
    'Display response time I took to reply to your message/interaction';
  category = 'general';

  async runPrefix(message: Message): Promise<void> {
    const delay = Math.abs(Date.now() - message.createdTimestamp);

    await message.reply({
      embeds: [this.prepareEmbed(delay)],
    });
  }

  async runSlash(interaction: CommandInteraction): Promise<void> {
    const delay = Math.abs(Date.now() - interaction.createdTimestamp);

    await interaction.reply({
      embeds: [this.prepareEmbed(delay)],
    });
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
