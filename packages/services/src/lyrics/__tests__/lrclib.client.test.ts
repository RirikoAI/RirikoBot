import { describe, it, expect, vi } from 'vitest';
import { RateLimiter } from '../../http/rate-limiter.js';
import { LrclibClient } from '../lrclib.client.js';

const instantLimiter = () => new RateLimiter(0, { sleep: () => Promise.resolve() });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const notFound = () => jsonResponse({ code: 404, name: 'TrackNotFound' }, 404);

const rawHit = (overrides: Record<string, unknown> = {}) => ({
  id: 3396226,
  name: 'Idol',
  trackName: 'Idol',
  artistName: 'YOASOBI',
  albumName: 'THE BOOK 3',
  duration: 213,
  instrumental: false,
  plainLyrics: 'line one\nline two',
  syncedLyrics: '[00:01.00] line one\n[00:02.50] line two',
  ...overrides,
});

function makeClient(fetchFn: ReturnType<typeof vi.fn<typeof fetch>>) {
  return new LrclibClient({ limiter: instantLimiter(), fetchFn, maxRetries: 0 });
}

describe('LrclibClient', () => {
  it('uses the exact /api/get match and maps the record', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(rawHit()));

    const result = await makeClient(fetchFn).findForTrack({
      title: 'Idol',
      artist: 'YOASOBI',
      durationSeconds: 213,
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchFn.mock.calls[0]![0]));
    expect(url.origin).toBe('https://lrclib.net');
    expect(url.pathname).toBe('/api/get');
    expect(url.searchParams.get('track_name')).toBe('Idol');
    expect(url.searchParams.get('artist_name')).toBe('YOASOBI');
    expect(url.searchParams.get('duration')).toBe('213');
    const headers = fetchFn.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['User-Agent']).toMatch(/RirikoBot/);
    expect(result).toEqual({
      id: 3396226,
      trackName: 'Idol',
      artistName: 'YOASOBI',
      albumName: 'THE BOOK 3',
      durationSeconds: 213,
      instrumental: false,
      plainLyrics: 'line one\nline two',
      syncedLyrics: '[00:01.00] line one\n[00:02.50] line two',
    });
  });

  it('falls back to /api/search on a 404 and keeps the first hit within 3 seconds', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(notFound())
      .mockResolvedValueOnce(
        jsonResponse([
          rawHit({ id: 1, duration: 300, plainLyrics: 'wrong length' }),
          rawHit({ id: 2, duration: 215, plainLyrics: 'right length' }),
          rawHit({ id: 3, duration: 213, plainLyrics: 'later match' }),
        ]),
      );

    const result = await makeClient(fetchFn).findForTrack({
      title: 'Idol',
      artist: 'YOASOBI',
      durationSeconds: 213,
    });

    const search = new URL(String(fetchFn.mock.calls[1]![0]));
    expect(search.pathname).toBe('/api/search');
    expect(search.searchParams.get('track_name')).toBe('Idol');
    expect(search.searchParams.get('artist_name')).toBe('YOASOBI');
    expect(search.searchParams.has('duration')).toBe(false);
    expect(result?.id).toBe(2);
    expect(result?.plainLyrics).toBe('right length');
  });

  it('returns null when no search hit is close enough in length', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(notFound())
      .mockResolvedValueOnce(jsonResponse([rawHit({ duration: 400 })]));

    const result = await makeClient(fetchFn).findForTrack({
      title: 'Idol',
      artist: 'YOASOBI',
      durationSeconds: 213,
    });

    expect(result).toBeNull();
  });

  it('returns null when both lookups find nothing', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(notFound())
      .mockResolvedValueOnce(jsonResponse([]));

    expect(
      await makeClient(fetchFn).findForTrack({
        title: 'Nope',
        artist: 'Nobody',
        durationSeconds: 90,
      }),
    ).toBeNull();
  });

  it('leaves the duration out and takes the first hit when the length is unknown', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(notFound())
      .mockResolvedValueOnce(jsonResponse([rawHit({ id: 7, duration: 999 }), rawHit({ id: 8 })]));

    const result = await makeClient(fetchFn).findForTrack({
      title: 'Idol',
      artist: 'YOASOBI',
      durationSeconds: 0,
    });

    const get = new URL(String(fetchFn.mock.calls[0]![0]));
    expect(get.searchParams.has('duration')).toBe(false);
    expect(result?.id).toBe(7);
  });

  it('skips a blank artist and rejects a blank title without a request', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(rawHit()));
    const client = makeClient(fetchFn);

    expect(await client.findForTrack({ title: '  ', artist: 'x' })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();

    await client.findForTrack({ title: 'Idol', artist: ' ' });
    const url = new URL(String(fetchFn.mock.calls[0]![0]));
    expect(url.searchParams.has('artist_name')).toBe(false);
  });

  it('searches free text with q and returns the first hit', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse([rawHit({ id: 11 }), rawHit({ id: 12 })]));

    const result = await makeClient(fetchFn).search('  yoasobi idol ');

    const url = new URL(String(fetchFn.mock.calls[0]![0]));
    expect(url.pathname).toBe('/api/search');
    expect(url.searchParams.get('q')).toBe('yoasobi idol');
    expect(result?.id).toBe(11);
  });

  it('returns null for empty free text and for a non-array search body', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ unexpected: true }));
    const client = makeClient(fetchFn);

    expect(await client.search('   ')).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await client.search('something')).toBeNull();
  });

  it('maps an instrumental record with no lyrics and falls back to name', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        id: 5,
        name: 'Interlude',
        artistName: 'Someone',
        duration: 61,
        instrumental: true,
        plainLyrics: null,
        syncedLyrics: null,
      }),
    );

    const result = await makeClient(fetchFn).findForTrack({
      title: 'Interlude',
      artist: 'Someone',
      durationSeconds: 61,
    });

    expect(result).toMatchObject({
      trackName: 'Interlude',
      albumName: null,
      instrumental: true,
      plainLyrics: null,
      syncedLyrics: null,
    });
  });

  it('throws on a non-404 error status so a caller can tell down from no lyrics', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response('boom', { status: 503 }));

    await expect(
      makeClient(fetchFn).findForTrack({ title: 'Idol', artist: 'YOASOBI', durationSeconds: 213 }),
    ).rejects.toThrow('HTTP 503');
    await expect(makeClient(fetchFn).search('idol')).rejects.toThrow('HTTP 503');
  });

  it('throws when the search step fails after the exact lookup missed', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(notFound())
      .mockResolvedValueOnce(new Response('bad', { status: 400 }));

    await expect(
      makeClient(fetchFn).findForTrack({ title: 'Idol', artist: 'YOASOBI', durationSeconds: 213 }),
    ).rejects.toThrow('HTTP 400');
  });

  it('honours a custom base URL', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([]));
    const client = new LrclibClient({
      baseUrl: 'https://lyrics.example/',
      limiter: instantLimiter(),
      fetchFn,
      maxRetries: 0,
    });

    await client.search('x');

    expect(String(fetchFn.mock.calls[0]![0]).startsWith('https://lyrics.example/api/search')).toBe(
      true,
    );
  });
});
