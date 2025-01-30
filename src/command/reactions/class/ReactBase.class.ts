import { Injectable } from '@nestjs/common';
import { EmbedBuilder } from 'discord.js';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import axios from 'axios';

/**
 * Base class for all reaction commands.
 * Will fetch a gif for reactions like hug, kiss and many more
 * Using otakugifs API (https://otakugifs.xyz)
 * @author Aki (https://github.com/True-Aki)
 */
@Injectable()
export abstract class ReactBase extends Command implements CommandInterface {
  abstract name: string;
  abstract regex: RegExp;
  abstract description: string;
  abstract category: string;
  abstract usageExamples: string[];
  abstract reactionType: string;
  abstract content: string;
  abstract noTargetContent: string;

  /**
   * Handles a command invocation using a prefix message.
   * @param message The Discord message containing the command.
   */
  async runPrefix(message: DiscordMessage): Promise<void> {
    const user = message.author;
    const targetUser = message.mentions.users.first();
    const target = this.getTargetId(user.id, targetUser?.id);

    const embed = await this.createReactEmbed(user);
    const replyContent = this.getReplyContent(user.id, target);

    await message.reply({
      content: replyContent,
      embeds: [embed],
    });
  }

  /**
   * Handles a command invocation using a slash command interaction.
   * @param interaction The Discord interaction containing the command.
   */
  async runSlash(interaction: DiscordInteraction): Promise<void> {
    const user = interaction.user;
    const targetUser = interaction.options.getUser('target');
    const target = this.getTargetId(user.id, targetUser?.id);

    const embed = await this.createReactEmbed(user);
    const replyContent = this.getReplyContent(user.id, target);

    await interaction.reply({
      content: replyContent,
      embeds: [embed],
    });
  }

  /**
   * Creates an embed for the reaction.
   * @param username The username of the requester.
   * @returns A promise resolving to an EmbedBuilder.
   */
  private async createReactEmbed(user): Promise<EmbedBuilder> {
    try {
      const { data } = await axios.get<{ url: string }>(
        `https://api.otakugifs.xyz/gif?reaction=${this.reactionType}&format=gif`,
      );

      return new EmbedBuilder().setImage(data.url).setFooter({
        text: `Requested by ${user.username}`,
        iconURL: user.displayAvatarURL(),
      });
    } catch (e) {
      return new EmbedBuilder()
        .setDescription(
          `Error fetching the image.\nYou'll have to use your imagination for this one!`,
        )
        .setFooter({
          text: `Requested by ${user.username}`,
          iconURL: user.displayAvatarURL(),
        });
    }
  }

  /**
   * Determines the target ID based on user and target user IDs.
   * @param userId The ID of the user invoking the command.
   * @param targetUserId The ID of the mentioned user, if any.
   * @returns The target ID or null if self-targeted or not mentioned.
   */
  private getTargetId(
    userId: string,
    targetUserId?: string | null,
  ): string | null {
    if (!targetUserId || targetUserId === userId) {
      return null;
    }
    return targetUserId;
  }

  /**
   * Constructs the reply content based on the user and target.
   * @param user The invoking user.
   * @param target The target user ID or null.
   * @returns The formatted reply content.
   */
  private getReplyContent(user: string, target: string | null): string {
    return target
      ? `<@${user}> ${this.content} <@${target}>`
      : `<@${user}> ${this.noTargetContent}`;
  }
}
