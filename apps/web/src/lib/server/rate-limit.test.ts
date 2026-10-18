import { describe, expect, it } from 'vitest';
import { limitAuthRequest, rateLimits, RateLimiter } from './rate-limit';

describe('RateLimiter (TASK-1173)', () => {
  it('allows a burst up to capacity, then refills over time per key', () => {
    let now = 0;
    const limiter = new RateLimiter({ capacity: 3, refillPerSecond: 1, now: () => now });

    expect([1, 2, 3, 4].map(() => limiter.take('a'))).toEqual([true, true, true, false]);
    expect(limiter.take('b')).toBe(true);

    now = 999;
    expect(limiter.take('a')).toBe(false);
    now = 1_000;
    expect(limiter.take('a')).toBe(true);
    expect(limiter.take('a')).toBe(false);

    now = 60_000;
    expect([1, 2, 3, 4].map(() => limiter.take('a'))).toEqual([true, true, true, false]);
  });

  it('keeps empty buckets when it prunes refilled ones', () => {
    let now = 0;
    const limiter = new RateLimiter({ capacity: 1, refillPerSecond: 1, now: () => now });
    for (let index = 0; index < 10_001; index += 1) limiter.take(`key-${index}`);
    now = 5_000;
    // This take pushes the map over the threshold; the refilled key-* buckets are dropped.
    expect(limiter.take('busy')).toBe(true);
    expect(limiter.take('busy')).toBe(false);
    expect(limiter.take('key-0')).toBe(true);
  });
});

describe('limitAuthRequest (TASK-1173)', () => {
  it('answers 429 once a client IP has used its auth requests', async () => {
    const request = new Request('https://dash.example.com/api/auth/login', {
      headers: { 'x-forwarded-for': '198.51.100.23' },
    });
    const results = Array.from({ length: 21 }, () => limitAuthRequest(request));

    expect(results.slice(0, 20).every((result) => result === null)).toBe(true);
    const limited = results[20];
    expect(limited?.status).toBe(429);
    expect(limited?.headers.get('retry-after')).toBe('60');
    expect(rateLimits.auth.take('ip:198.51.100.24')).toBe(true);
  });
});
