import { once } from 'node:events';
import { afterEach, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createHealthServer } from './health.js';
import { presentResult } from './presentation.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  })));
});

it('distinguishes liveness, dependency failure and shutdown without disclosing errors', async () => {
  let gateway = false;
  let database = true;
  let closing = false;
  const server = createHealthServer({
    isGatewayReady: () => gateway,
    isShuttingDown: () => closing,
    checkDatabase: async () => { if (!database) throw new Error('secret database url'); },
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server.');
  const url = `http://127.0.0.1:${address.port}`;
  expect((await fetch(`${url}/health/live`)).status).toBe(200);
  expect((await fetch(`${url}/health/ready`)).status).toBe(503);
  gateway = true;
  expect((await fetch(`${url}/health/ready`)).status).toBe(200);
  database = false;
  const failed = await fetch(`${url}/health/ready`);
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain('secret');
  database = true;
  closing = true;
  expect((await fetch(`${url}/health/ready`)).status).toBe(503);
  expect((await fetch(`${url}/unknown`)).status).toBe(404);
  expect((await fetch(`${url}/health/live`, { method: 'POST' })).status).toBe(405);
});

it('suppresses mentions and respects Discord embed size limits', () => {
  const result = presentResult({ kind: 'text', content: '@everyone' + 'a'.repeat(5000) });
  expect(result.allowedMentions).toEqual({ parse: [], repliedUser: false });
  const embed = result.embeds?.[0];
  expect(embed && 'toJSON' in embed ? embed.toJSON().description?.length : 0).toBe(4096);
});

it('times out a stuck readiness probe and does not launch additional database queries', async () => {
  let calls = 0;
  const server = createHealthServer({
    isGatewayReady: () => true, isShuttingDown: () => false, probeTimeoutMs: 20,
    checkDatabase: () => { calls++; return new Promise<void>(() => {}); },
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server.');
  const url = `http://127.0.0.1:${address.port}/health/ready`;
  expect((await fetch(url)).status).toBe(503);
  expect((await fetch(url)).status).toBe(503);
  expect(calls).toBe(1);
});
