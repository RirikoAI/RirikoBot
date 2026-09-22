import { describe, it, expect, vi } from 'vitest';
import { RateLimiter } from '../../http/rate-limiter.js';
import { WallhavenClient } from '../wallhaven.client.js';

const instantLimiter = () => new RateLimiter(0, { sleep: () => Promise.resolve() });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const raw = (id: string, purity = 'sfw') => ({
  id,
  url: `https://wallhaven.cc/w/${id}`,
  path: `https://w.wallhaven.cc/full/${id.slice(0, 2)}/wallhaven-${id}.jpg`,
  thumbs: { large: `https://th.wallhaven.cc/lg/${id}.jpg`, original: null },
  resolution: '1920x1080',
  favorites: 11,
  views: 1692,
  source: '',
  purity,
});

describe('WallhavenClient', () => {
  it('pins every search to the Anime category and SFW purity, by relevance for a query', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: [raw('k8831q')] }));
    const client = new WallhavenClient({ limiter: instantLimiter(), fetchFn });

    const [wallpaper] = await client.search({ query: ' frieren ', page: 2 });

    const url = new URL(String(fetchFn.mock.calls[0]![0]));
    expect(url.pathname).toBe('/api/v1/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      categories: '010',
      purity: '100',
      sorting: 'relevance',
      page: '2',
      q: 'frieren',
    });
    expect(wallpaper).toEqual({
      id: 'k8831q',
      pageUrl: 'https://wallhaven.cc/w/k8831q',
      imageUrl: 'https://w.wallhaven.cc/full/k8/wallhaven-k8831q.jpg',
      thumbnailUrl: 'https://th.wallhaven.cc/lg/k8831q.jpg',
      resolution: '1920x1080',
      favorites: 11,
      views: 1692,
      source: null,
    });
  });

  it('uses random sorting without a query and drops anything not SFW', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ data: [raw('aaaaaa'), raw('bbbbbb', 'sketchy')] }));
    const client = new WallhavenClient({ limiter: instantLimiter(), fetchFn });

    const results = await client.search();

    const url = new URL(String(fetchFn.mock.calls[0]![0]));
    expect(url.searchParams.get('sorting')).toBe('random');
    expect(url.searchParams.has('q')).toBe(false);
    expect(results.map((w) => w.id)).toEqual(['aaaaaa']);
  });

  it('throws on failures', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 401 }));
    await expect(new WallhavenClient({ limiter: instantLimiter(), fetchFn }).search()).rejects.toThrow('HTTP 401');
  });
});
