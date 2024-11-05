import { Injectable } from '@nestjs/common';
import { CommandInteraction, EmbedBuilder, Message } from 'discord.js';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import { SlashCommandOptionTypes } from '#command/command.types';

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
  description = 'Get information about yourself or another guild member.';
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
    const embed = await this.createMemberInfoEmbed(user);
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
    const embed = await this.createMemberInfoEmbed(user);
    await interaction.reply({
      embeds: [embed],
    });
  }

  /**
   * Create the member information embed.
   * @param user The user to get information about.
   */
  private async createMemberInfoEmbed(user) {
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
          value: user.client.guilds.cache
            .map((guild) => {
              const member = guild.members.cache.get(user.id);
              if (member) {
                return `${member.roles.cache
                  // .filter((role) => role.name !== '@everyone')
                  .map((role) => role.name)
                  .join(', ')}`;
              }
              return '';
            })
            .join('\n'),
        },
        {
          name: 'User ID',
          value: user.id,
          inline: true,
        },
        {
          name: 'Created At',
          value: user.createdAt.toDateString(),
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
  private getUserFromMessage(message: Message) {
    return message.mentions.users.first() || message.author;
  }

  /**
   * Get the user from the interaction.
   * @param interaction The interaction to get the user from.
   */
  private getUserFromInteraction(interaction: CommandInteraction) {
    return interaction.options.get('user')?.user || interaction.user;
  }
}
