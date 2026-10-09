import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { SecretVault } from '@ririko/core';
import { createDatabaseClient, GuildRepository, type SqliteDatabaseClient } from '@ririko/database';
import { sealPendingInvite, sealPendingLogin } from '@/lib/server/auth/oauth-state';
import { rateLimits } from '@/lib/server/rate-limit';

const DASHBOARD = 'https://dash.example.com';
const GUILD = '100000000000000001';
const OWNER = '100000000000000002';
const USER = '200000000000000002';

const mocks = vi.hoisted(() => ({
  services: null as unknown,
  after: [] as Array<() => unknown>,
  session: null as unknown,
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (task: () => unknown) => mocks.after.push(task),
}));
vi.mock('@/lib/server/services', () => ({ getWebServices: async () => mocks.services }));
vi.mock('@/lib/server/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/auth/session')>()),
  getSession: async () => mocks.session,
}));

const { GET } = await import('./route');

describe('GET /api/invite/callback (TASK-1841)', () => {
  const vault = new SecretVault({ version: 1, hexKey: 'b'.repeat(64) });
  let client: SqliteDatabaseClient;
  let repo: GuildRepository;
  const exchangeInviteCode = vi.fn();
  const getCurrentUser = vi.fn();
  const revokeToken = vi.fn();
  const upsertUser = vi.fn();

  const tokens = {
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresAt: new Date(Date.now() + 3_600_000),
    scopes: ['bot', 'applications.commands', 'identify'],
  };
  const guild = { id: GUILD, name: 'Example Server', icon: 'abc123', ownerId: OWNER };

  beforeAll(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = raw;
    repo = new GuildRepository(client);
    mocks.services = {
      config: { DASHBOARD_URL: DASHBOARD },
      vault,
      inviteOauth: { exchangeInviteCode, getCurrentUser, revokeToken },
      users: { upsert: upsertUser },
      guildRegistry: repo,
    };
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(() => {
    client.raw.exec('DELETE FROM guilds');
    mocks.after = [];
    mocks.session = null;
    exchangeInviteCode.mockReset().mockResolvedValue({ tokens, guild });
    getCurrentUser.mockReset().mockResolvedValue({
      id: USER,
      username: 'inviter',
      global_name: 'The Inviter',
      avatar: null,
    });
    revokeToken.mockReset().mockResolvedValue(undefined);
    upsertUser.mockReset().mockResolvedValue(undefined);
  });

  let nextIp = 0;
  function callback(
    options: {
      query?: string;
      state?: string;
      cookie?: string | null;
      ip?: string;
    } = {},
  ): Promise<Response> {
    const sealed =
      options.cookie === undefined
        ? sealPendingInvite(vault, {
            state: 'state-1',
            codeVerifier: 'verifier',
            guildId: GUILD,
            issuedAt: Date.now(),
          })
        : options.cookie;
    const headers: Record<string, string> = {
      'x-forwarded-for': options.ip ?? `203.0.113.${++nextIp}`,
    };
    if (sealed) headers.cookie = `__Host-ririko_invite=${sealed}`;
    return GET(
      new NextRequest(
        `${DASHBOARD}/api/invite/callback?${options.query ?? `code=abc&state=${options.state ?? 'state-1'}`}`,
        { headers },
      ),
    );
  }

  const clearsCookie = (response: Response) =>
    response.headers
      .getSetCookie()
      .some((c) => c.startsWith('__Host-ririko_invite=;') && /Max-Age=0/i.test(c));

  async function runAfter() {
    for (const task of mocks.after) await task();
  }

  it('records the server and the inviter, revokes the token and sends a visitor to the Servers page', async () => {
    const response = await callback();

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${DASHBOARD}/servers?invited=${GUILD}`);
    expect(clearsCookie(response)).toBe(true);
    expect(exchangeInviteCode).toHaveBeenCalledWith('abc', 'verifier', expect.any(Date));
    expect(getCurrentUser).toHaveBeenCalledWith('access');
    expect(upsertUser).toHaveBeenCalledWith({
      id: USER,
      username: 'inviter',
      displayName: 'The Inviter',
      avatarUrl: expect.stringContaining('cdn.discordapp.com'),
    });
    expect(await repo.findById(GUILD)).toMatchObject({
      id: GUILD,
      name: 'Example Server',
      ownerId: OWNER,
      iconUrl: expect.stringContaining(`/icons/${GUILD}/abc123.png`),
      isActive: true,
      invitedById: USER,
      invitedVia: 'oauth',
    });

    expect(revokeToken).not.toHaveBeenCalled();
    expect(mocks.after).toHaveLength(1);
    await runAfter();
    expect(revokeToken).toHaveBeenCalledWith('access');
  });

  it('never creates a session', async () => {
    const response = await callback();
    expect(response.headers.getSetCookie().some((c) => c.startsWith('__Host-ririko_session'))).toBe(
      false,
    );
  });

  it('sends a signed-in user to the new server dashboard', async () => {
    mocks.session = { userId: USER };

    const response = await callback();

    expect(response.headers.get('location')).toBe(`${DASHBOARD}/dashboard/${GUILD}`);
  });

  it('shows an error, records nothing and starts no exchange on a state mismatch', async () => {
    const response = await callback({ state: 'another-state' });

    expect(response.headers.get('location')).toBe(`${DASHBOARD}/?error=invite_invalid_state`);
    expect(clearsCookie(response)).toBe(true);
    expect(exchangeInviteCode).not.toHaveBeenCalled();
    expect(mocks.after).toHaveLength(0);
  });

  it('rejects a missing cookie, a missing code and a sign-in cookie', async () => {
    const login = sealPendingLogin(vault, {
      state: 'state-1',
      codeVerifier: 'verifier',
      returnTo: '/servers',
      issuedAt: Date.now(),
    });
    for (const options of [{ cookie: null }, { query: 'state=state-1' }, { cookie: login }]) {
      const response = await callback(options);
      expect(response.headers.get('location')).toBe(`${DASHBOARD}/?error=invite_invalid_state`);
    }
    expect(exchangeInviteCode).not.toHaveBeenCalled();
  });

  it('reports a cancelled authorization', async () => {
    const response = await callback({ query: 'error=access_denied&state=state-1' });

    expect(response.headers.get('location')).toBe(`${DASHBOARD}/?error=invite_cancelled`);
    expect(clearsCookie(response)).toBe(true);
    expect(exchangeInviteCode).not.toHaveBeenCalled();
  });

  it('reports a Discord error and logs without the token', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    exchangeInviteCode.mockRejectedValue(new Error('token exchange failed with HTTP 400'));

    const response = await callback();

    expect(response.headers.get('location')).toBe(`${DASHBOARD}/?error=invite_failed`);
    expect(clearsCookie(response)).toBe(true);
    expect(JSON.stringify(log.mock.calls)).not.toContain('access');
    expect(mocks.after).toHaveLength(0);
    log.mockRestore();
  });

  it('records nothing and still revokes the token when the response names no server', async () => {
    exchangeInviteCode.mockResolvedValue({ tokens, guild: null });

    const response = await callback();

    expect(response.headers.get('location')).toBe(`${DASHBOARD}/?error=invite_no_server`);
    expect(await repo.findById(GUILD)).toBeNull();
    expect(getCurrentUser).not.toHaveBeenCalled();
    await runAfter();
    expect(revokeToken).toHaveBeenCalledWith('access');
  });

  it('succeeds and records the inviter when the token lists only the identify scope', async () => {
    exchangeInviteCode.mockResolvedValue({ tokens: { ...tokens, scopes: ['identify'] }, guild });

    const response = await callback();

    expect(response.headers.get('location')).toBe(`${DASHBOARD}/servers?invited=${GUILD}`);
    expect(await repo.findById(GUILD)).toMatchObject({ invitedById: USER, invitedVia: 'oauth' });
  });

  it('fails without recording when the user did not grant the identify scope', async () => {
    exchangeInviteCode.mockResolvedValue({
      tokens: { ...tokens, scopes: ['bot', 'applications.commands'] },
      guild,
    });

    const response = await callback();

    expect(response.headers.get('location')).toBe(`${DASHBOARD}/?error=invite_failed`);
    expect(await repo.findById(GUILD)).toBeNull();
    await runAfter();
    expect(revokeToken).toHaveBeenCalledWith('access');
  });

  it('fails when the profile cannot be read, and records nothing', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    getCurrentUser.mockRejectedValue(new Error('GET /users/@me failed with HTTP 500'));

    const response = await callback();

    expect(response.headers.get('location')).toBe(`${DASHBOARD}/?error=invite_failed`);
    expect(await repo.findById(GUILD)).toBeNull();
    log.mockRestore();
  });

  it('does not fail the invite when the token revocation fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    revokeToken.mockRejectedValue(new Error('token revocation failed with HTTP 500'));

    const response = await callback();
    await runAfter();

    expect(response.headers.get('location')).toBe(`${DASHBOARD}/servers?invited=${GUILD}`);
    expect(log).toHaveBeenCalledWith('[web] Could not revoke an invite token:', expect.any(String));
    log.mockRestore();
  });

  it('keeps the oauth inviter when the bot records the server first', async () => {
    await repo.upsert({
      id: GUILD,
      name: 'Before',
      iconUrl: null,
      ownerId: OWNER,
      joinedAt: new Date('2026-10-01T00:00:00Z'),
    });
    await repo.setInviterIfMissing(GUILD, 'someone-from-audit-log', 'audit_log');

    await callback();

    expect(await repo.findById(GUILD)).toMatchObject({
      name: 'Example Server',
      invitedById: USER,
      invitedVia: 'oauth',
      joinedAt: new Date('2026-10-01T00:00:00Z'),
    });
  });

  it('answers 429 once a client IP is over the auth rate limit', async () => {
    const ip = '203.0.113.250';
    while (rateLimits.auth.take(`ip:${ip}`)) {
      /* drain the bucket */
    }
    const response = await callback({ ip });
    expect(response.status).toBe(429);
    expect(exchangeInviteCode).not.toHaveBeenCalled();
  });
});
