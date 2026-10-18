import { createHash } from 'node:crypto';
import { test as base } from '@playwright/test';
import { createDatabaseClient } from '@ririko/database';
import {
  fetchRecordedRequests,
  fetchUnhandledRequests,
  LOGIN_COOKIE,
  type RecordedRequest,
} from '../../../../tests/support/fake-discord/index.js';
import { DATABASE_FILE, FAKE_DISCORD_URL } from './env.js';

export { expect } from '@playwright/test';

type FakeLogin = 'admin' | 'member' | 'outsider';

interface E2EFixtures {
  /** Signs in through the real login route and OAuth callback, as the given fake Discord user. */
  signIn(login: FakeLogin): Promise<void>;
  /** Fails the test when the dashboard called a Discord route the fake does not implement. */
  allDiscordRoutesHandled: void;
}

export const test = base.extend<E2EFixtures>({
  // The auth routes allow 20 requests a minute per client IP; give each test its own address.
  // Playwright reads fixture dependencies from the destructuring pattern, so `{}` is required.
  // eslint-disable-next-line no-empty-pattern
  extraHTTPHeaders: async ({}, use, testInfo) => {
    const octet = parseInt(
      createHash('sha1').update(testInfo.testId).digest('hex').slice(0, 2),
      16,
    );
    await use({ 'X-Forwarded-For': `198.51.100.${octet}` });
  },

  allDiscordRoutesHandled: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await use();
      const unhandled = await fetchUnhandledRequests(FAKE_DISCORD_URL);
      if (unhandled.length > 0) {
        const routes = unhandled.map((r) => `${r.method} ${r.path}`).join(', ');
        throw new Error(
          `The dashboard called routes the fake Discord API does not implement: ${routes}`,
        );
      }
    },
    { auto: true },
  ],

  signIn: async ({ page, context }, use) => {
    await use(async (login) => {
      // The fake's authorize endpoint signs in whoever this cookie names.
      await context.addCookies([{ name: LOGIN_COOKIE, value: login, url: FAKE_DISCORD_URL }]);
      await page.goto('/');
      await page.getByRole('link', { name: 'Sign in with Discord' }).click();
      await page.waitForURL('**/servers');
    });
  },
});

/** Requests the dashboard sent to the fake Discord API (shared by every worker). */
export function discordRequests(): Promise<RecordedRequest[]> {
  return fetchRecordedRequests(FAKE_DISCORD_URL);
}

/** Reads one value straight from the dashboard's database. */
export async function queryDatabase<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
  const db = await createDatabaseClient({ dialect: 'sqlite', url: DATABASE_FILE });
  try {
    if (db.dialect !== 'sqlite') throw new Error('The E2E database is SQLite');
    return db.raw.prepare(sql).get(...params) as T | undefined;
  } finally {
    await db.close();
  }
}
