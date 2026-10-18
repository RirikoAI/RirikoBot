import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  baseServices,
  harness,
  makeSession,
  resetHarness,
} from '../../../../../tests/support/web-action-harness';

const mocks = vi.hoisted(() => ({
  authenticationOptions: vi.fn(),
  authenticate: vi.fn(),
  completePasskeyCheck: vi.fn(),
  setCookie: vi.fn(),
}));

vi.mock('next/headers', async () => {
  const { nextHeadersMock } = await import('../../../../../tests/support/web-action-harness');
  return {
    ...nextHeadersMock,
    cookies: async () => ({ get: () => ({ value: 'x'.repeat(43) }), set: mocks.setCookie }),
  };
});
vi.mock(
  'next/navigation',
  async () => (await import('../../../../../tests/support/web-action-harness')).nextNavigationMock,
);
vi.mock('@/lib/server/services', () => ({
  getWebServices: async () => ({
    ...baseServices({}),
    passkeys: {
      count: async () => harness.passkeyCount,
      authenticationOptions: mocks.authenticationOptions,
      authenticate: mocks.authenticate,
    },
    sessions: {
      resolve: async () => harness.session,
      completePasskeyCheck: mocks.completePasskeyCheck,
    },
  }),
}));

const { beginPasskeyCheck, finishPasskeyCheck } = await import('./actions');

describe('passkey check actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
    // A session that has not passed the check yet, the case this page exists for.
    harness.session = makeSession(harness.userId, null);
  });

  it('refuses another origin', async () => {
    harness.headers = new Headers({ origin: 'https://evil.example' });
    expect(await beginPasskeyCheck()).toEqual({
      ok: false,
      error: 'This request did not come from the dashboard.',
    });
    expect(await finishPasskeyCheck({})).toMatchObject({ ok: false });
    expect(mocks.authenticationOptions).not.toHaveBeenCalled();
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it('sends a signed-out visitor to sign in and back to the check', async () => {
    harness.session = null;
    await expect(beginPasskeyCheck()).rejects.toThrow(
      'REDIRECT /api/auth/login?returnTo=%2Fverify',
    );
    await expect(finishPasskeyCheck({})).rejects.toThrow('REDIRECT /api/auth/login');
  });

  it('starts the check for a session that still owes it', async () => {
    mocks.authenticationOptions.mockResolvedValue({ challenge: 'abc' });
    expect(await beginPasskeyCheck()).toEqual({ ok: true, data: { challenge: 'abc' } });
    expect(mocks.authenticationOptions).toHaveBeenCalledWith(harness.session);
  });

  it('tells users without a passkey to add one', async () => {
    mocks.authenticationOptions.mockResolvedValue(null);
    expect(await beginPasskeyCheck()).toEqual({
      ok: false,
      error: 'You have no passkey yet.',
      reason: 'passkey-required',
    });
  });

  it('marks the session as checked and sets a new cookie when the passkey verifies', async () => {
    mocks.authenticate.mockResolvedValue({ ok: true });
    const rotated = makeSession(harness.userId, new Date());
    mocks.completePasskeyCheck.mockResolvedValue({ token: 'fresh-token', session: rotated });
    expect(await finishPasskeyCheck({ id: 'cred' })).toEqual({ ok: true, data: null });
    expect(mocks.authenticate).toHaveBeenCalledWith(harness.session, { id: 'cred' });
    expect(mocks.setCookie).toHaveBeenCalledWith(
      '__Host-ririko_session',
      'fresh-token',
      expect.objectContaining({ httpOnly: true, secure: true }),
    );
  });

  it('keeps the session unchecked and reports the reason when verification fails', async () => {
    mocks.authenticate.mockResolvedValue({ ok: false, message: 'That passkey did not verify.' });
    expect(await finishPasskeyCheck({})).toEqual({
      ok: false,
      error: 'That passkey did not verify.',
    });
    expect(mocks.completePasskeyCheck).not.toHaveBeenCalled();
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
});
