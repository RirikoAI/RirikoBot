import { eq, sql } from 'drizzle-orm';
import { DatabaseError } from '@ririko/core';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type { EventLogSettings, NewEventLogSettings } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';

/** The settings a server admin edits. `guildId` is the key. */
export type EventLogSettingsPatch = Partial<Omit<NewEventLogSettings, 'guildId'>>;

/**
 * Event log settings (STORY-199): one row per server, keyed by guild id. A category channel that
 * is null means that category is off. The row is created the first time settings are saved.
 */
export class EventLogSettingsRepository extends BaseRepository<
  EventLogSettings,
  NewEventLogSettings,
  EventLogSettingsPatch,
  string
> {
  /** The server's settings, or null when nobody has saved any yet (event logs are then off). */
  async get(guildId: string, tx?: DatabaseClient): Promise<EventLogSettings | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.eventLogSettings)
        .where(eq(sqliteSchema.eventLogSettings.guildId, guildId));
      return (row as EventLogSettings) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.eventLogSettings)
        .where(eq(pgSchema.eventLogSettings.guildId, guildId));
      return (row as unknown as EventLogSettings) ?? null;
    }
  }

  /** Creates the settings row or changes the given fields of it. Other fields are kept. */
  async upsert(
    guildId: string,
    patch: EventLogSettingsPatch,
    tx?: DatabaseClient,
  ): Promise<EventLogSettings> {
    const client = this.getClient(tx);
    const payload = { ...patch, updatedAt: new Date() };

    if (this.isSqlite(client)) {
      const [upserted] = await client.db
        .insert(sqliteSchema.eventLogSettings)
        .values({ guildId, ...payload })
        .onConflictDoUpdate({ target: sqliteSchema.eventLogSettings.guildId, set: payload })
        .returning();
      if (!upserted) throw new DatabaseError(`Failed to upsert event log settings for ${guildId}`);
      return upserted as EventLogSettings;
    } else {
      const [upserted] = await client.db
        .insert(pgSchema.eventLogSettings)
        .values({
          guildId,
          ...payload,
        } as unknown as typeof pgSchema.eventLogSettings.$inferInsert)
        .onConflictDoUpdate({
          target: pgSchema.eventLogSettings.guildId,
          set: payload as unknown as Partial<typeof pgSchema.eventLogSettings.$inferInsert>,
        })
        .returning();
      if (!upserted) throw new DatabaseError(`Failed to upsert event log settings for ${guildId}`);
      return upserted as unknown as EventLogSettings;
    }
  }

  // ==========================================
  // BaseRepository contract (the guild id is the id)
  // ==========================================

  async findById(id: string, tx?: DatabaseClient): Promise<EventLogSettings | null> {
    return this.get(id, tx);
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    return (await this.get(id, tx)) !== null;
  }

  /** Inserts a settings row for `data.guildId`. Prefer `upsert`, which also changes one. */
  async create(data: NewEventLogSettings, tx?: DatabaseClient): Promise<EventLogSettings> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.eventLogSettings)
        .values(data)
        .returning();
      if (!created) {
        throw new DatabaseError(`Failed to insert event log settings for ${data.guildId}`);
      }
      return created as EventLogSettings;
    } else {
      const [created] = await client.db
        .insert(pgSchema.eventLogSettings)
        .values(data as unknown as typeof pgSchema.eventLogSettings.$inferInsert)
        .returning();
      if (!created) {
        throw new DatabaseError(`Failed to insert event log settings for ${data.guildId}`);
      }
      return created as unknown as EventLogSettings;
    }
  }

  async update(
    id: string,
    data: EventLogSettingsPatch,
    tx?: DatabaseClient,
  ): Promise<EventLogSettings> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [updated] = await client.db
        .update(sqliteSchema.eventLogSettings)
        .set(data)
        .where(eq(sqliteSchema.eventLogSettings.guildId, id))
        .returning();
      if (!updated) throw new DatabaseError(`Event log settings for ${id} not found for update`);
      return updated as EventLogSettings;
    } else {
      const [updated] = await client.db
        .update(pgSchema.eventLogSettings)
        .set(data as unknown as Partial<typeof pgSchema.eventLogSettings.$inferInsert>)
        .where(eq(pgSchema.eventLogSettings.guildId, id))
        .returning();
      if (!updated) throw new DatabaseError(`Event log settings for ${id} not found for update`);
      return updated as unknown as EventLogSettings;
    }
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .delete(sqliteSchema.eventLogSettings)
        .where(eq(sqliteSchema.eventLogSettings.guildId, id))
        .returning({ guildId: sqliteSchema.eventLogSettings.guildId });
      return rows.length > 0;
    } else {
      const rows = await client.db
        .delete(pgSchema.eventLogSettings)
        .where(eq(pgSchema.eventLogSettings.guildId, id))
        .returning({ guildId: pgSchema.eventLogSettings.guildId });
      return rows.length > 0;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.eventLogSettings);
      return Number(row?.count ?? 0);
    } else {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.eventLogSettings);
      return Number(row?.count ?? 0);
    }
  }
}
