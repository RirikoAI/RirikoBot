import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  baseServices,
  flushAfter,
  harness,
  makeSession,
  resetHarness,
  revalidatePath,
} from '../../../../../../tests/support/web-action-harness';

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  registrationOptions: vi.fn(),
  register: vi.fn(),
  remove: vi.fn(),
  completePasskeyCheck: vi.fn(),
  passkeyAdded: vi.fn(),
  passkeyRemoved: vi.fn(),
  setCookie: vi.fn(),
}));

vi.mock('next/headers', async () => {
  const { nextHeadersMock } = await import('../../../../../../tests/support/web-action-harness');
  return {
    ...nextHeadersMock,
    cookies: async () => ({ get: () => ({ value: 'x'.repeat(43) }), set: mocks.setCookie }),
  };
});
vi.mock(
  'next/navigation',
  async () =>
    (await import('../../../../../../tests/support/web-action-harness')).nextNavigationMock,
);
vi.mock(
  'next/cache',
  async () => (await import('../../../../../../tests/support/web-action-harness')).nextCacheMock,
);
vi.mock(
  'next/server',
  async () => (await import('../../../../../../tests/support/web-action-harness')).nextServerMock,
);
vi.mock('@/lib/server/services', () => ({
  getWebServices: async () => ({
    ...baseServices({}),
    passkeys: {
      count: async () => harness.passkeyCount,
      registrationOptions: mocks.registrationOptions,
      register: mocks.register,
      remove: mocks.remove,
    },
    users: { findById: mocks.findUser },
    sessions: {
      resolve: async () => harness.session,
      completePasskeyCheck: mocks.completePasskeyCheck,
    },
    notifier: { passkeyAdded: mocks.passkeyAdded, passkeyRemoved: mocks.passkeyRemoved },
  }),
}));

const { beginPasskeyRegistration, finishPasskeyRegistration, removePasskey } =
  await import('./actions');

const recent = () => new Date(Date.now() - 60_000);
const old = () => new Date(Date.now() - 6 * 60_000);

describe('account security actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
  });

  describe('enrollment guards (begin and finish)', () => {
    it('refuses another origin', async () => {
      harness.headers = new Headers({ origin: 'https://evil.example' });
      expect(await beginPasskeyRegistration()).toEqual({
        ok: false,
        error: 'This request did not come from the dashboard.',
      });
      expect(await finishPasskeyRegistration('Laptop', {})).toMatchObject({ ok: false });
      expect(mocks.register).not.toHaveBeenCalled();
    });

    it('sends a signed-out visitor to sign in', async () => {
      harness.session = null;
      await expect(beginPasskeyRegistration()).rejects.toThrow(
        'REDIRECT /api/auth/login?returnTo=%2Faccount%2Fsecurity',
      );
    });

    it('asks a user with a passkey for a fresh passkey check first', async () => {
      harness.passkeyCount = 1;
      harness.session = makeSession(harness.userId, old());
      expect(await beginPasskeyRegistration()).toEqual({
        ok: false,
        error: 'Confirm it is you with your passkey first.',
        reason: 'passkey-check-required',
      });
      expect(mocks.registrationOptions).not.toHaveBeenCalled();
    });

    it('asks for a recent Discord sign-in before the first passkey', async () => {
      harness.passkeyCount = 0;
      harness.session = makeSession(harness.userId, null, new Date(Date.now() - 11 * 60_000));
      expect(await finishPasskeyRegistration('Laptop', {})).toEqual({
        ok: false,
        error: 'For your first passkey, sign in with Discord again, then add it within 10 minutes.',
        reason: 'recent-sign-in-required',
      });
      expect(mocks.register).not.toHaveBeenCalled();
    });
  });

  describe('beginPasskeyRegistration', () => {
    it('names the passkey after the Discord account', async () => {
      harness.session = makeSession(harness.userId, recent());
      mocks.findUser.mockResolvedValue({ username: 'kuro', displayName: 'Kuro' });
      mocks.registrationOptions.mockResolvedValue({ challenge: 'abc' });
      expect(await beginPasskeyRegistration()).toEqual({ ok: true, data: { challenge: 'abc' } });
      expect(mocks.registrationOptions).toHaveBeenCalledWith(harness.session, {
        name: 'kuro',
        displayName: 'Kuro',
      });
    });

    it('falls back to the user ID and a generic name for an unknown user', async () => {
      harness.session = makeSession(harness.userId, recent());
      mocks.findUser.mockResolvedValue(null);
      mocks.registrationOptions.mockResolvedValue({ challenge: 'abc' });
      await beginPasskeyRegistration();
      expect(mocks.registrationOptions).toHaveBeenCalledWith(harness.session, {
        name: harness.userId,
        displayName: 'Discord user',
      });
    });
  });

  describe('finishPasskeyRegistration', () => {
    it('stores the passkey, rotates the session cookie and sends the DM after the response', async () => {
      harness.session = makeSession(harness.userId, recent());
      const createdAt = new Date('2026-10-03T10:00:00Z');
      mocks.register.mockResolvedValue({ ok: true, value: { name: 'Laptop', createdAt } });
      const rotatedSession = makeSession(harness.userId, new Date());
      mocks.completePasskeyCheck.mockResolvedValue({ token: 'new-token', session: rotatedSession });

      expect(await finishPasskeyRegistration('Laptop', { id: 'cred' })).toEqual({
        ok: true,
        data: null,
      });
      expect(mocks.register).toHaveBeenCalledWith(
        harness.session,
        'Laptop',
        { id: 'cred' },
        { ipAddress: '203.0.113.7', userAgent: 'vitest' },
      );
      expect(mocks.setCookie).toHaveBeenCalledWith(
        '__Host-ririko_session',
        'new-token',
        expect.objectContaining({ httpOnly: true, secure: true, path: '/' }),
      );
      expect(revalidatePath).toHaveBeenCalledWith('/account/security');
      expect(mocks.passkeyAdded).not.toHaveBeenCalled();
      await flushAfter();
      expect(mocks.passkeyAdded).toHaveBeenCalledWith(harness.userId, 'Laptop', {
        at: createdAt,
        ipAddress: '203.0.113.7',
        userAgent: 'vitest',
      });
    });

    it('reports why a passkey was rejected and leaves the session alone', async () => {
      harness.session = makeSession(harness.userId, recent());
      mocks.register.mockResolvedValue({ ok: false, message: 'Give the passkey a name.' });
      expect(await finishPasskeyRegistration('', {})).toEqual({
        ok: false,
        error: 'Give the passkey a name.',
      });
      expect(mocks.completePasskeyCheck).not.toHaveBeenCalled();
      expect(mocks.setCookie).not.toHaveBeenCalled();
    });
  });

  describe('removePasskey', () => {
    it('refuses another origin', async () => {
      harness.headers = new Headers({ origin: 'https://evil.example' });
      expect(await removePasskey('p1')).toMatchObject({ ok: false });
      expect(mocks.remove).not.toHaveBeenCalled();
    });

    it.each([42, null, 'x'.repeat(1025)])('rejects an invalid passkey ID %#', async (id) => {
      expect(await removePasskey(id)).toEqual({ ok: false, error: 'Unknown passkey.' });
      expect(mocks.remove).not.toHaveBeenCalled();
    });

    it('needs a passkey check from the last five minutes', async () => {
      harness.session = makeSession(harness.userId, old());
      expect(await removePasskey('p1')).toEqual({
        ok: false,
        error: 'Confirm it is you with your passkey first.',
        reason: 'passkey-check-required',
      });
      expect(mocks.remove).not.toHaveBeenCalled();
    });

    it('says the passkey is unknown when it is not the user’s', async () => {
      harness.session = makeSession(harness.userId, recent());
      mocks.remove.mockResolvedValue(null);
      expect(await removePasskey('p1')).toEqual({ ok: false, error: 'Unknown passkey.' });
      expect(mocks.passkeyRemoved).not.toHaveBeenCalled();
    });

    it('removes the passkey and tells the user how many remain, after the response', async () => {
      harness.session = makeSession(harness.userId, recent());
      mocks.remove.mockResolvedValue({ name: 'Laptop' });
      expect(await removePasskey('p1')).toEqual({ ok: true, data: null });
      expect(mocks.remove).toHaveBeenCalledWith(harness.userId, 'p1', {
        ipAddress: '203.0.113.7',
        userAgent: 'vitest',
      });
      expect(revalidatePath).toHaveBeenCalledWith('/account/security');
      harness.passkeyCount = 0;
      await flushAfter();
      expect(mocks.passkeyRemoved).toHaveBeenCalledWith(
        harness.userId,
        'Laptop',
        0,
        expect.objectContaining({ ipAddress: '203.0.113.7', at: expect.any(Date) }),
      );
    });
  });
});
