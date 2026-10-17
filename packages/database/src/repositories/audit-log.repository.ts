import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, lt, or } from 'drizzle-orm';

import type { DatabaseClient } from '../client/types.js';
import type { AuditLog, NewAuditLog } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';
import { PURGE_BATCH_SIZE, deleteInBatches } from './retention.js';

/** Position in a newest-first audit listing: entries after it are older. */
export interface AuditLogCursor {
  createdAt: Date;
  id: string;
}

/** Append-only store for `audit_logs` (dashboard and CLI changes). */
export class AuditLogRepository {
  constructor(protected readonly client: DatabaseClient) {}

  protected getClient(tx?: DatabaseClient): DatabaseClient {
    return tx ?? this.client;
  }

  async create(data: NewAuditLog, now: Date, tx?: DatabaseClient): Promise<AuditLog> {
    const client = this.getClient(tx);
    const values = { ...data, id: randomUUID(), createdAt: now };
    const [row] =
      client.dialect === 'sqlite'
        ? await client.db.insert(sqliteSchema.auditLogs).values(values).returning()
        : await client.db.insert(pgSchema.auditLogs).values(values).returning();
    if (!row) throw new DatabaseError('Failed to write audit log entry');
    return row as AuditLog;
  }

  /** A guild's entries, newest first, starting after `before`. */
  async listByGuild(
    guildId: string,
    options: { limit: number; before?: AuditLogCursor | undefined },
  ): Promise<AuditLog[]> {
    const client = this.client;
    const { before, limit } = options;
    if (client.dialect === 'sqlite') {
      const t = sqliteSchema.auditLogs;
      const rows = await client.db
        .select()
        .from(t)
        .where(
          and(
            eq(t.guildId, guildId),
            before
              ? or(
                  lt(t.createdAt, before.createdAt),
                  and(eq(t.createdAt, before.createdAt), lt(t.id, before.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(t.createdAt), desc(t.id))
        .limit(limit);
      return rows as AuditLog[];
    }
    const t = pgSchema.auditLogs;
    const rows = await client.db
      .select()
      .from(t)
      .where(
        and(
          eq(t.guildId, guildId),
          before
            ? or(
                lt(t.createdAt, before.createdAt),
                and(eq(t.createdAt, before.createdAt), lt(t.id, before.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(t.createdAt), desc(t.id))
      .limit(limit);
    return rows as unknown as AuditLog[];
  }

  /**
   * Retention purge (STORY-193): deletes entries created before `cutoff`, `batchSize` rows per
   * statement. Entries created at or after `cutoff` stay. Returns the number of rows deleted.
   */
  async deleteOlderThan(
    cutoff: Date,
    tx?: DatabaseClient,
    batchSize: number = PURGE_BATCH_SIZE,
  ): Promise<number> {
    const client = this.getClient(tx);
    if (client.dialect === 'sqlite') {
      const { db } = client;
      const t = sqliteSchema.auditLogs;
      return deleteInBatches(batchSize, async () => {
        const res = await db
          .delete(t)
          .where(
            inArray(
              t.id,
              db.select({ id: t.id }).from(t).where(lt(t.createdAt, cutoff)).limit(batchSize),
            ),
          );
        return res.changes;
      });
    }
    const { db } = client;
    const t = pgSchema.auditLogs;
    return deleteInBatches(batchSize, async () => {
      const res = await db
        .delete(t)
        .where(
          inArray(
            t.id,
            db.select({ id: t.id }).from(t).where(lt(t.createdAt, cutoff)).limit(batchSize),
          ),
        );
      return res.rowCount ?? 0;
    });
  }
}
