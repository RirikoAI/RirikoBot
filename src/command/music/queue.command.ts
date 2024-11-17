import { Injectable } from '@nestjs/common';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import {
  CommandButtons,
  DiscordInteraction,
  DiscordMessage,
} from '#command/command.types';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';

/**
 * Queue command.
 * Displays the current music queue.
 * @category Command
 */
@Injectable()
export default class QueueCommand extends Command implements CommandInterface {
  name = 'queue';
  regex = /^queue$/i;
  description = 'Show the current queue.';
  category = 'music';
  usageExamples = ['queue'];

  buttons: CommandButtons = {
    queue: this.run,
  };

  private readonly ITEMS_PER_PAGE = 8;

  async runPrefix(message: DiscordMessage): Promise<void> {
    await this.run(message as any as DiscordInteraction);
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    await this.run(interaction);
  }

  async handleButton(interaction: DiscordInteraction): Promise<void> {
    await interaction.deferUpdate();
    await this.run(interaction);
  }

  async run(interaction: DiscordInteraction): Promise<void> {
    try {
      const queue = this.player.getQueue(interaction.guild.id);
      if (!queue || !queue.playing) {
        return this.replyWithEphemeral(
          interaction,
          'No songs are currently playing.',
        );
      }

      if (!queue.songs.length) {
        return this.replyWithEphemeral(interaction, 'The queue is empty.');
      }

      const trackList = queue.songs.map((track) => ({
        title: track.name,
        author: track.uploader.name,
        user: track.user,
        url: track.url,
        duration: track.duration,
      }));

      await this.paginateQueue(interaction, trackList, queue.songs[0].name);
    } catch (error) {
      console.error('Error executing QueueCommand:', error);
    }
  }

  private async paginateQueue(
    interaction: DiscordInteraction,
    trackList: any[],
    currentlyPlaying: string,
  ): Promise<void> {
    let currentPage = 1;

    const backId = 'emojiBack';
    const forwardId = 'emojiForward';
    const deleteId = 'close';

    const generateEmbed = (start: number) => {
      const tracks = trackList.slice(start, start + this.ITEMS_PER_PAGE);
      if (!tracks.length) {
        return null;
      }

      const pageText = `Page ${currentPage}/${Math.ceil(trackList.length / this.ITEMS_PER_PAGE)}`;
      const description = tracks
        .map(
          (track, index) =>
            `\`${start + index + 1}\` | [${track.title}](${track.url}) | **${track.author}** (Requested by <@${track.user.id}>)`,
        )
        .join('\n');

      return new EmbedBuilder()
        .setTitle(`Queue - ${interaction.guild.name}`)
        .setThumbnail(interaction.guild.iconURL())
        .setColor('#5865F2')
        .setDescription(
          `Currently playing: \`${currentlyPlaying}\`\n\n${description}`,
        )
        .setFooter({ text: pageText });
    };

    const createButtons = () => {
      const components = [
        ...(currentPage > 1 ? [this.createButton(backId, '⬅️')] : []),
        ...(currentPage * this.ITEMS_PER_PAGE < trackList.length
          ? [this.createButton(forwardId, '➡️')]
          : []),
      ];

      if ('user' in interaction) {
        components.push(this.createButton(deleteId, '❌'));
      }

      if (components.length === 0) {
        return null;
      }

      return new ActionRowBuilder<ButtonBuilder>({ components });
    };

    const initialEmbed = generateEmbed(0);
    if (!initialEmbed) {
      return this.replyWithEphemeral(interaction, 'No tracks to display.');
    }

    const buttons = createButtons();

    const message = await interaction.reply({
      embeds: [initialEmbed],
      components: buttons ? [createButtons()] : undefined,
      fetchReply: true,
    });

    let userId;
    if ('user' in interaction) {
      userId = interaction.user.id;
    } else {
      userId = (interaction as any).member.user.id;
    }

    const collector = message.createMessageComponentCollector({
      filter: (i) => i.user.id === userId,
      time: 120000,
    });

    let currentIndex = 0;

    collector.on('collect', async (buttonInteraction) => {
      if (buttonInteraction.customId === deleteId) {
        collector.stop();
        return interaction.deleteReply().catch(console.error);
      }

      currentPage += buttonInteraction.customId === backId ? -1 : 1;
      currentIndex = (currentPage - 1) * this.ITEMS_PER_PAGE;

      const updatedEmbed = generateEmbed(currentIndex);
      if (!updatedEmbed) return;

      await buttonInteraction.update({
        embeds: [updatedEmbed],
        components: [createButtons()],
      });
    });

    collector.on('end', () => {
      if ('deleteReply' in interaction) {
        try {
          interaction.deleteReply();
        } catch (e) {}
      }
    });
  }

  private createButton(customId: string, emoji: string): ButtonBuilder {
    return new ButtonBuilder()
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(emoji)
      .setCustomId(customId);
  }

  private async replyWithEphemeral(
    interaction: DiscordInteraction,
    content: string,
  ): Promise<void> {
    await interaction.reply({ content, ephemeral: true }).catch(console.error);
  }
}
