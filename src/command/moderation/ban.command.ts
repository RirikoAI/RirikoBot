import { CommandInterface } from '#command/command.interface';
import { Command } from '#command/command.class';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';

/**
 * BanCommand
 * @description Ban a user from the server.
 * @category Command
 * @author Earnest Angel (https://angel.net.my)
 */
export default class BanCommand extends Command implements CommandInterface {
  name = 'ban';
  regex = new RegExp('^ban$|^ban |^b ', 'i');
  description = 'Ban a user from the server.';
  category = 'moderation';
  usageExamples = ['ban @user', 'b @user'];
  slashOptions = [
    {
      name: 'user',
      description: 'The user to ban.',
      type: SlashCommandOptionTypes.User,
      required: true,
    },
  ];

  async runPrefix(message: DiscordMessage) {
    // check if the sender has permission to ban members
    if (
      !message.member.permissions.has('BAN_MEMBERS') ||
      !message.member.permissions.has('ADMINISTRATOR')
    ) {
      return message.reply('You do not have permission to ban members.');
    }
    // get the user to ban
    const user = message.mentions.members.first();
    if (!user) {
      return message.reply('Please mention a user to ban.');
    }
    // check if the user can be banned
    if (!user.bannable) {
      return message.reply('This user cannot be banned.');
    }
    // ban the user
    await user.ban();
    // tell the user that the user has been banned
    await message.reply(`Banned ${user.user.tag} from the server.`);
  }

  async runSlash(interaction: DiscordInteraction) {
    // check if the sender has permission to ban members
    if (
      !interaction.member.permissions.has('BAN_MEMBERS') ||
      !interaction.member.permissions.has('ADMINISTRATOR')
    ) {
      return interaction.reply('You do not have permission to ban members.');
    }
    // get the user to ban
    const user = interaction.options.getUser('user');
    if (!user) {
      return interaction.reply('Please mention a user to ban.');
    }
    // check if the user can be banned
    if (!user.bannable) {
      return interaction.reply('This user cannot be banned.');
    }
    // ban the user
    await user.ban();
    // tell the user that the user has been banned
    await interaction.reply(`Banned ${user.tag} from the server.`);
  }
}
