import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { SecretVault } from '@ririko/core';
import {
  createDatabaseClient,
  WebKnownDeviceRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { KnownDeviceService } from '@/lib/server/auth/known-devices';
import { sealPendingLogin } from '@/lib/server/auth/oauth-state';

const DASHBOARD = 'https://dash.example.com';
const USER = '200000000000000002';

const mocks = vi.hoisted(() => ({
  services: null as unknown,
  after: [] as Array<() => unknown>,
  newDeviceSignIn: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (task: () => unknown) => mocks.after.push(task),
}));
vi.mock('@/lib/server/services', () => ({ getWebServices: async () => mocks.services }));

const { GET } = await import('./route');

describe('OAuth callback new-device alerts (TASK-1172)', () => {
  const vault = new SecretVault({ version: 1, hexKey: 'b'.repeat(64) });
  let client: SqliteDatabaseClient;

  beforeAll(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = raw;
    mocks.services = {
      config: { DASHBOARD_URL: DASHBOARD },
      vault,
      oauth: {
        exchangeCode: async () => ({
          accessToken: 'access',
          refreshToken: 'refresh',
          expiresAt: new Date(Date.now() + 3_600_000),
          scopes: ['identify', 'guilds'],
        }),
        getCurrentUser: async () => ({
          id: USER,
          username: 'ririko',
          global_name: null,
          avatar: null,
        }),
      },
      users: { upsert: async () => undefined },
      sessions: {
        create: async () => ({
          token: 's'.repeat(43),
          session: { expiresAt: new Date(Date.now() + 3_600_000) },
        }),
      },
      knownDevices: new KnownDeviceService({ repo: new WebKnownDeviceRepository(client) }),
      notifier: { newDeviceSignIn: mocks.newDeviceSignIn },
    };
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(() => {
    mocks.after = [];
    mocks.newDeviceSignIn.mockClear();
  });

  function callback(deviceCookie?: string): Promise<Response> {
    const sealed = sealPendingLogin(vault, {
      state: 'state-1',
      codeVerifier: 'verifier',
      returnTo: '/servers',
      issuedAt: Date.now(),
    });
    const cookies = [`__Host-ririko_oauth=${sealed}`];
    if (deviceCookie) cookies.push(`__Host-ririko_device=${deviceCookie}`);
    return GET(
      new NextRequest(`${DASHBOARD}/api/auth/callback?code=abc&state=state-1`, {
        headers: {
          cookie: cookies.join('; '),
          'x-forwarded-for': '203.0.113.7',
          'user-agent': 'vitest',
        },
      }),
    );
  }

  function deviceCookieOf(response: Response): string | undefined {
    const header = response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('__Host-ririko_device='));
    expect(header).toMatch(/Max-Age=31536000/);
    expect(header).toMatch(/HttpOnly/);
    expect(header).toMatch(/Secure/);
    return header?.split(';')[0]?.split('=')[1];
  }

  it('DMs the user after a sign-in from a new browser, and not from a known one', async () => {
    const first = await callback();
    expect(first.headers.get('location')).toBe(`${DASHBOARD}/servers`);
    const device = deviceCookieOf(first);
    expect(mocks.newDeviceSignIn).not.toHaveBeenCalled();
    expect(mocks.after).toHaveLength(1);
    await mocks.after[0]?.();
    expect(mocks.newDeviceSignIn).toHaveBeenCalledWith(USER, {
      at: expect.any(Date),
      ipAddress: '203.0.113.7',
      userAgent: 'vitest',
    });

    mocks.after = [];
    const again = await callback(device);
    expect(deviceCookieOf(again)).toBe(device);
    expect(mocks.after).toHaveLength(0);
  });
});
