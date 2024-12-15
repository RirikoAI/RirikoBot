import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import { JikanService } from '#command/anime/jikan/jikan.service';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';
import { EmbedBuilder } from 'discord.js';
import { Manga, JikanResults } from '#command/anime/jikan/jikan.types';

/**
 * MangaCommand
 * @description Search for a manga
 * @category Command
 * @author Earnest Angel (https://angel.net.my)
 */
export default class MangaCommand extends Command implements CommandInterface {
  name = 'manga';
  description = 'Search for a manga';
  regex = new RegExp('^manga$|^manga ', 'i');
  category = 'anime';
  usageExamples = ['manga <search>'];

  slashOptions = [
    {
      type: SlashCommandOptionTypes.String,
      name: 'search',
      description: 'Input the manga name to search',
      required: true,
    },
  ];

  currentUserSearch: {
    userId: string;
    search: string;
  }[] = [];

  async runPrefix(message: DiscordMessage) {
    const search = message.content.split(' ').slice(1).join(' ');
    if (!search) {
      return message.reply('Please provide a search keyword');
    }

    // check if user is already in the currentUserSearch
    const userIndex = this.currentUserSearch.findIndex(
      (s) => s.userId === message.author.id,
    );
    if (userIndex !== -1) {
      this.currentUserSearch[userIndex].search = search;
    } else {
      this.currentUserSearch.push({
        userId: message.author.id,
        search,
      });
    }
    await this.searchManga(message, search);
  }

  async runSlash(interaction: DiscordInteraction) {
    const search = (interaction as any).options.getString('search');

    if (!search) {
      return interaction.reply('Please provide a search keyword');
    }

    // check if user is already in the currentUserSearch
    const userIndex = this.currentUserSearch.findIndex(
      (s) => s.userId === interaction.user.id,
    );
    if (userIndex !== -1) {
      this.currentUserSearch[userIndex].search = search;
    } else {
      this.currentUserSearch.push({
        userId: interaction.user.id,
        search,
      });
    }

    await this.searchManga(interaction, search);
  }

  private async searchManga(
    interaction: DiscordMessage | DiscordInteraction,
    search: string,
    followUp = false,
  ) {
    const result: JikanResults<Manga> = await new JikanService().searchManga(
      search,
    );
    const data: Manga[] = result.data;
    await this.createMenu({
      interaction,
      text: 'Select an manga to view details:',
      options: this.createSelectMenuOptions(data),
      callback: this.handleMangaSelection.bind(this),
      followUp,
    });
  }

  private createSelectMenuOptions(data: Manga[]) {
    const options = [];
    for (const manga of data) {
      // check if the manga is already in the options
      if (options.find((o) => o.value === manga.mal_id.toString())) {
        continue;
      }

      options.push({
        label: manga?.title.substring(0, 100) || 'Unknown title',
        value: manga?.mal_id?.toString(),
        description:
          manga?.genres
            ?.map((g) => g.name)
            .join(', ')
            .substring(0, 100) || 'Unknown genre',
      });
    }
    return options;
  }

  private async handleMangaSelection(
    interaction: DiscordInteraction,
    selectedOption: string,
  ) {
    await interaction.deferReply();
    const embed = await this.getMangaDetails(selectedOption);
    await interaction.editReply({ embeds: [embed] });

    // show what to do next
    await this.createMenu({
      interaction,
      text: 'What would you like to do next?',
      options: [
        {
          label: 'Select a different manga',
          value: 'search',
          description: 'Search for another manga',
        },
        { label: 'Exit', value: 'exit', description: 'Exit' },
      ],
      callback: this.handleNextAction.bind(this),
      followUp: true,
    });
  }

  async handleNextAction(
    interaction: DiscordInteraction,
    selectedOption: string,
  ) {
    if (selectedOption === 'search') {
      // get the search keyword associated with the user id
      const search = this.currentUserSearch.find(
        (s) => s.userId === interaction.user.id,
      ).search;
      await this.searchManga(interaction, search, true);
    } else {
      // remove the search keyword associated with the user id
      this.currentUserSearch = this.currentUserSearch.filter(
        (s) => s.userId !== interaction.user.id,
      );
      interaction.reply(
        'Thank you for using the manga command! Made with ❤️ by Ririko',
      );
    }
  }

  async getMangaDetails(selectedOption: string) {
    // get the manga details
    const data = await new JikanService().getMangaDetails(
      parseInt(selectedOption),
    );

    // build embed based on the result data
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(data?.title || 'N/A')
      .setURL(data?.url || 'N/A')
      .setDescription(
        `**English Title:** ${data.title_english}\n**Japanese Title:** ${data.title_japanese}\n\n**Synopsis:** ${data.synopsis}
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
          name: 'Popularity',
          value: data?.popularity?.toString() || 'N/A',
          inline: true,
        },
        {
          name: 'Genres',
          value: data?.genres?.map((g) => g.name).join(', ') || 'N/A',
          inline: true,
        },

        {
          name: 'Chapters',
          value: data?.chapters?.toString() || 'N/A',
          inline: true,
        },
        {
          name: 'Volumes',
          value: data?.volumes?.toString() || 'N/A',
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
          name: 'Published From',
          value: data?.published?.from || 'N/A',
          inline: true,
        },
        {
          name: 'Published To',
          value: data?.published?.to || 'N/A',
          inline: true,
        },
        { name: 'Favorites', value: data?.favorites.toString() || 'N/A' },
        {
          name: 'Authors',
          value: data?.authors?.map((a) => a.name).join(', ') || 'N/A',
        },
      );

    return embed;
  }
}
