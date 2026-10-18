import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  beginPasskeyCheck: vi.fn(),
  finishPasskeyCheck: vi.fn(),
  startAuthentication: vi.fn(),
}));

vi.mock('@/app/verify/actions', () => ({
  beginPasskeyCheck: mocks.beginPasskeyCheck,
  finishPasskeyCheck: mocks.finishPasskeyCheck,
}));
vi.mock('@simplewebauthn/browser', () => ({ startAuthentication: mocks.startAuthentication }));

const { passkeyPromptError, runPasskeyCheck } = await import('./run-passkey-check');

describe('passkeyPromptError', () => {
  it('explains a closed prompt, and anything else as an unsupported browser', () => {
    const closed = new Error('The operation either timed out or was not allowed.');
    closed.name = 'NotAllowedError';
    expect(passkeyPromptError(closed)).toBe('The passkey prompt was closed or timed out.');
    expect(passkeyPromptError(new Error('boom'))).toBe(
      'Your browser could not use a passkey here.',
    );
    expect(passkeyPromptError('not an error')).toBe('Your browser could not use a passkey here.');
  });
});

describe('runPasskeyCheck', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the server refusal when the check cannot start', async () => {
    mocks.beginPasskeyCheck.mockResolvedValue({ ok: false, error: 'You have no passkey yet.' });
    expect(await runPasskeyCheck()).toBe('You have no passkey yet.');
    expect(mocks.startAuthentication).not.toHaveBeenCalled();
  });

  it('returns a message when the user closes the browser prompt', async () => {
    mocks.beginPasskeyCheck.mockResolvedValue({ ok: true, data: { challenge: 'abc' } });
    const closed = new Error('closed');
    closed.name = 'NotAllowedError';
    mocks.startAuthentication.mockRejectedValue(closed);
    expect(await runPasskeyCheck()).toBe('The passkey prompt was closed or timed out.');
    expect(mocks.finishPasskeyCheck).not.toHaveBeenCalled();
  });

  it('sends the browser response to the server and returns null when it verifies', async () => {
    mocks.beginPasskeyCheck.mockResolvedValue({ ok: true, data: { challenge: 'abc' } });
    mocks.startAuthentication.mockResolvedValue({ id: 'cred' });
    mocks.finishPasskeyCheck.mockResolvedValue({ ok: true, data: null });
    expect(await runPasskeyCheck()).toBeNull();
    expect(mocks.startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: 'abc' } });
    expect(mocks.finishPasskeyCheck).toHaveBeenCalledWith({ id: 'cred' });
  });

  it('returns the server message when verification fails', async () => {
    mocks.beginPasskeyCheck.mockResolvedValue({ ok: true, data: { challenge: 'abc' } });
    mocks.startAuthentication.mockResolvedValue({ id: 'cred' });
    mocks.finishPasskeyCheck.mockResolvedValue({
      ok: false,
      error: 'That passkey did not verify.',
    });
    expect(await runPasskeyCheck()).toBe('That passkey did not verify.');
  });
});
