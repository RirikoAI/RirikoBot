import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Message,
} from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { Wallpaper } from '@ririko/services';
import type { BotServices } from '../../services.js';
import { httpUrl, truncate } from './embeds.js';
import { attachOwnerCollector } from './owner-collector.js';

export const WALLPAPER_PREV_ID = 'wallpaper:prev';
export const WALLPAPER_NEXT_ID = 'wallpaper:next';
const MAX_QUERY_LENGTH = 100;

export function buildWallpaperEmbed(
  wallpaper: Wallpaper,
  position: { index: number; total: number },
  query: string | null,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(query ? `🖼️ Wallpaper: ${truncate(query, 200)}` : '🖼️ Random anime wallpaper')
    .setColor('#6D5BA3')
    .setAuthor({ name: 'Wallhaven', url: 'https://wallhaven.cc' })
    .setURL(wallpaper.pageUrl)
    .setImage(wallpaper.imageUrl)
    .addFields(
      { name: 'Resolution', value: wallpaper.resolution, inline: true },
      { name: 'Favorites', value: wallpaper.favorites.toLocaleString('en-US'), inline: true },
      { name: 'Views', value: wallpaper.views.toLocaleString('en-US'), inline: true },
    )
    .setFooter({ text: `Wallpaper ${position.index + 1} of ${position.total} • Made with ❤️ by Ririko` })
    .setTimestamp();

  const source = httpUrl(wallpaper.source);
  if (source) embed.addFields({ name: 'Source', value: truncate(source, 1024) });
  return embed;
}

function buildWallpaperRow(wallpaper: Wallpaper, index: number, total: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(WALLPAPER_PREV_ID)
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index === 0),
    new ButtonBuilder()
      .setCustomId(WALLPAPER_NEXT_ID)
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index >= total - 1),
    new ButtonBuilder().setLabel('Full resolution').setStyle(ButtonStyle.Link).setURL(wallpaper.imageUrl),
  );
}

export function createWallpaperCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'wallpaper',
      category: CommandCategory.ANIME,
      description: 'Find SFW anime wallpapers on Wallhaven',
      usage: '/wallpaper [search]',
      examples: ['/wallpaper', '/wallpaper search:Frieren', '!wallpaper Genshin Impact'],
      aliases: ['wallpapers'],
      cooldownSeconds: 3,
      options: [
        {
          name: 'search',
          description: 'What to search for (leave empty for random wallpapers)',
          type: 'STRING',
          required: false,
          maxLength: MAX_QUERY_LENGTH,
        },
      ],
    },

    execute: async (ctx: CommandContext) => {
      const query = ctx.options.getString('search')?.trim().slice(0, MAX_QUERY_LENGTH) || null;

      await ctx.deferReply();
      let wallpapers: Wallpaper[];
      try {
        // Only http(s) URLs survive; discord.js rejects anything else in embeds and link buttons.
        wallpapers = (await services.wallhavenClient.search(query ? { query } : {})).filter(
          (w) => httpUrl(w.imageUrl) && httpUrl(w.pageUrl),
        );
      } catch (err) {
        console.error('[Wallpaper] Wallhaven request failed:', err);
        await ctx.editReply({ content: '❌ Wallhaven is unreachable right now. Please try again in a moment.' });
        return;
      }
      if (wallpapers.length === 0) {
        await ctx.editReply({
          content: query ? `🔍 No wallpapers found for **${truncate(query, 100)}**.` : '🔍 No wallpapers found.',
        });
        return;
      }

      let index = 0;
      const render = () => {
        const wallpaper = wallpapers[index]!;
        return {
          embeds: [buildWallpaperEmbed(wallpaper, { index, total: wallpapers.length }, query)],
          components: [buildWallpaperRow(wallpaper, index, wallpapers.length)],
        };
      };

      const message: Message = await ctx.editReply(render());
      attachOwnerCollector(message, {
        ownerId: ctx.user.id,
        customIds: [WALLPAPER_PREV_ID, WALLPAPER_NEXT_ID],
        notOwnerHint: '⏳ Run `/wallpaper` to browse your own wallpapers.',
        onCollect: async (interaction) => {
          const step = interaction.customId === WALLPAPER_NEXT_ID ? 1 : -1;
          index = Math.min(Math.max(index + step, 0), wallpapers.length - 1);
          await interaction.update(render());
        },
      });
    },
  };
}
