import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';

export default class FilterCommand extends Command implements CommandInterface {
  name = 'filter';
  description = 'Adds audio filter to ongoing music';
  category = 'music';
  usageExamples = ['filter', 'filter <filter name>'];
  regex = new RegExp('^filter$|^filter ', 'i');

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    await this.loadFilters(interaction);
  }

  async runPrefix(message: DiscordMessage): Promise<void> {
    await this.loadFilters(message);
  }

  async loadFilters(interaction: DiscordInteraction | DiscordMessage) {
    try {
      const queue = this.player?.getQueue(interaction?.guild?.id);
      if (!queue || !queue?.playing) {
        await interaction.reply({
          content: 'No music is currently playing.',
          ephemeral: true,
        });
        return;
      }

      const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel('3D')
          .setCustomId('3d')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setLabel('Bassboost')
          .setCustomId('bassboost')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setLabel('Echo')
          .setCustomId('echo')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setLabel('Karaoke')
          .setCustomId('karaoke')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setLabel('Nightcore')
          .setCustomId('nightcore')
          .setStyle(ButtonStyle.Secondary),
      );

      const buttons2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel('Vaporwave')
          .setCustomId('vaporwave')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setLabel('Flanger')
          .setCustomId('flanger')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setLabel('Gate')
          .setCustomId('gate')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setLabel('Haas')
          .setCustomId('haas')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setLabel('Reverse')
          .setCustomId('reverse')
          .setStyle(ButtonStyle.Secondary),
      );

      const buttons3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel('Surround')
          .setCustomId('surround')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setLabel('Mcompand')
          .setCustomId('mcompand')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setLabel('Phaser')
          .setCustomId('phaser')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setLabel('Tremolo')
          .setCustomId('tremolo')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setLabel('Earwax')
          .setCustomId('earwax')
          .setStyle(ButtonStyle.Secondary),
      );

      const currentFilters = queue.filters.toString() || 'None';

      const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('Select a filter.')
        .setDescription(`Current filters: \`${currentFilters}\``)
        .setTimestamp()
        .setFooter({ text: 'Filter selection' });

      const message = await interaction.reply({
        embeds: [embed],
        components: [buttons, buttons2, buttons3],
        fetchReply: true,
      });

      const filter = (i) => i.user.id === interaction.member?.id;
      const collector = message.createMessageComponentCollector({
        filter,
        time: 60000,
      });

      collector.on('collect', async (button) => {
        if (button?.user?.id !== interaction?.member?.id) return;
        await button?.deferUpdate();

        const filters = [
          '3d',
          'bassboost',
          'echo',
          'karaoke',
          'nightcore',
          'vaporwave',
          'flanger',
          'gate',
          'haas',
          'reverse',
          'surround',
          'mcompand',
          'phaser',
          'tremolo',
          'earwax',
        ];

        const filter = button.customId.toLowerCase();
        if (!filters.includes(filter)) return;

        if (queue?.filters?.has(filter)) {
          queue?.filters?.remove(filter);
          embed.setDescription(`Filter \`${filter}\` has been removed.`);
        } else {
          queue?.filters?.add(filter);
          embed.setDescription(`Filter \`${filter}\` has been added.`);
        }

        await message.edit({ embeds: [embed] });
      });

      collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
          embed.setTitle('Time ended.');
          await message.edit({ embeds: [embed], components: [] });
        }
      });
    } catch (e) {
      console.error(e);
      await interaction.reply({
        content: 'An error occurred while processing the command.',
        ephemeral: true,
      });
    }
  }
}
