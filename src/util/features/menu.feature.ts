import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { MenuFeatureParams } from '#util/features/menu-feature.types';

/**
 * MenuFeature
 * @description Create a select menu
 * @category Feature
 * @author Earnest Angel (https://angel.net.my)
 */
export class MenuFeature {
  constructor(params: MenuFeatureParams) {
    this.createMenu(params);
  }

  async createMenu(params: MenuFeatureParams) {
    const { interaction, text, options, callback, context } = params;
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select-menu')
      .setPlaceholder('Choose an option...')
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const reply = await interaction.reply({
      content: text,
      components: [row],
    });

    const filter = (i) => i.customId === 'select-menu';
    const collector = reply.createMessageComponentCollector({
      filter,
      time: 180000,
    });

    collector.on('collect', async (i: any) => {
      await callback(i, i.values[0], context);
    });

    collector.on('end', async (collected) => {
      if (collected.size === 0) {
        await interaction.editReply('No one selected an option.');
      }
    });
  }
}
