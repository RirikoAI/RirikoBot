import { eq, sql } from 'drizzle-orm';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type { User, NewUser } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';

export class UserRepository extends BaseRepository<User, NewUser, Partial<NewUser>> {
  async findById(id: string, tx?: DatabaseClient): Promise<User | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.users)
        .where(eq(sqliteSchema.users.id, id));
      return (row as User) ?? null;
    } else {
      const [row] = await client.db.select().from(pgSchema.users).where(eq(pgSchema.users.id, id));
      return (row as unknown as User) ?? null;
    }
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    const user = await this.findById(id, tx);
    return user !== null;
  }

  async create(data: NewUser, tx?: DatabaseClient): Promise<User> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [created] = await client.db.insert(sqliteSchema.users).values(data).returning();
      if (!created) throw new DatabaseError(`Failed to create user with id ${data.id}`);
      return created as User;
    } else {
      const [created] = await client.db
        .insert(pgSchema.users)
        .values(data as unknown as typeof pgSchema.users.$inferInsert)
        .returning();
      if (!created) throw new DatabaseError(`Failed to create user with id ${data.id}`);
      return created as unknown as User;
    }
  }

  async update(id: string, data: Partial<NewUser>, tx?: DatabaseClient): Promise<User> {
    const client = this.getClient(tx);
    const updateData = { ...data, updatedAt: new Date() };

    if (this.isSqlite(client)) {
      const [updated] = await client.db
        .update(sqliteSchema.users)
        .set(updateData)
        .where(eq(sqliteSchema.users.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`User with id ${id} not found for update`);
      return updated as User;
    } else {
      const [updated] = await client.db
        .update(pgSchema.users)
        .set(updateData as unknown as Partial<typeof pgSchema.users.$inferInsert>)
        .where(eq(pgSchema.users.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`User with id ${id} not found for update`);
      return updated as unknown as User;
    }
  }

  async upsert(data: NewUser, tx?: DatabaseClient): Promise<User> {
    const client = this.getClient(tx);
    const now = new Date();

    if (this.isSqlite(client)) {
      const [upserted] = await client.db
        .insert(sqliteSchema.users)
        .values(data)
        .onConflictDoUpdate({
          target: sqliteSchema.users.id,
          set: {
            ...data,
            updatedAt: now,
          },
        })
        .returning();
      if (!upserted) throw new DatabaseError(`Failed to upsert user ${data.id}`);
      return upserted as User;
    } else {
      const [upserted] = await client.db
        .insert(pgSchema.users)
        .values(data as unknown as typeof pgSchema.users.$inferInsert)
        .onConflictDoUpdate({
          target: pgSchema.users.id,
          set: {
            ...(data as unknown as Partial<typeof pgSchema.users.$inferInsert>),
            updatedAt: now,
          },
        })
        .returning();
      if (!upserted) throw new DatabaseError(`Failed to upsert user ${data.id}`);
      return upserted as unknown as User;
    }
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const deleted = await client.db
        .delete(sqliteSchema.users)
        .where(eq(sqliteSchema.users.id, id))
        .returning({ id: sqliteSchema.users.id });
      return deleted.length > 0;
    } else {
      const deleted = await client.db
        .delete(pgSchema.users)
        .where(eq(pgSchema.users.id, id))
        .returning({ id: pgSchema.users.id });
      return deleted.length > 0;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.users);
      return Number(res?.count ?? 0);
    } else {
      const [res] = await client.db.select({ count: sql<number>`count(*)` }).from(pgSchema.users);
      return Number(res?.count ?? 0);
    }
  }

  async setBlacklist(
    id: string,
    blacklisted: boolean,
    _reason?: string | null,
    tx?: DatabaseClient,
  ): Promise<User> {
    return this.update(id, { isBlacklisted: blacklisted }, tx);
  }

  async incrementWarnCount(id: string, tx?: DatabaseClient): Promise<number> {
    const user = await this.findById(id, tx);
    if (!user) throw new DatabaseError(`User with id ${id} not found`);
    const newCount = user.warnCount + 1;
    await this.update(id, { warnCount: newCount }, tx);
    return newCount;
  }
}
