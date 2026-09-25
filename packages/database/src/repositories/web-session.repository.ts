import { eq, lte, or } from 'drizzle-orm';

import type { DatabaseClient } from '../client/types.js';
import type { NewWebSession, WebSession } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';

export interface WebSessionDiscordTokens {
  discordAccessToken: string;
  discordRefreshToken: string;
  discordTokenExpiresAt: Date;
}

/**
 * Dual-dialect store for web dashboard sessions. Rows are keyed by the SHA-256 hash of the
 * session cookie; hashing and expiry policy live in the dashboard's session service.
 */
export class WebSessionRepository {
  constructor(protected readonly client: DatabaseClient) {}

  protected getClient(tx?: DatabaseClient): DatabaseClient {
    return tx ?? this.client;
  }

  async create(data: NewWebSession, tx?: DatabaseClient): Promise<WebSession> {
    const client = this.getClient(tx);
    const [row] =
      client.dialect === 'sqlite'
        ? await client.db.insert(sqliteSchema.webSessions).values(data).returning()
        : await client.db.insert(pgSchema.webSessions).values(data).returning();
    if (!row) throw new DatabaseError('Failed to create web session');
    return row;
  }

  async findById(id: string, tx?: DatabaseClient): Promise<WebSession | null> {
    const client = this.getClient(tx);
    const [row] =
      client.dialect === 'sqlite'
        ? await client.db
            .select()
            .from(sqliteSchema.webSessions)
            .where(eq(sqliteSchema.webSessions.id, id))
        : await client.db
            .select()
            .from(pgSchema.webSessions)
            .where(eq(pgSchema.webSessions.id, id));
    return row ?? null;
  }

  async touch(id: string, lastSeenAt: Date, tx?: DatabaseClient): Promise<void> {
    const client = this.getClient(tx);
    if (client.dialect === 'sqlite') {
      await client.db
        .update(sqliteSchema.webSessions)
        .set({ lastSeenAt })
        .where(eq(sqliteSchema.webSessions.id, id));
    } else {
      await client.db
        .update(pgSchema.webSessions)
        .set({ lastSeenAt })
        .where(eq(pgSchema.webSessions.id, id));
    }
  }

  async updateDiscordTokens(
    id: string,
    tokens: WebSessionDiscordTokens,
    tx?: DatabaseClient,
  ): Promise<void> {
    const client = this.getClient(tx);
    if (client.dialect === 'sqlite') {
      await client.db
        .update(sqliteSchema.webSessions)
        .set(tokens)
        .where(eq(sqliteSchema.webSessions.id, id));
    } else {
      await client.db
        .update(pgSchema.webSessions)
        .set(tokens)
        .where(eq(pgSchema.webSessions.id, id));
    }
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    const deleted =
      client.dialect === 'sqlite'
        ? await client.db
            .delete(sqliteSchema.webSessions)
            .where(eq(sqliteSchema.webSessions.id, id))
            .returning({ id: sqliteSchema.webSessions.id })
        : await client.db
            .delete(pgSchema.webSessions)
            .where(eq(pgSchema.webSessions.id, id))
            .returning({ id: pgSchema.webSessions.id });
    return deleted.length > 0;
  }

  /** Removes sessions past their absolute expiry or idle since `idleBefore`. */
  async deleteExpired(now: Date, idleBefore: Date, tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    const deleted =
      client.dialect === 'sqlite'
        ? await client.db
            .delete(sqliteSchema.webSessions)
            .where(
              or(
                lte(sqliteSchema.webSessions.expiresAt, now),
                lte(sqliteSchema.webSessions.lastSeenAt, idleBefore),
              ),
            )
            .returning({ id: sqliteSchema.webSessions.id })
        : await client.db
            .delete(pgSchema.webSessions)
            .where(
              or(
                lte(pgSchema.webSessions.expiresAt, now),
                lte(pgSchema.webSessions.lastSeenAt, idleBefore),
              ),
            )
            .returning({ id: pgSchema.webSessions.id });
    return deleted.length;
  }
}
