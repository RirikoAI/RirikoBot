import type { DatabaseConfig, DatabaseClient, PingResult } from './types.js';
import { createSqliteClient } from './sqlite.js';
import { createPostgresClient } from './postgres.js';
import { DatabaseError } from '@ririko/core';

/**
 * Factory creating a type-safe DatabaseClient configured for SQLite or PostgreSQL.
 */
export async function createDatabaseClient(config: DatabaseConfig): Promise<DatabaseClient> {
  if (config.dialect === 'sqlite') {
    return createSqliteClient(config);
  } else if (config.dialect === 'postgres') {
    return createPostgresClient(config);
  }

  throw new DatabaseError(
    `Unsupported database dialect: ${(config as { dialect: string }).dialect}`,
  );
}

/**
 * Health check probe to verify database connectivity and latency.
 */
export async function pingDatabase(client: DatabaseClient): Promise<PingResult> {
  return client.ping();
}
