// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
const security = vi.hoisted(() => ({
  beginPasskeyRegistration: vi.fn(),
  finishPasskeyRegistration: vi.fn(),
  removePasskey: vi.fn(),
}));
const sessions = vi.hoisted(() => ({ revokeSession: vi.fn(), revokeOtherSessions: vi.fn() }));
const verify = vi.hoisted(() => ({ beginPasskeyCheck: vi.fn(), finishPasskeyCheck: vi.fn() }));
const webauthn = vi.hoisted(() => ({ startAuthentication: vi.fn(), startRegistration: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/app/account/security/actions', () => security);
vi.mock('@/app/account/sessions/actions', () => sessions);
vi.mock('@/app/verify/actions', () => verify);
vi.mock('@simplewebauthn/browser', () => webauthn);

const { PasskeyManager } = await import('./passkeys/passkey-manager');
const { PasskeyCheckButton } = await import('./passkeys/passkey-check-button');
const { SessionList } = await import('./session-list');

const CHECK_REQUIRED = { ok: false, error: 'Check first.', reason: 'passkey-check-required' };
const passkey = (id: string, name: string) => ({
  id,
  name,
  synced: false,
  createdAt: '2026-10-01T10:00:00Z',
  lastUsedAt: null,
});
const session = (id: string, current = false) => ({
  id,
  current,
  browser: `Browser ${id}`,
  userAgent: null,
  ipAddress: null,
  createdAt: '2026-10-01T10:00:00Z',
  lastSeenAt: '2026-10-02T10:00:00Z',
});

/** Fires a DOM event and lets the async handler and its state updates settle. */
async function settle(fire: () => void) {
  await act(async () => {
    fire();
  });
}

let confirm: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  confirm.mockRestore();
});

describe('PasskeyManager', () => {
  async function addPasskey(name: string) {
    fireEvent.change(screen.getByLabelText('Add a passkey'), { target: { value: name } });
    await settle(() => fireEvent.click(screen.getByRole('button', { name: 'Add passkey' })));
  }

  it('registers a passkey with the typed name, then clears the box and refreshes', async () => {
    security.beginPasskeyRegistration.mockResolvedValue({ ok: true, data: { challenge: 'c' } });
    webauthn.startRegistration.mockResolvedValue({ id: 'credential' });
    security.finishPasskeyRegistration.mockResolvedValue({ ok: true, data: null });
    render(<PasskeyManager passkeys={[]} />);

    await addPasskey('Laptop');

    expect(webauthn.startRegistration).toHaveBeenCalledWith({ optionsJSON: { challenge: 'c' } });
    expect(security.finishPasskeyRegistration).toHaveBeenCalledWith('Laptop', { id: 'credential' });
    expect(screen.getByLabelText<HTMLInputElement>('Add a passkey').value).toBe('');
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it('runs a passkey check when the server asks for one, then retries once', async () => {
    security.beginPasskeyRegistration
      .mockResolvedValueOnce(CHECK_REQUIRED)
      .mockResolvedValueOnce({ ok: true, data: { challenge: 'c' } });
    verify.beginPasskeyCheck.mockResolvedValue({ ok: true, data: { challenge: 'check' } });
    webauthn.startAuthentication.mockResolvedValue({ id: 'assertion' });
    verify.finishPasskeyCheck.mockResolvedValue({ ok: true, data: null });
    webauthn.startRegistration.mockResolvedValue({ id: 'credential' });
    security.finishPasskeyRegistration.mockResolvedValue({ ok: true, data: null });
    render(<PasskeyManager passkeys={[]} />);

    await addPasskey('Phone');

    expect(verify.finishPasskeyCheck).toHaveBeenCalledWith({ id: 'assertion' });
    expect(security.beginPasskeyRegistration).toHaveBeenCalledTimes(2);
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it('shows the check failure and stops when the passkey check fails', async () => {
    security.beginPasskeyRegistration.mockResolvedValue(CHECK_REQUIRED);
    verify.beginPasskeyCheck.mockResolvedValue({ ok: false, error: 'No passkey check.' });
    render(<PasskeyManager passkeys={[]} />);

    await addPasskey('Phone');

    expect(screen.getByRole('alert').textContent).toContain('No passkey check.');
    expect(webauthn.startRegistration).not.toHaveBeenCalled();
  });

  it('offers a sign-in link when the server needs a recent sign-in', async () => {
    security.beginPasskeyRegistration.mockResolvedValue({
      ok: false,
      error: 'Sign in again first.',
      reason: 'recent-sign-in-required',
    });
    render(<PasskeyManager passkeys={[]} />);

    await addPasskey('Phone');

    expect(screen.getByRole('alert').textContent).toContain('Sign in again first.');
    expect(screen.getByRole('link', { name: 'Sign in again' }).getAttribute('href')).toBe(
      '/api/auth/login?returnTo=%2Faccount%2Fsecurity',
    );
  });

  it('explains a closed browser prompt and keeps the typed name', async () => {
    security.beginPasskeyRegistration.mockResolvedValue({ ok: true, data: { challenge: 'c' } });
    webauthn.startRegistration.mockRejectedValue(
      Object.assign(new Error('closed'), { name: 'NotAllowedError' }),
    );
    render(<PasskeyManager passkeys={[]} />);

    await addPasskey('Laptop');

    expect(screen.getByRole('alert').textContent).toContain(
      'The passkey prompt was closed or timed out.',
    );
    expect(screen.getByLabelText<HTMLInputElement>('Add a passkey').value).toBe('Laptop');
    expect(security.finishPasskeyRegistration).not.toHaveBeenCalled();
  });

  it('shows a failed registration and offers sign-in only when the server asks for it', async () => {
    security.beginPasskeyRegistration.mockResolvedValue({ ok: true, data: { challenge: 'c' } });
    webauthn.startRegistration.mockResolvedValue({ id: 'credential' });
    security.finishPasskeyRegistration.mockResolvedValue({
      ok: false,
      error: 'That passkey is already registered.',
    });
    render(<PasskeyManager passkeys={[]} />);

    await addPasskey('Laptop');

    expect(screen.getByRole('alert').textContent).toContain('That passkey is already registered.');
    expect(screen.queryByRole('link', { name: 'Sign in again' })).toBeNull();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('removes a passkey after confirming, warning more strongly about the last one', async () => {
    security.removePasskey.mockResolvedValue({ ok: true, data: null });
    render(<PasskeyManager passkeys={[passkey('p1', 'Laptop')]} />);

    await settle(() => fireEvent.click(screen.getByRole('button', { name: 'Remove' })));

    expect(confirm.mock.calls[0]?.[0]).toContain('It is your last passkey');
    expect(security.removePasskey).toHaveBeenCalledWith('p1');
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it('does nothing when the removal is not confirmed', async () => {
    confirm.mockReturnValue(false);
    render(<PasskeyManager passkeys={[passkey('p1', 'Laptop'), passkey('p2', 'Phone')]} />);

    await settle(() => fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1]!));

    expect(confirm).toHaveBeenCalledWith('Remove "Phone"?');
    expect(security.removePasskey).not.toHaveBeenCalled();
  });

  it('shows a failed removal without refreshing', async () => {
    security.removePasskey.mockResolvedValue({ ok: false, error: 'Passkey not found.' });
    render(<PasskeyManager passkeys={[passkey('p1', 'Laptop'), passkey('p2', 'Phone')]} />);

    await settle(() => fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]!));

    expect(screen.getByRole('alert').textContent).toContain('Passkey not found.');
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe('PasskeyCheckButton', () => {
  it('continues to the return path after a passkey check', async () => {
    verify.beginPasskeyCheck.mockResolvedValue({ ok: true, data: { challenge: 'check' } });
    webauthn.startAuthentication.mockResolvedValue({ id: 'assertion' });
    verify.finishPasskeyCheck.mockResolvedValue({ ok: true, data: null });
    render(<PasskeyCheckButton returnTo="/dashboard" />);

    await settle(() => fireEvent.click(screen.getByRole('button', { name: 'Use my passkey' })));

    expect(router.replace).toHaveBeenCalledWith('/dashboard');
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it('shows the failure and lets the user try again', async () => {
    verify.beginPasskeyCheck.mockResolvedValue({ ok: true, data: { challenge: 'check' } });
    webauthn.startAuthentication.mockRejectedValue(new Error('no authenticator'));
    render(<PasskeyCheckButton returnTo="/dashboard" />);

    await settle(() => fireEvent.click(screen.getByRole('button', { name: 'Use my passkey' })));

    expect(screen.getByRole('alert').textContent).toBe(
      'Your browser could not use a passkey here.',
    );
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Use my passkey' }).disabled).toBe(
      false,
    );
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('SessionList', () => {
  it('signs out one other session and refreshes', async () => {
    sessions.revokeSession.mockResolvedValue({ ok: true });
    render(<SessionList sessions={[session('s1', true), session('s2')]} />);

    await settle(() => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));

    expect(sessions.revokeSession).toHaveBeenCalledWith('s2');
    expect(router.refresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('signs out every other session after confirming', async () => {
    sessions.revokeOtherSessions.mockResolvedValue({ ok: true });
    render(<SessionList sessions={[session('s1', true), session('s2'), session('s3')]} />);

    await settle(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere else' })),
    );

    expect(confirm).toHaveBeenCalledWith('Sign out 2 other sessions?');
    expect(sessions.revokeOtherSessions).toHaveBeenCalledOnce();
  });

  it('keeps every session when the sign-out is not confirmed', async () => {
    confirm.mockReturnValue(false);
    render(<SessionList sessions={[session('s1', true), session('s2')]} />);

    await settle(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere else' })),
    );

    expect(confirm).toHaveBeenCalledWith('Sign out 1 other session?');
    expect(sessions.revokeOtherSessions).not.toHaveBeenCalled();
  });

  it('shows a failed sign-out and still refreshes the list', async () => {
    sessions.revokeSession.mockResolvedValue({ ok: false, error: 'Session already ended.' });
    render(<SessionList sessions={[session('s1', true), session('s2')]} />);

    await settle(() => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));

    expect(screen.getByRole('alert').textContent).toBe('Session already ended.');
    expect(router.refresh).toHaveBeenCalledOnce();
  });
});
