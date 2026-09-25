import { and, asc, count, eq } from 'drizzle-orm';

import type { DatabaseClient } from '../client/types.js';
import type { NewWebPasskey, WebPasskey } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';

/** Dual-dialect store for dashboard WebAuthn passkeys (public keys only). */
export class WebPasskeyRepository {
  constructor(protected readonly client: DatabaseClient) {}

  protected getClient(tx?: DatabaseClient): DatabaseClient {
    return tx ?? this.client;
  }

  async create(data: NewWebPasskey, tx?: DatabaseClient): Promise<WebPasskey> {
    const client = this.getClient(tx);
    const [row] =
      client.dialect === 'sqlite'
        ? await client.db.insert(sqliteSchema.webPasskeys).values(data).returning()
        : await client.db.insert(pgSchema.webPasskeys).values(data).returning();
    if (!row) throw new DatabaseError('Failed to store passkey');
    return row;
  }

  /** The user's passkey with this credential ID, or null (also when it belongs to someone else). */
  async findForUser(userId: string, id: string, tx?: DatabaseClient): Promise<WebPasskey | null> {
    const client = this.getClient(tx);
    const [row] =
      client.dialect === 'sqlite'
        ? await client.db
            .select()
            .from(sqliteSchema.webPasskeys)
            .where(
              and(eq(sqliteSchema.webPasskeys.id, id), eq(sqliteSchema.webPasskeys.userId, userId)),
            )
        : await client.db
            .select()
            .from(pgSchema.webPasskeys)
            .where(and(eq(pgSchema.webPasskeys.id, id), eq(pgSchema.webPasskeys.userId, userId)));
    return row ?? null;
  }

  async listByUser(userId: string, tx?: DatabaseClient): Promise<WebPasskey[]> {
    const client = this.getClient(tx);
    return client.dialect === 'sqlite'
      ? client.db
          .select()
          .from(sqliteSchema.webPasskeys)
          .where(eq(sqliteSchema.webPasskeys.userId, userId))
          .orderBy(asc(sqliteSchema.webPasskeys.createdAt))
      : client.db
          .select()
          .from(pgSchema.webPasskeys)
          .where(eq(pgSchema.webPasskeys.userId, userId))
          .orderBy(asc(pgSchema.webPasskeys.createdAt));
  }

  async countByUser(userId: string, tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    const [row] =
      client.dialect === 'sqlite'
        ? await client.db
            .select({ total: count() })
            .from(sqliteSchema.webPasskeys)
            .where(eq(sqliteSchema.webPasskeys.userId, userId))
        : await client.db
            .select({ total: count() })
            .from(pgSchema.webPasskeys)
            .where(eq(pgSchema.webPasskeys.userId, userId));
    return Number(row?.total ?? 0);
  }

  /** Records a successful sign-in with the passkey. */
  async recordUse(
    id: string,
    use: { counter: number; backedUp: boolean; lastUsedAt: Date },
    tx?: DatabaseClient,
  ): Promise<void> {
    const client = this.getClient(tx);
    if (client.dialect === 'sqlite') {
      await client.db
        .update(sqliteSchema.webPasskeys)
        .set(use)
        .where(eq(sqliteSchema.webPasskeys.id, id));
    } else {
      await client.db.update(pgSchema.webPasskeys).set(use).where(eq(pgSchema.webPasskeys.id, id));
    }
  }

  /** Deletes the user's passkey; returns false when it does not exist or is not theirs. */
  async deleteForUser(userId: string, id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    const deleted =
      client.dialect === 'sqlite'
        ? await client.db
            .delete(sqliteSchema.webPasskeys)
            .where(
              and(eq(sqliteSchema.webPasskeys.id, id), eq(sqliteSchema.webPasskeys.userId, userId)),
            )
            .returning({ id: sqliteSchema.webPasskeys.id })
        : await client.db
            .delete(pgSchema.webPasskeys)
            .where(and(eq(pgSchema.webPasskeys.id, id), eq(pgSchema.webPasskeys.userId, userId)))
            .returning({ id: pgSchema.webPasskeys.id });
    return deleted.length > 0;
  }
}
