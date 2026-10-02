import { describe, expect, it, vi } from 'vitest';
import { rateLimits } from '@/lib/server/rate-limit';

const ping = vi.fn(async () => ({ ok: true, dialect: 'sqlite', latencyMs: 1 }));
vi.mock('@/lib/server/services', () => ({ getWebServices: async () => ({ db: { ping } }) }));

const health = await import('./route');
const ready = await import('../ready/route');

const request = (ip: string) =>
  new Request('https://dash.example.com/health', { headers: { 'x-forwarded-for': ip } });

describe('probe routes (TASK-1221)', () => {
  it('answer from the dashboard database', async () => {
    const live = await health.GET(request('203.0.113.1'));
    expect(live.status).toBe(200);
    expect(await live.json()).toMatchObject({ status: 'healthy', version: '2.0.0' });
    expect(await (await ready.GET(request('203.0.113.1'))).json()).toEqual({ ready: true });
    expect(ping).toHaveBeenCalledTimes(2);
  });

  it('are rate limited per client, before the database is touched', async () => {
    ping.mockClear();
    vi.spyOn(rateLimits.probes, 'take').mockReturnValueOnce(false);
    const limited = await health.GET(request('203.0.113.2'));
    expect(limited.status).toBe(429);
    expect(ping).not.toHaveBeenCalled();
  });
});
