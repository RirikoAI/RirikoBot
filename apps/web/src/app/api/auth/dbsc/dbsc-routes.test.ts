import { generateKeyPairSync, sign } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { SecretVault } from '@ririko/core';
import {
  createDatabaseClient,
  WebSessionRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { sealChallenge } from '@/lib/server/auth/dbsc';
import { SessionService } from '@/lib/server/auth/session-service';
import { rateLimits } from '@/lib/server/rate-limit';

const ORIGIN = 'https://dash.example.com';
const vault = new SecretVault({ version: 1, hexKey: 'c'.repeat(64) });
const mocks = vi.hoisted(() => ({ services: null as unknown }));
vi.mock('@/lib/server/services', () => ({ getWebServices: async () => mocks.services }));

const { POST: register } = await import('./register/route');
const { POST: refresh } = await import('./refresh/route');
const { POST: logout } = await import('../logout/route');

const keys = generateKeyPairSync('ec', { namedCurve: 'P-256' });

/** A `dbsc+jwt` proof signed with a test key; the public key goes in the header on request. */
function proof(jti: string, options: { withJwk?: boolean; key?: typeof keys } = {}): string {
  const key = options.key ?? keys;
  const header = {
    alg: 'ES256',
    typ: 'dbsc+jwt',
    ...(options.withJwk ? { jwk: key.publicKey.export({ format: 'jwk' }) } : {}),
  };
  const input = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(
    JSON.stringify({ jti }),
  ).toString('base64url')}`;
  const signature = sign('sha256', Buffer.from(input), {
    key: key.privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `${input}.${signature.toString('base64url')}`;
}

let nextIp = 0;
function post(
  path: string,
  headers: Record<string, string> = {},
  handler: (request: NextRequest) => Promise<Response> = register,
): Promise<Response> {
  return handler(
    new NextRequest(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: { 'x-forwarded-for': `203.0.113.${++nextIp}`, origin: ORIGIN, ...headers },
    }),
  );
}

function setCookieOf(response: Response, name: string): string | undefined {
  return response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`));
}

function cookieValue(response: Response, name: string): string | undefined {
  return setCookieOf(response, name)?.split(';')[0]?.split('=')[1];
}

describe('DBSC routes (TASK-1192)', () => {
  let client: SqliteDatabaseClient;
  let service: SessionService;

  beforeAll(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = raw;
    service = new SessionService({
      repo: new WebSessionRepository(client),
      vault,
      oauth: { refresh: async () => Promise.reject(new Error('unused')) },
    });
    mocks.services = { config: { DASHBOARD_URL: ORIGIN }, vault, sessions: service };
  });

  afterAll(async () => {
    await client.close();
  });

  async function signIn() {
    const { token, session } = await service.create({
      userId: 'user-1',
      tokens: {
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: new Date(Date.now() + 3_600_000),
        scopes: ['identify', 'guilds'],
      },
      ipAddress: null,
      userAgent: null,
    });
    return { token, challenge: service.registrationChallenge(session) };
  }

  async function bound() {
    const { token, challenge } = await signIn();
    const response = await post('/api/auth/dbsc/register', {
      cookie: `__Host-ririko_session=${token}`,
      'secure-session-response': proof(challenge, { withJwk: true }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { session_identifier: string };
    return { response, sid: body.session_identifier };
  }

  it('registers a device key: 200 with session instructions and __Host- cookies', async () => {
    const { token, challenge } = await signIn();
    const response = await post('/api/auth/dbsc/register', {
      cookie: `__Host-ririko_session=${token}`,
      'secure-session-response': proof(challenge, { withJwk: true }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      session_identifier: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      refresh_url: '/api/auth/dbsc/refresh',
      credentials: [{ type: 'cookie', name: '__Host-ririko_bound' }],
    });
    for (const name of ['__Host-ririko_session', '__Host-ririko_bound']) {
      const cookie = setCookieOf(response, name);
      expect(cookie, name).toMatch(/Secure/i);
      expect(cookie, name).toMatch(/HttpOnly/i);
      expect(cookie, name).toMatch(/Path=\//i);
      expect(cookie, name).not.toMatch(/Domain=/i);
    }
    expect(setCookieOf(response, '__Host-ririko_bound')).toMatch(/Max-Age=600/);
    const rotated = cookieValue(response, '__Host-ririko_session');
    expect(rotated).toBeTruthy();
    expect(rotated).not.toBe(token);
  });

  it('refuses a registration without a session, a proof, or a valid proof', async () => {
    const { token, challenge } = await signIn();
    const cookie = `__Host-ririko_session=${token}`;
    const noSession = await post('/api/auth/dbsc/register', { 'secure-session-response': 'x' });
    expect(noSession.status).toBe(401);
    expect((await post('/api/auth/dbsc/register', { cookie })).status).toBe(400);
    const garbage = await post('/api/auth/dbsc/register', {
      cookie,
      'secure-session-response': 'garbage',
    });
    expect(garbage.status).toBe(400);
    const unsealed = await post('/api/auth/dbsc/register', {
      cookie,
      'secure-session-response': proof('not-a-challenge', { withJwk: true }),
    });
    expect(unsealed.status).toBe(400);
    expect(setCookieOf(unsealed, '__Host-ririko_session')).toBeUndefined();

    const ok = await post('/api/auth/dbsc/register', {
      cookie,
      'secure-session-response': proof(challenge, { withJwk: true }),
    });
    expect(ok.status).toBe(200);
    // The binding rotated the session ID, so the old cookie is gone.
    const again = await post('/api/auth/dbsc/register', {
      cookie,
      'secure-session-response': proof(challenge, { withJwk: true }),
    });
    expect(again.status).toBe(401);
  });

  it('answers a refresh without a proof with 403 and a challenge for that session', async () => {
    const { sid } = await bound();
    const response = await post(
      '/api/auth/dbsc/refresh',
      { 'sec-secure-session-id': `"${sid}"` },
      refresh,
    );
    expect(response.status).toBe(403);
    expect(response.headers.get('secure-session-challenge')).toMatch(
      new RegExp(`^"[^"]+";id="${sid}"$`),
    );
    expect(setCookieOf(response, '__Host-ririko_bound')).toBeUndefined();
  });

  it('refreshes the bound cookie for a proof signed by the registered key', async () => {
    const { sid } = await bound();
    const challenged = await post(
      '/api/auth/dbsc/refresh',
      { 'sec-secure-session-id': `"${sid}"` },
      refresh,
    );
    const header = challenged.headers.get('secure-session-challenge') ?? '';
    const challenge = /^"([^"]+)"/.exec(header)?.[1] ?? '';
    const response = await post(
      '/api/auth/dbsc/refresh',
      { 'sec-secure-session-id': `"${sid}"`, 'secure-session-response': proof(challenge) },
      refresh,
    );
    expect(response.status).toBe(200);
    const cookie = setCookieOf(response, '__Host-ririko_bound');
    expect(cookie).toMatch(/Max-Age=600/);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it('rejects a refresh proof from another key or for another session with a new 403', async () => {
    const { sid } = await bound();
    const wrongKey = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    for (const bad of [
      proof(sealChallenge(vault, sid, new Date()), { key: wrongKey }),
      proof(sealChallenge(vault, 'a'.repeat(43), new Date())),
      'garbage',
    ]) {
      const response = await post(
        '/api/auth/dbsc/refresh',
        { 'sec-secure-session-id': `"${sid}"`, 'secure-session-response': bad },
        refresh,
      );
      expect(response.status).toBe(403);
      expect(response.headers.get('secure-session-challenge')).toBeTruthy();
      expect(setCookieOf(response, '__Host-ririko_bound')).toBeUndefined();
    }
  });

  it('answers 400 for a malformed session id header and 404 for an unknown session', async () => {
    expect((await post('/api/auth/dbsc/refresh', {}, refresh)).status).toBe(400);
    const unquoted = await post(
      '/api/auth/dbsc/refresh',
      { 'sec-secure-session-id': 'x' },
      refresh,
    );
    expect(unquoted.status).toBe(400);
    const unknown = await post(
      '/api/auth/dbsc/refresh',
      { 'sec-secure-session-id': `"${'z'.repeat(43)}"` },
      refresh,
    );
    expect(unknown.status).toBe(404);
  });

  it('answers 404 to a refresh after sign out, and sign out clears the bound cookie', async () => {
    const { response: registered, sid } = await bound();
    const token = cookieValue(registered, '__Host-ririko_session');
    const out = await post(
      '/api/auth/logout',
      { cookie: `__Host-ririko_session=${token}` },
      logout,
    );
    expect(out.status).toBe(303);
    expect(setCookieOf(out, '__Host-ririko_bound')).toMatch(/Max-Age=0/i);
    const response = await post(
      '/api/auth/dbsc/refresh',
      { 'sec-secure-session-id': `"${sid}"` },
      refresh,
    );
    expect(response.status).toBe(404);
  });

  it('answers 429 once a client IP is over the auth rate limit', async () => {
    const ip = '198.51.100.250';
    while (rateLimits.auth.take(`ip:${ip}`)) {
      /* drain the bucket */
    }
    for (const [path, handler] of [
      ['/api/auth/dbsc/register', register],
      ['/api/auth/dbsc/refresh', refresh],
    ] as const) {
      const response = await handler(
        new NextRequest(`${ORIGIN}${path}`, { method: 'POST', headers: { 'x-forwarded-for': ip } }),
      );
      expect(response.status).toBe(429);
    }
  });
});
