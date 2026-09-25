import { describe, it, expect, vi } from 'vitest';
import { ReactionGifService } from '../reaction-gif.service.js';
import type { OtakuGifsClient } from '../otakugifs.client.js';

function fakeClient(fetchGifUrl: ReturnType<typeof vi.fn>): OtakuGifsClient {
  return { fetchGifUrl } as unknown as OtakuGifsClient;
}

describe('ReactionGifService (TASK-1302)', () => {
  it('returns null for an unknown reaction without touching the client', async () => {
    const fetchGifUrl = vi.fn();
    const service = new ReactionGifService({ client: fakeClient(fetchGifUrl) });

    expect(await service.getGifUrl('not-a-real-reaction')).toBeNull();
    expect(fetchGifUrl).not.toHaveBeenCalled();
  });

  it('fetches on a cold (empty) pool and serves the fresh url', async () => {
    const fetchGifUrl = vi.fn().mockResolvedValue('https://otakugifs.xyz/hug-1.gif');
    const service = new ReactionGifService({ client: fakeClient(fetchGifUrl) });

    const result = await service.getGifUrl('hug');

    expect(result).toEqual({ url: 'https://otakugifs.xyz/hug-1.gif', stale: false });
    expect(fetchGifUrl).toHaveBeenCalledWith('hug');
  });

  it('fetches synchronously until the pool is warm, then serves from cache without a network call', async () => {
    const now = 0;
    const fetchGifUrl = vi.fn(
      async () => `https://otakugifs.xyz/hug-${fetchGifUrl.mock.calls.length}.gif`,
    );
    const service = new ReactionGifService({
      client: fakeClient(fetchGifUrl),
      minWarmSize: 3,
      maxPoolSize: 3,
      now: () => now,
      random: () => 0,
    });

    // Cold pool: 3 misses fetch synchronously to reach minWarmSize.
    await service.getGifUrl('hug');
    await service.getGifUrl('hug');
    await service.getGifUrl('hug');
    expect(fetchGifUrl).toHaveBeenCalledTimes(3);

    // Warm now (3 fresh entries, at maxPoolSize) -> served from cache, no new fetch, and no
    // background top-up since the pool is already at its cap.
    const result = await service.getGifUrl('hug');
    expect(fetchGifUrl).toHaveBeenCalledTimes(3);
    expect(result?.stale).toBe(false);
    expect(result?.url).toMatch(/^https:\/\/otakugifs\.xyz\/hug-/);
  });

  it('kicks off a background top-up when warm but below maxPoolSize, without blocking the caller', async () => {
    const now = 0;
    let resolveFetch: (url: string) => void = () => undefined;
    const fetchGifUrl = vi
      .fn()
      .mockResolvedValueOnce('https://otakugifs.xyz/a.gif')
      .mockResolvedValueOnce('https://otakugifs.xyz/b.gif')
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveFetch = resolve;
          }),
      );
    const service = new ReactionGifService({
      client: fakeClient(fetchGifUrl),
      minWarmSize: 2,
      maxPoolSize: 20,
      now: () => now,
      random: () => 0,
    });

    await service.getGifUrl('hug'); // miss #1
    await service.getGifUrl('hug'); // miss #2 -> warm (2 >= minWarmSize)

    const warmResult = await service.getGifUrl('hug'); // warm hit, triggers background refill (call #3)
    expect(warmResult?.stale).toBe(false);
    expect(fetchGifUrl).toHaveBeenCalledTimes(3);

    resolveFetch('https://otakugifs.xyz/c.gif');
    await Promise.resolve();
    await Promise.resolve();
  });

  it('treats entries older than the TTL as cold again for the warm check', async () => {
    let now = 0;
    const fetchGifUrl = vi.fn(
      async () => `https://otakugifs.xyz/${fetchGifUrl.mock.calls.length}.gif`,
    );
    const service = new ReactionGifService({
      client: fakeClient(fetchGifUrl),
      ttlMs: 1000,
      minWarmSize: 2,
      maxPoolSize: 10,
      now: () => now,
      random: () => 0,
    });

    await service.getGifUrl('hug');
    await service.getGifUrl('hug');
    expect(fetchGifUrl).toHaveBeenCalledTimes(2);

    now = 5000; // past the TTL: pool is fresh-empty again
    await service.getGifUrl('hug');
    expect(fetchGifUrl).toHaveBeenCalledTimes(3);
  });

  it('serves a stale (TTL-expired) cached url when the live fetch fails (offline fallback)', async () => {
    let now = 0;
    const fetchGifUrl = vi.fn().mockResolvedValueOnce('https://otakugifs.xyz/old.gif');
    const service = new ReactionGifService({
      client: fakeClient(fetchGifUrl),
      ttlMs: 1000,
      minWarmSize: 5,
      now: () => now,
      random: () => 0,
    });

    await service.getGifUrl('hug'); // populates the pool with one entry
    now = 5000; // TTL expired
    fetchGifUrl.mockRejectedValueOnce(new Error('network down'));

    const result = await service.getGifUrl('hug');
    expect(result).toEqual({ url: 'https://otakugifs.xyz/old.gif', stale: true });
  });

  it('resolves to null when the pool is empty and the live fetch fails', async () => {
    const fetchGifUrl = vi.fn().mockRejectedValue(new Error('network down'));
    const service = new ReactionGifService({ client: fakeClient(fetchGifUrl) });

    expect(await service.getGifUrl('hug')).toBeNull();
  });

  it('never throws to the caller when the client throws', async () => {
    const fetchGifUrl = vi.fn().mockRejectedValue(new Error('boom'));
    const service = new ReactionGifService({ client: fakeClient(fetchGifUrl) });

    await expect(service.getGifUrl('hug')).resolves.toBeNull();
  });

  it('bounds the pool at maxPoolSize, evicting the oldest entry first', async () => {
    let now = 0;
    let calls = 0;
    const fetchGifUrl = vi.fn(async () => `https://otakugifs.xyz/${++calls}.gif`);
    const service = new ReactionGifService({
      client: fakeClient(fetchGifUrl),
      ttlMs: 1000,
      minWarmSize: 999, // never "warm" -> always cold-fetch for this test
      maxPoolSize: 2,
      now: () => now,
      random: () => 0,
    });

    await service.getGifUrl('hug'); // pool: [1]
    now = 5000; // expire it so the next call is also a cold miss
    await service.getGifUrl('hug'); // pool: [1(stale), 2]
    now = 10000;
    await service.getGifUrl('hug'); // pool: [2(stale), 3] -- entry "1" evicted

    // Force offline fallback to inspect what remains cached.
    fetchGifUrl.mockRejectedValueOnce(new Error('down'));
    const result = await service.getGifUrl('hug');
    expect(result?.stale).toBe(true);
    expect(['https://otakugifs.xyz/2.gif', 'https://otakugifs.xyz/3.gif']).toContain(result?.url);
    expect(result?.url).not.toBe('https://otakugifs.xyz/1.gif');
  });

  it('uses the injected random function to pick from the pool deterministically', async () => {
    const fetchGifUrl = vi.fn();
    const now = 0;
    const service = new ReactionGifService({
      client: fakeClient(fetchGifUrl),
      minWarmSize: 1,
      maxPoolSize: 5,
      now: () => now,
      random: () => 0.99, // should pick the last fresh entry
    });
    // Seed the pool directly via a successful cold fetch. Warm on the very next call also
    // triggers a background top-up fetch, so give every call the same url to stay deterministic.
    fetchGifUrl.mockResolvedValue('https://otakugifs.xyz/only.gif');
    await service.getGifUrl('hug');

    const result = await service.getGifUrl('hug');
    expect(result?.url).toBe('https://otakugifs.xyz/only.gif');
  });
});
