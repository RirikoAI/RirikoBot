import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import { SlashCommandOptionTypes } from '#command/command.types';
import { AnimeSource, AnimeWallpaper } from 'anime-wallpaper';
import {
  CommandInteraction,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  MessageComponentInteraction,
} from 'discord.js';
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

  async runSlash(interaction: CommandInteraction) {
    const search = (interaction as any).options.getString('search');
    await this.handleInteraction(interaction, search);
  }

  async runPrefix(message: any) {
    const search = message.content.split(' ').slice(1).join(' ');
    await this.handleInteraction(message, search);
  }

  // Common logic for responding to user interactions
  private async handleInteraction(
    interaction: CommandInteraction | any,
    search: string,
  ) {
    const sourceOptions = this.createSelectMenuOptions(search);
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select-menu')
      .setPlaceholder('Choose an option...')
      .addOptions(sourceOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const reply = await interaction.reply({
      content: 'Please select the source of the wallpaper:',
      components: [row],
    });

    const filter = (i) => i.customId === 'select-menu';
    const collector = reply.createMessageComponentCollector({
      filter,
      time: 60000,
    });

    collector.on('collect', async (i: any) => {
      await i.deferReply();
      await this.fetchWallpaper(i, i.values[0]);
    });

    collector.on('end', async (collected) => {
      if (collected.size === 0) {
        await interaction.editReply('No one selected an option.');
      }
    });
  }

  // Helper function to create select menu options
  private createSelectMenuOptions(search: string) {
    return [
      {
        label: 'WallHaven',
        value: this.prepareOption(AnimeSource.WallHaven, search, 'WallHaven'),
        description: `Search for ${search} in WallHaven`,
      },
      {
        label: 'Wallpapers.com',
        value: this.prepareOption(
          AnimeSource.Wallpapers,
          search,
          'Wallpapers.com',
        ),
        description: `Search for ${search} in Wallpapers.com`,
      },
      {
        label: 'Live 2D - Moe Walls',
        value: this.prepareOption('MoeWalls', search, 'MoeWalls'),
        description: `Search for ${search} in MoeWalls`,
      },
      {
        label: 'Pinterest',
        value: this.prepareOption('Pinterest', search, 'Pinterest'),
        description: `Search for ${search} in Pinterest`,
      },
      {
        label: 'ZeroChan',
        value: this.prepareOption(AnimeSource.ZeroChan, search, 'ZeroChan'),
        description: `Search for ${search} in ZeroChan`,
      },
    ];
  }

  private prepareOption(
    source: AnimeSource | string,
    keyword: string,
    sourceName,
  ) {
    return `${source}&&&&${keyword}&&&&${sourceName}&&&&${Date.now()}`;
  }

  // Helper function to handle wallpaper retrieval
  private async fetchWallpaper(
    i: MessageComponentInteraction,
    selectedOption: string,
  ) {
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
        await i.editReply(
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
        }
      }

      await i.editReply({
        content: `Here is the wallpaper (Courtesy of ${sourceName}):`,
        files: randomWallpapers,
      });
    } catch (error) {
      await i.editReply('An error occurred while fetching the wallpaper.');
      Logger.error(error, 'Ririko CommandService');
    }
  }
}
