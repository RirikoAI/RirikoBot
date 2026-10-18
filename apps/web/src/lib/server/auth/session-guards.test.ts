import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActiveSession } from './session-service';

const mocks = vi.hoisted(() => ({
  cookie: 'x'.repeat(43) as string | undefined,
  session: null as ActiveSession | null,
  passkeyCount: 0,
  headers: new Headers({ origin: 'https://dash.example.com' }),
  remove: vi.fn(),
  after: [] as Array<() => unknown>,
  passkeyRemoved: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => (mocks.cookie ? { value: mocks.cookie } : undefined),
    set: vi.fn(),
  }),
  headers: async () => mocks.headers,
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/server', () => ({ after: (task: () => unknown) => mocks.after.push(task) }));
vi.mock('../services', () => ({
  getWebServices: async () => ({
    config: { DASHBOARD_URL: 'https://dash.example.com', BOT_OWNER_ID: ['owner-1'] },
    sessions: { resolve: async () => mocks.session },
    passkeys: { count: async () => mocks.passkeyCount, remove: mocks.remove },
    notifier: { passkeyRemoved: mocks.passkeyRemoved },
  }),
}));

const { requireOwner, requireSession, requireSessionForPasskeyCheck } = await import('./session');
const { removePasskey } = await import('@/app/account/security/actions');

const session = (stepUpAt: Date | null, userId = 'user-1'): ActiveSession => ({
  id: 'hash',
  userId,
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 3_600_000),
  stepUpAt,
});

describe('passkey sign-in gate (TASK-1171)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookie = 'x'.repeat(43);
    mocks.headers = new Headers({ origin: 'https://dash.example.com' });
  });

  it('lets users without a passkey through after Discord sign-in', async () => {
    mocks.session = session(null);
    mocks.passkeyCount = 0;
    await expect(requireSession('/servers')).resolves.toMatchObject({ userId: 'user-1' });
  });

  it('sends users with a passkey to the passkey check until they pass it', async () => {
    mocks.session = session(null);
    mocks.passkeyCount = 1;
    await expect(requireSession('/dashboard/1')).rejects.toThrow(
      'REDIRECT /verify?returnTo=%2Fdashboard%2F1',
    );
    await expect(requireSessionForPasskeyCheck('/verify')).resolves.toMatchObject({
      userId: 'user-1',
    });

    mocks.session = session(new Date(Date.now() - 3_600_000));
    await expect(requireSession('/dashboard/1')).resolves.toMatchObject({ userId: 'user-1' });
  });

  it('sends visitors without a session to Discord login', async () => {
    mocks.session = null;
    await expect(requireSessionForPasskeyCheck('/servers')).rejects.toThrow(
      'REDIRECT /api/auth/login?returnTo=%2Fservers',
    );
  });
});

describe('removePasskey (TASK-1171)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.passkeyCount = 1;
    mocks.headers = new Headers({ origin: 'https://dash.example.com' });
  });

  it('asks for a fresh passkey check when the last one is older than five minutes', async () => {
    mocks.session = session(new Date(Date.now() - 6 * 60_000));
    const result = await removePasskey('cred-1');
    expect(result).toMatchObject({ ok: false, reason: 'passkey-check-required' });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('removes the passkey after a recent passkey check and DMs the user', async () => {
    mocks.session = session(new Date());
    mocks.after = [];
    mocks.remove.mockResolvedValue({ id: 'cred-1', name: 'Laptop' });
    expect(await removePasskey('cred-1')).toEqual({ ok: true, data: null });
    expect(mocks.remove).toHaveBeenCalledWith('user-1', 'cred-1', {
      ipAddress: null,
      userAgent: null,
    });

    expect(mocks.passkeyRemoved).not.toHaveBeenCalled();
    await mocks.after[0]?.();
    expect(mocks.passkeyRemoved).toHaveBeenCalledWith('user-1', 'Laptop', 1, {
      at: expect.any(Date),
      ipAddress: null,
      userAgent: null,
    });
  });

  it('rejects requests from another origin before anything else', async () => {
    mocks.headers = new Headers({ origin: 'https://evil.example' });
    mocks.session = session(new Date());
    expect(await removePasskey('cred-1')).toMatchObject({ ok: false });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

describe('requireOwner (TASK-1174)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.passkeyCount = 1;
  });

  it('hides the owner console from users who are not bot owners', async () => {
    mocks.session = session(new Date(), 'user-1');
    await expect(requireOwner('/owner')).rejects.toThrow('NOT_FOUND');
  });

  it('sends owners without a passkey to add one', async () => {
    mocks.session = session(null, 'owner-1');
    mocks.passkeyCount = 0;
    await expect(requireOwner('/owner')).rejects.toThrow('REDIRECT /account/security');
  });

  it('asks owners for a fresh passkey check, then lets them in', async () => {
    mocks.session = session(new Date(Date.now() - 6 * 60_000), 'owner-1');
    await expect(requireOwner('/owner')).rejects.toThrow('REDIRECT /verify?returnTo=%2Fowner');

    mocks.session = session(new Date(), 'owner-1');
    await expect(requireOwner('/owner')).resolves.toMatchObject({ userId: 'owner-1' });
  });
});
