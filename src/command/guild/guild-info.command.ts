import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import { Injectable } from '@nestjs/common';
import { EmbedBuilder, Guild } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { DiscordPermissions } from '#util/features/permissions.util';

/**
 * Guild Info Command
 * @description Command to get information about the guild.
 * @category Command
 * @author Earnest Angel (https://angel.net.my)
 */
@Injectable()
export default class GuildInfoCommand
  extends Command
  implements CommandInterface
{
  name = 'guildinfo';
  description = 'Get info of the guild.';
  regex = new RegExp('^guildinfo$|^info$', 'i');
  usageExamples = ['guildinfo', 'info'];
  category = 'guild';

  permissions: DiscordPermissions = ['ManageGuild'];

  async runPrefix(message: DiscordMessage) {
    const embed = await this.createGuildInfoEmbed(message.guild);
    await message.reply({
      embeds: [embed],
    });
  }

  async runSlash(interaction: DiscordInteraction): Promise<any> {
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
