import { eq, and, gt, sql } from 'drizzle-orm';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type {
  FreeGame,
  NewFreeGame,
  FreeGameAnnouncement,
  NewFreeGameAnnouncement,
  FreeGameChannel,
} from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';

/** Where a guild's free game announcements go and the role they mention. */
export interface FreeGameAnnounceTarget {
  guildId: string;
  channelId: string;
  mentionRoleId: string | null;
}

export class FreeGameRepository extends BaseRepository<
  FreeGame,
  NewFreeGame,
  Partial<NewFreeGame>
> {
  async findById(id: string, tx?: DatabaseClient): Promise<FreeGame | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.freeGames)
        .where(eq(sqliteSchema.freeGames.id, id));
      return (row as FreeGame) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.freeGames)
        .where(eq(pgSchema.freeGames.id, id));
      return (row as unknown as FreeGame) ?? null;
    }
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    const game = await this.findById(id, tx);
    return game !== null;
  }

  async create(data: NewFreeGame, tx?: DatabaseClient): Promise<FreeGame> {
    const client = this.getClient(tx);
    const payload = {
      ...data,
      provider: data.provider.toUpperCase(),
    };

    if (this.isSqlite(client)) {
      const [created] = await client.db.insert(sqliteSchema.freeGames).values(payload).returning();
      if (!created) throw new DatabaseError(`Failed to insert free game ${data.title}`);
      return created as FreeGame;
    } else {
      const [created] = await client.db
        .insert(pgSchema.freeGames)
        .values(payload as unknown as typeof pgSchema.freeGames.$inferInsert)
        .returning();
      if (!created) throw new DatabaseError(`Failed to insert free game ${data.title}`);
      return created as unknown as FreeGame;
    }
  }

  async update(id: string, data: Partial<NewFreeGame>, tx?: DatabaseClient): Promise<FreeGame> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [updated] = await client.db
        .update(sqliteSchema.freeGames)
        .set(data)
        .where(eq(sqliteSchema.freeGames.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`Free game ${id} not found for update`);
      return updated as FreeGame;
    } else {
      const [updated] = await client.db
        .update(pgSchema.freeGames)
        .set(data as unknown as Partial<typeof pgSchema.freeGames.$inferInsert>)
        .where(eq(pgSchema.freeGames.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`Free game ${id} not found for update`);
      return updated as unknown as FreeGame;
    }
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const deleted = await client.db
        .delete(sqliteSchema.freeGames)
        .where(eq(sqliteSchema.freeGames.id, id))
        .returning();
      return deleted.length > 0;
    } else {
      const deleted = await client.db
        .delete(pgSchema.freeGames)
        .where(eq(pgSchema.freeGames.id, id))
        .returning();
      return deleted.length > 0;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.freeGames);
      return Number(row?.count ?? 0);
    } else {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.freeGames);
      return Number(row?.count ?? 0);
    }
  }

  async upsertFreeGame(data: NewFreeGame, tx?: DatabaseClient): Promise<FreeGame> {
    const client = this.getClient(tx);
    const existing = await this.findById(data.id, tx);

    if (existing) {
      const updateData = {
        title: data.title,
        storeUrl: data.storeUrl,
        thumbnailUrl: data.thumbnailUrl !== undefined ? data.thumbnailUrl : existing.thumbnailUrl,
        startDate: data.startDate,
        endDate: data.endDate,
      };

      if (this.isSqlite(client)) {
        const [updated] = await client.db
          .update(sqliteSchema.freeGames)
          .set(updateData)
          .where(eq(sqliteSchema.freeGames.id, data.id))
          .returning();
        return updated as FreeGame;
      } else {
        const [updated] = await client.db
          .update(pgSchema.freeGames)
          .set(updateData as unknown as Partial<typeof pgSchema.freeGames.$inferInsert>)
          .where(eq(pgSchema.freeGames.id, data.id))
          .returning();
        return updated as unknown as FreeGame;
      }
    }

    return this.create(data, tx);
  }

  async listActiveFreeGames(now: Date = new Date(), tx?: DatabaseClient): Promise<FreeGame[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.freeGames)
        .where(gt(sqliteSchema.freeGames.endDate, now));
      return rows as FreeGame[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.freeGames)
        .where(gt(pgSchema.freeGames.endDate, now));
      return rows as unknown as FreeGame[];
    }
  }

  async isGameAnnounced(gameId: string, guildId: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select({ gameId: sqliteSchema.freeGameAnnouncements.gameId })
        .from(sqliteSchema.freeGameAnnouncements)
        .where(
          and(
            eq(sqliteSchema.freeGameAnnouncements.gameId, gameId),
            eq(sqliteSchema.freeGameAnnouncements.guildId, guildId),
          ),
        );
      return Boolean(row);
    } else {
      const [row] = await client.db
        .select({ gameId: pgSchema.freeGameAnnouncements.gameId })
        .from(pgSchema.freeGameAnnouncements)
        .where(
          and(
            eq(pgSchema.freeGameAnnouncements.gameId, gameId),
            eq(pgSchema.freeGameAnnouncements.guildId, guildId),
          ),
        );
      return Boolean(row);
    }
  }

  async recordAnnouncement(
    data: NewFreeGameAnnouncement,
    tx?: DatabaseClient,
  ): Promise<FreeGameAnnouncement> {
    const client = this.getClient(tx);
    const insertPayload = {
      gameId: data.gameId,
      guildId: data.guildId,
      channelId: data.channelId,
      messageId: data.messageId,
      announcedAt: data.announcedAt ?? new Date(),
    };

    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.freeGameAnnouncements)
        .values(insertPayload)
        .returning();
      if (!created) throw new DatabaseError('Failed to record free game announcement');
      return created as FreeGameAnnouncement;
    } else {
      const [created] = await client.db
        .insert(pgSchema.freeGameAnnouncements)
        .values(insertPayload as unknown as typeof pgSchema.freeGameAnnouncements.$inferInsert)
        .returning();
      if (!created) throw new DatabaseError('Failed to record free game announcement');
      return created as unknown as FreeGameAnnouncement;
    }
  }

  async listAnnouncementsByGuild(
    guildId: string,
    tx?: DatabaseClient,
  ): Promise<FreeGameAnnouncement[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.freeGameAnnouncements)
        .where(eq(sqliteSchema.freeGameAnnouncements.guildId, guildId));
      return rows as FreeGameAnnouncement[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.freeGameAnnouncements)
        .where(eq(pgSchema.freeGameAnnouncements.guildId, guildId));
      return rows as unknown as FreeGameAnnouncement[];
    }
  }

  /** Where the guild's free game announcements go and whom they mention, or null for nowhere. */
  async getGuildChannel(
    guildId: string,
    tx?: DatabaseClient,
  ): Promise<FreeGameAnnounceTarget | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.freeGameChannels)
        .where(eq(sqliteSchema.freeGameChannels.guildId, guildId));
      return row ? toTarget(row) : null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.freeGameChannels)
        .where(eq(pgSchema.freeGameChannels.guildId, guildId));
      return row ? toTarget(row) : null;
    }
  }

  /** Sets the announcement channel; a `mentionRoleId` left out keeps the saved role. */
  async setGuildChannel(
    guildId: string,
    data: { channelId: string; mentionRoleId?: string | null | undefined },
    tx?: DatabaseClient,
  ): Promise<FreeGameChannel> {
    const client = this.getClient(tx);
    const set = {
      channelId: data.channelId,
      ...(data.mentionRoleId !== undefined ? { mentionRoleId: data.mentionRoleId } : {}),
    };
    const values = {
      guildId,
      channelId: data.channelId,
      mentionRoleId: data.mentionRoleId ?? null,
      createdAt: new Date(),
    };
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .insert(sqliteSchema.freeGameChannels)
        .values(values)
        .onConflictDoUpdate({ target: sqliteSchema.freeGameChannels.guildId, set })
        .returning();
      return row as FreeGameChannel;
    } else {
      const [row] = await client.db
        .insert(pgSchema.freeGameChannels)
        .values(values)
        .onConflictDoUpdate({ target: pgSchema.freeGameChannels.guildId, set })
        .returning();
      return row as unknown as FreeGameChannel;
    }
  }

  async removeGuildChannel(guildId: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const deleted = await client.db
        .delete(sqliteSchema.freeGameChannels)
        .where(eq(sqliteSchema.freeGameChannels.guildId, guildId))
        .returning();
      return deleted.length > 0;
    } else {
      const deleted = await client.db
        .delete(pgSchema.freeGameChannels)
        .where(eq(pgSchema.freeGameChannels.guildId, guildId))
        .returning();
      return deleted.length > 0;
    }
  }

  async listAllConfiguredGuildChannels(tx?: DatabaseClient): Promise<FreeGameAnnounceTarget[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      return (await client.db.select().from(sqliteSchema.freeGameChannels)).map(toTarget);
    } else {
      return (await client.db.select().from(pgSchema.freeGameChannels)).map(toTarget);
    }
  }
}

function toTarget(row: FreeGameAnnounceTarget): FreeGameAnnounceTarget {
  return { guildId: row.guildId, channelId: row.channelId, mentionRoleId: row.mentionRoleId };
}
