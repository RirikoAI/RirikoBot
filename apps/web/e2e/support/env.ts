import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ids } from '../../../../tests/support/fake-discord/index.js';

/** Off the user's `next dev` port (3000) so both can run at once. */
export const WEB_PORT = 3100;
export const FAKE_DISCORD_PORT = 3199;

/** Must equal the browser origin exactly: Server Actions reject any other Origin. */
export const DASHBOARD_URL = `http://localhost:${WEB_PORT}`;
export const FAKE_DISCORD_URL = `http://127.0.0.1:${FAKE_DISCORD_PORT}`;

/** The seeded Waifu TCG collection of the fake `admin` user (see seed.ts). */
export const SEEDED_CARDS = 30;
export const RARE_CARDS = 3;
export const LISTED_CARD_NAME = 'E2E Card 01';

/** Recreated by the seed script before every run. */
export const DATABASE_FILE = join(tmpdir(), 'ririko-e2e', 'dashboard.sqlite');

/**
 * Everything the dashboard needs to boot against the fake Discord API and the throwaway
 * database. These win over the monorepo .env, which next.config.ts loads only for unset keys.
 */
export const SERVER_ENV: Record<string, string> = {
  DATABASE_DIALECT: 'sqlite',
  DATABASE_URL: DATABASE_FILE,
  DASHBOARD_URL,
  DISCORD_API_URL: `${FAKE_DISCORD_URL}/api`,
  DISCORD_TOKEN: 'fake-bot-token',
  DISCORD_CLIENT_ID: ids.application,
  DISCORD_CLIENT_SECRET: 'fake-client-secret',
  SECRET_VAULT_KEY: 'e2e0'.repeat(16),
  BOT_OWNER_ID: '',
};
