import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DatabaseError } from '@ririko/core';
import type { DatabaseConfig, PingResult, PostgresDatabaseClient } from './types.js';

export function createPostgresClient(config: DatabaseConfig): PostgresDatabaseClient {
  try {
    const pool = new pg.Pool({
      connectionString: config.url,
      max: config.maxConnections ?? 20,
      idleTimeoutMillis: config.idleTimeoutMs ?? 30000,
      connectionTimeoutMillis: config.connectionTimeoutMs ?? 5000,
    });

    const db = drizzle(pool);

    const client: PostgresDatabaseClient = {
      dialect: 'postgres',
      db,
      raw: pool,
      async close(): Promise<void> {
        await pool.end();
      },
      async ping(): Promise<PingResult> {
        const start = Date.now();
        try {
          await pool.query('SELECT 1');
          return {
            ok: true,
            dialect: 'postgres',
            latencyMs: Date.now() - start,
          };
        } catch (err) {
          return {
            ok: false,
            dialect: 'postgres',
            latencyMs: Date.now() - start,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    };

    return client;
  } catch (error) {
    throw new DatabaseError('Failed to initialize PostgreSQL database connection pool', {
      cause: error instanceof Error ? error : undefined,
      details: { dialect: 'postgres' },
    });
  }
}
