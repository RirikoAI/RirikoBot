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
    const menuId = Math.random().toString(36).substring(7);
    const { interaction, text, options, callback, context, followUp } = params;
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(menuId)
      .setPlaceholder('Choose an option...')
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    let reply;
    if (interaction.deferrable) {
      await interaction.deferReply();
      reply = await interaction.editReply({
        content: text,
        components: [row],
      });
    } else if (followUp) {
      try {
        await interaction?.deferUpdate();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {}
      reply = await interaction.channel.send({
        content: text,
        components: [row],
      });
    } else {
      reply = await interaction.reply({
        content: text,
        components: [row],
      });
    }

    const filter = (i) => i.customId === menuId;

    const collector = reply.createMessageComponentCollector({
      filter,
      time: 180000,
    });

    collector.on('collect', async (i: any) => {
      if (params?.deleteAfterSelection) {
        try {
          await i.message.delete();
        } catch (error) {}
      }

      await callback(i, i.values[0], context);
    });

    collector.on('end', async (collected) => {
      if (collected.size === 0) {
        await interaction.editReply('No one selected an option.');
      }
    });
  }
}
