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

  async runSlash(interaction: DiscordInteraction) {
    const search = (interaction as any).options.getString('search');
    await this.handleInteraction(interaction, search);
  }

  async runPrefix(message: DiscordMessage) {
    const search = message.content.split(' ').slice(1).join(' ');
    await this.handleInteraction(message, search);
  }

  // Common logic for responding to user interactions
  private async handleInteraction(
    interaction: DiscordInteraction | DiscordMessage,
    search: string,
  ) {
    const sourceOptions = this.createSelectMenuOptions(search);
    await this.createMenu({
      interaction,
      text: 'Select a source to search for the wallpaper:',
      options: sourceOptions,
      callback: this.handleWallpaperSelection.bind(this),
      context: this,
    });
  }

  // Helper function to create select menu options
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

  // Helper function to handle wallpaper retrieval
  private async handleWallpaperSelection(
    interaction: DiscordInteraction,
    selectedOption: string,
  ) {
    await interaction.deferReply();
    try {
      const [source, keyword, sourceName, time] = selectedOption.split('&&&&');
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
        await interaction.editReply(
          `No result found. Searching for ${keyword} in ${sourceName} at ${time}...`,
        );
        return;
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

      await interaction.editReply({
        content: `Here is the wallpaper (Courtesy of ${sourceName}):`,
        files: randomWallpapers,
      });
    } catch (error) {
      await interaction.editReply(
        'An error occurred while fetching the wallpaper.',
      );
      Logger.error(error, 'Ririko CommandService');
    }
  }
}
