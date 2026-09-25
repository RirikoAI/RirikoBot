import { randomUUID } from 'node:crypto';
import { and, desc, eq, lt, or } from 'drizzle-orm';

import type { DatabaseClient } from '../client/types.js';
import type { AuditLog, NewAuditLog } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';

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
}
