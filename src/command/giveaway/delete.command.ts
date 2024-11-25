import { CommandInterface } from '#command/command.interface';
import { Command } from '#command/command.class';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';
import { EmbedBuilder } from 'discord.js';

export default class DeleteCommand extends Command implements CommandInterface {
  name = 'giveaway-delete';
  description = 'Delete a giveaway.';
  regex = new RegExp(`^giveaway-delete|^gdelete|^giveaway delete`, 'i');
  category = 'giveaway';
  usageExamples = [
    'giveaway-delete <message_id>',
    'giveaway delete <message_id>',
    'gdelete <message_id>',
  ];

  slashOptions = [
    {
      name: 'message_id',
      description: 'The message ID of the giveaway to delete.',
      type: SlashCommandOptionTypes.String,
      required: true,
    },
  ];

  async runPrefix(message: DiscordMessage): Promise<void> {
    // get message ID from the message content
    const messageId = this.allParams;
    await this.deleteGiveaway(message, messageId);
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    const messageId = interaction.options.getString('message_id');
    await this.deleteGiveaway(interaction, messageId);
  }

  async deleteGiveaway(
    message: DiscordMessage | DiscordInteraction,
    messageId?: string,
  ): Promise<void> {
    if (
      !message.member.permissions.has('ManageMessages') &&
      !message.member.roles.cache.some((r) => r.name === 'Giveaways')
    ) {
      await message.reply(
        ':x: You need to have the manage messages permissions to edit giveaways.',
      );
      return;
    }

    // try to found the giveaway with prize then with ID
    const giveaway =
      // Search with giveaway ID
      this.client.giveawaysManager.giveaways.find((g) => {
        return g.messageId == messageId;
      });

    // If no giveaway was found
    if (!giveaway) {
      await this.sendErrorMessage(
        message,
        `No giveaway found for the message ID: ${messageId}`,
      );
      return;
    }

    // Reroll the giveaway
    this.client.giveawaysManager
      .delete(giveaway.messageId)
      .then(() => {
        // Success message
        message.reply('Giveaway deleted!');
      })
      .catch((e) => {
        console.error(e);
        message.reply(e);
      });
  }

  async sendErrorMessage(
    message: DiscordMessage | DiscordInteraction,
    content: string,
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('Error')
      .setDescription(content)
      .setColor('#ff0000');
    await message.reply({ embeds: [embed] });
  }
}
