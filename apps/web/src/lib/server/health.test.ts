import { describe, expect, it, vi } from 'vitest';
import type { DatabaseClient } from '@ririko/database';
import { webProbe } from './health';
import { SchemaNotReadyError } from './schema-guard';

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

  it('is not ready while migrations are pending, and logs which ones', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const behind = new SchemaNotReadyError('The database schema is behind: 0001_add_column.', [
      '0001_add_column',
    ]);

    const ready = await webProbe('ready', {
      database: async () => {
        throw behind;
      },
      version: '2.0.0',
    });

    expect(ready.status).toBe(503);
    expect(await ready.text()).toBe('{"ready":false}');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('ready probe'), behind);
    expect(String(log.mock.calls[0]?.[1])).toContain('0001_add_column');
    log.mockRestore();
  });

  it('stays alive while migrations are pending, without logging on every liveness poll', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const behind = new SchemaNotReadyError('The database schema is behind: 0000_baseline.', [
      '0000_baseline',
    ]);

    const health = await webProbe('health', {
      database: async () => {
        throw behind;
      },
      version: '2.0.0',
    });

    expect(health.status).toBe(200);
    expect(health.headers.get('cache-control')).toBe('no-store');
    expect(await health.json()).toMatchObject({
      status: 'healthy',
      version: '2.0.0',
      database: { status: 'MIGRATION_PENDING', pending: ['0000_baseline'] },
    });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('answers 503 on both probes when the database is unreachable, not just behind', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = {
      database: async (): Promise<DatabaseClient> => {
        throw new Error('connect ECONNREFUSED 10.0.0.5:5432');
      },
      version: '2.0.0',
    };

    const health = await webProbe('health', deps);
    expect(health.status).toBe(503);
    const text = await health.text();
    expect(JSON.parse(text)).toMatchObject({
      status: 'unhealthy',
      database: { status: 'UNREACHABLE' },
    });
    expect(text).not.toContain('10.0.0.5');
    expect((await webProbe('ready', deps)).status).toBe(503);
    expect(log).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });
});
