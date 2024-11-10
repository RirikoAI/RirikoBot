import { Injectable } from '@nestjs/common';
import { EmbedBuilder } from 'discord.js';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import { DiscordInteraction, DiscordMessage, SlashCommandOptionTypes } from '#command/command.types';

/**
 * GetAvatarCommand
 * @author Earnest Angel (angel.net.my)
 * @description Get the avatar of a user
 * @category Command
 */
@Injectable()
export default class GetAvatarCommand
  extends Command
  implements CommandInterface
{
  name = 'get-avatar';
  regex = new RegExp('^get-avatar |^get-avatar$', 'i');
  description = 'Get the avatar of a user';
  category = 'general';
  usageExamples = ['get-avatar'];

  slashOptions = [
    {
      name: 'user',
      description: 'The user to get the avatar from',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];

  async runPrefix(message: DiscordMessage): Promise<void> {
    // Get the user's avatar based on the mentioned user
    const user = message.mentions.users.first() || message.author;
    const avatar = user.displayAvatarURL();
    const embed = new EmbedBuilder()
      .addFields([
        {
          name: `Avatar of ${user.username}`,
          value: `[Click here to view](${avatar})`,
        },
      ])
      .setImage(avatar);

    await message.reply({
      embeds: [embed],
    });
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    // Get the user's avatar based on the mentioned user
    const user = interaction.options.getUser('user') || interaction.user;
    const avatar = user.displayAvatarURL();
    const embed = new EmbedBuilder()
      .addFields([
        {
          name: `Avatar of ${user.username}`,
          value: `[Click here to view](${avatar})`,
        },
      ])
      .setImage(avatar);

    await interaction.reply({
      embeds: [embed],
    });
  }
}
