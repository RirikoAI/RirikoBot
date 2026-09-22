import { describe, it, expect, vi } from 'vitest';
import { AnimeSearchService, toPlainText } from '../anime-search.service.js';
import type { AniListClient, AniListMedia } from '../anilist.client.js';
import type { JikanAnime, JikanClient } from '../jikan.client.js';

const jikanAnime: JikanAnime = {
  mal_id: 52991,
  url: 'https://myanimelist.net/anime/52991',
  images: { jpg: { image_url: 'small.jpg', large_image_url: 'large.jpg' } },
  title: 'Sousou no Frieren',
  title_english: "Frieren: Beyond Journey's End",
  title_japanese: '葬送のフリーレン',
  type: 'TV',
  status: 'Finished Airing',
  score: 9.26,
  popularity: 120,
  members: 1_000_000,
  synopsis: 'An elf mage.\n\n[Written by MAL Rewrite]',
  genres: [{ mal_id: 2, name: 'Adventure' }],
  episodes: 28,
  aired: { from: '2023-09-29T00:00:00+00:00', to: '2024-03-22T00:00:00+00:00' },
  rating: 'PG-13 - Teens 13 or older',
  studios: [{ mal_id: 11, name: 'Madhouse' }],
  producers: [{ mal_id: 17, name: 'Aniplex' }],
};

const aniListMedia: AniListMedia = {
  id: 154587,
  idMal: 52991,
  type: 'ANIME',
  title: { romaji: 'Sousou no Frieren', english: "Frieren: Beyond Journey's End", native: null },
  description: 'An elf mage.<br>~!She outlives them.!~',
  averageScore: 91,
  popularity: 400_000,
  episodes: 28,
  chapters: null,
  volumes: null,
  status: 'FINISHED',
  format: 'TV',
  genres: ['Adventure'],
  startDate: '2023-09-29',
  endDate: '2024-03-22',
  studios: ['Madhouse'],
  producers: [],
  authors: [],
  coverImageUrl: 'cover.jpg',
  siteUrl: 'https://anilist.co/anime/154587',
  isAdult: false,
};

function setup(overrides: { jikan?: Partial<JikanClient>; anilist?: Partial<AniListClient> } = {}) {
  let clock = 1_000;
  const jikan = {
    searchAnime: vi.fn().mockResolvedValue([jikanAnime]),
    searchManga: vi.fn().mockResolvedValue([]),
    searchCharacters: vi.fn().mockResolvedValue([]),
    getCharacter: vi.fn().mockResolvedValue(null),
    ...overrides.jikan,
  };
  const anilist = {
    searchMedia: vi.fn().mockResolvedValue([aniListMedia]),
    searchCharacters: vi.fn().mockResolvedValue([]),
    getCharacter: vi.fn().mockResolvedValue(null),
    ...overrides.anilist,
  };
  const service = new AnimeSearchService({
    jikan: jikan as unknown as JikanClient,
    anilist: anilist as unknown as AniListClient,
    now: () => clock,
    cacheTtlMs: 100,
    jikanCooldownMs: 50,
  });
  return { service, jikan, anilist, advance: (ms: number) => (clock += ms) };
}

describe('AnimeSearchService', () => {
  it('answers from MyAnimeList first and maps Jikan fields', async () => {
    const { service, jikan, anilist } = setup();

    const result = await service.searchAnime('Frieren');

    expect(result.source).toBe('myanimelist');
    expect(result.items[0]).toMatchObject({
      id: 52991,
      kind: 'ANIME',
      imageUrl: 'large.jpg',
      score: 9.26,
      popularityRank: 120,
      startDate: '2023-09-29',
      endDate: '2024-03-22',
      ageRating: 'PG-13 - Teens 13 or older',
      studios: ['Madhouse'],
      producers: ['Aniplex'],
      genres: ['Adventure'],
    });
    expect(jikan.searchAnime).toHaveBeenCalledWith('Frieren', { limit: 10, includeAdult: false });
    expect(anilist.searchMedia).not.toHaveBeenCalled();
  });

  it('falls back to AniList when Jikan fails, then skips Jikan during the cooldown', async () => {
    const { service, jikan, anilist, advance } = setup({
      jikan: { searchAnime: vi.fn().mockRejectedValue(new Error('HTTP 504')) },
    });

    const first = await service.searchAnime('Frieren');
    expect(first.source).toBe('anilist');
    expect(first.items[0]).toMatchObject({
      id: 154587,
      score: 9.1,
      members: 400_000,
      popularityRank: null,
      synopsis: 'An elf mage.\n||She outlives them.||',
    });
    expect(anilist.searchMedia).toHaveBeenCalledWith('Frieren', {
      type: 'ANIME',
      perPage: 10,
      includeAdult: false,
    });

    await service.searchAnime('Berserk');
    expect(jikan.searchAnime).toHaveBeenCalledTimes(1);

    advance(60);
    await service.searchAnime('Bocchi');
    expect(jikan.searchAnime).toHaveBeenCalledTimes(2);
  });

  it('caches results per kind, adult filter and normalised query until the TTL expires', async () => {
    const { service, jikan, advance } = setup();

    await service.searchAnime('Frieren');
    await service.searchAnime('  FRIEREN ');
    expect(jikan.searchAnime).toHaveBeenCalledTimes(1);

    await service.searchAnime('Frieren', { includeAdult: true });
    expect(jikan.searchAnime).toHaveBeenCalledTimes(2);

    advance(150);
    await service.searchAnime('Frieren');
    expect(jikan.searchAnime).toHaveBeenCalledTimes(3);
  });

  it('does not cache failures when both sources are down', async () => {
    const { service, anilist } = setup({
      jikan: { searchManga: vi.fn().mockRejectedValue(new Error('down')) },
      anilist: { searchMedia: vi.fn().mockRejectedValue(new Error('down too')) },
    });

    await expect(service.searchManga('Berserk')).rejects.toThrow('down too');
    await expect(service.searchManga('Berserk')).rejects.toThrow('down too');
    expect(anilist.searchMedia).toHaveBeenCalledTimes(2);
  });

  it('loads character details from the source of the search hit', async () => {
    const { service, jikan, anilist } = setup({
      jikan: {
        getCharacter: vi.fn().mockResolvedValue({
          mal_id: 118737,
          url: 'https://myanimelist.net/character/118737',
          images: { jpg: { image_url: 'rem.jpg' } },
          name: 'Rem',
          name_kanji: 'レム',
          nicknames: ['Oni'],
          favorites: 80_000,
          about: 'Twin maid.',
          anime: [{ role: 'Main', anime: { mal_id: 31240, title: 'Re:Zero' } }],
          manga: [],
          voices: [
            { language: 'Japanese', person: { mal_id: 1, name: 'Minase, Inori' } },
            { language: 'English', person: { mal_id: 2, name: 'Someone' } },
          ],
        }),
      },
      anilist: {
        getCharacter: vi.fn().mockResolvedValue({
          id: 88,
          name: 'Rem',
          nativeName: null,
          alternativeNames: [],
          description: null,
          imageUrl: null,
          siteUrl: null,
          favourites: 1,
          mediaTitles: [],
          animeTitles: ['Re:ZERO'],
          mangaTitles: [],
          voiceActors: [],
        }),
      },
    });

    const mal = await service.getCharacter('myanimelist', 118737);
    expect(mal).toMatchObject({
      source: 'myanimelist',
      nicknames: ['Oni'],
      animeTitles: ['Re:Zero'],
      voiceActors: ['Minase, Inori'],
    });
    await service.getCharacter('myanimelist', 118737);
    expect(jikan.getCharacter).toHaveBeenCalledTimes(1);

    expect((await service.getCharacter('anilist', 88))?.animeTitles).toEqual(['Re:ZERO']);
    expect(anilist.getCharacter).toHaveBeenCalledWith(88);
  });
});

describe('toPlainText', () => {
  it('strips markup, decodes entities and keeps spoilers hidden', () => {
    expect(toPlainText('<i>Hi</i> &amp; __bold__<br><br><br><br>~!twist!~')).toBe('Hi & bold\n\n||twist||');
    expect(toPlainText('   ')).toBeNull();
    expect(toPlainText(null)).toBeNull();
  });
});
