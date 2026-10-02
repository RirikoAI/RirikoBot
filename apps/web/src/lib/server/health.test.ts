import { describe, expect, it, vi } from 'vitest';
import type { DatabaseClient } from '@ririko/database';
import { webProbe } from './health';

const database = (ping: DatabaseClient['ping']) => async () => ({ ping }) as DatabaseClient;

describe('dashboard probes', () => {
  it('reports health and readiness while the database answers', async () => {
    const deps = {
      database: database(async () => ({ ok: true, dialect: 'postgres', latencyMs: 3 })),
      version: '2.0.0',
    };

    const health = await webProbe('health', deps);
    expect(health.status).toBe(200);
    expect(health.headers.get('cache-control')).toBe('no-store');
    expect(await health.json()).toMatchObject({
      status: 'healthy',
      version: '2.0.0',
      database: { status: 'CONNECTED', latencyMs: 3 },
    });

    const ready = await webProbe('ready', deps);
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ ready: true });
  });

  it('answers 503 without error details when the database or the configuration fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    const down = await webProbe('health', {
      database: database(async () => ({
        ok: false,
        dialect: 'postgres',
        latencyMs: 0,
        error: 'connect ECONNREFUSED 10.0.0.5:5432',
      })),
      version: '2.0.0',
    });
    expect(down.status).toBe(503);
    const text = await down.text();
    expect(JSON.parse(text)).toMatchObject({ status: 'unhealthy' });
    expect(text).not.toContain('10.0.0.5');

    const broken = await webProbe('ready', {
      database: async () => {
        throw new Error('DISCORD_CLIENT_SECRET is required');
      },
      version: '2.0.0',
    });
    expect(broken.status).toBe(503);
    expect(await broken.text()).toBe('{"ready":false}');
    expect(log).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });
});
