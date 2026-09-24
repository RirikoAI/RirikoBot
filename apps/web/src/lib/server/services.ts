import 'server-only';
import { loadWebConfig, SecretVault, type WebConfig } from '@ririko/core';
import {
  createDatabaseClient,
  UserRepository,
  WebSessionRepository,
  type DatabaseClient,
} from '@ririko/database';
import { DiscordOAuthClient } from './auth/discord-oauth';
import { SessionService } from './auth/session-service';

/**
 * Server-side dependencies of the dashboard. Built once per process from the shared monorepo
 * configuration; never import this module from a client component.
 */
export interface WebServices {
  config: WebConfig;
  db: DatabaseClient;
  vault: SecretVault;
  oauth: DiscordOAuthClient;
  sessions: SessionService;
  users: UserRepository;
}

async function createWebServices(): Promise<WebServices> {
  const config = loadWebConfig();
  const db = await createDatabaseClient({
    dialect: config.DATABASE_DIALECT,
    url: config.DATABASE_URL,
  });
  const vault = SecretVault.fromConfig(config);
  const oauth = new DiscordOAuthClient({
    clientId: config.DISCORD_CLIENT_ID,
    clientSecret: config.DISCORD_CLIENT_SECRET,
    redirectUri: `${config.DASHBOARD_URL}/api/auth/callback`,
  });
  const sessions = new SessionService({ repo: new WebSessionRepository(db), vault, oauth });
  return { config, db, vault, oauth, sessions, users: new UserRepository(db) };
}

// Kept on globalThis so dev-mode module reloads reuse one database connection.
const globalForServices = globalThis as typeof globalThis & {
  __ririkoWebServices?: Promise<WebServices>;
};

export function getWebServices(): Promise<WebServices> {
  globalForServices.__ririkoWebServices ??= createWebServices().catch((error: unknown) => {
    delete globalForServices.__ririkoWebServices;
    throw error;
  });
  return globalForServices.__ririkoWebServices;
}
