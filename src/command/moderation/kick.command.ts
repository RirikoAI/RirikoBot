import { CommandInterface } from '#command/command.interface';
import { Command } from '#command/command.class';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';

/**
 * KickCommand
 * @description Kick a user from the server.
 * @category Command
 * @author Earnest Angel (https://angel.net.my)
 */
export default class KickCommand extends Command implements CommandInterface {
  name = 'kick';
  regex = new RegExp('^kick$|^kick |^k ', 'i');
  description = 'Kick a user from the server.';
  category = 'moderation';
  usageExamples = ['kick @user', 'k @user'];
  slashOptions = [
    {
      name: 'user',
      description: 'The user to kick.',
      type: SlashCommandOptionTypes.User,
      required: true,
    },
  ];

  async runPrefix(message: DiscordMessage) {
    // check if the sender has permission to kick members
    if (
      !message.member.permissions.has('KICK_MEMBERS') ||
      !message.member.permissions.has('ADMINISTRATOR')
    ) {
      return await message.reply('You do not have permission to kick members.');
    }
    // get the user to kick
    const user = message.mentions.members.first();
    if (!user) {
      return await message.reply('Please mention a user to kick.');
    }
    // check if the user can be kicked
    if (!user.kickable) {
      return await message.reply('This user cannot be kicked.');
    }
    // kick the user
    await user.kick();
    // tell the user that the user has been kicked
    await message.reply(`Kicked ${user.user.tag} from the server.`);
  }

  async runSlash(interaction: DiscordInteraction) {
    // check if the sender has permission to kick members
    if (
      !interaction.member.permissions.has('KICK_MEMBERS') ||
      !interaction.member.permissions.has('ADMINISTRATOR')
    ) {
      return await interaction.reply(
        'You do not have permission to kick members.',
      );
    }
    // get the user to kick
    const user = interaction.options.getMember('user');
    if (!user) {
      return await interaction.reply('Please mention a user to kick.');
    }
    // check if the user can be kicked
    if (!user.kickable) {
      return await interaction.reply('This user cannot be kicked.');
    }
    // kick the user
    await user.kick();
    // tell the user that the user has been kicked
    await interaction.reply(`Kicked ${user.user.tag} from the server.`);
  }
}
