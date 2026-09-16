import { AsyncLocalStorage } from 'node:async_hooks';
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

class AsyncMutex {
  private queue: Promise<void> = Promise.resolve();

  acquire(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const current = this.queue;
    this.queue = current.then(() => next);
    return current.then(() => release);
  }
}

interface SqliteTxContext {
  depth: number;
}

const sqliteTxStorage = new AsyncLocalStorage<SqliteTxContext>();
const SQLITE_MUTEX = Symbol('ririko:sqlite_tx_mutex');

type SqliteWithMutex = SqliteDatabaseClient['raw'] & {
  [SQLITE_MUTEX]?: AsyncMutex | undefined;
};

/**
 * Executes a callback within an ACID database transaction.
 * Supports dual-dialect:
 * - SQLite: Thread/task-safe async mutex serialization for concurrent transactions on a single connection,
 *   with re-entrant SAVEPOINT nesting when called within the same async stack.
 * - PostgreSQL: Uses Drizzle's native connection pool transaction harness.
 */
export async function withTransaction<T, TClient extends DatabaseClient = DatabaseClient>(
  client: TClient,
  callback: (client: TClient) => Promise<T>,
  _options?: TransactionOptions,
): Promise<T> {
  if (client.dialect === 'sqlite') {
    const raw = client.raw as SqliteWithMutex;
    const parentContext = sqliteTxStorage.getStore();

    if (!parentContext) {
      // Root transaction: acquire mutex across concurrent async tasks on this SQLite connection
      if (!raw[SQLITE_MUTEX]) {
        raw[SQLITE_MUTEX] = new AsyncMutex();
      }
      const releaseLock = await raw[SQLITE_MUTEX].acquire();

      try {
        raw.prepare('BEGIN IMMEDIATE').run();
        try {
          const result = await sqliteTxStorage.run({ depth: 1 }, async () => {
            return await callback(client);
          });
          raw.prepare('COMMIT').run();
          return result;
        } catch (error) {
          try {
            raw.prepare('ROLLBACK').run();
          } catch {
            // Suppress rollback failure if connection was closed or already rolled back
          }
          throw error instanceof Error
            ? error
            : new DatabaseError('Transaction failed and was rolled back', {
                cause: error instanceof Error ? error : undefined,
              });
        }
      } finally {
        releaseLock();
      }
    } else {
      // Re-entrant nested transaction on the same call stack: safely use SAVEPOINT
      const depth = parentContext.depth;
      const savepoint = `sp_${depth}`;
      raw.prepare(`SAVEPOINT ${savepoint}`).run();
      try {
        const result = await sqliteTxStorage.run({ depth: depth + 1 }, async () => {
          return await callback(client);
        });
        raw.prepare(`RELEASE SAVEPOINT ${savepoint}`).run();
        return result;
      } catch (error) {
        try {
          raw.prepare(`ROLLBACK TO SAVEPOINT ${savepoint}`).run();
        } catch {
          // Suppress rollback failure
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
