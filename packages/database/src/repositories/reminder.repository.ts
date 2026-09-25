import { and, asc, count, eq, lte } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DatabaseError } from '@ririko/core';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type { NewReminder, Reminder } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';

const sqliteTable = sqliteSchema.reminders;
const pgTable = pgSchema.reminders;

/** New reminder; the id is generated when omitted. */
export type CreateReminderRow = Omit<NewReminder, 'id'> & { id?: string };

/**
 * Persistent reminders. A row is "active" while `isCompleted` is false; the scheduler claims a due
 * row by flipping that flag, which only one caller can win.
 */
export class ReminderRepository extends BaseRepository<
  Reminder,
  CreateReminderRow,
  Partial<NewReminder>
> {
  async findById(id: string, tx?: DatabaseClient): Promise<Reminder | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db.select().from(sqliteTable).where(eq(sqliteTable.id, id));
      return (row as Reminder) ?? null;
    }
    const [row] = await client.db.select().from(pgTable).where(eq(pgTable.id, id));
    return (row as unknown as Reminder) ?? null;
  }

  async create(data: CreateReminderRow, tx?: DatabaseClient): Promise<Reminder> {
    const client = this.getClient(tx);
    const payload = { ...data, id: data.id ?? randomUUID() };
    const [created] = this.isSqlite(client)
      ? await client.db.insert(sqliteTable).values(payload).returning()
      : await client.db
          .insert(pgTable)
          .values(payload as unknown as typeof pgTable.$inferInsert)
          .returning();
    if (!created) throw new DatabaseError('Failed to create reminder');
    return created as unknown as Reminder;
  }

  async update(id: string, data: Partial<NewReminder>, tx?: DatabaseClient): Promise<Reminder> {
    const client = this.getClient(tx);
    const [updated] = this.isSqlite(client)
      ? await client.db.update(sqliteTable).set(data).where(eq(sqliteTable.id, id)).returning()
      : await client.db
          .update(pgTable)
          .set(data as unknown as Partial<typeof pgTable.$inferInsert>)
          .where(eq(pgTable.id, id))
          .returning();
    if (!updated) throw new DatabaseError(`Reminder ${id} not found`);
    return updated as unknown as Reminder;
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    return (await this.findById(id, tx)) !== null;
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    const rows = this.isSqlite(client)
      ? await client.db.delete(sqliteTable).where(eq(sqliteTable.id, id)).returning()
      : await client.db.delete(pgTable).where(eq(pgTable.id, id)).returning();
    return rows.length > 0;
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    const [row] = this.isSqlite(client)
      ? await client.db.select({ value: count() }).from(sqliteTable)
      : await client.db.select({ value: count() }).from(pgTable);
    return Number(row?.value ?? 0);
  }

  /** A user's active reminders, soonest first. */
  async listActiveByUser(userId: string, tx?: DatabaseClient): Promise<Reminder[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteTable)
        .where(and(eq(sqliteTable.userId, userId), eq(sqliteTable.isCompleted, false)))
        .orderBy(asc(sqliteTable.triggerAt));
      return rows as Reminder[];
    }
    const rows = await client.db
      .select()
      .from(pgTable)
      .where(and(eq(pgTable.userId, userId), eq(pgTable.isCompleted, false)))
      .orderBy(asc(pgTable.triggerAt));
    return rows as unknown as Reminder[];
  }

  async countActiveByUser(userId: string, tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    const [row] = this.isSqlite(client)
      ? await client.db
          .select({ value: count() })
          .from(sqliteTable)
          .where(and(eq(sqliteTable.userId, userId), eq(sqliteTable.isCompleted, false)))
      : await client.db
          .select({ value: count() })
          .from(pgTable)
          .where(and(eq(pgTable.userId, userId), eq(pgTable.isCompleted, false)));
    return Number(row?.value ?? 0);
  }

  /** Active reminders due at or before `now`, oldest first. */
  async findDue(now: Date, limit = 50, tx?: DatabaseClient): Promise<Reminder[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteTable)
        .where(and(eq(sqliteTable.isCompleted, false), lte(sqliteTable.triggerAt, now)))
        .orderBy(asc(sqliteTable.triggerAt))
        .limit(limit);
      return rows as Reminder[];
    }
    const rows = await client.db
      .select()
      .from(pgTable)
      .where(and(eq(pgTable.isCompleted, false), lte(pgTable.triggerAt, now)))
      .orderBy(asc(pgTable.triggerAt))
      .limit(limit);
    return rows as unknown as Reminder[];
  }

  /**
   * Marks an active reminder completed. Returns false when it was already completed or deleted,
   * so concurrent schedulers never deliver the same reminder twice.
   */
  async claim(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    const rows = this.isSqlite(client)
      ? await client.db
          .update(sqliteTable)
          .set({ isCompleted: true })
          .where(and(eq(sqliteTable.id, id), eq(sqliteTable.isCompleted, false)))
          .returning()
      : await client.db
          .update(pgTable)
          .set({ isCompleted: true })
          .where(and(eq(pgTable.id, id), eq(pgTable.isCompleted, false)))
          .returning();
    return rows.length > 0;
  }

  /** Re-arms a repeating reminder for its next occurrence. */
  async reschedule(id: string, triggerAt: Date, tx?: DatabaseClient): Promise<Reminder> {
    return this.update(id, { triggerAt, isCompleted: false }, tx);
  }

  /** Deletes a reminder only if it belongs to `userId`. */
  async deleteForUser(id: string, userId: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    const rows = this.isSqlite(client)
      ? await client.db
          .delete(sqliteTable)
          .where(and(eq(sqliteTable.id, id), eq(sqliteTable.userId, userId)))
          .returning()
      : await client.db
          .delete(pgTable)
          .where(and(eq(pgTable.id, id), eq(pgTable.userId, userId)))
          .returning();
    return rows.length > 0;
  }
}
