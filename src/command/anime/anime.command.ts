import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import { JikanService } from '#command/anime/jikan/jikan.service';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';
import { EmbedBuilder } from 'discord.js';
import { Anime, JikanResults } from '#command/anime/jikan/jikan.types';

/**
 * AnimeCommand
 * @description Search for an anime
 * @category Command
 * @author Earnest Angel (https://angel.net.my)
 */
export default class AnimeCommand extends Command implements CommandInterface {
  name = 'anime';
  description = 'Search for an anime';
  regex = new RegExp('^anime$|^anime ', 'i');
  category = 'anime';
  usageExamples = ['anime <search>'];

  slashOptions = [
    {
      type: SlashCommandOptionTypes.String,
      name: 'search',
      description: 'Input the anime name to search',
      required: true,
    },
  ];

  async runPrefix(message: DiscordMessage) {
    const search = message.content.split(' ').slice(1).join(' ');
    await this.searchAnime(message, search);
  }

  async runSlash(interaction: DiscordInteraction) {
    const search = (interaction as any).options.getString('search');
    await this.searchAnime(interaction, search);
  }

  private async searchAnime(
    interaction: DiscordMessage | DiscordInteraction,
    search: string,
  ) {
    const result: JikanResults<Anime> = await new JikanService().searchAnime(
      search,
    );
    const data: Anime[] = result.data;
    await this.createMenu({
      interaction,
      text: 'Select an anime to view details:',
      options: this.createSelectMenuOptions(data),
      callback: this.handleAnimeSelection.bind(this),
    });
  }

  private createSelectMenuOptions(data: Anime[]) {
    const options = [];
    for (const anime of data) {
      // check if the anime is already in the options
      if (options.find((o) => o.value === anime.mal_id.toString())) {
        continue;
      }

      options.push({
        label: anime?.title,
        value: anime?.mal_id?.toString(),
        description:
          anime?.genres?.map((g) => g.name).join(', ') || 'Unknown genre',
      });
    }
    return options;
  }

  private async handleAnimeSelection(
    interaction: DiscordInteraction,
    selectedOption: string,
  ) {
    await interaction.deferReply();

    // get the anime details
    let data = await new JikanService().getAnimeDetails(
      parseInt(selectedOption),
    );

    // build embed based on the result data
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(data?.title || 'N/a')
      .setURL(data?.url || 'N/A')
      .setDescription(
        `English Title: ${data.title_english}\nJapanese Title:${data.title_japanese}\n\nSynopsis: ${data.synopsis}
          `.substring(0, 2048),
      )
      .setAuthor({
        name: 'MyAnimeList',
        iconURL:
          'https://upload.wikimedia.org/wikipedia/commons/7/7a/MyAnimeList_Logo.png',
      })
      .setFooter({
        text: `Made with ❤️ by Ririko`,
      })
      .setTimestamp()
      .setImage(data?.images?.jpg?.image_url || data?.images?.webp?.image_url)
      .addFields(
        {
          name: 'Score',
          value: data?.score?.toString() || 'N/A',
          inline: true,
        },
        {
          name: 'Episodes',
          value: data?.episodes?.toString() || 'N/A',
          inline: true,
        },
        {
          name: 'Genres',
          value: data?.genres?.map((g) => g.name).join(', ') || 'N/A',
          inline: true,
        },
        {
          name: 'Popularity',
          value: data?.popularity?.toString() || 'N/A',
          inline: true,
        },
        {
          name: 'Type',
          value: data?.type,
          inline: true,
        },
        {
          name: 'Status',
          value: data?.status,
          inline: true,
        },
        {
          name: 'Start Date',
          value: data?.aired?.from || 'N/A',
          inline: true,
        },
        {
          name: 'End Date',
          value: data?.aired?.to || 'N/A',
          inline: true,
        },
        { name: 'Rating', value: data?.rating || 'N/A' },
        {
          name: 'Studios',
          value: data?.studios?.map((s) => s.name).join(', ') || 'N/A',
        },
        {
          name: 'Producers',
          value: data?.producers?.map((p) => p.name).join(', ') || 'N/A',
          inline: true,
        },
      );
    await interaction.editReply({ embeds: [embed] });
  }
}