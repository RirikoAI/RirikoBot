import type {
  DatabaseClient,
  PostgresDatabaseClient,
  SqliteDatabaseClient,
} from '../client/types.js';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DatabaseError } from '@ririko/core';

export interface TransactionOptions {
  timeoutMs?: number | undefined;
}

export type TransactionCallback<T, TClient extends DatabaseClient = DatabaseClient> = (
  client: TClient,
) => Promise<T>;

const SQLITE_TX_DEPTH = Symbol('ririko:sqlite_tx_depth');

type SqliteWithDepth = SqliteDatabaseClient['raw'] & {
  [SQLITE_TX_DEPTH]?: number | undefined;
};

/**
 * Executes a callback within an ACID database transaction.
 * Supports dual-dialect:
 * - SQLite: Uses BEGIN IMMEDIATE / COMMIT / ROLLBACK with SAVEPOINTs for nested transactions.
 * - PostgreSQL: Uses Drizzle's native connection pool transaction harness.
 */
export async function withTransaction<T, TClient extends DatabaseClient = DatabaseClient>(
  client: TClient,
  callback: (client: TClient) => Promise<T>,
  _options?: TransactionOptions,
): Promise<T> {
  if (client.dialect === 'sqlite') {
    const raw = client.raw as SqliteWithDepth;
    const currentDepth = raw[SQLITE_TX_DEPTH] ?? 0;

    if (currentDepth === 0) {
      raw[SQLITE_TX_DEPTH] = 1;
      raw.prepare('BEGIN IMMEDIATE').run();
      try {
        const result = await callback(client);
        raw[SQLITE_TX_DEPTH] = 0;
        raw.prepare('COMMIT').run();
        return result;
      } catch (error) {
        raw[SQLITE_TX_DEPTH] = 0;
        try {
          raw.prepare('ROLLBACK').run();
        } catch {
          // suppress rollback failure if connection was closed or already rolled back
        }
        throw error instanceof Error
          ? error
          : new DatabaseError('Transaction failed and was rolled back', {
              cause: error instanceof Error ? error : undefined,
            });
      }
    } else {
      // Nested transaction via SAVEPOINT
      const savepoint = `sp_${currentDepth}`;
      raw[SQLITE_TX_DEPTH] = currentDepth + 1;
      raw.prepare(`SAVEPOINT ${savepoint}`).run();
      try {
        const result = await callback(client);
        raw[SQLITE_TX_DEPTH] = currentDepth;
        raw.prepare(`RELEASE SAVEPOINT ${savepoint}`).run();
        return result;
      } catch (error) {
        raw[SQLITE_TX_DEPTH] = currentDepth;
        try {
          raw.prepare(`ROLLBACK TO SAVEPOINT ${savepoint}`).run();
        } catch {
          // suppress rollback failure
        }
        throw error;
      }
    }
  } else if (client.dialect === 'postgres') {
    try {
      return await (client.db as NodePgDatabase<Record<string, unknown>>).transaction(
        async (tx) => {
          const txClient: PostgresDatabaseClient = {
            dialect: 'postgres',
            db: tx as unknown as NodePgDatabase<Record<string, unknown>>,
            raw: client.raw as PostgresDatabaseClient['raw'],
            close: async () => {},
            ping: client.ping.bind(client),
          };
          return await callback(txClient as unknown as TClient);
        },
      );
    } catch (error) {
      throw error instanceof Error
        ? error
        : new DatabaseError('PostgreSQL transaction failed', {
            cause: error instanceof Error ? error : undefined,
          });
    }
  }

  throw new DatabaseError(
    `Unsupported database dialect for transaction: ${(client as { dialect: string }).dialect}`,
  );
}
