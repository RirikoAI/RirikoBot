import { describe, it, expect, vi } from 'vitest';
import { RateLimiter } from '../../http/rate-limiter.js';
import { WaifuImClient } from '../waifu-im.client.js';

const instantLimiter = () => new RateLimiter(0, { sleep: () => Promise.resolve() });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const rawItem = {
  id: 8007,
  url: 'https://cdn.waifu.im/8007.png',
  extension: '.png',
  source: 'https://www.pixiv.net/artworks/101462647',
  isNsfw: false,
  width: 1484,
  height: 2452,
  dominantColor: '#828387',
  favorites: 8,
  tags: [{ id: 12, name: 'Waifu', slug: 'waifu', description: 'x' }],
  artists: [
    { id: 950, name: 'yejji', pixiv: 'https://www.pixiv.net/users/12131266', twitter: null, deviantArt: null, patreon: null },
  ],
};

describe('WaifuImClient', () => {
  it('requests random SFW images from /images and maps items', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ items: [rawItem] }));
    const client = new WaifuImClient({ limiter: instantLimiter(), fetchFn });

    const [image] = await client.search({ tags: ['waifu', 'maid'] });

    const url = new URL(String(fetchFn.mock.calls[0]![0]));
    expect(url.pathname).toBe('/images');
    expect(url.searchParams.get('IsNsfw')).toBe('False');
    expect(url.searchParams.get('OrderBy')).toBe('Random');
    expect(url.searchParams.get('PageSize')).toBe('1');
    expect(url.searchParams.getAll('IncludedTags')).toEqual(['waifu', 'maid']);
    expect(image).toMatchObject({
      id: 8007,
      url: 'https://cdn.waifu.im/8007.png',
      favorites: 8,
      tags: [{ name: 'Waifu', slug: 'waifu' }],
      artists: [{ name: 'yejji', pixiv: 'https://www.pixiv.net/users/12131266' }],
    });
    const headers = fetchFn.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['User-Agent']).toMatch(/RirikoBot/);
  });

  it('clamps the page size and only lifts the NSFW filter on request', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ items: [] }));
    const client = new WaifuImClient({ limiter: instantLimiter(), fetchFn });

    expect(await client.search({ limit: 500, includeNsfw: true })).toEqual([]);
    const url = new URL(String(fetchFn.mock.calls[0]![0]));
    expect(url.searchParams.get('PageSize')).toBe('30');
    expect(url.searchParams.get('IsNsfw')).toBe('All');
  });

  it('retries 429 through fetchWithRetry and throws on other failures', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '0.001' } }))
      .mockResolvedValueOnce(jsonResponse({ items: [rawItem] }))
      .mockResolvedValueOnce(new Response('', { status: 403 }));
    const client = new WaifuImClient({ limiter: instantLimiter(), fetchFn, maxRetries: 1 });

    expect(await client.search()).toHaveLength(1);
    await expect(client.search()).rejects.toThrow('HTTP 403');
  });

  it('downloads image binaries', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    const client = new WaifuImClient({ limiter: instantLimiter(), fetchFn });
    expect([...(await client.downloadImage('https://cdn.waifu.im/1.png'))]).toEqual([1, 2, 3]);
  });
});
