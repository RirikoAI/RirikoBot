import 'server-only';
import { loadWebConfig, SecretVault, type WebConfig } from '@ririko/core';
import { createDatabaseClient, type DatabaseClient } from '@ririko/database';

/**
 * Server-side dependencies of the dashboard. Built once per process from the shared monorepo
 * configuration; never import this module from a client component.
 */
export interface WebServices {
  config: WebConfig;
  db: DatabaseClient;
  vault: SecretVault;
}

async function createWebServices(): Promise<WebServices> {
  const config = loadWebConfig();
  const db = await createDatabaseClient({
    dialect: config.DATABASE_DIALECT,
    url: config.DATABASE_URL,
  });
  return { config, db, vault: SecretVault.fromConfig(config) };
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
