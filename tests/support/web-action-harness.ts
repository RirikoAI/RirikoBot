/**
 * Shared state and module fakes for the dashboard Server Action tests (`apps/web`). The real
 * guards (`checkDashboardRequest`, `requireSession`, `requireGuildAccess`, `requireStepUp`,
 * `runOwnerAction`) run against this state, so a test only decides who is signed in, how the
 * request looks and what the services answer. Test files wire it up with `vi.mock` factories
 * that `await import()` this module, for example:
 *
 *   vi.mock('next/headers', async () => (await import('<path>')).nextHeadersMock);
 */
import { vi } from 'vitest';

export interface HarnessSession {
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  stepUpAt: Date | null;
}

export const GUILD_ID = '100000000000000001';
export const DASHBOARD_URL = 'https://dash.example.com';

export function makeSession(
  userId = 'user-1',
  stepUpAt: Date | null = new Date(),
  createdAt = new Date(),
): HarnessSession {
  return {
    id: 'a'.repeat(64),
    userId,
    createdAt,
    expiresAt: new Date(Date.now() + 3_600_000),
    stepUpAt,
  };
}

/** What the guards see; reset between tests with `resetHarness`. */
export const harness = {
  session: null as HarnessSession | null,
  passkeyCount: 1,
  headers: new Headers(),
  /** `checkAccess` answer: a guild, `'denied'` (404) or `null` (sign in again). */
  guildAccess: { id: GUILD_ID, name: 'Guild', icon: null, botPresent: true } as
    { id: string; name: string; icon: string | null; botPresent: boolean } | 'denied' | null,
  /** Fresh per test, so the shared per-user rate limiter never trips by accident. */
  userId: 'user-0',
  /** Bot owners; the signed-in user is one by default. */
  ownerIds: [] as string[],
  afterCallbacks: [] as Array<() => unknown>,
};

export const revalidatePath = vi.fn();

let counter = 0;

export function resetHarness(): void {
  counter += 1;
  harness.userId = `user-${counter}`;
  harness.session = makeSession(harness.userId);
  harness.passkeyCount = 1;
  harness.headers = new Headers({
    origin: DASHBOARD_URL,
    'x-forwarded-for': '203.0.113.7',
    'user-agent': 'vitest',
  });
  harness.guildAccess = { id: GUILD_ID, name: 'Guild', icon: null, botPresent: true };
  harness.ownerIds = [harness.userId];
  harness.afterCallbacks = [];
  revalidatePath.mockReset();
}

/** Runs the `after()` callbacks the action scheduled, as Next does once the response is sent. */
export async function flushAfter(): Promise<void> {
  const callbacks = harness.afterCallbacks.splice(0);
  for (const callback of callbacks) await callback();
}

export const nextHeadersMock = {
  cookies: async () => ({ get: () => ({ value: 'x'.repeat(43) }), set: vi.fn() }),
  headers: async () => harness.headers,
};

export const nextNavigationMock = {
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
};

export const nextCacheMock = { revalidatePath };

export const nextServerMock = {
  after: (callback: () => unknown) => {
    harness.afterCallbacks.push(callback);
  },
};

/** The services every guard needs; tests add the ones their action uses. */
export function baseServices<T extends Record<string, unknown>>(extra: T) {
  return {
    config: { DASHBOARD_URL, BOT_OWNER_ID: harness.ownerIds },
    sessions: { resolve: async () => harness.session },
    passkeys: { count: async () => harness.passkeyCount },
    guildAccess: { checkAccess: async () => harness.guildAccess },
    ...extra,
  };
}
