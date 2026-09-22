import { describe, it, expect, vi } from 'vitest';
import { RateLimiter } from '../../http/rate-limiter.js';
import { AniListClient } from '../anilist.client.js';

const noSleep = () => Promise.resolve();
const instantLimiter = () => new RateLimiter(0, { sleep: noSleep });

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('AniListClient', () => {
  const page = (characters: unknown[]) => jsonResponse({ data: { Page: { characters } } });
  const aniChar = (id: number, name: string, titles: string[], favourites = 10) => ({
    id,
    name: { full: name },
    image: { large: `https://img/${id}.png` },
    favourites,
    media: { nodes: titles.map((t) => ({ title: { romaji: t, english: null } })) },
  });

  it('prefers the result whose media matches the anime title', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        page([aniChar(1, 'Lucy', ['Fairy Tail']), aniChar(2, 'Lucy', ['Elfen Lied'], 50)]),
      );
    const client = new AniListClient({ limiter: instantLimiter(), fetchFn });
    const found = await client.findCharacter('Lucy', 'Elfen Lied');
    expect(found).toMatchObject({ id: 2, favourites: 50, imageUrl: 'https://img/2.png' });
  });

  it('falls back to the first result and returns null on no results', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([aniChar(7, 'Rem', ['Something Else'])]))
      .mockResolvedValueOnce(page([]));
    const client = new AniListClient({ limiter: instantLimiter(), fetchFn });
    expect((await client.findCharacter('Rem', 'Re:Zero'))?.id).toBe(7);
    expect(await client.findCharacter('Nobody')).toBeNull();
  });

  describe('searchMedia', () => {
    const rawMedia = (id: number, overrides: Record<string, unknown> = {}) => ({
      id,
      idMal: id + 1000,
      type: 'ANIME',
      title: { romaji: `Romaji ${id}`, english: null, native: null },
      description: 'Desc',
      averageScore: 88,
      episodes: 12,
      chapters: null,
      volumes: null,
      status: 'FINISHED',
      format: 'TV',
      genres: null,
      startDate: { year: 2023 },
      coverImage: { large: `https://img/${id}.jpg` },
      siteUrl: `https://anilist.co/anime/${id}`,
      isAdult: null,
      ...overrides,
    });

    it('maps media and sends SFW defaults', async () => {
      const fetchFn = vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ data: { Page: { media: [rawMedia(5)] } } }));
      const client = new AniListClient({ limiter: instantLimiter(), fetchFn });

      const [media] = await client.searchMedia('Frieren');

      expect(media).toMatchObject({
        id: 5,
        idMal: 1005,
        genres: [],
        startYear: 2023,
        coverImageUrl: 'https://img/5.jpg',
        isAdult: false,
      });
      const body = JSON.parse(fetchFn.mock.calls[0]![1]!.body as string);
      expect(body.variables).toEqual({ search: 'Frieren', type: 'ANIME', perPage: 10, isAdult: false });
    });

    it('passes type, clamps perPage and lifts the adult filter on request', async () => {
      const fetchFn = vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ data: { Page: { media: [] } } }));
      const client = new AniListClient({ limiter: instantLimiter(), fetchFn });

      expect(await client.searchMedia('Berserk', { type: 'MANGA', perPage: 99, includeAdult: true })).toEqual(
        [],
      );
      const body = JSON.parse(fetchFn.mock.calls[0]![1]!.body as string);
      expect(body.variables).toMatchObject({ type: 'MANGA', perPage: 25, isAdult: null });
    });

    it('throws on GraphQL errors and non-OK responses', async () => {
      const fetchFn = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ errors: [{ message: 'Bad query' }] }))
        .mockResolvedValueOnce(new Response('', { status: 404 }));
      const client = new AniListClient({ limiter: instantLimiter(), fetchFn });

      await expect(client.searchMedia('x')).rejects.toThrow('Bad query');
      await expect(client.searchMedia('x')).rejects.toThrow('HTTP 404');
    });
  });
});
