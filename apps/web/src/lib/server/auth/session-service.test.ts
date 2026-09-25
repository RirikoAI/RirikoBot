import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { SecretVault } from '@ririko/core';
import {
  createDatabaseClient,
  WebSessionRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { DiscordApiError, type DiscordTokenSet } from './discord-oauth';
import {
  hashSessionToken,
  SESSION_ABSOLUTE_TIMEOUT_MS,
  SESSION_IDLE_TIMEOUT_MS,
  SessionService,
} from './session-service';

const T0 = new Date('2026-09-25T00:00:00Z').getTime();
const MINUTE = 60_000;

function tokens(suffix: string, expiresAt: number): DiscordTokenSet {
  return {
    accessToken: `access-${suffix}`,
    refreshToken: `refresh-${suffix}`,
    expiresAt: new Date(expiresAt),
    scopes: ['identify', 'guilds'],
  };
}

describe('SessionService (TASK-1102)', () => {
  let client: SqliteDatabaseClient;
  let repo: WebSessionRepository;
  let now: number;
  let refresh: Mock<(refreshToken: string, now: Date) => Promise<DiscordTokenSet>>;
  let service: SessionService;
  const vault = new SecretVault({ version: 1, hexKey: 'a'.repeat(64) });

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = raw;
    repo = new WebSessionRepository(client);
    now = T0;
    refresh = vi.fn<(refreshToken: string, now: Date) => Promise<DiscordTokenSet>>();
    service = new SessionService({ repo, vault, oauth: { refresh }, now: () => new Date(now) });
  });

  afterEach(async () => {
    await client.close();
  });

  const login = (userId = 'user-1', replacesToken?: string) =>
    service.create({
      userId,
      tokens: tokens(userId, T0 + 7 * 24 * 60 * MINUTE),
      ipAddress: '203.0.113.7',
      userAgent: 'vitest',
      replacesToken,
    });

  it('stores only the SHA-256 of the cookie and encrypted Discord tokens', async () => {
    const { token, session } = await login();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.id).toBe(hashSessionToken(token));
    const row = await repo.findById(session.id);
    expect(row?.id).not.toContain(token);
    expect(row?.discordAccessToken.startsWith('v1.')).toBe(true);
    expect(row?.discordAccessToken).not.toContain('access-user-1');
    expect(row?.discordRefreshToken).not.toContain('refresh-user-1');
    expect(await service.getDiscordAccessToken(session)).toBe('access-user-1');
  });

  it('resolves live sessions and rejects unknown or malformed cookies', async () => {
    const { token } = await login();
    expect((await service.resolve(token))?.userId).toBe('user-1');
    expect(await service.resolve('x'.repeat(43))).toBeNull();
    expect(await service.resolve('not a token')).toBeNull();
  });

  it('expires a session after 30 minutes idle and deletes the row', async () => {
    const { token, session } = await login();
    now = T0 + SESSION_IDLE_TIMEOUT_MS - 1;
    expect(await service.resolve(token)).not.toBeNull();

    now += SESSION_IDLE_TIMEOUT_MS;
    expect(await service.resolve(token)).toBeNull();
    expect(await repo.findById(session.id)).toBeNull();
  });

  it('expires an active session at the 12 hour absolute limit', async () => {
    const { token } = await login();
    for (now = T0; now < T0 + SESSION_ABSOLUTE_TIMEOUT_MS; now += 10 * MINUTE) {
      expect(await service.resolve(token)).not.toBeNull();
    }
    now = T0 + SESSION_ABSOLUTE_TIMEOUT_MS;
    expect(await service.resolve(token)).toBeNull();
  });

  it('writes last-seen at most once a minute', async () => {
    const { token, session } = await login();
    now = T0 + 30_000;
    await service.resolve(token);
    expect((await repo.findById(session.id))?.lastSeenAt.getTime()).toBe(T0);

    now = T0 + MINUTE;
    await service.resolve(token);
    expect((await repo.findById(session.id))?.lastSeenAt.getTime()).toBe(T0 + MINUTE);
  });

  it('rotates the session ID on login and revokes on logout', async () => {
    const first = await login();
    const second = await login('user-1', first.token);

    expect(second.token).not.toBe(first.token);
    expect(await service.resolve(first.token)).toBeNull();
    expect(await service.resolve(second.token)).not.toBeNull();

    await service.revoke(second.token);
    expect(await service.resolve(second.token)).toBeNull();
  });

  it('lists only the live sessions of one user, most recently used first (TASK-1172)', async () => {
    const idle = await login('user-1');
    now = T0 + 20 * MINUTE;
    const older = await login('user-1');
    now = T0 + 25 * MINUTE;
    const newer = await login('user-1');
    await login('user-2');
    now = T0 + SESSION_IDLE_TIMEOUT_MS + 5 * MINUTE;

    const list = await service.listForUser('user-1');
    expect(list.map((entry) => entry.id)).toEqual([newer.session.id, older.session.id]);
    expect(list.map((entry) => entry.id)).not.toContain(idle.session.id);
    expect(list[0]).toEqual({
      id: newer.session.id,
      createdAt: new Date(T0 + 25 * MINUTE),
      lastSeenAt: new Date(T0 + 25 * MINUTE),
      ipAddress: '203.0.113.7',
      userAgent: 'vitest',
    });
  });

  it("revokes a session by ID only for its owner, and all of a user's other sessions", async () => {
    const mine = await login('user-1');
    const other = await login('user-1');
    const third = await login('user-1');
    const foreign = await login('user-2');

    expect(await service.revokeForUser('user-1', foreign.session.id)).toBe(false);
    expect(await service.resolve(foreign.token)).not.toBeNull();
    expect(await service.revokeForUser('user-1', other.session.id)).toBe(true);
    expect(await service.resolve(other.token)).toBeNull();

    expect(await service.revokeOthers(mine.session)).toBe(1);
    expect(await service.resolve(third.token)).toBeNull();
    expect(await service.resolve(mine.token)).not.toBeNull();
    expect(await service.resolve(foreign.token)).not.toBeNull();
  });

  it('removes expired sessions of other users on login', async () => {
    const stale = await login('user-2');
    now = T0 + SESSION_IDLE_TIMEOUT_MS + MINUTE;
    await login('user-1');
    expect(await repo.findById(stale.session.id)).toBeNull();
  });

  it('refreshes a Discord token close to expiry once for concurrent callers', async () => {
    const { session } = await service.create({
      userId: 'user-1',
      tokens: tokens('old', T0 + 30_000),
      ipAddress: null,
      userAgent: null,
    });
    refresh.mockResolvedValue(tokens('new', T0 + 7 * 24 * 60 * MINUTE));

    const results = await Promise.all([
      service.getDiscordAccessToken(session),
      service.getDiscordAccessToken(session),
    ]);

    expect(results).toEqual(['access-new', 'access-new']);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith('refresh-old', new Date(T0));
    expect(await service.getDiscordAccessToken(session)).toBe('access-new');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('ends the session when Discord rejects the refresh token', async () => {
    const { token, session } = await service.create({
      userId: 'user-1',
      tokens: tokens('old', T0),
      ipAddress: null,
      userAgent: null,
    });
    refresh.mockRejectedValue(new DiscordApiError(400, 'invalid_grant'));

    expect(await service.getDiscordAccessToken(session)).toBeNull();
    expect(await service.resolve(token)).toBeNull();
  });

  it('rethrows transient refresh failures without ending the session', async () => {
    const { token, session } = await service.create({
      userId: 'user-1',
      tokens: tokens('old', T0),
      ipAddress: null,
      userAgent: null,
    });
    refresh.mockRejectedValue(new DiscordApiError(503, 'unavailable'));

    await expect(service.getDiscordAccessToken(session)).rejects.toBeInstanceOf(DiscordApiError);
    expect(await service.resolve(token)).not.toBeNull();
  });

  it('refuses Discord tokens copied from another session row', async () => {
    const a = await login('user-1');
    const b = await login('user-2');
    const rowA = await repo.findById(a.session.id);
    await repo.updateDiscordTokens(b.session.id, {
      discordAccessToken: rowA!.discordAccessToken,
      discordRefreshToken: rowA!.discordRefreshToken,
      discordTokenExpiresAt: rowA!.discordTokenExpiresAt,
    });

    await expect(service.getDiscordAccessToken(b.session)).rejects.toThrow(/authentication/);
  });
});
