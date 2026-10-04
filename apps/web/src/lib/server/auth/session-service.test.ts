import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { SecretVault } from '@ririko/core';
import {
  createDatabaseClient,
  WebSessionRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { BOUND_COOKIE_TTL_MS, DBSC_CHALLENGE_TTL_MS, sealChallenge } from './dbsc';
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

const ecKeys = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const otherKeys = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const rsaKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });

/** A `dbsc+jwt` proof answering `jti`, with the public key in the header when `withJwk`. */
function proof(
  jti: string,
  keys: { publicKey: KeyObject; privateKey: KeyObject } = ecKeys,
  withJwk = true,
): string {
  const alg = keys.publicKey.asymmetricKeyType === 'rsa' ? 'RS256' : 'ES256';
  const header = {
    alg,
    typ: 'dbsc+jwt',
    ...(withJwk ? { jwk: keys.publicKey.export({ format: 'jwk' }) } : {}),
  };
  const input = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(
    JSON.stringify({ jti }),
  ).toString('base64url')}`;
  const signature =
    alg === 'ES256'
      ? sign('sha256', Buffer.from(input), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' })
      : sign('RSA-SHA256', Buffer.from(input), keys.privateKey);
  return `${input}.${signature.toString('base64url')}`;
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
      deviceBound: false,
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

  describe('device bound sessions (TASK-1191)', () => {
    const bind = async (keys = ecKeys) => {
      const signedIn = await login();
      const challenge = service.registrationChallenge(signedIn.session);
      const result = await service.bindDevice(signedIn.token, proof(challenge, keys));
      if (result.kind !== 'bound') throw new Error(`Expected a binding, got ${result.kind}`);
      return { signedIn, result };
    };

    it('binds, rotates the session ID and requires the bound cookie from then on', async () => {
      const { signedIn, result } = await bind();

      expect(result.token).not.toBe(signedIn.token);
      expect(result.session.id).toBe(hashSessionToken(result.token));
      expect(result.session.userId).toBe('user-1');
      expect(result.sid).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(await service.resolve(signedIn.token, result.boundCookie)).toBeNull();

      const row = await repo.findById(result.session.id);
      expect(row?.dbscSessionId).toBe(result.sid);
      expect(JSON.parse(row?.dbscPublicKey ?? '{}')).toMatchObject({ kty: 'EC', crv: 'P-256' });
      expect(await service.getDiscordAccessToken(result.session)).toBe('access-user-1');

      expect(await service.resolve(result.token)).toBeNull();
      expect(await service.resolve(result.token, null)).toBeNull();
      expect(await service.resolve(result.token, 'v1.bogus.cookie.value')).toBeNull();
      expect(await repo.findById(result.session.id)).not.toBeNull();
      expect((await service.resolve(result.token, result.boundCookie))?.id).toBe(result.session.id);
      expect(await service.listForUser('user-1')).toEqual([
        expect.objectContaining({ id: result.session.id, deviceBound: true }),
      ]);
    });

    it('refuses an expired bound cookie and one sealed for another DBSC session', async () => {
      const { result } = await bind();
      const other = await bind();

      expect(await service.resolve(result.token, other.result.boundCookie)).toBeNull();
      now = T0 + BOUND_COOKIE_TTL_MS - 1;
      expect(await service.resolve(result.token, result.boundCookie)).not.toBeNull();
      now = T0 + BOUND_COOKIE_TTL_MS;
      expect(await service.resolve(result.token, result.boundCookie)).toBeNull();
      expect(await repo.findById(result.session.id)).not.toBeNull();
    });

    it('challenges, then refreshes the bound cookie for a proof from the stored key', async () => {
      const { result } = await bind();
      now = T0 + BOUND_COOKIE_TTL_MS + 1;

      const challenged = await service.refreshBinding(result.sid, null);
      if (challenged.kind !== 'challenge') throw new Error('Expected a challenge');
      const refreshed = await service.refreshBinding(
        result.sid,
        proof(challenged.challenge, ecKeys, false),
      );
      if (refreshed.kind !== 'refreshed') throw new Error('Expected a refresh');

      expect(await service.resolve(result.token, result.boundCookie)).toBeNull();
      expect((await service.resolve(result.token, refreshed.boundCookie))?.userId).toBe('user-1');
    });

    it('answers a bad refresh proof with a new challenge', async () => {
      const { result } = await bind();
      const challenge = sealChallenge(vault, result.sid, new Date(now));

      for (const bad of [
        proof(challenge, otherKeys),
        proof(sealChallenge(vault, 'another-sid', new Date(now))),
        proof('not a challenge'),
        'garbage',
      ]) {
        expect((await service.refreshBinding(result.sid, bad)).kind).toBe('challenge');
      }
      now += DBSC_CHALLENGE_TTL_MS;
      expect((await service.refreshBinding(result.sid, proof(challenge))).kind).toBe('challenge');
    });

    it('reports unknown or ended DBSC sessions', async () => {
      const { result } = await bind();
      expect(await service.refreshBinding('x'.repeat(43), null)).toEqual({ kind: 'unknown' });
      expect(await service.refreshBinding('not a sid', null)).toEqual({ kind: 'unknown' });

      now = T0 + SESSION_IDLE_TIMEOUT_MS;
      expect(await service.refreshBinding(result.sid, null)).toEqual({ kind: 'unknown' });
    });

    it('binds with an RS256 key', async () => {
      const { result } = await bind(rsaKeys);
      const row = await repo.findById(result.session.id);
      expect(JSON.parse(row?.dbscPublicKey ?? '{}')).toMatchObject({ kty: 'RSA' });
      const challenged = await service.refreshBinding(result.sid, null);
      if (challenged.kind !== 'challenge') throw new Error('Expected a challenge');
      expect(
        (await service.refreshBinding(result.sid, proof(challenged.challenge, rsaKeys, false)))
          .kind,
      ).toBe('refreshed');
    });

    it('refuses proofs that do not answer a fresh challenge for this session', async () => {
      const mine = await login();
      const theirs = await login('user-2');
      const challenge = service.registrationChallenge(mine.session);

      const [header, payload, signature] = proof(challenge).split('.') as [string, string, string];
      const flipped = Buffer.from(signature, 'base64url');
      flipped[0] = (flipped[0] ?? 0) ^ 1;
      const tampered = `${header}.${payload}.${flipped.toString('base64url')}`;
      for (const bad of [
        proof(service.registrationChallenge(theirs.session)),
        proof(challenge, ecKeys, false),
        tampered,
        'garbage',
      ]) {
        expect(await service.bindDevice(mine.token, bad)).toEqual({ kind: 'invalid_proof' });
      }
      now += DBSC_CHALLENGE_TTL_MS;
      expect(await service.bindDevice(mine.token, proof(challenge))).toEqual({
        kind: 'invalid_proof',
      });
      expect((await repo.findById(mine.session.id))?.dbscSessionId).toBeNull();
    });

    it('refuses to bind twice, unknown cookies and ended sessions', async () => {
      const { result } = await bind();
      expect(
        await service.bindDevice(
          result.token,
          proof(service.registrationChallenge(result.session)),
        ),
      ).toEqual({ kind: 'already_bound' });
      expect(await service.bindDevice('not a token', 'x')).toEqual({ kind: 'no_session' });
      expect(await service.bindDevice('x'.repeat(43), 'x')).toEqual({ kind: 'no_session' });

      const idle = await login();
      const challenge = service.registrationChallenge(idle.session);
      now += SESSION_IDLE_TIMEOUT_MS;
      expect(await service.bindDevice(idle.token, proof(challenge))).toEqual({
        kind: 'no_session',
      });
    });

    it('resolves unbound sessions as before, with or without a bound cookie', async () => {
      const { token } = await login();
      expect(await service.resolve(token)).not.toBeNull();
      expect(await service.resolve(token, 'v1.bogus.cookie.value')).not.toBeNull();
    });

    it('keeps the binding through a passkey check rotation', async () => {
      const { result } = await bind();
      const checked = await service.completePasskeyCheck(result.session);

      expect(await service.resolve(result.token, result.boundCookie)).toBeNull();
      expect(await service.resolve(checked.token)).toBeNull();
      expect((await service.resolve(checked.token, result.boundCookie))?.stepUpAt).toEqual(
        new Date(T0),
      );
      expect((await repo.findById(checked.session.id))?.dbscSessionId).toBe(result.sid);
    });
  });
});
