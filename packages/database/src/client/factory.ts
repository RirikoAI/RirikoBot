import type { DatabaseConfig, DatabaseClient, DatabaseDialect, PingResult } from './types.js';
import { createSqliteClient } from './sqlite.js';
import { createPostgresClient } from './postgres.js';
import { DatabaseError, DEFAULT_DATABASE_URL } from '@ririko/core';
import { migrateDatabase } from '../migrations/runner.js';

/**
 * The database connection named by `DATABASE_DIALECT` and `DATABASE_URL`, with the same defaults
 * as the config schema (SQLite at `./data/ririko.sqlite`). Empty values count as unset. The
 * dialect is not checked here: `createDatabaseClient` rejects unsupported ones.
 */
export function databaseConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): DatabaseConfig {
  return {
    dialect: (env.DATABASE_DIALECT || 'sqlite') as DatabaseDialect,
    url: env.DATABASE_URL || DEFAULT_DATABASE_URL,
  };
}

/**
 * Factory creating a type-safe DatabaseClient configured for SQLite or PostgreSQL.
 */
export async function createDatabaseClient(config: DatabaseConfig): Promise<DatabaseClient> {
  if (config.dialect !== 'sqlite' && config.dialect !== 'postgres') {
    throw new DatabaseError(
      `Unsupported database dialect: ${(config as { dialect: string }).dialect}`,
    );
  }
  const client =
    config.dialect === 'sqlite' ? createSqliteClient(config) : createPostgresClient(config);
  if (config.autoMigrate === true) {
    try {
      await migrateDatabase(client);
    } catch (error) {
      await client.close().catch(() => undefined);
      throw error;
    }
  }
  return client;
}

/**
 * Health check probe to verify database connectivity and latency.
 */
export async function pingDatabase(client: DatabaseClient): Promise<PingResult> {
  return client.ping();
}
