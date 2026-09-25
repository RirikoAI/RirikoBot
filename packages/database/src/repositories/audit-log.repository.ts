import { randomUUID } from 'node:crypto';

import type { DatabaseClient } from '../client/types.js';
import type { AuditLog, NewAuditLog } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';

/** Append-only writer for `audit_logs` (dashboard and CLI changes). */
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
}
