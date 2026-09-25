import { and, desc, eq, gt, lte, ne, or } from 'drizzle-orm';

import type { DatabaseClient } from '../client/types.js';
import type { NewWebSession, WebSession } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';

export type WebSessionPatch = Partial<Omit<NewWebSession, 'userId' | 'createdAt'>>;

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

  /** Applies `patch` to one session; `patch.id` renames the row (session ID rotation). */
  async update(id: string, patch: WebSessionPatch, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    const updated =
      client.dialect === 'sqlite'
        ? await client.db
            .update(sqliteSchema.webSessions)
            .set(patch)
            .where(eq(sqliteSchema.webSessions.id, id))
            .returning({ id: sqliteSchema.webSessions.id })
        : await client.db
            .update(pgSchema.webSessions)
            .set(patch)
            .where(eq(pgSchema.webSessions.id, id))
            .returning({ id: pgSchema.webSessions.id });
    return updated.length > 0;
  }

  async touch(id: string, lastSeenAt: Date, tx?: DatabaseClient): Promise<void> {
    await this.update(id, { lastSeenAt }, tx);
  }

  async updateDiscordTokens(
    id: string,
    tokens: WebSessionDiscordTokens,
    tx?: DatabaseClient,
  ): Promise<void> {
    await this.update(id, tokens, tx);
  }

  /**
   * Clears the pending WebAuthn challenge if it equals `challenge` and has not expired. Returns
   * true only for the one caller that consumed it, so a challenge can be used once.
   */
  async consumeChallenge(
    id: string,
    challenge: string,
    now: Date,
    tx?: DatabaseClient,
  ): Promise<boolean> {
    const client = this.getClient(tx);
    const cleared = { webauthnChallenge: null, webauthnChallengeExpiresAt: null };
    const consumed =
      client.dialect === 'sqlite'
        ? await client.db
            .update(sqliteSchema.webSessions)
            .set(cleared)
            .where(
              and(
                eq(sqliteSchema.webSessions.id, id),
                eq(sqliteSchema.webSessions.webauthnChallenge, challenge),
                gt(sqliteSchema.webSessions.webauthnChallengeExpiresAt, now),
              ),
            )
            .returning({ id: sqliteSchema.webSessions.id })
        : await client.db
            .update(pgSchema.webSessions)
            .set(cleared)
            .where(
              and(
                eq(pgSchema.webSessions.id, id),
                eq(pgSchema.webSessions.webauthnChallenge, challenge),
                gt(pgSchema.webSessions.webauthnChallengeExpiresAt, now),
              ),
            )
            .returning({ id: pgSchema.webSessions.id });
    return consumed.length > 0;
  }

  /** The user's sessions, most recently used first (including ones not yet cleaned up). */
  async listByUser(userId: string, tx?: DatabaseClient): Promise<WebSession[]> {
    const client = this.getClient(tx);
    return client.dialect === 'sqlite'
      ? client.db
          .select()
          .from(sqliteSchema.webSessions)
          .where(eq(sqliteSchema.webSessions.userId, userId))
          .orderBy(desc(sqliteSchema.webSessions.lastSeenAt))
      : client.db
          .select()
          .from(pgSchema.webSessions)
          .where(eq(pgSchema.webSessions.userId, userId))
          .orderBy(desc(pgSchema.webSessions.lastSeenAt));
  }

  /** Deletes one session only if it belongs to the user, so a client-supplied ID is safe. */
  async deleteForUser(userId: string, id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    const deleted =
      client.dialect === 'sqlite'
        ? await client.db
            .delete(sqliteSchema.webSessions)
            .where(
              and(eq(sqliteSchema.webSessions.id, id), eq(sqliteSchema.webSessions.userId, userId)),
            )
            .returning({ id: sqliteSchema.webSessions.id })
        : await client.db
            .delete(pgSchema.webSessions)
            .where(and(eq(pgSchema.webSessions.id, id), eq(pgSchema.webSessions.userId, userId)))
            .returning({ id: pgSchema.webSessions.id });
    return deleted.length > 0;
  }

  /** Ends every session of the user except `keepId`; returns how many were removed. */
  async deleteOthersForUser(userId: string, keepId: string, tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    const deleted =
      client.dialect === 'sqlite'
        ? await client.db
            .delete(sqliteSchema.webSessions)
            .where(
              and(
                eq(sqliteSchema.webSessions.userId, userId),
                ne(sqliteSchema.webSessions.id, keepId),
              ),
            )
            .returning({ id: sqliteSchema.webSessions.id })
        : await client.db
            .delete(pgSchema.webSessions)
            .where(
              and(eq(pgSchema.webSessions.userId, userId), ne(pgSchema.webSessions.id, keepId)),
            )
            .returning({ id: pgSchema.webSessions.id });
    return deleted.length;
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

  /** Ends every session of the user; returns how many were removed. */
  async deleteByUser(userId: string, tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    const deleted =
      client.dialect === 'sqlite'
        ? await client.db
            .delete(sqliteSchema.webSessions)
            .where(eq(sqliteSchema.webSessions.userId, userId))
            .returning({ id: sqliteSchema.webSessions.id })
        : await client.db
            .delete(pgSchema.webSessions)
            .where(eq(pgSchema.webSessions.userId, userId))
            .returning({ id: pgSchema.webSessions.id });
    return deleted.length;
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
