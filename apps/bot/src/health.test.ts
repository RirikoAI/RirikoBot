import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { healthPort, probe, startHealthServer, type HealthSources } from './health.js';

function sources(overrides: Partial<HealthSources> = {}): HealthSources {
  return {
    version: '2.0.0',
    ping: async () => ({ ok: true, dialect: 'sqlite', latencyMs: 2 }),
    gateway: () => ({ state: 'READY', pingMs: 40 }),
    started: () => true,
    ...overrides,
  };
}

describe('bot health probes', () => {
  it('reports health with the database and the gateway', async () => {
    const { status, body } = await probe('/health', sources());
    expect(status).toBe(200);
    expect(body).toMatchObject({
      status: 'healthy',
      version: '2.0.0',
      discord: { status: 'READY', pingMs: 40 },
      database: { status: 'CONNECTED', latencyMs: 2 },
    });
  });

  it('is unhealthy when the database fails or its ping throws', async () => {
    const down = await probe(
      '/health',
      sources({
        ping: async () => ({ ok: false, dialect: 'postgres', latencyMs: 5, error: 'refused' }),
      }),
    );
    expect(down.status).toBe(503);
    expect(down.body).toMatchObject({
      status: 'unhealthy',
      database: { status: 'UNREACHABLE', error: 'refused' },
    });

    const thrown = await probe(
      '/health?x=1',
      sources({
        ping: async () => {
          throw new Error('pool closed');
        },
      }),
    );
    expect(thrown.status).toBe(503);
    expect(thrown.body).toMatchObject({ database: { error: 'pool closed' } });
  });

  it('is ready only after startup, with the database up and the gateway READY', async () => {
    expect((await probe('/ready', sources())).status).toBe(200);
    expect((await probe('/ready', sources({ started: () => false }))).body).toEqual({
      ready: false,
      started: false,
      discord: 'READY',
      database: true,
    });
    expect(
      (await probe('/ready', sources({ gateway: () => ({ state: 'CONNECTING', pingMs: null }) })))
        .status,
    ).toBe(503);
    expect(
      (
        await probe(
          '/ready',
          sources({ ping: async () => ({ ok: false, dialect: 'sqlite', latencyMs: 0 }) }),
        )
      ).status,
    ).toBe(503);
  });

  it('answers 404 for other paths', async () => {
    expect(await probe('/', sources())).toEqual({ status: 404, body: { error: 'Not found' } });
  });

  it('reads HEALTH_PORT, where 0 turns the probes off', () => {
    expect(healthPort({})).toBe(8080);
    expect(healthPort({ HEALTH_PORT: '9000' })).toBe(9000);
    expect(healthPort({ HEALTH_PORT: '0' })).toBe(0);
    expect(healthPort({ HEALTH_PORT: 'nope' })).toBe(8080);
  });

  describe('server', () => {
    let server: Server | undefined;
    afterEach(async () => {
      await new Promise((resolve) => server?.close(resolve));
    });

    it('serves the probes as JSON over HTTP', async () => {
      server = startHealthServer(0, sources({ started: () => false }));
      await new Promise((resolve) => server!.once('listening', resolve));
      const { port } = server.address() as AddressInfo;
      const base = `http://127.0.0.1:${port}`;

      const health = await fetch(`${base}/health`);
      expect(health.status).toBe(200);
      expect(health.headers.get('content-type')).toBe('application/json');
      expect(await health.json()).toMatchObject({ status: 'healthy' });

      expect((await fetch(`${base}/ready`)).status).toBe(503);
      expect((await fetch(`${base}/health`, { method: 'POST' })).status).toBe(405);
    });
  });
});
