import { describe, it, expect, vi } from 'vitest';
import type { AnimeCharacterDetails, AnimeMediaDetails } from '@ririko/services';
import type { BotServices } from '../../../services.js';
import {
  createAnimeCharacterCommand,
  createAnimeCommand,
  createMangaCommand,
} from '../search.command.js';
import { buildMediaEmbed, humanize, mediaOption } from '../embeds.js';
import { flush, makeContext, selectInteraction } from './helpers.js';

const frieren: AnimeMediaDetails = {
  source: 'myanimelist',
  id: 52991,
  kind: 'ANIME',
  title: 'Sousou no Frieren',
  englishTitle: "Frieren: Beyond Journey's End",
  nativeTitle: '葬送のフリーレン',
  synopsis: 'An elf mage.',
  url: 'https://myanimelist.net/anime/52991',
  imageUrl: 'https://cdn.myanimelist.net/large.jpg',
  score: 9.26,
  popularityRank: 120,
  members: 1_000_000,
  format: 'TV',
  status: 'Finished Airing',
  startDate: '2023-09-29',
  endDate: '2024-03-22',
  genres: ['Adventure', 'Drama'],
  ageRating: 'PG-13 - Teens 13 or older',
  isAdult: false,
  episodes: 28,
  chapters: null,
  volumes: null,
  studios: ['Madhouse'],
  producers: ['Aniplex'],
  authors: [],
};

const rem: AnimeCharacterDetails = {
  source: 'anilist',
  id: 88,
  name: 'Rem',
  nativeName: 'レム',
  imageUrl: 'rem.png',
  favourites: 5000,
  nicknames: [],
  about: 'Twin maid.',
  url: 'https://anilist.co/character/88',
  animeTitles: ['Re:ZERO'],
  mangaTitles: [],
  voiceActors: ['Inori Minase'],
};

function servicesWith(search: Partial<BotServices['animeSearchService']>): BotServices {
  return { animeSearchService: search } as unknown as BotServices;
}

describe('Anime search commands (TASK-1423)', () => {
  it('lists results in a select menu and shows details for the picked entry', async () => {
    const searchAnime = vi.fn().mockResolvedValue({ source: 'myanimelist', items: [frieren] });
    const { ctx, raw, collector } = makeContext('Frieren');

    await createAnimeCommand(servicesWith({ searchAnime })).execute(ctx);

    expect(searchAnime).toHaveBeenCalledWith('Frieren', { includeAdult: false });
    expect(raw.deferReply).toHaveBeenCalled();
    const listPayload = raw.editReply.mock.calls[0]![0];
    expect(listPayload.embeds[0].data.author.name).toBe('MyAnimeList');
    const menu = listPayload.components[0].components[0].data;
    expect(menu.custom_id).toBe('anime:select');
    expect(listPayload.components[0].components[0].options[0].data).toMatchObject({
      label: 'Sousou no Frieren',
      value: '0',
    });

    const pick = selectInteraction('0');
    collector.emit('collect', pick);
    await flush();

    expect(collector.resetTimer).toHaveBeenCalled();
    expect(pick.deferUpdate).toHaveBeenCalled();
    const detail = pick.editReply.mock.calls[0]![0];
    expect(detail.embeds[0].data.title).toBe('Sousou no Frieren');
  });

  it('rejects menu use by other users', async () => {
    const searchAnime = vi.fn().mockResolvedValue({ source: 'myanimelist', items: [frieren] });
    const { ctx, collector } = makeContext('Frieren');
    await createAnimeCommand(servicesWith({ searchAnime })).execute(ctx);

    const intruder = selectInteraction('0', 'user-2');
    collector.emit('collect', intruder);
    await flush();

    expect(intruder.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    expect(intruder.editReply).not.toHaveBeenCalled();
  });

  it('removes the menu when the collector ends', async () => {
    const searchManga = vi
      .fn()
      .mockResolvedValue({ source: 'anilist', items: [{ ...frieren, kind: 'MANGA' }] });
    const { ctx, collector, message } = makeContext('Berserk');
    await createMangaCommand(servicesWith({ searchManga })).execute(ctx);

    collector.emit('end');
    await flush();
    expect(message.edit).toHaveBeenCalledWith({ components: [] });
  });

  it('includes adult entries only in age-restricted channels', async () => {
    const searchManga = vi.fn().mockResolvedValue({ source: 'anilist', items: [] });
    const { ctx, raw } = makeContext('Berserk', { nsfw: true });

    await createMangaCommand(servicesWith({ searchManga })).execute(ctx);

    expect(searchManga).toHaveBeenCalledWith('Berserk', { includeAdult: true });
    expect(raw.editReply).toHaveBeenCalledWith({ content: '🔍 No manga found for **Berserk**.' });
  });

  it('asks for a query and reports unreachable databases', async () => {
    const empty = makeContext(null);
    await createAnimeCommand(servicesWith({})).execute(empty.ctx);
    expect(empty.raw.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));

    const searchAnime = vi.fn().mockRejectedValue(new Error('down'));
    const failing = makeContext('Frieren');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await createAnimeCommand(servicesWith({ searchAnime })).execute(failing.ctx);
    expect(failing.raw.editReply.mock.calls[0]![0].content).toMatch(/unreachable/);
  });

  it('loads character details from the source of the hit', async () => {
    const searchCharacters = vi.fn().mockResolvedValue({
      source: 'anilist',
      items: [
        {
          source: 'anilist',
          id: 88,
          name: 'Rem',
          nativeName: 'レム',
          imageUrl: null,
          favourites: 5000,
        },
      ],
    });
    const getCharacter = vi.fn().mockResolvedValue(rem);
    const { ctx, collector } = makeContext('Rem');

    await createAnimeCharacterCommand(servicesWith({ searchCharacters, getCharacter })).execute(
      ctx,
    );
    expect(searchCharacters).toHaveBeenCalledWith('Rem');

    const pick = selectInteraction('0');
    collector.emit('collect', pick);
    await flush();

    expect(getCharacter).toHaveBeenCalledWith('anilist', 88);
    const embed = pick.editReply.mock.calls[0]![0].embeds[0].data;
    expect(embed.author.name).toBe('AniList');
    expect(embed.fields.find((f: { name: string }) => f.name === 'Voice Actors').value).toBe(
      'Inori Minase',
    );
  });
});

describe('anime embeds', () => {
  it('humanizes upstream enum values', () => {
    expect(humanize('FINISHED')).toBe('Finished');
    expect(humanize('NOT_YET_RELEASED')).toBe('Not Yet Released');
    expect(humanize('Finished Airing')).toBe('Finished Airing');
    expect(humanize('TV')).toBe('TV');
    expect(humanize(null)).toBe('N/A');
  });

  it('builds the legacy detail fields and a compact menu option', () => {
    const fields = buildMediaEmbed(frieren).data.fields!.map((f) => [f.name, f.value]);
    expect(Object.fromEntries(fields)).toMatchObject({
      Score: '⭐ 9.26',
      Episodes: '28',
      Popularity: '#120',
      Genres: 'Adventure, Drama',
      Rating: 'PG-13 - Teens 13 or older',
      Studios: 'Madhouse',
      Producers: 'Aniplex',
    });
    expect(mediaOption(frieren)).toEqual({
      label: 'Sousou no Frieren',
      description: 'TV · 2023 — Adventure, Drama',
    });
  });

  it('drops non-http image and page URLs from upstream data', () => {
    const embed = buildMediaEmbed({
      ...frieren,
      url: 'javascript:alert(1)',
      imageUrl: 'large.jpg',
    });
    expect(embed.data.url).toBeUndefined();
    expect(embed.data.image).toBeUndefined();
  });

  it('shows member counts when there is no popularity rank', () => {
    const embed = buildMediaEmbed({
      ...frieren,
      source: 'anilist',
      popularityRank: null,
      members: 400_000,
    });
    expect(embed.data.fields!.find((f) => f.name === 'Popularity')!.value).toBe('400,000 members');
  });
});
