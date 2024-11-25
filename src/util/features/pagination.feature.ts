import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageComponentInteraction,
} from 'discord.js';
import { PaginationFeatureParams } from '#util/features/pagination-feature.types';

/**
 * PaginationFeature
 * @description A feature to enable pagination for a command interaction.
 * @category Feature
 * @author Earnest Angel (https://angel.net.my)
 */
export class PaginationFeature {
  private currentPage: number = 0;

  constructor(params: PaginationFeatureParams) {
    this.startPagination(params);
  }

  /**
   * Initialize the pagination with the pages and interaction.
   * @param params {PaginationFeatureParams} - The parameters for the pagination feature.
   * @see PaginationFeatureParams
   */
  async startPagination(params: PaginationFeatureParams): Promise<void> {
    const { interaction, pages } = params;

    this.currentPage = 0; // reset the page counter

    // Initial embed and row setup
    const embed = pages[this.currentPage];

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('previous')
        .setLabel('Previous')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('next')
        .setLabel('Next')
        .setStyle(ButtonStyle.Primary),
    );

    const reply = await interaction.reply({
      embeds: [embed],
      components: [row],
    });

    // Create a collector for button interactions
    const filter = (i: MessageComponentInteraction) =>
      i.user.id === interaction.user.id;
    const collector = reply.createMessageComponentCollector({
      filter,
      time: 180000,
    });

    collector.on('collect', async (i: MessageComponentInteraction) => {
      if (i.customId === 'next') {
        this.currentPage = (this.currentPage + 1) % pages.length; // Go to the next page
      } else if (i.customId === 'previous') {
        this.currentPage = (this.currentPage - 1 + pages.length) % pages.length; // Go to the previous page
      }

      const newEmbed = pages[this.currentPage];

      await i.update({ embeds: [newEmbed] });
    });

    collector.on('end', async () => {
      // Disable the buttons after the collector ends
      const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('previous')
          .setLabel('Previous')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('next')
          .setLabel('Next')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
      );
      await interaction.editReply({ components: [disabledRow] });
    });
  }
}
