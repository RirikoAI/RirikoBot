import type { GuildSettingsStore } from '@ririko/core';
import { AppError } from '@ririko/core';
import type { DatabaseDialect, MigrationStatus } from './migrations.js';
import { sqliteConnection } from './sqlite.js';
import { postgresConnection } from './postgres.js';

export type { DatabaseDialect, MigrationStatus } from './migrations.js';

/** A database URL is a PostgreSQL URI or SQLite path (including :memory:). */
export interface DatabaseConfig { dialect: DatabaseDialect; url: string }

/** Explicit schema operations keep process startup read-only until configured. */
export interface DatabaseConnection {
  settings: GuildSettingsStore;
  migrate(): Promise<void>;
  migrationStatus(): Promise<MigrationStatus>;
  healthCheck(): Promise<void>;
  close(): Promise<void>;
}

/** Construct a connection without running migrations or creating SQLite files. */
export async function connectDatabase(config: DatabaseConfig): Promise<DatabaseConnection> {
  if (config.dialect === 'sqlite') return sqliteConnection(config.url);
  if (config.dialect === 'postgres') {
    try {
      const url = new URL(config.url);
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) throw new Error();
    } catch {
      throw new AppError('VALIDATION', 'A PostgreSQL connection URL is required.');
    }
    return postgresConnection(config.url);
  }
  throw new AppError('VALIDATION', 'Unsupported database dialect.');
}
