import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';
import { AnimeSource, AnimeWallpaper } from 'anime-wallpaper';
import { Logger } from '@nestjs/common';

/**
 * WallpaperCommand
 * @description Get random anime wallpaper
 * @category Command
 * @author Earnest Angel (https://angel.net.my)
 */
export default class WallpaperCommand
  extends Command
  implements CommandInterface
{
  name = 'wallpaper';
  regex = new RegExp('^wallpaper$|^wallpaper ', 'i');
  description = 'Get random anime wallpaper';
  category = 'anime';
  usageExamples = ['wallpaper <keyword>'];

  slashOptions = [
    {
      type: SlashCommandOptionTypes.String, // STRING type
      name: 'search',
      description: 'Input the keyword to search',
      required: true,
    },
  ];

  currentUserSearch: {
    userId: string;
    search: string;
  }[] = [];

  async runSlash(interaction: DiscordInteraction) {
    const search = (interaction as any).options.getString('search');
    this.currentUserSearch.push({
      userId: interaction.user.id,
      search,
    });
    await this.selectSource({ interaction, search });
  }

  async runPrefix(message: DiscordMessage) {
    const search = message.content.split(' ').slice(1).join(' ');
    this.currentUserSearch.push({
      userId: message.author.id,
      search,
    });
    await this.selectSource({ interaction: message, search });
  }

  private async selectSource(params: {
    interaction: DiscordInteraction | DiscordMessage;
    search: string;
    followUp?: boolean;
  }) {
    const { interaction, search, followUp } = params;
    const sourceOptions = this.createSelectMenuOptions(search);
    await this.createMenu({
      interaction,
      text: 'Select a source to search for the wallpaper:',
      options: sourceOptions,
      callback: this.handleSourceSelection.bind(this),
      followUp,
    });
  }

  private createSelectMenuOptions(search: string) {
    return [
      {
        label: 'WallHaven',
        value: this.prepareSelectionValue(
          AnimeSource.WallHaven,
          search,
          'WallHaven',
        ),
        description: `Search for ${search} in WallHaven`,
      },
      {
        label: 'Wallpapers.com',
        value: this.prepareSelectionValue(
          AnimeSource.Wallpapers,
          search,
          'Wallpapers.com',
        ),
        description: `Search for ${search} in Wallpapers.com`,
      },
      {
        label: 'Live 2D - Moe Walls',
        value: this.prepareSelectionValue('MoeWalls', search, 'MoeWalls'),
        description: `Search for ${search} in MoeWalls`,
      },
      {
        label: 'Pinterest',
        value: this.prepareSelectionValue('Pinterest', search, 'Pinterest'),
        description: `Search for ${search} in Pinterest`,
      },
      {
        label: 'ZeroChan (Unstable)',
        value: this.prepareSelectionValue(
          AnimeSource.ZeroChan,
          search,
          'ZeroChan',
        ),
        description: `Search for ${search} in ZeroChan`,
      },
    ];
  }

  private prepareSelectionValue(
    source: AnimeSource | string,
    keyword: string,
    sourceName,
  ) {
    return `${source}&&&&${keyword}&&&&${sourceName}&&&&${Date.now()}`;
  }

  private async handleSourceSelection(
    interaction: DiscordInteraction,
    selectedOption: string,
  ) {
    await interaction.deferReply();
    try {
      const reply: any = await this.getWallpapers(selectedOption);

      await interaction.editReply(reply);

      // ask if the user wants to search on another source
      await this.createMenu({
        interaction,
        text: 'Do you want to do anything else?',
        options: [
          {
            label: 'Load another wallpaper',
            value: selectedOption,
            description: `Get more wallpaper from the same source`,
          },
          {
            label: 'Select another source',
            value: 'another_source',
            description: 'Search on another source',
          },
          {
            label: 'No',
            value: 'no',
            description: 'No, I am done',
          },
        ],
        followUp: true,
        callback: this.handleNextAction.bind(this),
      });
    } catch (error) {
      await interaction.editReply(
        'An error occurred while fetching the wallpaper.',
      );
      Logger.error(error, 'Ririko CommandService');
    }
  }

  async handleNextAction(
    interaction: DiscordInteraction,
    selectedOption: string,
  ) {
    if (selectedOption === 'another_source') {
      const search = this.currentUserSearch.find(
        (s) => s.userId === interaction.user.id,
      ).search;
      await this.selectSource({
        interaction,
        search,
        followUp: true,
      });
    } else if (selectedOption === 'no') {
      this.currentUserSearch = this.currentUserSearch.filter(
        (s) => s.userId !== interaction.user.id,
      );
      await interaction.reply(
        'Thank you for using the wallpaper command. Made with ❤️ by Ririko',
      );
    } else {
      await this.handleSourceSelection(interaction, selectedOption);
    }
  }

  async getWallpapers(selectedOption) {
    const [source, keyword, sourceName] = selectedOption.split('&&&&');
    const wallpaper = new AnimeWallpaper();
    let result;

    if (source === 'MoeWalls') {
      result = await wallpaper.live2d(keyword);
    } else if (source === 'Pinterest') {
      result = await wallpaper.pinterest(keyword);
    } else {
      result = await wallpaper.search({ title: keyword }, parseInt(source));
    }
    if (!result) {
      return false;
    }

    // Wallpaper could be an image or a video
    // Randomly select 3 wallpapers (or less if there are less than 3)
    // and send it to the user
    const randomWallpapers = [];
    for (let i = 0; i < 3; i++) {
      const random = result[Math.floor(Math.random() * result.length)];

      // ensure no duplicate
      if (
        randomWallpapers.includes(random.image) ||
        randomWallpapers.includes(random.video)
      ) {
        i--;
        continue;
      }

      if (random?.image) {
        randomWallpapers.push(random.image);
      }

      if (random?.video) {
        randomWallpapers.push(random.video);
        // only take one video
        break;
      }
    }

    return {
      content: `Here is the wallpaper (Courtesy of ${sourceName})`,
      files: randomWallpapers,
    };
  }
}
