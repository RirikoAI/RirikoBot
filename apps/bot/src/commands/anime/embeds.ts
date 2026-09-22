import {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type APIEmbedField,
  type ColorResolvable,
} from 'discord.js';
import type {
  AnimeCharacterDetails,
  AnimeCharacterSummary,
  AnimeDataSource,
  AnimeMediaDetails,
} from '@ririko/services';

export const ANIME_SELECT_ID = 'anime:select';

const SOURCE_AUTHOR: Record<AnimeDataSource, { name: string; iconURL: string; color: ColorResolvable }> = {
  myanimelist: {
    name: 'MyAnimeList',
    iconURL: 'https://upload.wikimedia.org/wikipedia/commons/7/7a/MyAnimeList_Logo.png',
    color: '#2E51A2',
  },
  anilist: {
    name: 'AniList',
    iconURL: 'https://anilist.co/img/icons/android-chrome-512x512.png',
    color: '#02A9FF',
  },
};

const NA = 'N/A';

/** Upstream URLs are untrusted; discord.js throws on anything that is not http(s). */
const httpUrl = (value: string | null) => (value && /^https?:\/\/\S+$/i.test(value) ? value : null);

/** `FINISHED_AIRING` / `Finished Airing` → `Finished Airing`; keeps short codes like `TV`. */
export function humanize(value: string | null | undefined): string {
  if (!value) return NA;
  if (!value.includes('_') && value !== value.toUpperCase()) return value;
  if (value.length <= 3) return value;
  return value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

const list = (values: string[], max = 1024) => (values.length ? truncate(values.join(', '), max) : NA);
const num = (value: number | null) => (value === null ? NA : value.toLocaleString('en-US'));

function yearOf(media: AnimeMediaDetails): string | null {
  return media.startDate ? media.startDate.slice(0, 4) : null;
}

function baseEmbed(source: AnimeDataSource): EmbedBuilder {
  const author = SOURCE_AUTHOR[source];
  return new EmbedBuilder()
    .setColor(author.color)
    .setAuthor({ name: author.name, iconURL: author.iconURL })
    .setFooter({ text: 'Made with ❤️ by Ririko' })
    .setTimestamp();
}

/** Select menu over search results; option values are result indexes. */
export function buildResultMenu(
  options: Array<{ label: string; description: string }>,
  placeholder: string,
): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(ANIME_SELECT_ID)
    .setPlaceholder(placeholder)
    .addOptions(
      options.slice(0, 25).map((o, index) => ({
        label: truncate(o.label || `Result ${index + 1}`, 100),
        description: truncate(o.description || NA, 100),
        value: String(index),
      })),
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export function mediaOption(media: AnimeMediaDetails): { label: string; description: string } {
  const meta = [humanize(media.format), yearOf(media)].filter((v) => v && v !== NA).join(' · ');
  const genres = media.genres.join(', ');
  return { label: media.title, description: [meta, genres].filter(Boolean).join(' — ') };
}

export function characterOption(character: AnimeCharacterSummary): { label: string; description: string } {
  const favourites = `❤️ ${character.favourites.toLocaleString('en-US')} favourites`;
  return {
    label: character.name,
    description: character.nativeName ? `${character.nativeName} · ${favourites}` : favourites,
  };
}

export function buildResultListEmbed(
  source: AnimeDataSource,
  title: string,
  query: string,
  count: number,
): EmbedBuilder {
  return baseEmbed(source)
    .setTitle(title)
    .setDescription(
      `Found **${count}** result${count === 1 ? '' : 's'} for **${truncate(query, 200)}**.\nPick one from the menu below.`,
    );
}

export function buildMediaEmbed(media: AnimeMediaDetails): EmbedBuilder {
  const titles = [
    media.englishTitle && media.englishTitle !== media.title ? `**English:** ${media.englishTitle}` : null,
    media.nativeTitle ? `**Japanese:** ${media.nativeTitle}` : null,
  ].filter(Boolean);
  const synopsis = media.synopsis ?? 'No synopsis available.';
  const description = truncate([...titles, '', synopsis].join('\n').trim(), 4096);

  const fields: APIEmbedField[] = [
    { name: 'Score', value: media.score === null ? NA : `⭐ ${media.score.toFixed(2)}`, inline: true },
    media.kind === 'ANIME'
      ? { name: 'Episodes', value: num(media.episodes), inline: true }
      : { name: 'Chapters / Volumes', value: `${num(media.chapters)} / ${num(media.volumes)}`, inline: true },
    {
      name: 'Popularity',
      value: media.popularityRank !== null ? `#${num(media.popularityRank)}` : `${num(media.members)} members`,
      inline: true,
    },
    { name: 'Type', value: humanize(media.format), inline: true },
    { name: 'Status', value: humanize(media.status), inline: true },
    { name: 'Genres', value: list(media.genres), inline: true },
    { name: 'Start Date', value: media.startDate ?? NA, inline: true },
    { name: 'End Date', value: media.endDate ?? NA, inline: true },
  ];
  if (media.ageRating) fields.push({ name: 'Rating', value: media.ageRating, inline: true });
  if (media.kind === 'ANIME') {
    fields.push({ name: 'Studios', value: list(media.studios) });
    fields.push({ name: 'Producers', value: list(media.producers) });
  } else {
    fields.push({ name: 'Authors', value: list(media.authors) });
    if (media.producers.length) fields.push({ name: 'Serialization', value: list(media.producers) });
  }

  const embed = baseEmbed(media.source)
    .setTitle(truncate(media.title, 256))
    .setDescription(description)
    .addFields(fields);
  const url = httpUrl(media.url);
  const image = httpUrl(media.imageUrl);
  if (url) embed.setURL(url);
  if (image) embed.setImage(image);
  return embed;
}

export function buildCharacterEmbed(character: AnimeCharacterDetails): EmbedBuilder {
  const header = character.nativeName ? `**Japanese:** ${character.nativeName}\n\n` : '';
  const embed = baseEmbed(character.source)
    .setTitle(truncate(character.name, 256))
    .setDescription(truncate(`${header}${character.about ?? 'No description available.'}`, 4096))
    .addFields(
      { name: 'Nicknames', value: list(character.nicknames), inline: true },
      { name: 'Favorites', value: `❤️ ${num(character.favourites)}`, inline: true },
      { name: 'Anime', value: list(character.animeTitles.slice(0, 10)) },
      { name: 'Manga', value: list(character.mangaTitles.slice(0, 10)) },
      { name: 'Voice Actors', value: list(character.voiceActors.slice(0, 10)) },
    );
  const url = httpUrl(character.url);
  const image = httpUrl(character.imageUrl);
  if (url) embed.setURL(url);
  if (image) embed.setImage(image);
  return embed;
}
