import type { EmbedBuilder, Message, StringSelectMenuInteraction } from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { AnimeDataSource, AnimeSearchResult } from '@ririko/services';
import type { BotServices } from '../../services.js';
import {
  ANIME_SELECT_ID,
  buildCharacterEmbed,
  buildMediaEmbed,
  buildResultListEmbed,
  buildResultMenu,
  characterOption,
  mediaOption,
} from './embeds.js';
import { attachOwnerCollector } from './owner-collector.js';

const MAX_QUERY_LENGTH = 100;

interface SearchFlow<T> {
  /** Lower-case label used in messages: `anime`, `manga`, `character`. */
  noun: string;
  search: (query: string, includeAdult: boolean) => Promise<AnimeSearchResult<T>>;
  toOption: (item: T) => { label: string; description: string };
  /** Resolves null when the entry disappeared upstream. */
  render: (item: T, source: AnimeDataSource) => Promise<EmbedBuilder | null>;
}

function isNsfwChannel(ctx: CommandContext): boolean {
  const channel = ctx.channel as { nsfw?: boolean } | null;
  return channel?.nsfw === true;
}

/**
 * Shared search → select → details flow used by /anime, /manga and /anime-character.
 * Adult entries are only searched in age-restricted channels.
 */
async function runSearchFlow<T>(ctx: CommandContext, flow: SearchFlow<T>): Promise<void> {
  const query = ctx.options.getString('search')?.trim().slice(0, MAX_QUERY_LENGTH);
  if (!query) {
    await ctx.reply({ content: `❌ Please tell me which ${flow.noun} to search for.`, ephemeral: true });
    return;
  }

  await ctx.deferReply();

  let result: AnimeSearchResult<T>;
  try {
    result = await flow.search(query, isNsfwChannel(ctx));
  } catch (err) {
    console.error(`[AnimeSearch] ${flow.noun} search failed for "${query}":`, err);
    await ctx.editReply({
      content: '❌ The anime databases are unreachable right now. Please try again in a moment.',
    });
    return;
  }

  const items = result.items.slice(0, 25);
  if (items.length === 0) {
    await ctx.editReply({ content: `🔍 No ${flow.noun} found for **${query}**.` });
    return;
  }

  const menu = buildResultMenu(items.map(flow.toOption), 'Pick a result to view its details');
  const message: Message = await ctx.editReply({
    embeds: [buildResultListEmbed(result.source, `🔍 ${capitalize(flow.noun)} search`, query, items.length)],
    components: [menu],
  });
  attachOwnerCollector(message, {
    ownerId: ctx.user.id,
    customIds: [ANIME_SELECT_ID],
    notOwnerHint: `⏳ This menu belongs to someone else. Run \`/${ctx.commandName}\` to start your own search.`,
    onCollect: async (interaction) => {
      if (interaction.isStringSelectMenu()) await showSelection(interaction, items, result.source, flow, menu);
    },
  });
}

async function showSelection<T>(
  interaction: StringSelectMenuInteraction,
  items: T[],
  source: AnimeDataSource,
  flow: SearchFlow<T>,
  menu: ReturnType<typeof buildResultMenu>,
): Promise<void> {
  const item = items[Number(interaction.values[0])];
  if (!item) {
    await interaction.deferUpdate();
    return;
  }

  await interaction.deferUpdate();
  try {
    const embed = await flow.render(item, source);
    await interaction.editReply(
      embed
        ? { content: '', embeds: [embed], components: [menu] }
        : { content: `❌ That ${flow.noun} entry is no longer available.`, components: [menu] },
    );
  } catch (err) {
    console.error(`[AnimeSearch] Failed to load ${flow.noun} details:`, err);
    await interaction.followUp({
      content: '❌ Could not load the details right now. Please try again in a moment.',
      ephemeral: true,
    });
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const searchOption = (description: string) => ({
  name: 'search',
  description,
  type: 'STRING' as const,
  required: true,
  maxLength: MAX_QUERY_LENGTH,
});

export function createAnimeCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'anime',
      category: CommandCategory.ANIME,
      description: 'Search for an anime and view its details',
      usage: '/anime <search>',
      examples: ['/anime search:Frieren', '!anime Cowboy Bebop'],
      cooldownSeconds: 3,
      options: [searchOption('The anime title to search for')],
    },
    execute: (ctx) =>
      runSearchFlow(ctx, {
        noun: 'anime',
        search: (query, includeAdult) => services.animeSearchService.searchAnime(query, { includeAdult }),
        toOption: mediaOption,
        render: async (media) => buildMediaEmbed(media),
      }),
  };
}

export function createMangaCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'manga',
      category: CommandCategory.ANIME,
      description: 'Search for a manga and view its details',
      usage: '/manga <search>',
      examples: ['/manga search:Berserk', '!manga One Piece'],
      cooldownSeconds: 3,
      options: [searchOption('The manga title to search for')],
    },
    execute: (ctx) =>
      runSearchFlow(ctx, {
        noun: 'manga',
        search: (query, includeAdult) => services.animeSearchService.searchManga(query, { includeAdult }),
        toOption: mediaOption,
        render: async (media) => buildMediaEmbed(media),
      }),
  };
}

export function createAnimeCharacterCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'anime-character',
      category: CommandCategory.ANIME,
      description: 'Search for an anime or manga character and view their details',
      usage: '/anime-character <search>',
      examples: ['/anime-character search:Rem', '!anime-character Frieren'],
      aliases: ['character'],
      cooldownSeconds: 3,
      options: [searchOption('The character name to search for')],
    },
    execute: (ctx) =>
      runSearchFlow(ctx, {
        noun: 'character',
        search: (query) => services.animeSearchService.searchCharacters(query),
        toOption: characterOption,
        render: async (character, source) => {
          const details = await services.animeSearchService.getCharacter(source, character.id);
          return details ? buildCharacterEmbed(details) : null;
        },
      }),
  };
}
