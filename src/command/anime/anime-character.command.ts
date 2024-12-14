import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import { JikanService } from '#command/anime/jikan/jikan.service';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';
import { EmbedBuilder } from 'discord.js';
import { AnimeCharacter, JikanResults } from '#command/anime/jikan/jikan.types';

/**
 * AnimeCharacterCommand
 * @description Search for an anime
 * @category Command
 * @author Earnest Angel (https://angel.net.my)
 */
export default class AnimeCharacterCommand
  extends Command
  implements CommandInterface
{
  name = 'anime-character';
  description = 'Search for an anime character';
  regex = new RegExp('^anime-character', 'i');
  category = 'anime';
  usageExamples = ['anime-character <search>'];

  slashOptions = [
    {
      type: SlashCommandOptionTypes.String,
      name: 'search',
      description: 'Input the anime character name to search',
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

    await this.searchAnimeCharacter(message, search);
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

    await this.searchAnimeCharacter(interaction, search);
  }

  private async searchAnimeCharacter(
    interaction: DiscordMessage | DiscordInteraction,
    search: string,
    followUp = false,
  ) {
    const result: JikanResults<AnimeCharacter> =
      await new JikanService().searchAnimeCharacters(search);
    const data: AnimeCharacter[] = result.data;
    await this.createMenu({
      interaction,
      text: 'Select an anime to view details:',
      options: this.createSelectMenuOptions(data),
      callback: this.handleAnimeCharacterSelection.bind(this),
      followUp,
    });
  }

  private createSelectMenuOptions(data: AnimeCharacter[]) {
    const options = [];
    for (const character of data) {
      // check if the anime is already in the options
      if (options.find((o) => o.value === character.mal_id.toString())) {
        continue;
      }

      options.push({
        label: `${character.name} ${character?.name_kanji ? `(${character.name_kanji})` : ''}`,
        value: character?.mal_id?.toString(),
        // trim character.about to 100 characters
        description: character.about?.substring(0, 100) || 'N/A',
      });
    }
    return options;
  }

  private async handleAnimeCharacterSelection(
    interaction: DiscordInteraction,
    selectedOption: string,
  ) {
    await interaction.deferReply();
    const embed = await this.getAnimeCharacterDetails(selectedOption);
    await interaction.editReply({ embeds: [embed] });

    // show what to do next
    await this.createMenu({
      interaction,
      text: 'What would you like to do next?',
      options: [
        {
          label: 'Select a different anime character',
          value: 'search',
          description: 'Search for another anime character',
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
      await this.searchAnimeCharacter(interaction, search, true);
    } else {
      // remove the search keyword associated with the user id
      this.currentUserSearch = this.currentUserSearch.filter(
        (s) => s.userId !== interaction.user.id,
      );
      await interaction.reply(
        'Thank you for using the anime command! Made with ❤️ by Ririko',
      );
    }
  }

  async getAnimeCharacterDetails(selectedOption: string) {
    // get the anime details
    const data = await new JikanService().getAnimeCharacter(
      parseInt(selectedOption),
    );

    const animes: string[] = [];
    data.anime.forEach((anime) => {
      animes.push(`${anime.anime.title} - (${anime.role})`);
    });

    const mangas: string[] = [];
    data.manga.forEach((manga) => {
      mangas.push(`${manga.manga.title} - (${manga.role})`);
    });

    const voiceActors: string[] = [];
    data.voices.forEach((va) => {
      voiceActors.push(`${va.person.name} - (${va.language})`);
    });

    // build embed based on the result data
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(data?.name || 'N/a')
      .setURL(data?.url || 'N/A')
      .setDescription(
        `**Kanji Name:**${data?.name_kanji}\n\n**About:** ${data?.about}
          `.substring(0, 2000),
      )
      .setFields([
        {
          name: 'Nicknames',
          value: data?.nicknames.join(', ') || 'N/A',
          inline: true,
        },
        {
          name: 'Favorites',
          value: data.favorites ? `Favorites: ${data.favorites}` : 'N/A',
          inline: true,
        },
        {
          name: 'Anime',
          value: animes.join('\n').substring(0, 1000) || 'N/A',
        },
        {
          name: 'Manga',
          value: mangas.join('\n').substring(0, 1000) || 'N/A',
        },
        {
          name: 'Voice Actors',
          value: voiceActors.join('\n').substring(0, 1000) || 'N/A',
        },
      ])
      .setAuthor({
        name: 'MyAnimeList',
        iconURL:
          'https://upload.wikimedia.org/wikipedia/commons/7/7a/MyAnimeList_Logo.png',
      })
      .setFooter({
        text: `Made with ❤️ by Ririko`,
      })
      .setTimestamp()
      .setImage(data?.images?.jpg?.image_url || data?.images?.webp?.image_url);

    return embed;
  }
}
