import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActiveSession } from '@/lib/server/auth/session-service';

const CURRENT = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

const mocks = vi.hoisted(() => ({
  session: null as ActiveSession | null,
  passkeyCount: 0,
  headers: new Headers(),
  revokeForUser: vi.fn(),
  revokeOthers: vi.fn(),
  audit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'x'.repeat(43) }), set: vi.fn() }),
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
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/server/services', () => ({
  getWebServices: async () => ({
    config: { DASHBOARD_URL: 'https://dash.example.com' },
    sessions: {
      resolve: async () => mocks.session,
      revokeForUser: mocks.revokeForUser,
      revokeOthers: mocks.revokeOthers,
    },
    passkeys: { count: async () => mocks.passkeyCount },
    audit: { create: mocks.audit },
  }),
}));

const { revokeOtherSessions, revokeSession } = await import('./actions');

describe('session revoke actions (TASK-1172)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.passkeyCount = 0;
    mocks.headers = new Headers({
      origin: 'https://dash.example.com',
      'x-forwarded-for': '203.0.113.7',
      'user-agent': 'vitest',
    });
    mocks.session = {
      id: CURRENT,
      userId: 'user-1',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
      stepUpAt: null,
    };
  });

  it('revokes another session of the signed-in user and audits it', async () => {
    mocks.revokeForUser.mockResolvedValue(true);
    expect(await revokeSession(OTHER)).toEqual({ ok: true });
    expect(mocks.revokeForUser).toHaveBeenCalledWith('user-1', OTHER);
    expect(mocks.audit).toHaveBeenCalledWith(
      {
        guildId: null,
        actorUserId: 'user-1',
        action: 'web.session.revoke',
        details: { source: 'dashboard', sessionId: OTHER },
        ipAddress: '203.0.113.7',
        userAgent: 'vitest',
      },
      expect.any(Date),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/account/sessions');
  });

  it("reports sessions that are gone or someone else's without auditing", async () => {
    mocks.revokeForUser.mockResolvedValue(false);
    expect(await revokeSession(OTHER)).toMatchObject({ ok: false });
    expect(await revokeSession('not-a-session-id')).toMatchObject({ ok: false });
    expect(mocks.revokeForUser).toHaveBeenCalledTimes(1);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('keeps the current session, which signs out through the header', async () => {
    expect(await revokeSession(CURRENT)).toMatchObject({ ok: false });
    expect(mocks.revokeForUser).not.toHaveBeenCalled();
  });

  it('signs out every other session without a fresh passkey check', async () => {
    mocks.passkeyCount = 1;
    mocks.session = { ...mocks.session!, stepUpAt: new Date(Date.now() - 3_600_000) };
    mocks.revokeOthers.mockResolvedValue(3);

    expect(await revokeOtherSessions()).toEqual({ ok: true });
    expect(mocks.revokeOthers).toHaveBeenCalledWith(mocks.session);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'web.session.revoke_all',
        details: { source: 'dashboard', ended: 3 },
      }),
      expect.any(Date),
    );
  });

  it('needs a passed passkey check at sign-in, like every other page', async () => {
    mocks.passkeyCount = 1;
    await expect(revokeOtherSessions()).rejects.toThrow('REDIRECT /verify');
    expect(mocks.revokeOthers).not.toHaveBeenCalled();
  });

  it('rejects requests from another origin before anything else', async () => {
    mocks.headers = new Headers({ origin: 'https://evil.example' });
    expect(await revokeOtherSessions()).toMatchObject({ ok: false });
    expect(await revokeSession(OTHER)).toMatchObject({ ok: false });
    expect(mocks.revokeOthers).not.toHaveBeenCalled();
    expect(mocks.revokeForUser).not.toHaveBeenCalled();
  });
});
