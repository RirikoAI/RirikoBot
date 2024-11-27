import { CommandInterface } from '#command/command.interface';
import { Command } from '#command/command.class';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';
import { EmbedBuilder } from 'discord.js';

export default class RerollCommand extends Command implements CommandInterface {
  name = 'giveaway-reroll';
  description = 'Reroll a giveaway.';
  regex = new RegExp(`^giveaway-reroll|^giveaway reroll|^greroll`, 'i');
  category = 'giveaway';
  usageExamples = [
    'giveaway-reroll <messageid>',
    'giveaway reroll <messageid>',
    'greroll <messageid>',
  ];

  // Define the chat menu command
  chatMenuOption = {
    name: 'Reroll giveaway',
  };

  slashOptions = [
    {
      name: 'message_id',
      description: 'The message ID of the giveaway to reroll.',
      type: SlashCommandOptionTypes.String,
      required: true,
    },
  ];

  async runPrefix(message: DiscordMessage): Promise<void> {
    // get message ID from the message content
    const messageId = this.allParams;
    await this.rerollGiveaway(message, messageId);
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    const messageId = interaction.options.getString('message_id');
    await this.rerollGiveaway(interaction, messageId);
  }

  async runChatMenu(interaction: DiscordInteraction): Promise<void> {
    const messageId = interaction.targetId;
    await this.rerollGiveaway(interaction, messageId);
  }

  async rerollGiveaway(
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
      .reroll(giveaway.messageId)
      .then(() => {
        // Success message
        message.reply('Giveaway rerolled!');
      })
      .catch((e) => {
        if (
          e.startsWith(
            `Giveaway with message ID ${giveaway.messageId} is not ended.`,
          )
        ) {
          message.reply('This giveaway is not ended!');
        } else {
          console.error(e);
          message.reply(e);
        }
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
