import { describe, it, expect, vi } from 'vitest';
import { RateLimiter } from '../../http/rate-limiter.js';
import { ZerochanClient } from '../zerochan.client.js';
import { KonachanClient } from '../konachan.client.js';

const instantLimiter = () => new RateLimiter(0, { sleep: () => Promise.resolve() });

function withUrl(res: Response, url: string): Response {
  Object.defineProperty(res, 'url', { value: url });
  return res;
}

const jsonResponse = (body: unknown, url = '') =>
  withUrl(
    new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }),
    url,
  );

const htmlResponse = (url: string) =>
  withUrl(new Response('<html></html>', { headers: { 'content-type': 'text/html' } }), url);

const zeroItem = (id: number, tag: string) => ({
  id,
  width: 1500,
  height: 2200,
  source: 'https://pixiv.net/1',
  tag,
});

describe('ZerochanClient', () => {
  it('requests JSON pages with an identifying User-Agent and derives 600px image URLs', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ items: [zeroItem(3924910, 'Raiden Shogun')] }));
    const client = new ZerochanClient({ limiter: instantLimiter(), fetchFn });

    const [wallpaper] = await client.search('Raiden Shogun', 2);

    expect(String(fetchFn.mock.calls[0]![0])).toBe(
      'https://www.zerochan.net/Raiden%20Shogun?json&l=24&p=2',
    );
    const headers = fetchFn.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['User-Agent']).toBe('RirikoBot - RirikoAI');
    expect(wallpaper).toEqual({
      id: '3924910',
      pageUrl: 'https://www.zerochan.net/3924910',
      imageUrl: 'https://s1.zerochan.net/Raiden.Shogun.600.3924910.jpg',
      thumbnailUrl: null,
      resolution: '1500x2200',
      favorites: null,
      views: null,
      source: 'https://pixiv.net/1',
    });
  });

  it('re-requests JSON after an alias redirect and leaves unusual tags for detail lookup', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(htmlResponse('https://www.zerochan.net/Fern'))
      .mockResolvedValueOnce(
        jsonResponse({ items: [zeroItem(1, 'Fern'), zeroItem(2, 'Saber (Fate)')] }),
      );
    const client = new ZerochanClient({ limiter: instantLimiter(), fetchFn });

    const results = await client.search('Fern (Sousou no Frieren)');

    expect(String(fetchFn.mock.calls[1]![0])).toBe('https://www.zerochan.net/Fern?json&l=24&p=1');
    expect(results.map((w) => w.imageUrl)).toEqual(['https://s1.zerochan.net/Fern.600.1.jpg', '']);
  });

  it('returns nothing for unknown tags and resolves image URLs from the detail endpoint', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(htmlResponse('https://www.zerochan.net/zzzz?json&l=24&p=1'))
      .mockResolvedValueOnce(jsonResponse({ id: 2, large: 'https://s1.zerochan.net/x.600.2.jpg' }));
    const client = new ZerochanClient({ limiter: instantLimiter(), fetchFn });

    expect(await client.search('zzzz')).toEqual([]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(await client.resolveImageUrl('2')).toBe('https://s1.zerochan.net/x.600.2.jpg');
    expect(String(fetchFn.mock.calls[1]![0])).toBe('https://www.zerochan.net/2?json');
  });
});

describe('KonachanClient', () => {
  const post = (id: number, rating: string) => ({
    id,
    rating,
    jpeg_url: `https://konachan.net/jpeg/${id}.jpg`,
    file_url: `https://konachan.net/image/${id}.png`,
    width: 3305,
    height: 1513,
    score: 17,
    source: '',
  });

  it('searches konachan.net as one safe-rated tag and keeps only safe posts', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse([post(1, 's'), post(2, 'q')]));
    const client = new KonachanClient({ limiter: instantLimiter(), fetchFn });

    const results = await client.search('Raiden  Shogun', 3);

    const url = new URL(String(fetchFn.mock.calls[0]![0]));
    expect(url.origin + url.pathname).toBe('https://konachan.net/post.json');
    expect(url.searchParams.get('tags')).toBe('raiden_shogun rating:safe');
    expect(url.searchParams.get('page')).toBe('3');
    expect(results).toEqual([
      {
        id: '1',
        pageUrl: 'https://konachan.net/post/show/1',
        imageUrl: 'https://konachan.net/jpeg/1.jpg',
        thumbnailUrl: null,
        resolution: '3305x1513',
        favorites: 17,
        views: null,
        source: null,
      },
    ]);
  });

  it('throws on failures', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 500 }));
    const client = new KonachanClient({ limiter: instantLimiter(), fetchFn, maxRetries: 0 });
    await expect(client.search('x')).rejects.toThrow('HTTP 500');
  });
});
