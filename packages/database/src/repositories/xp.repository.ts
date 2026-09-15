import { eq, and, desc, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type { PaginationOptions, PaginatedResult } from './types.js';
import type { XpAccount, NewXpAccount, XpEvent } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { withTransaction } from '../transactions/index.js';
import { DatabaseError } from '@ririko/core';

export interface XpAccountId {
  userId: string;
  guildId: string;
}

export interface AddXpParams {
  userId: string;
  guildId: string;
  xpDelta: number;
  source: string;
  newLevel?: number | undefined;
}

export interface AddXpResult {
  account: XpAccount;
  event: XpEvent;
}

/**
 * Repository for XP accounts, experience transaction events, and level progression.
 */
export class XpRepository extends BaseRepository<
  XpAccount,
  NewXpAccount,
  Partial<NewXpAccount>,
  XpAccountId
> {
  async findById(id: XpAccountId, tx?: DatabaseClient): Promise<XpAccount | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.xpAccounts)
        .where(
          and(
            eq(sqliteSchema.xpAccounts.userId, id.userId),
            eq(sqliteSchema.xpAccounts.guildId, id.guildId),
          ),
        );
      return (row as XpAccount) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.xpAccounts)
        .where(
          and(
            eq(pgSchema.xpAccounts.userId, id.userId),
            eq(pgSchema.xpAccounts.guildId, id.guildId),
          ),
        );
      return (row as unknown as XpAccount) ?? null;
    }
  }

  async getAccount(
    userId: string,
    guildId: string,
    tx?: DatabaseClient,
  ): Promise<XpAccount | null> {
    return this.findById({ userId, guildId }, tx);
  }

  async exists(id: XpAccountId, tx?: DatabaseClient): Promise<boolean> {
    const found = await this.findById(id, tx);
    return found !== null;
  }

  async create(data: NewXpAccount, tx?: DatabaseClient): Promise<XpAccount> {
    const client = this.getClient(tx);
    const now = new Date();
    const insertData = {
      ...data,
      createdAt: now,
      updatedAt: now,
    };

    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.xpAccounts)
        .values(insertData)
        .returning();
      if (!created) {
        throw new DatabaseError(
          `Failed to create XP account for user ${data.userId} in guild ${data.guildId}`,
        );
      }
      return created as XpAccount;
    } else {
      const [created] = await client.db
        .insert(pgSchema.xpAccounts)
        .values({
          ...insertData,
          xp: BigInt(data.xp ?? 0),
        } as unknown as typeof pgSchema.xpAccounts.$inferInsert)
        .returning();
      if (!created) {
        throw new DatabaseError(
          `Failed to create XP account for user ${data.userId} in guild ${data.guildId}`,
        );
      }
      return created as unknown as XpAccount;
    }
  }

  async getOrCreateAccount(
    userId: string,
    guildId: string,
    tx?: DatabaseClient,
  ): Promise<XpAccount> {
    const existing = await this.getAccount(userId, guildId, tx);
    if (existing) return existing;

    const client = this.getClient(tx);
    const now = new Date();

    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.xpAccounts)
        .values({
          userId,
          guildId,
          xp: 0,
          level: 0,
          karma: 0,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [sqliteSchema.xpAccounts.userId, sqliteSchema.xpAccounts.guildId],
          set: { updatedAt: now },
        })
        .returning();

      if (!created) {
        throw new DatabaseError(
          `Failed to get or create XP account for ${userId} in ${guildId}`,
        );
      }
      return created as XpAccount;
    } else {
      const [created] = await client.db
        .insert(pgSchema.xpAccounts)
        .values({
          userId,
          guildId,
          xp: 0n,
          level: 0,
          karma: 0,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [pgSchema.xpAccounts.userId, pgSchema.xpAccounts.guildId],
          set: { updatedAt: now },
        })
        .returning();

      if (!created) {
        throw new DatabaseError(
          `Failed to get or create XP account for ${userId} in ${guildId}`,
        );
      }
      return created as unknown as XpAccount;
    }
  }

  async update(
    id: XpAccountId,
    data: Partial<NewXpAccount>,
    tx?: DatabaseClient,
  ): Promise<XpAccount> {
    const client = this.getClient(tx);
    const updateData = { ...data, updatedAt: new Date() };

    if (this.isSqlite(client)) {
      const [updated] = await client.db
        .update(sqliteSchema.xpAccounts)
        .set(updateData)
        .where(
          and(
            eq(sqliteSchema.xpAccounts.userId, id.userId),
            eq(sqliteSchema.xpAccounts.guildId, id.guildId),
          ),
        )
        .returning();
      if (!updated) {
        throw new DatabaseError(
          `XP account for user ${id.userId} in guild ${id.guildId} not found for update`,
        );
      }
      return updated as XpAccount;
    } else {
      const pgData = {
        ...updateData,
        ...(data.xp !== undefined ? { xp: BigInt(data.xp) } : {}),
      };
      const [updated] = await client.db
        .update(pgSchema.xpAccounts)
        .set(pgData as unknown as Partial<typeof pgSchema.xpAccounts.$inferInsert>)
        .where(
          and(
            eq(pgSchema.xpAccounts.userId, id.userId),
            eq(pgSchema.xpAccounts.guildId, id.guildId),
          ),
        )
        .returning();
      if (!updated) {
        throw new DatabaseError(
          `XP account for user ${id.userId} in guild ${id.guildId} not found for update`,
        );
      }
      return updated as unknown as XpAccount;
    }
  }

  async updateAccount(
    userId: string,
    guildId: string,
    data: Partial<NewXpAccount>,
    tx?: DatabaseClient,
  ): Promise<XpAccount> {
    return this.update({ userId, guildId }, data, tx);
  }

  /**
   * Atomically adds XP to a user's account, updates their level, and logs an XP event.
   */
  async addXp(params: AddXpParams, tx?: DatabaseClient): Promise<AddXpResult> {
    const targetClient = this.getClient(tx);
    const { userId, guildId, xpDelta, source, newLevel } = params;

    return withTransaction(targetClient, async (txClient) => {
      const current = await this.getOrCreateAccount(userId, guildId, txClient);
      const currentXp = Number(current.xp);
      const updatedXp = Math.max(0, currentXp + xpDelta);
      const updatedLevel = newLevel ?? current.level;
      const now = new Date();
      const eventId = randomUUID();

      let updatedAccount: XpAccount;
      let recordedEvent: XpEvent;

      if (this.isSqlite(txClient)) {
        const [acc] = await txClient.db
          .update(sqliteSchema.xpAccounts)
          .set({
            xp: updatedXp,
            level: updatedLevel,
            lastXpAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(sqliteSchema.xpAccounts.userId, userId),
              eq(sqliteSchema.xpAccounts.guildId, guildId),
            ),
          )
          .returning();

        const [ev] = await txClient.db
          .insert(sqliteSchema.xpEvents)
          .values({
            id: eventId,
            userId,
            guildId,
            xpAwarded: xpDelta,
            source,
            createdAt: now,
          })
          .returning();

        if (!acc || !ev) throw new DatabaseError('Failed to record XP update in SQLite');
        updatedAccount = acc as XpAccount;
        recordedEvent = ev as XpEvent;
      } else {
        const [acc] = await txClient.db
          .update(pgSchema.xpAccounts)
          .set({
            xp: BigInt(updatedXp),
            level: updatedLevel,
            lastXpAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(pgSchema.xpAccounts.userId, userId),
              eq(pgSchema.xpAccounts.guildId, guildId),
            ),
          )
          .returning();

        const [ev] = await txClient.db
          .insert(pgSchema.xpEvents)
          .values({
            id: eventId,
            userId,
            guildId,
            xpAwarded: xpDelta,
            source,
            createdAt: now,
          })
          .returning();

        if (!acc || !ev) throw new DatabaseError('Failed to record XP update in PostgreSQL');
        updatedAccount = acc as unknown as XpAccount;
        recordedEvent = ev as unknown as XpEvent;
      }

      return {
        account: updatedAccount,
        event: recordedEvent,
      };
    });
  }

  /**
   * Adds or subtracts Karma from a user's account.
   */
  async addKarma(
    userId: string,
    guildId: string,
    karmaDelta: number,
    tx?: DatabaseClient,
  ): Promise<XpAccount> {
    const current = await this.getOrCreateAccount(userId, guildId, tx);
    const newKarma = current.karma + karmaDelta;
    return this.updateAccount(userId, guildId, { karma: newKarma }, tx);
  }

  /**
   * Sets Karma to a specific value.
   */
  async setKarma(
    userId: string,
    guildId: string,
    karma: number,
    tx?: DatabaseClient,
  ): Promise<XpAccount> {
    await this.getOrCreateAccount(userId, guildId, tx);
    return this.updateAccount(userId, guildId, { karma }, tx);
  }

  /**
   * Retrieves top ranked members within a guild.
   */
  async getLeaderboard(
    guildId: string,
    options?: PaginationOptions,
    tx?: DatabaseClient,
  ): Promise<PaginatedResult<XpAccount>> {
    const client = this.getClient(tx);
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    if (this.isSqlite(client)) {
      const items = await client.db
        .select()
        .from(sqliteSchema.xpAccounts)
        .where(eq(sqliteSchema.xpAccounts.guildId, guildId))
        .orderBy(desc(sqliteSchema.xpAccounts.xp))
        .limit(limit)
        .offset(offset);

      const [countRes] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.xpAccounts)
        .where(eq(sqliteSchema.xpAccounts.guildId, guildId));

      return {
        items: items as XpAccount[],
        total: Number(countRes?.count ?? 0),
        limit,
        offset,
      };
    } else {
      const items = await client.db
        .select()
        .from(pgSchema.xpAccounts)
        .where(eq(pgSchema.xpAccounts.guildId, guildId))
        .orderBy(desc(pgSchema.xpAccounts.xp))
        .limit(limit)
        .offset(offset);

      const [countRes] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.xpAccounts)
        .where(eq(pgSchema.xpAccounts.guildId, guildId));

      return {
        items: items as unknown as XpAccount[],
        total: Number(countRes?.count ?? 0),
        limit,
        offset,
      };
    }
  }

  async delete(id: XpAccountId, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const deleted = await client.db
        .delete(sqliteSchema.xpAccounts)
        .where(
          and(
            eq(sqliteSchema.xpAccounts.userId, id.userId),
            eq(sqliteSchema.xpAccounts.guildId, id.guildId),
          ),
        )
        .returning({ userId: sqliteSchema.xpAccounts.userId });
      return deleted.length > 0;
    } else {
      const deleted = await client.db
        .delete(pgSchema.xpAccounts)
        .where(
          and(
            eq(pgSchema.xpAccounts.userId, id.userId),
            eq(pgSchema.xpAccounts.guildId, id.guildId),
          ),
        )
        .returning({ userId: pgSchema.xpAccounts.userId });
      return deleted.length > 0;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.xpAccounts);
      return Number(res?.count ?? 0);
    } else {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.xpAccounts);
      return Number(res?.count ?? 0);
    }
  }
}
