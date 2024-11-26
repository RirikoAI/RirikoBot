import { Injectable } from '@nestjs/common';
import { EmbedBuilder } from 'discord.js';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';

/**
 * Ping command.
 * @description Use this as a template for creating new commands.
 * @category Command
 */
@Injectable()
export default class PingCommand extends Command implements CommandInterface {
  name = 'ping';
  regex = new RegExp('^ping$', 'i');
  description = 'Display time I took to reply to this request';
  category = 'general';
  usageExamples = ['ping'];

  // Define the user context menu command
  userMenuOption = {
    name: 'Ping from user context',
  };

  // Define the chat menu command
  chatMenuOption = {
    name: 'Ping from chat context',
  };

  async runPrefix(message: DiscordMessage): Promise<void> {
    const delay = this.calculateDelay(message.createdTimestamp);

    const embed = new EmbedBuilder().addFields([
      {
        name: `Ping`,
        value: `I took ${delay}ms to reply to your message/interaction`,
      },
    ]);

    await message.reply({
      embeds: [embed],
    });
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    const delay = this.calculateDelay(interaction.createdTimestamp);

    const embed = new EmbedBuilder().addFields([
      {
        name: `Ping`,
        value: `I took ${delay}ms to reply to your message/interaction`,
      },
    ]);

    await interaction.reply({
      embeds: [embed],
    });
  }

  async runUserMenu(interaction: DiscordInteraction): Promise<void> {
    const delay = this.calculateDelay(interaction.createdTimestamp);

    const embed = new EmbedBuilder().addFields([
      {
        name: `Ping`,
        value: `I took ${delay}ms to reply to your message/interaction`,
      },
    ]);

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  async runChatMenu(interaction: DiscordInteraction): Promise<void> {
    const delay = this.calculateDelay(interaction.createdTimestamp);

    const embed = new EmbedBuilder().addFields([
      {
        name: `Ping`,
        value: `I took ${delay}ms to reply to your message/interaction`,
      },
    ]);

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  private calculateDelay(timestamp: number): number {
    return Math.abs(Date.now() - timestamp);
  }
}
