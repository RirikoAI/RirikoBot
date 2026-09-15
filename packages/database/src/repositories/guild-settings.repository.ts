import { eq, sql } from 'drizzle-orm';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type { GuildSettings, NewGuildSettings } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';

export class GuildSettingsRepository extends BaseRepository<
  GuildSettings,
  NewGuildSettings,
  Partial<NewGuildSettings>
> {
  async findById(guildId: string, tx?: DatabaseClient): Promise<GuildSettings | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.guildSettings)
        .where(eq(sqliteSchema.guildSettings.guildId, guildId));
      return (row as GuildSettings) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.guildSettings)
        .where(eq(pgSchema.guildSettings.guildId, guildId));
      return (row as unknown as GuildSettings) ?? null;
    }
  }

  async getByGuildId(guildId: string, tx?: DatabaseClient): Promise<GuildSettings | null> {
    return this.findById(guildId, tx);
  }

  async exists(guildId: string, tx?: DatabaseClient): Promise<boolean> {
    const settings = await this.findById(guildId, tx);
    return settings !== null;
  }

  async create(data: NewGuildSettings, tx?: DatabaseClient): Promise<GuildSettings> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [created] = await client.db.insert(sqliteSchema.guildSettings).values(data).returning();
      if (!created) throw new DatabaseError(`Failed to create settings for guild ${data.guildId}`);
      return created as GuildSettings;
    } else {
      const [created] = await client.db
        .insert(pgSchema.guildSettings)
        .values(data as unknown as typeof pgSchema.guildSettings.$inferInsert)
        .returning();
      if (!created) throw new DatabaseError(`Failed to create settings for guild ${data.guildId}`);
      return created as unknown as GuildSettings;
    }
  }

  async update(
    guildId: string,
    data: Partial<NewGuildSettings>,
    tx?: DatabaseClient,
  ): Promise<GuildSettings> {
    const client = this.getClient(tx);
    const updateData = { ...data, updatedAt: new Date() };

    if (this.isSqlite(client)) {
      const [updated] = await client.db
        .update(sqliteSchema.guildSettings)
        .set(updateData)
        .where(eq(sqliteSchema.guildSettings.guildId, guildId))
        .returning();
      if (!updated)
        throw new DatabaseError(`Guild settings for guild ${guildId} not found for update`);
      return updated as GuildSettings;
    } else {
      const [updated] = await client.db
        .update(pgSchema.guildSettings)
        .set(updateData as unknown as Partial<typeof pgSchema.guildSettings.$inferInsert>)
        .where(eq(pgSchema.guildSettings.guildId, guildId))
        .returning();
      if (!updated)
        throw new DatabaseError(`Guild settings for guild ${guildId} not found for update`);
      return updated as unknown as GuildSettings;
    }
  }

  async upsert(data: NewGuildSettings, tx?: DatabaseClient): Promise<GuildSettings> {
    const client = this.getClient(tx);
    const now = new Date();

    if (this.isSqlite(client)) {
      const [upserted] = await client.db
        .insert(sqliteSchema.guildSettings)
        .values(data)
        .onConflictDoUpdate({
          target: sqliteSchema.guildSettings.guildId,
          set: {
            ...data,
            updatedAt: now,
          },
        })
        .returning();
      if (!upserted) throw new DatabaseError(`Failed to upsert settings for guild ${data.guildId}`);
      return upserted as GuildSettings;
    } else {
      const [upserted] = await client.db
        .insert(pgSchema.guildSettings)
        .values(data as unknown as typeof pgSchema.guildSettings.$inferInsert)
        .onConflictDoUpdate({
          target: pgSchema.guildSettings.guildId,
          set: {
            ...(data as unknown as Partial<typeof pgSchema.guildSettings.$inferInsert>),
            updatedAt: now,
          },
        })
        .returning();
      if (!upserted) throw new DatabaseError(`Failed to upsert settings for guild ${data.guildId}`);
      return upserted as unknown as GuildSettings;
    }
  }

  async delete(guildId: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const deleted = await client.db
        .delete(sqliteSchema.guildSettings)
        .where(eq(sqliteSchema.guildSettings.guildId, guildId))
        .returning({ guildId: sqliteSchema.guildSettings.guildId });
      return deleted.length > 0;
    } else {
      const deleted = await client.db
        .delete(pgSchema.guildSettings)
        .where(eq(pgSchema.guildSettings.guildId, guildId))
        .returning({ guildId: pgSchema.guildSettings.guildId });
      return deleted.length > 0;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.guildSettings);
      return Number(res?.count ?? 0);
    } else {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.guildSettings);
      return Number(res?.count ?? 0);
    }
  }

  async setPrefix(guildId: string, prefix: string, tx?: DatabaseClient): Promise<GuildSettings> {
    return this.upsert({ guildId, prefix }, tx);
  }

  async getOrCreate(
    guildId: string,
    defaults?: Partial<NewGuildSettings>,
    tx?: DatabaseClient,
  ): Promise<GuildSettings> {
    const existing = await this.findById(guildId, tx);
    if (existing) return existing;

    return this.create(
      {
        guildId,
        prefix: defaults?.prefix ?? '!',
        locale: defaults?.locale ?? 'en-US',
        timezone: defaults?.timezone ?? 'UTC',
        ...defaults,
      },
      tx,
    );
  }
}
