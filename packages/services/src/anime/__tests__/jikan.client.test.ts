import { describe, it, expect, vi } from 'vitest';
import { RateLimiter } from '../../http/rate-limiter.js';
import { JikanClient } from '../jikan.client.js';

const noSleep = () => Promise.resolve();
const instantLimiter = () => new RateLimiter(0, { sleep: noSleep });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function clientWith(fetchFn: typeof fetch): JikanClient {
  return new JikanClient({ limiter: instantLimiter(), fetchFn, maxRetries: 0 });
}

const requestedUrl = (fetchFn: ReturnType<typeof vi.fn<typeof fetch>>, call = 0) =>
  new URL(String(fetchFn.mock.calls[call]![0]));

describe('JikanClient', () => {
  it('searches anime and manga with the SFW flag and a clamped limit', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ mal_id: 52991, title: 'Sousou no Frieren' }] }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: [] }));
    const client = clientWith(fetchFn);

    const anime = await client.searchAnime('Frieren');
    expect(anime[0]).toMatchObject({ mal_id: 52991 });
    const animeUrl = requestedUrl(fetchFn, 0);
    expect(animeUrl.pathname).toBe('/v4/anime');
    expect(animeUrl.searchParams.get('q')).toBe('Frieren');
    expect(animeUrl.searchParams.get('limit')).toBe('10');
    expect(animeUrl.searchParams.has('sfw')).toBe(true);

    expect(await client.searchManga('Berserk', { limit: 99 })).toEqual([]);
    const mangaUrl = requestedUrl(fetchFn, 1);
    expect(mangaUrl.pathname).toBe('/v4/manga');
    expect(mangaUrl.searchParams.get('limit')).toBe('25');
  });

  it('omits the SFW flag only when adult entries are requested', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: [] }));
    await clientWith(fetchFn).searchAnime('x', { includeAdult: true });
    expect(requestedUrl(fetchFn).searchParams.has('sfw')).toBe(false);
  });

  it('orders character search by favourites', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: [] }));
    await clientWith(fetchFn).searchCharacters('Rem', { limit: 5 });
    const url = requestedUrl(fetchFn);
    expect(url.pathname).toBe('/v4/characters');
    expect(url.searchParams.get('order_by')).toBe('favorites');
    expect(url.searchParams.get('sort')).toBe('desc');
    expect(url.searchParams.get('limit')).toBe('5');
  });

  it('fetches full details and returns null on 404', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ data: { mal_id: 1, title: 'Cowboy Bebop' } }))
      .mockResolvedValueOnce(jsonResponse({ status: 404 }, 404))
      .mockResolvedValueOnce(jsonResponse({ data: { mal_id: 118737, name: 'Rem', voices: [] } }));
    const client = clientWith(fetchFn);

    expect(await client.getAnime(1)).toMatchObject({ title: 'Cowboy Bebop' });
    expect(requestedUrl(fetchFn, 0).pathname).toBe('/v4/anime/1/full');
    expect(await client.getManga(999999)).toBeNull();
    expect(requestedUrl(fetchFn, 1).pathname).toBe('/v4/manga/999999/full');
    expect(await client.getCharacter(118737)).toMatchObject({ name: 'Rem' });
    expect(requestedUrl(fetchFn, 2).pathname).toBe('/v4/characters/118737/full');
  });

  it('throws on non-404 failures so callers can fall back', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 429 }));
    await expect(clientWith(fetchFn).searchAnime('x')).rejects.toThrow('HTTP 429');
  });
});
