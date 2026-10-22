import { eq, sql } from 'drizzle-orm';
import { DatabaseError } from '@ririko/core';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type { LevelRoleSettings, NewLevelRoleSettings } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';

/** The settings a server admin edits. `guildId` is the key. */
export type LevelRoleSettingsPatch = Partial<Omit<NewLevelRoleSettings, 'guildId'>>;

/**
 * Level role settings (STORY-200): one row per server, keyed by guild id. `rewards` is the list of
 * { level, roleId } pairs. A server with no row has no rewards. The row is created the first time
 * settings are saved.
 */
export class LevelRoleSettingsRepository extends BaseRepository<
  LevelRoleSettings,
  NewLevelRoleSettings,
  LevelRoleSettingsPatch,
  string
> {
  /** The server's settings, or null when nobody has saved any yet (there are then no rewards). */
  async get(guildId: string, tx?: DatabaseClient): Promise<LevelRoleSettings | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.levelRoleSettings)
        .where(eq(sqliteSchema.levelRoleSettings.guildId, guildId));
      return (row as LevelRoleSettings) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.levelRoleSettings)
        .where(eq(pgSchema.levelRoleSettings.guildId, guildId));
      return (row as unknown as LevelRoleSettings) ?? null;
    }
  }

  /** Creates the settings row or changes the given fields of it. Other fields are kept. */
  async upsert(
    guildId: string,
    patch: LevelRoleSettingsPatch,
    tx?: DatabaseClient,
  ): Promise<LevelRoleSettings> {
    const client = this.getClient(tx);
    const payload = { ...patch, updatedAt: new Date() };

    if (this.isSqlite(client)) {
      const [upserted] = await client.db
        .insert(sqliteSchema.levelRoleSettings)
        .values({ guildId, ...payload })
        .onConflictDoUpdate({ target: sqliteSchema.levelRoleSettings.guildId, set: payload })
        .returning();
      if (!upserted) throw new DatabaseError(`Failed to upsert level role settings for ${guildId}`);
      return upserted as LevelRoleSettings;
    } else {
      const [upserted] = await client.db
        .insert(pgSchema.levelRoleSettings)
        .values({
          guildId,
          ...payload,
        } as unknown as typeof pgSchema.levelRoleSettings.$inferInsert)
        .onConflictDoUpdate({
          target: pgSchema.levelRoleSettings.guildId,
          set: payload as unknown as Partial<typeof pgSchema.levelRoleSettings.$inferInsert>,
        })
        .returning();
      if (!upserted) throw new DatabaseError(`Failed to upsert level role settings for ${guildId}`);
      return upserted as unknown as LevelRoleSettings;
    }
  }

  // ==========================================
  // BaseRepository contract (the guild id is the id)
  // ==========================================

  async findById(id: string, tx?: DatabaseClient): Promise<LevelRoleSettings | null> {
    return this.get(id, tx);
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    return (await this.get(id, tx)) !== null;
  }

  /** Inserts a settings row for `data.guildId`. Prefer `upsert`, which also changes one. */
  async create(data: NewLevelRoleSettings, tx?: DatabaseClient): Promise<LevelRoleSettings> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.levelRoleSettings)
        .values(data)
        .returning();
      if (!created) {
        throw new DatabaseError(`Failed to insert level role settings for ${data.guildId}`);
      }
      return created as LevelRoleSettings;
    } else {
      const [created] = await client.db
        .insert(pgSchema.levelRoleSettings)
        .values(data as unknown as typeof pgSchema.levelRoleSettings.$inferInsert)
        .returning();
      if (!created) {
        throw new DatabaseError(`Failed to insert level role settings for ${data.guildId}`);
      }
      return created as unknown as LevelRoleSettings;
    }
  }

  async update(
    id: string,
    data: LevelRoleSettingsPatch,
    tx?: DatabaseClient,
  ): Promise<LevelRoleSettings> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [updated] = await client.db
        .update(sqliteSchema.levelRoleSettings)
        .set(data)
        .where(eq(sqliteSchema.levelRoleSettings.guildId, id))
        .returning();
      if (!updated) throw new DatabaseError(`Level role settings for ${id} not found for update`);
      return updated as LevelRoleSettings;
    } else {
      const [updated] = await client.db
        .update(pgSchema.levelRoleSettings)
        .set(data as unknown as Partial<typeof pgSchema.levelRoleSettings.$inferInsert>)
        .where(eq(pgSchema.levelRoleSettings.guildId, id))
        .returning();
      if (!updated) throw new DatabaseError(`Level role settings for ${id} not found for update`);
      return updated as unknown as LevelRoleSettings;
    }
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .delete(sqliteSchema.levelRoleSettings)
        .where(eq(sqliteSchema.levelRoleSettings.guildId, id))
        .returning({ guildId: sqliteSchema.levelRoleSettings.guildId });
      return rows.length > 0;
    } else {
      const rows = await client.db
        .delete(pgSchema.levelRoleSettings)
        .where(eq(pgSchema.levelRoleSettings.guildId, id))
        .returning({ guildId: pgSchema.levelRoleSettings.guildId });
      return rows.length > 0;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.levelRoleSettings);
      return Number(row?.count ?? 0);
    } else {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.levelRoleSettings);
      return Number(row?.count ?? 0);
    }
  }
}
