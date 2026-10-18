import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SecretVault } from '@ririko/core';
import {
  AuditLogRepository,
  createDatabaseClient,
  WebPasskeyRepository,
  WebSessionRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { PasskeyService, type PasskeyOutcome } from './passkeys';
import {
  enrollmentState,
  FIRST_PASSKEY_SIGN_IN_WINDOW_MS,
  needsPasskeyCheck,
  STEP_UP_WINDOW_MS,
  stepUpState,
} from './passkey-policy';
import { SessionService, type ActiveSession } from './session-service';
import { SoftAuthenticator } from './testing/soft-authenticator';

const ORIGIN = 'https://dash.example.com';
const T0 = new Date('2026-09-25T00:00:00Z').getTime();
const actor = { ipAddress: '203.0.113.7', userAgent: 'vitest' };
const user = { name: 'ririko-fan', displayName: 'Ririko Fan' };
const FAILED = { ok: false, message: 'The passkey could not be verified. Please try again.' };

function unwrap<T>(outcome: PasskeyOutcome<T>): T {
  if (!outcome.ok) throw new Error(`Expected success, got: ${outcome.message}`);
  return outcome.value;
}

describe('PasskeyService (TASK-1171)', () => {
  let db: SqliteDatabaseClient;
  let now: number;
  let sessions: SessionService;
  let passkeys: PasskeyService;
  let sessionRepo: WebSessionRepository;
  let session: ActiveSession;
  let token: string;

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    db = raw;
    now = T0;
    sessionRepo = new WebSessionRepository(db);
    sessions = new SessionService({
      repo: sessionRepo,
      vault: new SecretVault({ version: 1, hexKey: 'a'.repeat(64) }),
      oauth: { refresh: async () => Promise.reject(new Error('unused')) },
      now: () => new Date(now),
    });
    passkeys = new PasskeyService({
      repo: new WebPasskeyRepository(db),
      sessions,
      audit: new AuditLogRepository(db),
      origin: ORIGIN,
      now: () => new Date(now),
    });
    ({ token, session } = await sessions.create({
      userId: 'user-1',
      tokens: {
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: new Date(T0 + 7 * 86_400_000),
        scopes: ['identify', 'guilds'],
      },
      ipAddress: null,
      userAgent: null,
    }));
  });

  afterEach(async () => {
    await db.close();
  });

  async function enroll(authenticator = new SoftAuthenticator(ORIGIN), name = 'Laptop') {
    const options = await passkeys.registrationOptions(session, user);
    return unwrap(
      await passkeys.register(session, name, authenticator.register(options.challenge), actor),
    );
  }

  async function check(authenticator: SoftAuthenticator, counter?: number, origin?: string) {
    const options = await passkeys.authenticationOptions(session);
    return passkeys.authenticate(
      session,
      authenticator.authenticate(options!.challenge, {
        ...(counter === undefined ? {} : { counter }),
        ...(origin === undefined ? {} : { origin }),
      }),
    );
  }

  it('registers a passkey with its public key and device flags, and audits it', async () => {
    const authenticator = new SoftAuthenticator(ORIGIN, { synced: true });
    const passkey = await enroll(authenticator, '  Phone  ');

    expect(passkey).toMatchObject({
      id: authenticator.id,
      userId: 'user-1',
      name: 'Phone',
      deviceType: 'multiDevice',
      backedUp: true,
      transports: ['internal'],
    });
    expect(await passkeys.count('user-1')).toBe(1);
    const audit = db.raw.prepare('SELECT action, actor_user_id FROM audit_logs').get();
    expect(audit).toEqual({ action: 'web.passkey.add', actor_user_id: 'user-1' });
  });

  it('excludes already registered credentials from new registration options', async () => {
    const authenticator = new SoftAuthenticator(ORIGIN);
    await enroll(authenticator);
    const options = await passkeys.registrationOptions(session, user);
    expect(options.excludeCredentials?.map((c) => c.id)).toEqual([authenticator.id]);
    expect(options.authenticatorSelection?.userVerification).toBe('preferred');
  });

  it('uses each challenge once and rejects expired ones', async () => {
    const authenticator = new SoftAuthenticator(ORIGIN);
    const options = await passkeys.registrationOptions(session, user);
    const response = authenticator.register(options.challenge);
    unwrap(await passkeys.register(session, 'Laptop', response, actor));

    expect(await passkeys.register(session, 'Again', response, actor)).toEqual(FAILED);

    await enroll(new SoftAuthenticator(ORIGIN), 'Second');
    const authOptions = await passkeys.authenticationOptions(session);
    now += 5 * 60_000;
    expect(
      await passkeys.authenticate(session, authenticator.authenticate(authOptions!.challenge)),
    ).toEqual(FAILED);
  });

  it('rejects registrations from another origin, without user presence or badly named', async () => {
    let options = await passkeys.registrationOptions(session, user);
    expect(
      await passkeys.register(
        session,
        'Laptop',
        new SoftAuthenticator(ORIGIN).register(options.challenge, 'https://evil.example'),
        actor,
      ),
    ).toEqual(FAILED);

    options = await passkeys.registrationOptions(session, user);
    expect(
      await passkeys.register(
        session,
        'Laptop',
        new SoftAuthenticator(ORIGIN, { userPresent: false }).register(options.challenge),
        actor,
      ),
    ).toEqual(FAILED);

    expect(await passkeys.register(session, '   ', { not: 'a response' }, actor)).toEqual({
      ok: false,
      message: 'Give the passkey a name, e.g. "Laptop" or "Phone".',
    });
    expect(await passkeys.register(session, 'Laptop', { not: 'a response' }, actor)).toEqual(
      FAILED,
    );
    expect(await passkeys.count('user-1')).toBe(0);
  });

  it('verifies a passkey check and records use', async () => {
    const authenticator = new SoftAuthenticator(ORIGIN);
    await enroll(authenticator);
    now += 60_000;
    expect(await check(authenticator)).toEqual({ ok: true, value: null });
    const [stored] = await passkeys.list('user-1');
    expect(stored?.counter).toBe(1);
    expect(stored?.lastUsedAt?.getTime()).toBe(now);
  });

  it('accepts authenticators that skip user verification but not user presence (BUG-0020)', async () => {
    const noVerification = new SoftAuthenticator(ORIGIN, { userVerified: false });
    await enroll(noVerification);
    expect(await check(noVerification)).toEqual({ ok: true, value: null });

    const options = await passkeys.authenticationOptions(session);
    expect(options?.userVerification).toBe('preferred');
    expect(
      await passkeys.authenticate(
        session,
        noVerification.authenticate(options!.challenge, { userPresent: false }),
      ),
    ).toEqual(FAILED);
  });

  it('rejects a signature counter that did not increase (cloned authenticator)', async () => {
    const authenticator = new SoftAuthenticator(ORIGIN);
    await enroll(authenticator);
    unwrap(await check(authenticator, 5));
    expect(await check(authenticator, 5)).toEqual(FAILED);
    expect(await check(authenticator, 3)).toEqual(FAILED);
  });

  it("rejects another user's passkey and a phishing origin", async () => {
    const authenticator = new SoftAuthenticator(ORIGIN);
    await enroll(authenticator);
    expect(await check(authenticator, undefined, 'https://evil.example')).toEqual(FAILED);

    const other = await sessions.create({
      userId: 'user-2',
      tokens: {
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: new Date(T0 + 86_400_000),
        scopes: [],
      },
      ipAddress: null,
      userAgent: null,
    });
    await enroll(new SoftAuthenticator(ORIGIN), 'Theirs');
    const options = await passkeys.authenticationOptions(other.session);
    expect(options).toBeNull();
  });

  it('removes only the owner’s passkey and audits the remaining count', async () => {
    const authenticator = new SoftAuthenticator(ORIGIN);
    await enroll(authenticator);
    expect(await passkeys.remove('user-2', authenticator.id, actor)).toBeNull();
    expect((await passkeys.remove('user-1', authenticator.id, actor))?.name).toBe('Laptop');
    expect(await passkeys.count('user-1')).toBe(0);
    const audit = db.raw
      .prepare("SELECT details FROM audit_logs WHERE action = 'web.passkey.remove'")
      .get() as { details: string };
    expect(JSON.parse(audit.details)).toMatchObject({ remaining: 0, name: 'Laptop' });
  });

  it('rotates the session on a passkey check and keeps the Discord tokens readable', async () => {
    const authenticator = new SoftAuthenticator(ORIGIN);
    await enroll(authenticator);
    unwrap(await check(authenticator));
    now += 1_000;
    const rotated = await sessions.completePasskeyCheck(session);

    expect(rotated.token).not.toBe(token);
    expect(rotated.session.stepUpAt?.getTime()).toBe(now);
    expect(await sessions.resolve(token)).toBeNull();
    expect((await sessions.resolve(rotated.token))?.stepUpAt?.getTime()).toBe(now);
    expect(await sessions.getDiscordAccessToken(rotated.session)).toBe('access');
  });
});

describe('passkey policy', () => {
  const session = (stepUpAt: number | null): ActiveSession => ({
    id: 'id',
    userId: 'user-1',
    createdAt: new Date(T0),
    expiresAt: new Date(T0 + 1),
    stepUpAt: stepUpAt === null ? null : new Date(stepUpAt),
  });

  it('gates sessions of users with a passkey until a passkey check', () => {
    expect(needsPasskeyCheck(session(null), 0)).toBe(false);
    expect(needsPasskeyCheck(session(null), 1)).toBe(true);
    expect(needsPasskeyCheck(session(T0), 1)).toBe(false);
  });

  it('requires a recent passkey check for sensitive writes', () => {
    expect(stepUpState(session(T0), 0, T0)).toBe('passkey-required');
    expect(stepUpState(session(null), 1, T0)).toBe('passkey-check-required');
    expect(stepUpState(session(T0), 1, T0 + STEP_UP_WINDOW_MS - 1)).toBe('ok');
    expect(stepUpState(session(T0), 1, T0 + STEP_UP_WINDOW_MS)).toBe('passkey-check-required');
  });

  it('lets a first passkey be added only soon after a Discord sign-in', () => {
    expect(enrollmentState(session(null), 0, T0 + FIRST_PASSKEY_SIGN_IN_WINDOW_MS - 1)).toBe('ok');
    expect(enrollmentState(session(null), 0, T0 + FIRST_PASSKEY_SIGN_IN_WINDOW_MS)).toBe(
      'recent-sign-in-required',
    );
  });

  it('requires a fresh passkey check to add another passkey', () => {
    expect(enrollmentState(session(T0), 1, T0 + 1)).toBe('ok');
    expect(enrollmentState(session(null), 1, T0)).toBe('passkey-check-required');
    expect(enrollmentState(session(T0), 1, T0 + STEP_UP_WINDOW_MS)).toBe('passkey-check-required');
  });
});
