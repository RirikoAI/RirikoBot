import { and, eq } from 'drizzle-orm';

import type { DatabaseClient } from '../client/types.js';
import type { UserConsent } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';

/** The notices and consents a user can accept: the terms notice and the AI chat consent. */
export type UserConsentKind = 'terms' | 'ai';

/** Dual-dialect store for which notice or consent each user accepted, and which version. */
export class UserConsentRepository {
  constructor(protected readonly client: DatabaseClient) {}

  protected getClient(tx?: DatabaseClient): DatabaseClient {
    return tx ?? this.client;
  }

  /** The user's record of `kind`, or null when they never accepted it (or withdrew). */
  async find(
    userId: string,
    kind: UserConsentKind,
    tx?: DatabaseClient,
  ): Promise<UserConsent | null> {
    const client = this.getClient(tx);
    if (client.dialect === 'sqlite') {
      const table = sqliteSchema.userConsents;
      const [row] = await client.db
        .select()
        .from(table)
        .where(and(eq(table.userId, userId), eq(table.kind, kind)))
        .limit(1);
      return row ?? null;
    }
    const table = pgSchema.userConsents;
    const [row] = await client.db
      .select()
      .from(table)
      .where(and(eq(table.userId, userId), eq(table.kind, kind)))
      .limit(1);
    return row ?? null;
  }

  /** Records that the user accepted `version` of `kind` at `now`, replacing an older record. */
  async accept(
    userId: string,
    kind: UserConsentKind,
    version: string,
    now: Date,
    tx?: DatabaseClient,
  ): Promise<void> {
    const client = this.getClient(tx);
    const values = { userId, kind, version, acceptedAt: now };
    const set = { version, acceptedAt: now };
    if (client.dialect === 'sqlite') {
      const table = sqliteSchema.userConsents;
      await client.db
        .insert(table)
        .values(values)
        .onConflictDoUpdate({ target: [table.userId, table.kind], set });
      return;
    }
    const table = pgSchema.userConsents;
    await client.db
      .insert(table)
      .values(values)
      .onConflictDoUpdate({ target: [table.userId, table.kind], set });
  }

  /** Removes the user's record of `kind`; returns true when there was one. */
  async withdraw(userId: string, kind: UserConsentKind, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (client.dialect === 'sqlite') {
      const table = sqliteSchema.userConsents;
      const deleted = await client.db
        .delete(table)
        .where(and(eq(table.userId, userId), eq(table.kind, kind)))
        .returning({ userId: table.userId });
      return deleted.length > 0;
    }
    const table = pgSchema.userConsents;
    const deleted = await client.db
      .delete(table)
      .where(and(eq(table.userId, userId), eq(table.kind, kind)))
      .returning({ userId: table.userId });
    return deleted.length > 0;
  }
}
