import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import { Injectable } from '@nestjs/common';
import { CommandInteraction, EmbedBuilder, Guild, Message } from 'discord.js';

@Injectable()
export default class GuildInfoCommand
  extends Command
  implements CommandInterface
{
  name = 'guildinfo';
  description = 'Get information about the guild.';
  regex = new RegExp('^guildinfo$|^info$', 'i');
  usageExamples = ['guildinfo', 'info'];
  category = 'guild';

  async runPrefix(message: Message) {
    const embed = await this.createGuildInfoEmbed(message.guild);
    await message.reply({
      embeds: [embed],
    });
  }

  async runSlash(interaction: CommandInteraction): Promise<any> {
    const embed = await this.createGuildInfoEmbed(interaction.guild);
    await interaction.reply({
      embeds: [embed],
    });
  }

  private async createGuildInfoEmbed(guild: Guild): Promise<EmbedBuilder> {
    const owner = await guild.fetchOwner().then((owner) => owner.user.tag);

    return new EmbedBuilder({
      title: `🏡 Guild Information`,
      description: `Here is some information about the guild:`,
      thumbnail: {
        url: guild.iconURL(),
      },
      fields: [
        {
          name: 'Guild Name',
          value: guild.name,
        },
        {
          name: 'Members',
          value: guild.memberCount.toString(),
          inline: true,
        },
        {
          name: 'Guild Owner',
          value: owner,
        },
        {
          name: 'Guild ID',
          value: guild.id,
          inline: true,
        },
        {
          name: 'Created At',
          value: guild.createdAt.toDateString(),
          inline: true,
        },
      ],
      timestamp: new Date(),
      footer: {
        text: 'Made with ❤️ by Ririko',
      },
    });
  }
}
