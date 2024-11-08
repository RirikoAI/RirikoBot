import { Injectable } from '@nestjs/common';
import { CommandInteraction, EmbedBuilder, Message } from 'discord.js';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import { SlashCommandOptionTypes } from '#command/command.types';
import NicerTimeUtil from '#util/time/nicer-time.util';

/**
 * Ping command.
 * Use this as a template for creating new commands.
 */
@Injectable()
export default class MemberInfoCommand
  extends Command
  implements CommandInterface
{
  name = 'memberinfo';
  regex = new RegExp('^memberinfo$|^memberinfo |^userinfo$|^userinfo ', 'i');
  description = 'Get info of yourself or a member.';
  category = 'guild';
  usageExamples = [
    'memberinfo',
    'memberinfo @user',
    'userinfo',
    'userinfo @user',
  ];
  slashOptions = [
    {
      name: 'user',
      description: 'The user to get information about',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];

  /**
   * Async runPrefix method. If this.params[0] is not null, it will attempt to get the user from the message.
   * If the user is not found, it will attempt to pull the user that sent the message.
   */
  async runPrefix(message: Message) {
    const user = this.getUserFromMessage(message);
    const embed = await this.createMemberInfoEmbed(user, message.guildId);
    await message.reply({
      embeds: [embed],
    });
  }

  /**
   * Async runSlash method. If this.params[0] is not null, it will attempt to get the user from the interaction.
   * If the user is not found, it will attempt to pull the user that sent the interaction.
   */
  async runSlash(interaction: CommandInteraction): Promise<any> {
    const user = this.getUserFromInteraction(interaction);
    const embed = await this.createMemberInfoEmbed(user, interaction.guildId);
    await interaction.reply({
      embeds: [embed],
    });
  }

  public async createMemberInfoEmbed(user, guildId?: string) {
    // If guildId is available, attempt to fetch the member from the guild
    let roles = 'N/A';
    if (guildId) {
      try {
        const guild = await this.client.guilds.fetch(guildId);
        const member = await guild.members.fetch(user.id);

        roles =
          member.roles.cache.size > 1
            ? member.roles.cache
                .map((role) => role.name.replace('@everyone', ''))
                .join(', ')
                .replace(/,\s*$/, '')
            : 'No roles';
      } catch (error) {
        roles = 'Error fetching roles';
        console.error('Failed to fetch roles:', error);
      }
    }

    return new EmbedBuilder({
      title: `👤 Member Information`,
      description: `Here is some information about the user:`,
      thumbnail: {
        url: user.displayAvatarURL(),
      },
      fields: [
        {
          name: 'User Name',
          value: user.username,
        },
        {
          name: 'Roles',
          value: roles,
        },
        {
          name: 'User ID',
          value: user.id,
          inline: true,
        },
        {
          name: 'Created At',
          value: `${user.createdAt.toLocaleString()} (${NicerTimeUtil.timeSince(user.createdAt)} ago)`,
          inline: true,
        },
      ],
      timestamp: new Date(),
      footer: {
        text: 'Made with ❤️ by Ririko',
      },
    });
  }

  /**
   * Get the user from the message.
   * @param message The message to get the user from.
   */
  getUserFromMessage(message: Message) {
    return message.mentions.users.first() || message.author;
  }

  /**
   * Get the user from the interaction.
   * @param interaction The interaction to get the user from.
   */
  getUserFromInteraction(interaction: CommandInteraction) {
    return interaction.options.get('user')?.user || interaction.user;
  }
}
