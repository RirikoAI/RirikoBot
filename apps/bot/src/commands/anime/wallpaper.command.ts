import {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type InteractionEditReplyOptions,
  type Message,
} from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import {
  WALLPAPER_SOURCES,
  type Wallpaper,
  type WallpaperSession,
  type WallpaperSourceId,
} from '@ririko/services';
import type { BotServices } from '../../services.js';
import { httpUrl, truncate } from './embeds.js';
import { attachOwnerCollector } from '../shared/owner-collector.js';

export const WALLPAPER_SOURCE_ID = 'wallpaper:source';
export const WALLPAPER_ACTION_ID = 'wallpaper:action';
const MAX_QUERY_LENGTH = 100;
const PER_LOAD = 3;
const COLOR = '#6D5BA3';

type WallpaperAction = 'more' | 'sources' | 'done';

const sourceLabel = (id: WallpaperSourceId) => WALLPAPER_SOURCES.find((s) => s.id === id)?.label ?? id;

function sourceMenu(query: string): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(WALLPAPER_SOURCE_ID)
      .setPlaceholder('Select a source')
      .addOptions(
        WALLPAPER_SOURCES.map((s) => ({
          label: s.label,
          value: s.id,
          description: truncate(`Search for ${query} on ${s.label} · ${s.description}`, 100),
        })),
      ),
  );
}

function actionMenu(source: WallpaperSourceId): ActionRowBuilder<StringSelectMenuBuilder> {
  const label = sourceLabel(source);
  const options: Array<{ label: string; value: WallpaperAction; description: string }> = [
    { label: 'Load another wallpaper', value: 'more', description: `Get more wallpapers from ${label}` },
    { label: 'Select another source', value: 'sources', description: 'Search on another source' },
    { label: 'No, I am done', value: 'done', description: 'Close this menu' },
  ];
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(WALLPAPER_ACTION_ID)
      .setPlaceholder('Do you want to do anything else?')
      .addOptions(options),
  );
}

export function buildWallpaperEmbed(wallpaper: Wallpaper, source: WallpaperSourceId): EmbedBuilder {
  const stats = [
    wallpaper.resolution,
    wallpaper.favorites !== null ? `❤️ ${wallpaper.favorites.toLocaleString('en-US')}` : null,
    wallpaper.views !== null ? `👁️ ${wallpaper.views.toLocaleString('en-US')}` : null,
    sourceLabel(source),
  ].filter(Boolean);

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setURL(wallpaper.pageUrl)
    .setImage(wallpaper.imageUrl)
    .setFooter({ text: stats.join(' • ') });
  const artwork = httpUrl(wallpaper.source);
  if (artwork) embed.setDescription(`[Original artwork](${artwork})`);
  return embed;
}

function sourcePrompt(query: string, note?: string): InteractionEditReplyOptions {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🖼️ Anime wallpapers')
    .setDescription([note, `Select a source to search for **${truncate(query, 200)}**:`].filter(Boolean).join('\n\n'))
    .setFooter({ text: 'Made with ❤️ by Ririko' });
  return { content: '', embeds: [embed], components: [sourceMenu(query)] };
}

export function createWallpaperCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'wallpaper',
      category: CommandCategory.ANIME,
      description: 'Find anime wallpapers on WallHaven, Zerochan, or Konachan',
      usage: '/wallpaper <search>',
      examples: ['/wallpaper search:Frieren', '!wallpaper Raiden Shogun'],
      aliases: ['wallpapers'],
      cooldownSeconds: 3,
      options: [
        {
          name: 'search',
          description: 'Character, series, or keyword to search for',
          type: 'STRING',
          required: true,
          maxLength: MAX_QUERY_LENGTH,
        },
      ],
    },

    execute: async (ctx: CommandContext) => {
      const query = ctx.options.getString('search')?.trim().slice(0, MAX_QUERY_LENGTH);
      if (!query) {
        await ctx.reply({ content: '❌ Please tell me what wallpaper to search for.', ephemeral: true });
        return;
      }

      const session: WallpaperSession = services.wallpaperService.createSession(query);
      let current: WallpaperSourceId | null = null;

      /** Loads the next batch from `source` and renders it, or explains why there is none. */
      const load = async (source: WallpaperSourceId): Promise<InteractionEditReplyOptions> => {
        const label = sourceLabel(source);
        let batch: Wallpaper[];
        try {
          // discord.js rejects non-http(s) URLs in embeds.
          batch = (await session.next(source, PER_LOAD)).filter((w) => httpUrl(w.imageUrl) && httpUrl(w.pageUrl));
        } catch (err) {
          console.error(`[Wallpaper] ${label} request failed:`, err);
          return sourcePrompt(query, `❌ ${label} is unreachable right now. Try another source.`);
        }
        if (batch.length === 0) {
          return sourcePrompt(query, `🔍 No ${current === source ? 'more ' : ''}wallpapers for **${truncate(query, 100)}** on ${label}.`);
        }
        current = source;
        return {
          content: `🖼️ Here are wallpapers for **${truncate(query, 100)}** (Courtesy of ${label})`,
          embeds: batch.map((w) => buildWallpaperEmbed(w, source)),
          components: [actionMenu(source)],
        };
      };

      await ctx.deferReply();
      const message: Message = await ctx.editReply(sourcePrompt(query));

      attachOwnerCollector(message, {
        ownerId: ctx.user.id,
        customIds: [WALLPAPER_SOURCE_ID, WALLPAPER_ACTION_ID],
        notOwnerHint: '⏳ Run `/wallpaper` to search for your own wallpapers.',
        onCollect: async (interaction) => {
          if (!interaction.isStringSelectMenu()) return;
          const choice = interaction.values[0];

          if (interaction.customId === WALLPAPER_SOURCE_ID) {
            await interaction.deferUpdate();
            await interaction.editReply(await load(choice as WallpaperSourceId));
            return;
          }

          if (choice === 'more' && current) {
            await interaction.deferUpdate();
            await interaction.editReply(await load(current));
          } else if (choice === 'sources') {
            await interaction.update(sourcePrompt(query));
          } else if (choice === 'done') {
            await interaction.update({
              content: 'Thank you for using the wallpaper command. Made with ❤️ by Ririko',
              components: [],
            });
          }
        },
      });
    },
  };
}
