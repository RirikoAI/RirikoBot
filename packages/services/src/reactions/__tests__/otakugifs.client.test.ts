import { describe, it, expect, vi } from 'vitest';
import { RateLimiter } from '../../http/rate-limiter.js';
import { OtakuGifsClient, UnknownReactionError } from '../otakugifs.client.js';

const instantLimiter = () => new RateLimiter(0, { sleep: () => Promise.resolve() });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('OtakuGifsClient (TASK-1302)', () => {
  it('requests the reactionType slug (not the catalog name) and returns the url', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ url: 'https://otakugifs.xyz/hug.gif' }));
    const client = new OtakuGifsClient({ limiter: instantLimiter(), fetchFn });

    const url = await client.fetchGifUrl('hug');

    expect(url).toBe('https://otakugifs.xyz/hug.gif');
    const requestedUrl = new URL(String(fetchFn.mock.calls[0]![0]));
    expect(requestedUrl.origin + requestedUrl.pathname).toBe('https://api.otakugifs.xyz/gif');
    expect(requestedUrl.searchParams.get('reaction')).toBe('hug');
    expect(requestedUrl.searchParams.get('format')).toBe('gif');
  });

  it('maps a catalog alias to its reactionType slug (stopit -> stop)', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ url: 'https://otakugifs.xyz/stop.gif' }));
    const client = new OtakuGifsClient({ limiter: instantLimiter(), fetchFn });

    await client.fetchGifUrl('stopit');

    const requestedUrl = new URL(String(fetchFn.mock.calls[0]![0]));
    expect(requestedUrl.searchParams.get('reaction')).toBe('stop');
  });

  it('URL-encodes the reactionType slug', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ url: 'https://otakugifs.xyz/x.gif' }));
    const client = new OtakuGifsClient({ limiter: instantLimiter(), fetchFn });

    await client.fetchGifUrl('HUG');

    const requestedUrl = new URL(String(fetchFn.mock.calls[0]![0]));
    expect(requestedUrl.searchParams.get('reaction')).toBe('hug');
  });

  it('rejects an unknown reaction before making any network request', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const client = new OtakuGifsClient({ limiter: instantLimiter(), fetchFn });

    await expect(client.fetchGifUrl('not-a-real-reaction')).rejects.toThrow(UnknownReactionError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('throws on a non-ok response', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 500 }));
    const client = new OtakuGifsClient({ limiter: instantLimiter(), fetchFn, maxRetries: 0 });

    await expect(client.fetchGifUrl('hug')).rejects.toThrow('HTTP 500');
  });

  it('throws when the response body has no url field', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}));
    const client = new OtakuGifsClient({ limiter: instantLimiter(), fetchFn });

    await expect(client.fetchGifUrl('hug')).rejects.toThrow('missing the "url" field');
  });
});
