import { describe, it, expect, vi } from 'vitest';
import { RateLimiter, fetchWithRetry } from '../rate-limiter.js';

const noSleep = () => Promise.resolve();
const instantLimiter = () => new RateLimiter(0, { sleep: noSleep });

describe('RateLimiter & fetchWithRetry', () => {
  it('spaces task starts by the minimum interval', async () => {
    let clock = 0;
    const sleeps: number[] = [];
    const limiter = new RateLimiter(1000, {
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    });
    const starts: number[] = [];
    await Promise.all([1, 2, 3].map(() => limiter.schedule(async () => void starts.push(clock))));
    expect(starts).toEqual([0, 1000, 2000]);
    expect(sleeps).toEqual([1000, 1000]);
  });

  it('keeps working after a task throws', async () => {
    const limiter = instantLimiter();
    await expect(limiter.schedule(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(limiter.schedule(async () => 'ok')).resolves.toBe('ok');
  });

  it('retries 429 using Retry-After and 5xx with backoff, then returns success', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '3' } }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const sleeps: number[] = [];
    const res = await fetchWithRetry(
      'https://x',
      {},
      {
        limiter: instantLimiter(),
        fetchFn,
        baseBackoffMs: 100,
        sleep: async (ms) => void sleeps.push(ms),
      },
    );
    expect(res.status).toBe(200);
    expect(sleeps).toEqual([3000, 200]);
  });

  it('does not retry client errors', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 }));
    const res = await fetchWithRetry(
      'https://x',
      {},
      { limiter: instantLimiter(), fetchFn, sleep: noSleep },
    );
    expect(res.status).toBe(404);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('aborts each attempt after timeoutMs and retries it', async () => {
    const signals: Array<AbortSignal | null | undefined> = [];
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      signals.push(init?.signal);
      if (signals.length === 1) throw new DOMException('timed out', 'TimeoutError');
      return new Response('', { status: 200 });
    });
    const res = await fetchWithRetry(
      'https://x',
      {},
      { limiter: instantLimiter(), fetchFn, sleep: noSleep, timeoutMs: 50 },
    );
    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(signals.every((s) => s instanceof AbortSignal)).toBe(true);
  });
});
