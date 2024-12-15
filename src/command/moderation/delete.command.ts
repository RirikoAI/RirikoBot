import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import {
  DiscordMessage,
  SlashCommandOptions,
  SlashCommandOptionTypes,
} from '#command/command.types';
import { DiscordPermissions } from '#util/features/permissions.util';

/**
 * DeleteCommand
 * @description Delete messages in a channel.
 * @category Command
 * @author Earnest Angel (https://angel.net.my)
 */
export default class DeleteCommand extends Command implements CommandInterface {
  name = 'delete';
  regex = new RegExp('^delete$|^delete |^del$|^del ', 'i');
  description = 'Delete messages in a channel.';
  category = 'moderation';
  usageExamples = ['delete 5', 'del 10'];
  slashOptions: SlashCommandOptions = [
    {
      name: 'amount',
      description: 'The amount of messages to delete.',
      type: SlashCommandOptionTypes.Integer,
      required: true,
    },
  ];

  permissions: DiscordPermissions = ['ManageChannels'];

  async runPrefix(message: DiscordMessage) {
    // get the amount of messages to delete
    const amount = parseInt(this.params[0]);
    if (isNaN(amount)) {
      return await message.reply('Invalid amount.');
    } else if (amount < 1 || amount > 100) {
      return await message.reply('Amount must be between 1 and 100.');
    }
    //delete
    await message.channel.bulkDelete(amount + 1);
    // tell the user that the messages have been deleted
    await message.channel.send(`Deleted ${amount} messages in this channel.`);
  }

  async runSlash(interaction) {
    // get the amount of messages to delete
    const amount = interaction.options.getInteger('amount');
    if (amount < 1 || amount > 100) {
      return await interaction.reply('Amount must be between 1 and 100.');
    }
    //delete
    await interaction.channel.bulkDelete(amount + 1);
    // tell the user that the messages have been deleted
    await interaction.reply(`Deleted ${amount} messages in this channel.`);
  }
}
