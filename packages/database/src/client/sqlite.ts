import DatabaseConstructor from 'better-sqlite3';
import type Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { DatabaseError, resolveWorkspacePath } from '@ririko/core';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { DatabaseConfig, PingResult, SqliteDatabaseClient } from './types.js';
import { SQLITE_SCHEMA_DDL } from '../schema/sqlite/ddl.js';

export function resolveDatabasePath(url: string): string {
  if (url === ':memory:' || url.startsWith('file::memory:') || url.startsWith('sqlite:')) {
    return url;
  }
  return resolveWorkspacePath(url);
}

export function createSqliteClient(config: DatabaseConfig): SqliteDatabaseClient {
  try {
    const resolvedUrl = resolveDatabasePath(config.url);
    const isMemory = resolvedUrl === ':memory:' || resolvedUrl.startsWith('file::memory:');
    if (!isMemory) {
      // Ensure parent directory exists for file-based SQLite databases
      const dir = dirname(resolvedUrl);
      if (dir && dir !== '.') {
        mkdirSync(dir, { recursive: true });
      }
    }

    const sqlite = new (DatabaseConstructor as unknown as typeof Database)(resolvedUrl);

    // Apply performance and safety pragmas
    if (config.foreignKeys !== false) {
      sqlite.pragma('foreign_keys = ON');
    }

    if (!isMemory && config.walMode !== false) {
      sqlite.pragma('journal_mode = WAL');
    }

    const syncMode = config.synchronous ?? (isMemory ? 'OFF' : 'NORMAL');
    sqlite.pragma(`synchronous = ${syncMode}`);

    // Auto-initialize schema if new/empty database
    const shouldAutoMigrate =
      config.autoMigrate === true || (!isMemory && config.autoMigrate !== false);
    if (shouldAutoMigrate) {
      const tableCountRow = sqlite
        .prepare(
          "SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
        .get() as { count: number } | undefined;

      if (!tableCountRow || tableCountRow.count === 0) {
        sqlite.exec(SQLITE_SCHEMA_DDL);
      }
    }

    const db = drizzle(sqlite);

    const client: SqliteDatabaseClient = {
      dialect: 'sqlite',
      db,
      raw: sqlite,
      async close(): Promise<void> {
        if (sqlite.open) {
          sqlite.close();
        }
      },
      async ping(): Promise<PingResult> {
        const start = Date.now();
        try {
          if (!sqlite.open) {
            return {
              ok: false,
              dialect: 'sqlite',
              latencyMs: 0,
              error: 'Database connection is closed',
            };
          }
          sqlite.prepare('SELECT 1').get();
          return {
            ok: true,
            dialect: 'sqlite',
            latencyMs: Date.now() - start,
          };
        } catch (err) {
          return {
            ok: false,
            dialect: 'sqlite',
            latencyMs: Date.now() - start,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    };

    return client;
  } catch (error) {
    throw new DatabaseError(`Failed to initialize SQLite database at ${config.url}`, {
      cause: error instanceof Error ? error : undefined,
      details: { url: config.url },
    });
  }
}
