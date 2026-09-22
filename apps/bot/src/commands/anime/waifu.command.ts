import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Message,
} from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { WaifuImImage } from '@ririko/services';
import type { BotServices } from '../../services.js';
import { httpUrl, truncate } from './embeds.js';
import { attachOwnerCollector } from '../shared/owner-collector.js';

export const WAIFU_REROLL_ID = 'waifu:reroll';
/**
 * 1.4.0 served `selfies`, but only 3 SFW images carry that tag now (the rest are NSFW), so
 * regenerating would loop. `waifu` has over 1,200 SFW images.
 */
const WAIFU_TAG = 'waifu';
const BATCH_SIZE = 10;

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
      usage: '/waifu',
      examples: ['/waifu', '!waifu'],
      cooldownSeconds: 3,
    },

    execute: async (ctx: CommandContext) => {
      // waifu.im repeats its "random" pick for a few seconds, so ask for a batch and prefer an
      // image this user has not seen yet. Entries with URLs discord.js would reject are skipped.
      const shown = new Set<number>();
      const fetchImage = async () => {
        const batch = (await services.waifuImClient.search({ tags: [WAIFU_TAG], limit: BATCH_SIZE })).filter((i) =>
          httpUrl(i.url),
        );
        const image = batch.find((i) => !shown.has(i.id)) ?? batch[0] ?? null;
        if (image) shown.add(image.id);
        return image;
      };

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
        await ctx.editReply({ content: '🔍 waifu.im returned no image. Please try again.' });
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
