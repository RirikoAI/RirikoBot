import { CommandInterface } from '#command/command.interface';
import { Command } from '#command/command.class';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';
import { EmbedBuilder } from 'discord.js';

export default class EndCommand extends Command implements CommandInterface {
  name = 'giveaway-end';
  description = 'End a giveaway.';
  regex = new RegExp(`^giveaway-end|^giveaway end|^gend`, 'i');
  category = 'giveaway';
  usageExamples = [
    'giveaway-end <messageid>',
    'giveaway end <messageid>',
    'gend <messageid>',
  ];

  // Define the chat menu command
  chatMenuOption = {
    name: 'End giveaway',
  };

  slashOptions = [
    {
      name: 'message_id',
      description: 'The message ID of the giveaway to end.',
      type: SlashCommandOptionTypes.String,
      required: true,
    },
  ];

  async runPrefix(message: DiscordMessage): Promise<void> {
    // get message ID from the message content
    const messageId = this.allParams;
    await this.endGiveaway(message, messageId);
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    const messageId = interaction.options.getString('message_id');
    await this.endGiveaway(interaction, messageId);
  }

  async runChatMenu(interaction: DiscordInteraction): Promise<void> {
    const messageId = interaction.targetId;
    await this.endGiveaway(interaction, messageId);
  }

  async endGiveaway(
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

    // End the giveaway
    this.client.giveawaysManager
      .end(giveaway.messageId)
      .then(() => {
        // Success message
        message.reply('Giveaway ended!');
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
