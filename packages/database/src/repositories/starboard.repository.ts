import { eq, sql } from 'drizzle-orm';
import { DatabaseError } from '@ririko/core';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type {
  NewStarboardPost,
  NewStarboardSettings,
  StarboardPost,
  StarboardSettings,
} from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';

/** The settings a server admin edits. `guildId` is the key. */
export type StarboardSettingsPatch = Partial<Omit<NewStarboardSettings, 'guildId'>>;

/** What changes on a starred message. The message id is the key; `createdAt` never changes. */
export type StarboardPostPatch = Partial<
  Omit<NewStarboardPost, 'messageId' | 'guildId' | 'createdAt'>
>;

/**
 * Starboard settings and starred messages (STORY-201). The BaseRepository contract is over the
 * posts, with the original message id as the id. `insertPost` is duplicate-safe, because reaction
 * events come in bursts: the first insert for a message wins and the others return false.
 */
export class StarboardRepository extends BaseRepository<
  StarboardPost,
  NewStarboardPost,
  StarboardPostPatch,
  string
> {
  // ==========================================
  // SETTINGS
  // ==========================================

  /** The server's settings, or null when nobody has saved any yet (the starboard is then off). */
  async getSettings(guildId: string, tx?: DatabaseClient): Promise<StarboardSettings | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.starboardSettings)
        .where(eq(sqliteSchema.starboardSettings.guildId, guildId));
      return (row as StarboardSettings) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.starboardSettings)
        .where(eq(pgSchema.starboardSettings.guildId, guildId));
      return (row as unknown as StarboardSettings) ?? null;
    }
  }

  /** Creates the settings row or changes the given fields of it. Other fields are kept. */
  async upsertSettings(
    guildId: string,
    patch: StarboardSettingsPatch,
    tx?: DatabaseClient,
  ): Promise<StarboardSettings> {
    const client = this.getClient(tx);
    const payload = { ...patch, updatedAt: new Date() };

    if (this.isSqlite(client)) {
      const [upserted] = await client.db
        .insert(sqliteSchema.starboardSettings)
        .values({ guildId, ...payload })
        .onConflictDoUpdate({ target: sqliteSchema.starboardSettings.guildId, set: payload })
        .returning();
      if (!upserted) throw new DatabaseError(`Failed to upsert starboard settings for ${guildId}`);
      return upserted as StarboardSettings;
    } else {
      const [upserted] = await client.db
        .insert(pgSchema.starboardSettings)
        .values({
          guildId,
          ...payload,
        } as unknown as typeof pgSchema.starboardSettings.$inferInsert)
        .onConflictDoUpdate({
          target: pgSchema.starboardSettings.guildId,
          set: payload as unknown as Partial<typeof pgSchema.starboardSettings.$inferInsert>,
        })
        .returning();
      if (!upserted) throw new DatabaseError(`Failed to upsert starboard settings for ${guildId}`);
      return upserted as unknown as StarboardSettings;
    }
  }

  // ==========================================
  // POSTS
  // ==========================================

  /** The record of a starred message, found by the id of the original message. */
  async findByMessage(messageId: string, tx?: DatabaseClient): Promise<StarboardPost | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.starboardPosts)
        .where(eq(sqliteSchema.starboardPosts.messageId, messageId));
      return (row as StarboardPost) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.starboardPosts)
        .where(eq(pgSchema.starboardPosts.messageId, messageId));
      return (row as unknown as StarboardPost) ?? null;
    }
  }

  /** The record of a starred message, found by the id of its copy in the starboard channel. */
  async findByStarboardMessage(
    starboardMessageId: string,
    tx?: DatabaseClient,
  ): Promise<StarboardPost | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.starboardPosts)
        .where(eq(sqliteSchema.starboardPosts.starboardMessageId, starboardMessageId));
      return (row as StarboardPost) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.starboardPosts)
        .where(eq(pgSchema.starboardPosts.starboardMessageId, starboardMessageId));
      return (row as unknown as StarboardPost) ?? null;
    }
  }

  /**
   * Inserts the record of a starred message. Returns true when this call inserted it, and false
   * when a record for that message (or for that starboard copy) already exists, so two reactions
   * that arrive together post one copy.
   */
  async insertPost(data: NewStarboardPost, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .insert(sqliteSchema.starboardPosts)
        .values(data)
        .onConflictDoNothing()
        .returning({ messageId: sqliteSchema.starboardPosts.messageId });
      return rows.length > 0;
    } else {
      const rows = await client.db
        .insert(pgSchema.starboardPosts)
        .values(data as unknown as typeof pgSchema.starboardPosts.$inferInsert)
        .onConflictDoNothing()
        .returning({ messageId: pgSchema.starboardPosts.messageId });
      return rows.length > 0;
    }
  }

  /** Changes the given fields of a record. Returns the record, or null when there is none. */
  async updatePost(
    messageId: string,
    patch: StarboardPostPatch,
    tx?: DatabaseClient,
  ): Promise<StarboardPost | null> {
    const client = this.getClient(tx);
    const payload = { ...patch, updatedAt: new Date() };
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .update(sqliteSchema.starboardPosts)
        .set(payload)
        .where(eq(sqliteSchema.starboardPosts.messageId, messageId))
        .returning();
      return (row as StarboardPost) ?? null;
    } else {
      const [row] = await client.db
        .update(pgSchema.starboardPosts)
        .set(payload as unknown as Partial<typeof pgSchema.starboardPosts.$inferInsert>)
        .where(eq(pgSchema.starboardPosts.messageId, messageId))
        .returning();
      return (row as unknown as StarboardPost) ?? null;
    }
  }

  /** Removes the record of a starred message. Returns true when there was one. */
  async deletePost(messageId: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .delete(sqliteSchema.starboardPosts)
        .where(eq(sqliteSchema.starboardPosts.messageId, messageId))
        .returning({ messageId: sqliteSchema.starboardPosts.messageId });
      return rows.length > 0;
    } else {
      const rows = await client.db
        .delete(pgSchema.starboardPosts)
        .where(eq(pgSchema.starboardPosts.messageId, messageId))
        .returning({ messageId: pgSchema.starboardPosts.messageId });
      return rows.length > 0;
    }
  }

  // ==========================================
  // BaseRepository contract (the original message id is the id)
  // ==========================================

  async findById(id: string, tx?: DatabaseClient): Promise<StarboardPost | null> {
    return this.findByMessage(id, tx);
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    return (await this.findByMessage(id, tx)) !== null;
  }

  /** Inserts a record and returns it. Throws when one already exists; `insertPost` does not. */
  async create(data: NewStarboardPost, tx?: DatabaseClient): Promise<StarboardPost> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.starboardPosts)
        .values(data)
        .returning();
      if (!created) throw new DatabaseError(`Failed to insert starboard post ${data.messageId}`);
      return created as StarboardPost;
    } else {
      const [created] = await client.db
        .insert(pgSchema.starboardPosts)
        .values(data as unknown as typeof pgSchema.starboardPosts.$inferInsert)
        .returning();
      if (!created) throw new DatabaseError(`Failed to insert starboard post ${data.messageId}`);
      return created as unknown as StarboardPost;
    }
  }

  async update(id: string, data: StarboardPostPatch, tx?: DatabaseClient): Promise<StarboardPost> {
    const updated = await this.updatePost(id, data, tx);
    if (!updated) throw new DatabaseError(`Starboard post ${id} not found for update`);
    return updated;
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    return this.deletePost(id, tx);
  }

  /** How many starred messages are recorded, over every server. */
  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.starboardPosts);
      return Number(row?.count ?? 0);
    } else {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.starboardPosts);
      return Number(row?.count ?? 0);
    }
  }
}
