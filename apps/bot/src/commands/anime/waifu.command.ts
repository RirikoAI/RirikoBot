import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Message,
} from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import { WAIFU_IM_SFW_TAGS, type WaifuImImage } from '@ririko/services';
import type { BotServices } from '../../services.js';
import { httpUrl, truncate } from './embeds.js';
import { attachOwnerCollector } from './owner-collector.js';

export const WAIFU_REROLL_ID = 'waifu:reroll';
const DEFAULT_TAG = 'selfies';

type WaifuTag = (typeof WAIFU_IM_SFW_TAGS)[number];

const isWaifuTag = (value: string): value is WaifuTag => (WAIFU_IM_SFW_TAGS as readonly string[]).includes(value);

const tagLabel = (slug: string) =>
  slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

export function buildWaifuEmbed(image: WaifuImImage): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('Random Waifu Image')
    .setColor('#FF00FF')
    .setImage(image.url)
    .addFields(
      { name: 'Tags', value: truncate(image.tags.map((t) => t.name).join(', ') || 'N/A', 1024), inline: true },
      { name: 'Favorites', value: String(image.favorites), inline: true },
    )
    .setFooter({ text: 'Collect waifus as cards with /tcg-info • Made with ❤️ by Ririko' })
    .setTimestamp();

  const source = httpUrl(image.source);
  if (source) embed.setURL(source);

  const artist = image.artists[0];
  const artistUrl = artist
    ? httpUrl(artist.pixiv ?? artist.twitter ?? artist.deviantArt ?? artist.patreon)
    : null;
  embed.setAuthor(
    artist
      ? { name: truncate(`${artist.name} via Waifu.im`, 256), ...(artistUrl ? { url: artistUrl } : {}) }
      : { name: 'via Waifu.im', url: 'https://waifu.im' },
  );
  return embed;
}

const rerollRow = () =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(WAIFU_REROLL_ID).setLabel('Another one').setEmoji('🔄').setStyle(ButtonStyle.Primary),
  );

export function createWaifuCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'waifu',
      category: CommandCategory.ANIME,
      description: 'Get a random waifu image from waifu.im',
      usage: '/waifu [tag]',
      examples: ['/waifu', '/waifu tag:maid', '!waifu raiden-shogun'],
      cooldownSeconds: 3,
      options: [
        {
          name: 'tag',
          description: `Image theme (default: ${DEFAULT_TAG})`,
          type: 'STRING',
          required: false,
          choices: WAIFU_IM_SFW_TAGS.map((slug) => ({ name: tagLabel(slug), value: slug })),
        },
      ],
    },

    execute: async (ctx: CommandContext) => {
      const requested = ctx.options.getString('tag')?.trim().toLowerCase() || DEFAULT_TAG;
      if (!isWaifuTag(requested)) {
        await ctx.reply({
          content: `❌ Unknown tag \`${truncate(requested, 50)}\`. Available tags: ${WAIFU_IM_SFW_TAGS.map((t) => `\`${t}\``).join(', ')}`,
          ephemeral: true,
        });
        return;
      }

      // Skip entries whose URL discord.js would reject.
      const fetchImage = async () =>
        (await services.waifuImClient.search({ tags: [requested] })).find((i) => httpUrl(i.url)) ?? null;

      await ctx.deferReply();
      let image: WaifuImImage | null;
      try {
        image = await fetchImage();
      } catch (err) {
        console.error('[Waifu] waifu.im request failed:', err);
        await ctx.editReply({ content: '❌ waifu.im is unreachable right now. Please try again in a moment.' });
        return;
      }
      if (!image) {
        await ctx.editReply({ content: `🔍 No images found for \`${requested}\`.` });
        return;
      }

      const message: Message = await ctx.editReply({ embeds: [buildWaifuEmbed(image)], components: [rerollRow()] });
      attachOwnerCollector(message, {
        ownerId: ctx.user.id,
        customIds: [WAIFU_REROLL_ID],
        notOwnerHint: '⏳ Run `/waifu` to get your own image.',
        onCollect: async (interaction) => {
          await interaction.deferUpdate();
          try {
            const next = await fetchImage();
            if (next) await interaction.editReply({ embeds: [buildWaifuEmbed(next)], components: [rerollRow()] });
          } catch (err) {
            console.error('[Waifu] waifu.im reroll failed:', err);
            await interaction.followUp({ content: '❌ Could not fetch another image right now.', ephemeral: true });
          }
        },
      });
    },
  };
}
