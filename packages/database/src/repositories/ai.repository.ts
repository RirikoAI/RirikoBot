import { eq, and, desc, inArray, isNotNull, isNull, lt, notExists, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { BaseRepository } from './base.js';
import { PURGE_BATCH_SIZE, deleteInBatches } from './retention.js';
import { withTransaction } from '../transactions/index.js';
import type { DatabaseClient } from '../client/types.js';
import type {
  AiConversation,
  NewAiConversation,
  AiMessage,
  NewAiMessage,
  AiGuildPreferences,
  NewAiGuildPreferences,
  AiUserPreferences,
  NewAiUserPreferences,
} from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';

export interface UserContextFilter {
  userId: string;
  guildId?: string | null | undefined;
  channelId?: string | null | undefined;
}

export type InsertAiConversation = Omit<NewAiConversation, 'id'> & { id?: string | undefined };
export type InsertAiMessage = Omit<NewAiMessage, 'id'> & { id?: string | undefined };

export class AiRepository extends BaseRepository<
  AiConversation,
  InsertAiConversation,
  Partial<NewAiConversation>
> {
  /** A fresh row ID in the readable `conv_<uuid>` form; both dialects store these as text. */
  private newId(prefix: 'conv' | 'msg'): string {
    return `${prefix}_${randomUUID()}`;
  }

  // --- BaseRepository Compliance ---

  async findById(id: string, tx?: DatabaseClient): Promise<AiConversation | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.aiConversations)
        .where(eq(sqliteSchema.aiConversations.id, id));
      return (row as AiConversation) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.aiConversations)
        .where(eq(pgSchema.aiConversations.id, id));
      return (row as unknown as AiConversation) ?? null;
    }
  }

  async create(data: InsertAiConversation, tx?: DatabaseClient): Promise<AiConversation> {
    const client = this.getClient(tx);
    const id = data.id ?? this.newId('conv');
    const insertData = { ...data, id };

    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.aiConversations)
        .values(insertData)
        .returning();
      if (!created) throw new DatabaseError(`Failed to create AI conversation ${id}`);
      return created as AiConversation;
    } else {
      const [created] = await client.db
        .insert(pgSchema.aiConversations)
        .values(insertData as unknown as typeof pgSchema.aiConversations.$inferInsert)
        .returning();
      if (!created) throw new DatabaseError(`Failed to create AI conversation ${id}`);
      return created as unknown as AiConversation;
    }
  }

  async update(
    id: string,
    data: Partial<NewAiConversation>,
    tx?: DatabaseClient,
  ): Promise<AiConversation> {
    const client = this.getClient(tx);
    const updateData = { ...data, updatedAt: new Date() };

    if (this.isSqlite(client)) {
      const [updated] = await client.db
        .update(sqliteSchema.aiConversations)
        .set(updateData)
        .where(eq(sqliteSchema.aiConversations.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`AI conversation ${id} not found for update`);
      return updated as AiConversation;
    } else {
      const [updated] = await client.db
        .update(pgSchema.aiConversations)
        .set(updateData as unknown as Partial<typeof pgSchema.aiConversations.$inferInsert>)
        .where(eq(pgSchema.aiConversations.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`AI conversation ${id} not found for update`);
      return updated as unknown as AiConversation;
    }
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    const conv = await this.findById(id, tx);
    return conv !== null;
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      await client.db
        .delete(sqliteSchema.aiMessages)
        .where(eq(sqliteSchema.aiMessages.conversationId, id));

      const deleted = await client.db
        .delete(sqliteSchema.aiConversations)
        .where(eq(sqliteSchema.aiConversations.id, id))
        .returning({ id: sqliteSchema.aiConversations.id });
      return deleted.length > 0;
    } else {
      await client.db.delete(pgSchema.aiMessages).where(eq(pgSchema.aiMessages.conversationId, id));

      const deleted = await client.db
        .delete(pgSchema.aiConversations)
        .where(eq(pgSchema.aiConversations.id, id))
        .returning({ id: pgSchema.aiConversations.id });
      return deleted.length > 0;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.aiConversations);
      return res?.count ?? 0;
    } else {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.aiConversations);
      return Number(res?.count ?? 0);
    }
  }

  // --- Dedicated AI Channel Mapping ---

  async getAiChannel(guildId: string, tx?: DatabaseClient): Promise<string | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.aiChannels)
        .where(eq(sqliteSchema.aiChannels.guildId, guildId));
      return row?.channelId ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.aiChannels)
        .where(eq(pgSchema.aiChannels.guildId, guildId));
      return row?.channelId ?? null;
    }
  }

  async setAiChannel(guildId: string, channelId: string, tx?: DatabaseClient): Promise<void> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      await client.db
        .insert(sqliteSchema.aiChannels)
        .values({ guildId, channelId })
        .onConflictDoUpdate({
          target: sqliteSchema.aiChannels.guildId,
          set: { channelId },
        });
    } else {
      await client.db
        .insert(pgSchema.aiChannels)
        .values({ guildId, channelId })
        .onConflictDoUpdate({
          target: pgSchema.aiChannels.guildId,
          set: { channelId },
        });
    }
  }

  async removeAiChannel(guildId: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const deleted = await client.db
        .delete(sqliteSchema.aiChannels)
        .where(eq(sqliteSchema.aiChannels.guildId, guildId))
        .returning();
      return deleted.length > 0;
    } else {
      const deleted = await client.db
        .delete(pgSchema.aiChannels)
        .where(eq(pgSchema.aiChannels.guildId, guildId))
        .returning();
      return deleted.length > 0;
    }
  }

  // --- Strict Per-User Context Isolation ---

  async findConversationByUserContext(
    filter: UserContextFilter,
    tx?: DatabaseClient,
  ): Promise<AiConversation | null> {
    const client = this.getClient(tx);
    const { userId, guildId, channelId } = filter;

    if (this.isSqlite(client)) {
      const conditions = [eq(sqliteSchema.aiConversations.userId, userId)];
      if (guildId) {
        conditions.push(eq(sqliteSchema.aiConversations.guildId, guildId));
      } else {
        conditions.push(isNull(sqliteSchema.aiConversations.guildId));
      }

      if (channelId) {
        conditions.push(eq(sqliteSchema.aiConversations.channelId, channelId));
      } else {
        conditions.push(isNull(sqliteSchema.aiConversations.channelId));
      }

      const [row] = await client.db
        .select()
        .from(sqliteSchema.aiConversations)
        .where(and(...conditions))
        .orderBy(desc(sqliteSchema.aiConversations.updatedAt))
        .limit(1);

      return (row as AiConversation) ?? null;
    } else {
      const conditions = [eq(pgSchema.aiConversations.userId, userId)];
      if (guildId) {
        conditions.push(eq(pgSchema.aiConversations.guildId, guildId));
      } else {
        conditions.push(isNull(pgSchema.aiConversations.guildId));
      }

      if (channelId) {
        conditions.push(eq(pgSchema.aiConversations.channelId, channelId));
      } else {
        conditions.push(isNull(pgSchema.aiConversations.channelId));
      }

      const [row] = await client.db
        .select()
        .from(pgSchema.aiConversations)
        .where(and(...conditions))
        .orderBy(desc(pgSchema.aiConversations.updatedAt))
        .limit(1);

      return (row as unknown as AiConversation) ?? null;
    }
  }

  async getOrCreateConversation(
    filter: UserContextFilter & { provider?: string; model?: string },
    tx?: DatabaseClient,
  ): Promise<AiConversation> {
    const existing = await this.findConversationByUserContext(filter, tx);
    if (existing) {
      // Touch updatedAt
      return this.update(existing.id, { updatedAt: new Date() }, tx);
    }

    return this.create(
      {
        userId: filter.userId,
        guildId: filter.guildId ?? null,
        channelId: filter.channelId ?? null,
        provider: filter.provider ?? 'GEMINI',
        model: filter.model ?? 'gemini-2.5-flash',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      tx,
    );
  }

  async clearConversation(conversationId: string, tx?: DatabaseClient): Promise<void> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      await client.db
        .delete(sqliteSchema.aiMessages)
        .where(eq(sqliteSchema.aiMessages.conversationId, conversationId));
      await client.db
        .update(sqliteSchema.aiConversations)
        .set({ summary: null, updatedAt: new Date() })
        .where(eq(sqliteSchema.aiConversations.id, conversationId));
    } else {
      await client.db
        .delete(pgSchema.aiMessages)
        .where(eq(pgSchema.aiMessages.conversationId, conversationId));
      await client.db
        .update(pgSchema.aiConversations)
        .set({ summary: null, updatedAt: new Date() })
        .where(eq(pgSchema.aiConversations.id, conversationId));
    }
  }

  async clearUserContext(filter: UserContextFilter, tx?: DatabaseClient): Promise<boolean> {
    const conv = await this.findConversationByUserContext(filter, tx);
    if (!conv) return false;
    await this.clearConversation(conv.id, tx);
    return true;
  }

  /**
   * Deletes every AI conversation of the user, in every server and channel, with all their
   * messages, in one transaction. Returns how many conversations were removed. User and guild
   * preferences are not touched.
   */
  async clearAllForUser(userId: string, tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    return withTransaction(client, async (txClient) => {
      if (this.isSqlite(txClient)) {
        const owned = txClient.db
          .select({ id: sqliteSchema.aiConversations.id })
          .from(sqliteSchema.aiConversations)
          .where(eq(sqliteSchema.aiConversations.userId, userId));
        await txClient.db
          .delete(sqliteSchema.aiMessages)
          .where(inArray(sqliteSchema.aiMessages.conversationId, owned));
        const removed = await txClient.db
          .delete(sqliteSchema.aiConversations)
          .where(eq(sqliteSchema.aiConversations.userId, userId))
          .returning({ id: sqliteSchema.aiConversations.id });
        return removed.length;
      }
      const owned = txClient.db
        .select({ id: pgSchema.aiConversations.id })
        .from(pgSchema.aiConversations)
        .where(eq(pgSchema.aiConversations.userId, userId));
      await txClient.db
        .delete(pgSchema.aiMessages)
        .where(inArray(pgSchema.aiMessages.conversationId, owned));
      const removed = await txClient.db
        .delete(pgSchema.aiConversations)
        .where(eq(pgSchema.aiConversations.userId, userId))
        .returning({ id: pgSchema.aiConversations.id });
      return removed.length;
    });
  }

  // --- Data Retention ---

  /**
   * Retention purge for AI chat (STORY-193). In batches of `batchSize`, so a large table never
   * runs as one statement: deletes messages created before `cutoff`; deletes conversations last
   * updated before `cutoff` that have no message left; and clears the `summary` (text derived
   * from chat) of every conversation last updated before `cutoff`. Rows at or after `cutoff` are
   * never touched. Returns the messages and conversations deleted; cleared summaries are not
   * counted.
   */
  async deleteOlderThan(
    cutoff: Date,
    tx?: DatabaseClient,
    batchSize: number = PURGE_BATCH_SIZE,
  ): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const { db } = client;
      const conv = sqliteSchema.aiConversations;
      const msg = sqliteSchema.aiMessages;
      const messages = await deleteInBatches(batchSize, async () => {
        const res = await db
          .delete(msg)
          .where(
            inArray(
              msg.id,
              db.select({ id: msg.id }).from(msg).where(lt(msg.createdAt, cutoff)).limit(batchSize),
            ),
          );
        return res.changes;
      });
      const conversations = await deleteInBatches(batchSize, async () => {
        const res = await db.delete(conv).where(
          inArray(
            conv.id,
            db
              .select({ id: conv.id })
              .from(conv)
              .where(
                and(
                  lt(conv.updatedAt, cutoff),
                  notExists(
                    db
                      .select({ one: sql`1` })
                      .from(msg)
                      .where(eq(msg.conversationId, conv.id)),
                  ),
                ),
              )
              .limit(batchSize),
          ),
        );
        return res.changes;
      });
      await deleteInBatches(batchSize, async () => {
        const res = await db
          .update(conv)
          .set({ summary: null })
          .where(
            inArray(
              conv.id,
              db
                .select({ id: conv.id })
                .from(conv)
                .where(and(lt(conv.updatedAt, cutoff), isNotNull(conv.summary)))
                .limit(batchSize),
            ),
          );
        return res.changes;
      });
      return messages + conversations;
    }

    const { db } = client;
    const conv = pgSchema.aiConversations;
    const msg = pgSchema.aiMessages;
    const messages = await deleteInBatches(batchSize, async () => {
      const res = await db
        .delete(msg)
        .where(
          inArray(
            msg.id,
            db.select({ id: msg.id }).from(msg).where(lt(msg.createdAt, cutoff)).limit(batchSize),
          ),
        );
      return res.rowCount ?? 0;
    });
    const conversations = await deleteInBatches(batchSize, async () => {
      const res = await db.delete(conv).where(
        inArray(
          conv.id,
          db
            .select({ id: conv.id })
            .from(conv)
            .where(
              and(
                lt(conv.updatedAt, cutoff),
                notExists(
                  db
                    .select({ one: sql`1` })
                    .from(msg)
                    .where(eq(msg.conversationId, conv.id)),
                ),
              ),
            )
            .limit(batchSize),
        ),
      );
      return res.rowCount ?? 0;
    });
    await deleteInBatches(batchSize, async () => {
      const res = await db
        .update(conv)
        .set({ summary: null })
        .where(
          inArray(
            conv.id,
            db
              .select({ id: conv.id })
              .from(conv)
              .where(and(lt(conv.updatedAt, cutoff), isNotNull(conv.summary)))
              .limit(batchSize),
          ),
        );
      return res.rowCount ?? 0;
    });
    return messages + conversations;
  }
  // --- Messages Management & Sliding Window ---

  async addMessage(data: InsertAiMessage, tx?: DatabaseClient): Promise<AiMessage> {
    const client = this.getClient(tx);
    const id = data.id ?? this.newId('msg');
    const insertData = { ...data, id };

    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.aiMessages)
        .values(insertData)
        .returning();
      if (!created)
        throw new DatabaseError(`Failed to save AI message in conv ${data.conversationId}`);

      // Touch parent conversation updatedAt
      await client.db
        .update(sqliteSchema.aiConversations)
        .set({ updatedAt: new Date() })
        .where(eq(sqliteSchema.aiConversations.id, data.conversationId));

      return created as AiMessage;
    } else {
      const [created] = await client.db
        .insert(pgSchema.aiMessages)
        .values(insertData as unknown as typeof pgSchema.aiMessages.$inferInsert)
        .returning();
      if (!created)
        throw new DatabaseError(`Failed to save AI message in conv ${data.conversationId}`);

      await client.db
        .update(pgSchema.aiConversations)
        .set({ updatedAt: new Date() })
        .where(eq(pgSchema.aiConversations.id, data.conversationId));

      return created as unknown as AiMessage;
    }
  }

  async getMessages(
    conversationId: string,
    limit: number = 50,
    tx?: DatabaseClient,
  ): Promise<AiMessage[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.aiMessages)
        .where(eq(sqliteSchema.aiMessages.conversationId, conversationId))
        .orderBy(sqliteSchema.aiMessages.createdAt)
        .limit(limit);
      return rows as AiMessage[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.aiMessages)
        .where(eq(pgSchema.aiMessages.conversationId, conversationId))
        .orderBy(pgSchema.aiMessages.createdAt)
        .limit(limit);
      return rows as unknown as AiMessage[];
    }
  }

  async getSlidingWindowMessages(
    conversationId: string,
    maxMessages: number = 20,
    tx?: DatabaseClient,
  ): Promise<AiMessage[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      // Fetch latest N messages ordered by createdAt DESC, then return them in chronological ASC order
      const rows = await client.db
        .select()
        .from(sqliteSchema.aiMessages)
        .where(eq(sqliteSchema.aiMessages.conversationId, conversationId))
        .orderBy(desc(sqliteSchema.aiMessages.createdAt))
        .limit(maxMessages);

      return (rows as AiMessage[]).reverse();
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.aiMessages)
        .where(eq(pgSchema.aiMessages.conversationId, conversationId))
        .orderBy(desc(pgSchema.aiMessages.createdAt))
        .limit(maxMessages);

      return (rows as unknown as AiMessage[]).reverse();
    }
  }

  // --- Guild Preferences ---

  async getGuildPreferences(
    guildId: string,
    tx?: DatabaseClient,
  ): Promise<AiGuildPreferences | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.aiGuildPreferences)
        .where(eq(sqliteSchema.aiGuildPreferences.guildId, guildId));
      return (row as AiGuildPreferences) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.aiGuildPreferences)
        .where(eq(pgSchema.aiGuildPreferences.guildId, guildId));
      return (row as unknown as AiGuildPreferences) ?? null;
    }
  }

  async upsertGuildPreferences(
    guildId: string,
    data: Partial<NewAiGuildPreferences>,
    tx?: DatabaseClient,
  ): Promise<AiGuildPreferences> {
    const client = this.getClient(tx);
    const insertData = { ...data, guildId };

    if (this.isSqlite(client)) {
      const [row] = await client.db
        .insert(sqliteSchema.aiGuildPreferences)
        .values(insertData as typeof sqliteSchema.aiGuildPreferences.$inferInsert)
        .onConflictDoUpdate({
          target: sqliteSchema.aiGuildPreferences.guildId,
          set: data,
        })
        .returning();
      if (!row) throw new DatabaseError(`Failed to upsert AI guild preferences for ${guildId}`);
      return row as AiGuildPreferences;
    } else {
      const [row] = await client.db
        .insert(pgSchema.aiGuildPreferences)
        .values(insertData as unknown as typeof pgSchema.aiGuildPreferences.$inferInsert)
        .onConflictDoUpdate({
          target: pgSchema.aiGuildPreferences.guildId,
          set: data as unknown as Partial<typeof pgSchema.aiGuildPreferences.$inferInsert>,
        })
        .returning();
      if (!row) throw new DatabaseError(`Failed to upsert AI guild preferences for ${guildId}`);
      return row as unknown as AiGuildPreferences;
    }
  }

  // --- User Preferences ---

  async getUserPreferences(userId: string, tx?: DatabaseClient): Promise<AiUserPreferences | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.aiUserPreferences)
        .where(eq(sqliteSchema.aiUserPreferences.userId, userId));
      return (row as AiUserPreferences) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.aiUserPreferences)
        .where(eq(pgSchema.aiUserPreferences.userId, userId));
      return (row as unknown as AiUserPreferences) ?? null;
    }
  }

  /** Deletes the user's AI preferences (time zone, nickname, language); true when there were any. */
  async deleteUserPreferences(userId: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const removed = await client.db
        .delete(sqliteSchema.aiUserPreferences)
        .where(eq(sqliteSchema.aiUserPreferences.userId, userId))
        .returning({ userId: sqliteSchema.aiUserPreferences.userId });
      return removed.length > 0;
    }
    const removed = await client.db
      .delete(pgSchema.aiUserPreferences)
      .where(eq(pgSchema.aiUserPreferences.userId, userId))
      .returning({ userId: pgSchema.aiUserPreferences.userId });
    return removed.length > 0;
  }

  async upsertUserPreferences(
    userId: string,
    data: Partial<NewAiUserPreferences>,
    tx?: DatabaseClient,
  ): Promise<AiUserPreferences> {
    const client = this.getClient(tx);
    const insertData = { ...data, userId };

    if (this.isSqlite(client)) {
      const [row] = await client.db
        .insert(sqliteSchema.aiUserPreferences)
        .values(insertData as typeof sqliteSchema.aiUserPreferences.$inferInsert)
        .onConflictDoUpdate({
          target: sqliteSchema.aiUserPreferences.userId,
          set: data,
        })
        .returning();
      if (!row) throw new DatabaseError(`Failed to upsert AI user preferences for ${userId}`);
      return row as AiUserPreferences;
    } else {
      const [row] = await client.db
        .insert(pgSchema.aiUserPreferences)
        .values(insertData as unknown as typeof pgSchema.aiUserPreferences.$inferInsert)
        .onConflictDoUpdate({
          target: pgSchema.aiUserPreferences.userId,
          set: data as unknown as Partial<typeof pgSchema.aiUserPreferences.$inferInsert>,
        })
        .returning();
      if (!row) throw new DatabaseError(`Failed to upsert AI user preferences for ${userId}`);
      return row as unknown as AiUserPreferences;
    }
  }
}
