import DatabaseConstructor from 'better-sqlite3';
import type Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { DatabaseError } from '@ririko/core';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { DatabaseConfig, PingResult, SqliteDatabaseClient } from './types.js';

export function createSqliteClient(config: DatabaseConfig): SqliteDatabaseClient {
  try {
    const isMemory = config.url === ':memory:' || config.url.startsWith('file::memory:');
    if (!isMemory) {
      // Ensure parent directory exists for file-based SQLite databases
      const dir = dirname(config.url);
      if (dir && dir !== '.') {
        mkdirSync(dir, { recursive: true });
      }
    }

    const sqlite = new (DatabaseConstructor as unknown as typeof Database)(config.url);

    // Apply performance and safety pragmas
    if (config.foreignKeys !== false) {
      sqlite.pragma('foreign_keys = ON');
    }

    if (!isMemory && config.walMode !== false) {
      sqlite.pragma('journal_mode = WAL');
    }

    const syncMode = config.synchronous ?? (isMemory ? 'OFF' : 'NORMAL');
    sqlite.pragma(`synchronous = ${syncMode}`);

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
