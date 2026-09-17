import { eq, and, lte, desc, sql } from 'drizzle-orm';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type {
  Giveaway,
  NewGiveaway,
  GiveawayEntry,
  GiveawayWinner,
} from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';
import { withTransaction } from '../transactions/index.js';

export class GiveawayRepository extends BaseRepository<
  Giveaway,
  NewGiveaway,
  Partial<NewGiveaway>
> {
  async findById(id: string, tx?: DatabaseClient): Promise<Giveaway | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.giveaways)
        .where(eq(sqliteSchema.giveaways.id, id));
      return (row as Giveaway) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.giveaways)
        .where(eq(pgSchema.giveaways.id, id));
      return (row as unknown as Giveaway) ?? null;
    }
  }

  async findByMessageId(messageId: string, tx?: DatabaseClient): Promise<Giveaway | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.giveaways)
        .where(eq(sqliteSchema.giveaways.messageId, messageId));
      return (row as Giveaway) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.giveaways)
        .where(eq(pgSchema.giveaways.messageId, messageId));
      return (row as unknown as Giveaway) ?? null;
    }
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    const giveaway = await this.findById(id, tx);
    return giveaway !== null;
  }

  async create(data: NewGiveaway, tx?: DatabaseClient): Promise<Giveaway> {
    const client = this.getClient(tx);
    const id = data.id ?? crypto.randomUUID();
    const payload = {
      ...data,
      id,
      startsAt: data.startsAt ?? new Date(),
      isEnded: data.isEnded ?? false,
      winnerCount: data.winnerCount ?? 1,
      requirements: data.requirements ?? {},
    };

    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.giveaways)
        .values(payload)
        .returning();
      if (!created) throw new DatabaseError(`Failed to insert giveaway ${id}`);
      return created as Giveaway;
    } else {
      const [created] = await client.db
        .insert(pgSchema.giveaways)
        .values(payload as unknown as typeof pgSchema.giveaways.$inferInsert)
        .returning();
      if (!created) throw new DatabaseError(`Failed to insert giveaway ${id}`);
      return created as unknown as Giveaway;
    }
  }

  async update(
    id: string,
    data: Partial<NewGiveaway>,
    tx?: DatabaseClient,
  ): Promise<Giveaway> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [updated] = await client.db
        .update(sqliteSchema.giveaways)
        .set(data)
        .where(eq(sqliteSchema.giveaways.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`Giveaway with ID ${id} not found for update`);
      return updated as Giveaway;
    } else {
      const [updated] = await client.db
        .update(pgSchema.giveaways)
        .set(data as unknown as typeof pgSchema.giveaways.$inferInsert)
        .where(eq(pgSchema.giveaways.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`Giveaway with ID ${id} not found for update`);
      return updated as unknown as Giveaway;
    }
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    return withTransaction(client, async (txClient) => {
      if (this.isSqlite(txClient)) {
        // Delete related entries and winners first
        await txClient.db
          .delete(sqliteSchema.giveawayEntries)
          .where(eq(sqliteSchema.giveawayEntries.giveawayId, id));
        await txClient.db
          .delete(sqliteSchema.giveawayWinners)
          .where(eq(sqliteSchema.giveawayWinners.giveawayId, id));
        const result = await txClient.db
          .delete(sqliteSchema.giveaways)
          .where(eq(sqliteSchema.giveaways.id, id))
          .returning();
        return result.length > 0;
      } else {
        await txClient.db
          .delete(pgSchema.giveawayEntries)
          .where(eq(pgSchema.giveawayEntries.giveawayId, id));
        await txClient.db
          .delete(pgSchema.giveawayWinners)
          .where(eq(pgSchema.giveawayWinners.giveawayId, id));
        const result = await txClient.db
          .delete(pgSchema.giveaways)
          .where(eq(pgSchema.giveaways.id, id))
          .returning();
        return result.length > 0;
      }
    });
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.giveaways);
      return Number(row?.count ?? 0);
    } else {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.giveaways);
      return Number(row?.count ?? 0);
    }
  }

  async listActiveGiveaways(guildId?: string, tx?: DatabaseClient): Promise<Giveaway[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const conditions = [eq(sqliteSchema.giveaways.isEnded, false)];
      if (guildId) {
        conditions.push(eq(sqliteSchema.giveaways.guildId, guildId));
      }
      const rows = await client.db
        .select()
        .from(sqliteSchema.giveaways)
        .where(and(...conditions));
      return rows as Giveaway[];
    } else {
      const conditions = [eq(pgSchema.giveaways.isEnded, false)];
      if (guildId) {
        conditions.push(eq(pgSchema.giveaways.guildId, guildId));
      }
      const rows = await client.db
        .select()
        .from(pgSchema.giveaways)
        .where(and(...conditions));
      return rows as unknown as Giveaway[];
    }
  }

  async listExpiredPendingGiveaways(
    now: Date = new Date(),
    tx?: DatabaseClient,
  ): Promise<Giveaway[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.giveaways)
        .where(
          and(
            eq(sqliteSchema.giveaways.isEnded, false),
            lte(sqliteSchema.giveaways.endsAt, now),
          ),
        );
      return rows as Giveaway[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.giveaways)
        .where(
          and(
            eq(pgSchema.giveaways.isEnded, false),
            lte(pgSchema.giveaways.endsAt, now),
          ),
        );
      return rows as unknown as Giveaway[];
    }
  }

  async listGuildGiveaways(
    guildId: string,
    limit: number = 20,
    tx?: DatabaseClient,
  ): Promise<Giveaway[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.giveaways)
        .where(eq(sqliteSchema.giveaways.guildId, guildId))
        .orderBy(desc(sqliteSchema.giveaways.startsAt))
        .limit(limit);
      return rows as Giveaway[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.giveaways)
        .where(eq(pgSchema.giveaways.guildId, guildId))
        .orderBy(desc(pgSchema.giveaways.startsAt))
        .limit(limit);
      return rows as unknown as Giveaway[];
    }
  }

  // --- Entry Operations ---

  async addEntry(
    giveawayId: string,
    userId: string,
    bonusMultiplier: number = 1,
    tx?: DatabaseClient,
  ): Promise<boolean> {
    const client = this.getClient(tx);
    const entryData = {
      giveawayId,
      userId,
      bonusMultiplier: Math.max(1, bonusMultiplier),
      enteredAt: new Date(),
    };

    try {
      if (this.isSqlite(client)) {
        const [inserted] = await client.db
          .insert(sqliteSchema.giveawayEntries)
          .values(entryData)
          .onConflictDoNothing()
          .returning();
        return Boolean(inserted);
      } else {
        const [inserted] = await client.db
          .insert(pgSchema.giveawayEntries)
          .values(entryData as unknown as typeof pgSchema.giveawayEntries.$inferInsert)
          .onConflictDoNothing()
          .returning();
        return Boolean(inserted);
      }
    } catch {
      return false;
    }
  }

  async removeEntry(
    giveawayId: string,
    userId: string,
    tx?: DatabaseClient,
  ): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const result = await client.db
        .delete(sqliteSchema.giveawayEntries)
        .where(
          and(
            eq(sqliteSchema.giveawayEntries.giveawayId, giveawayId),
            eq(sqliteSchema.giveawayEntries.userId, userId),
          ),
        )
        .returning();
      return result.length > 0;
    } else {
      const result = await client.db
        .delete(pgSchema.giveawayEntries)
        .where(
          and(
            eq(pgSchema.giveawayEntries.giveawayId, giveawayId),
            eq(pgSchema.giveawayEntries.userId, userId),
          ),
        )
        .returning();
      return result.length > 0;
    }
  }

  async getEntries(
    giveawayId: string,
    tx?: DatabaseClient,
  ): Promise<GiveawayEntry[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.giveawayEntries)
        .where(eq(sqliteSchema.giveawayEntries.giveawayId, giveawayId));
      return rows as GiveawayEntry[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.giveawayEntries)
        .where(eq(pgSchema.giveawayEntries.giveawayId, giveawayId));
      return rows as unknown as GiveawayEntry[];
    }
  }

  async getEntryCount(
    giveawayId: string,
    tx?: DatabaseClient,
  ): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.giveawayEntries)
        .where(eq(sqliteSchema.giveawayEntries.giveawayId, giveawayId));
      return Number(row?.count ?? 0);
    } else {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.giveawayEntries)
        .where(eq(pgSchema.giveawayEntries.giveawayId, giveawayId));
      return Number(row?.count ?? 0);
    }
  }

  async hasUserEntered(
    giveawayId: string,
    userId: string,
    tx?: DatabaseClient,
  ): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.giveawayEntries)
        .where(
          and(
            eq(sqliteSchema.giveawayEntries.giveawayId, giveawayId),
            eq(sqliteSchema.giveawayEntries.userId, userId),
          ),
        );
      return Boolean(row);
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.giveawayEntries)
        .where(
          and(
            eq(pgSchema.giveawayEntries.giveawayId, giveawayId),
            eq(pgSchema.giveawayEntries.userId, userId),
          ),
        );
      return Boolean(row);
    }
  }

  // --- Winner Operations ---

  async recordWinners(
    giveawayId: string,
    userIds: string[],
    isReroll: boolean = false,
    tx?: DatabaseClient,
  ): Promise<GiveawayWinner[]> {
    if (userIds.length === 0) return [];
    const client = this.getClient(tx);
    const now = new Date();
    const payloads = userIds.map((userId) => ({
      giveawayId,
      userId,
      wonAt: now,
      isReroll,
    }));

    if (this.isSqlite(client)) {
      const created = await client.db
        .insert(sqliteSchema.giveawayWinners)
        .values(payloads)
        .returning();
      return created as GiveawayWinner[];
    } else {
      const created = await client.db
        .insert(pgSchema.giveawayWinners)
        .values(payloads as unknown as typeof pgSchema.giveawayWinners.$inferInsert[])
        .returning();
      return created as unknown as GiveawayWinner[];
    }
  }

  async getWinners(
    giveawayId: string,
    tx?: DatabaseClient,
  ): Promise<GiveawayWinner[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.giveawayWinners)
        .where(eq(sqliteSchema.giveawayWinners.giveawayId, giveawayId));
      return rows as GiveawayWinner[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.giveawayWinners)
        .where(eq(pgSchema.giveawayWinners.giveawayId, giveawayId));
      return rows as unknown as GiveawayWinner[];
    }
  }

  async endGiveaway(
    giveawayId: string,
    winnerUserIds: string[],
    tx?: DatabaseClient,
  ): Promise<void> {
    const client = this.getClient(tx);
    await withTransaction(client, async (txClient) => {
      // 1. Mark giveaway as ended
      if (this.isSqlite(txClient)) {
        await txClient.db
          .update(sqliteSchema.giveaways)
          .set({ isEnded: true })
          .where(eq(sqliteSchema.giveaways.id, giveawayId));
      } else {
        await txClient.db
          .update(pgSchema.giveaways)
          .set({ isEnded: true })
          .where(eq(pgSchema.giveaways.id, giveawayId));
      }

      // 2. Record winners if any
      if (winnerUserIds.length > 0) {
        await this.recordWinners(giveawayId, winnerUserIds, false, txClient);
      }
    });
  }
}
