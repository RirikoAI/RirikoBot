import { eq, and, asc, sql } from 'drizzle-orm';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type { PaginationOptions, PaginatedResult } from './types.js';
import type { LeaderboardSnapshot, NewLeaderboardSnapshot } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { withTransaction } from '../transactions/index.js';
import { DatabaseError } from '@ririko/core';

export interface LeaderboardSnapshotId {
  userId: string;
  guildId: string;
}

export interface UserRankResult {
  userId: string;
  guildId: string;
  globalRank: number;
  serverRank: number;
  calculatedAt: Date;
}

/**
 * Repository for materialized leaderboard snapshots and dense rank lookups.
 */
export class LeaderboardRepository extends BaseRepository<
  LeaderboardSnapshot,
  NewLeaderboardSnapshot,
  Partial<NewLeaderboardSnapshot>,
  LeaderboardSnapshotId
> {
  async findById(
    id: LeaderboardSnapshotId,
    tx?: DatabaseClient,
  ): Promise<LeaderboardSnapshot | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.leaderboardSnapshots)
        .where(
          and(
            eq(sqliteSchema.leaderboardSnapshots.userId, id.userId),
            eq(sqliteSchema.leaderboardSnapshots.guildId, id.guildId),
          ),
        );
      return (row as LeaderboardSnapshot) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.leaderboardSnapshots)
        .where(
          and(
            eq(pgSchema.leaderboardSnapshots.userId, id.userId),
            eq(pgSchema.leaderboardSnapshots.guildId, id.guildId),
          ),
        );
      return (row as unknown as LeaderboardSnapshot) ?? null;
    }
  }

  async exists(id: LeaderboardSnapshotId, tx?: DatabaseClient): Promise<boolean> {
    const found = await this.findById(id, tx);
    return found !== null;
  }

  async create(data: NewLeaderboardSnapshot, tx?: DatabaseClient): Promise<LeaderboardSnapshot> {
    const client = this.getClient(tx);
    const now = new Date();
    const insertData = {
      ...data,
      calculatedAt: data.calculatedAt ?? now,
    };

    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.leaderboardSnapshots)
        .values(insertData)
        .returning();
      if (!created) throw new DatabaseError('Failed to create leaderboard snapshot in SQLite');
      return created as LeaderboardSnapshot;
    } else {
      const [created] = await client.db
        .insert(pgSchema.leaderboardSnapshots)
        .values(insertData as unknown as typeof pgSchema.leaderboardSnapshots.$inferInsert)
        .returning();
      if (!created) throw new DatabaseError('Failed to create leaderboard snapshot in PostgreSQL');
      return created as unknown as LeaderboardSnapshot;
    }
  }

  async update(
    id: LeaderboardSnapshotId,
    data: Partial<NewLeaderboardSnapshot>,
    tx?: DatabaseClient,
  ): Promise<LeaderboardSnapshot> {
    const client = this.getClient(tx);
    const updateData = { ...data, calculatedAt: data.calculatedAt ?? new Date() };

    if (this.isSqlite(client)) {
      const [updated] = await client.db
        .update(sqliteSchema.leaderboardSnapshots)
        .set(updateData)
        .where(
          and(
            eq(sqliteSchema.leaderboardSnapshots.userId, id.userId),
            eq(sqliteSchema.leaderboardSnapshots.guildId, id.guildId),
          ),
        )
        .returning();
      if (!updated) throw new DatabaseError('Snapshot not found for update in SQLite');
      return updated as LeaderboardSnapshot;
    } else {
      const [updated] = await client.db
        .update(pgSchema.leaderboardSnapshots)
        .set(updateData as unknown as Partial<typeof pgSchema.leaderboardSnapshots.$inferInsert>)
        .where(
          and(
            eq(pgSchema.leaderboardSnapshots.userId, id.userId),
            eq(pgSchema.leaderboardSnapshots.guildId, id.guildId),
          ),
        )
        .returning();
      if (!updated) throw new DatabaseError('Snapshot not found for update in PostgreSQL');
      return updated as unknown as LeaderboardSnapshot;
    }
  }

  /**
   * Performs high-speed bulk upsert of materialized rank snapshots.
   */
  async upsertBatch(snapshots: NewLeaderboardSnapshot[], tx?: DatabaseClient): Promise<number> {
    if (snapshots.length === 0) return 0;
    const client = this.getClient(tx);

    return withTransaction(client, async (txClient) => {
      if (this.isSqlite(txClient)) {
        await txClient.db
          .insert(sqliteSchema.leaderboardSnapshots)
          .values(snapshots)
          .onConflictDoUpdate({
            target: [
              sqliteSchema.leaderboardSnapshots.userId,
              sqliteSchema.leaderboardSnapshots.guildId,
            ],
            set: {
              globalRank: sql`excluded.global_rank`,
              serverRank: sql`excluded.server_rank`,
              calculatedAt: sql`excluded.calculated_at`,
            },
          });
      } else {
        await txClient.db
          .insert(pgSchema.leaderboardSnapshots)
          .values(snapshots as unknown as (typeof pgSchema.leaderboardSnapshots.$inferInsert)[])
          .onConflictDoUpdate({
            target: [pgSchema.leaderboardSnapshots.userId, pgSchema.leaderboardSnapshots.guildId],
            set: {
              globalRank: sql`excluded.global_rank`,
              serverRank: sql`excluded.server_rank`,
              calculatedAt: sql`excluded.calculated_at`,
            },
          });
      }
      return snapshots.length;
    });
  }

  /**
   * O(1) indexed point lookup for a user's precomputed global and server ranks.
   */
  async getUserRank(
    userId: string,
    guildId: string,
    tx?: DatabaseClient,
  ): Promise<UserRankResult | null> {
    const snapshot = await this.findById({ userId, guildId }, tx);
    if (!snapshot) return null;

    return {
      userId: snapshot.userId,
      guildId: snapshot.guildId,
      globalRank: snapshot.globalRank,
      serverRank: snapshot.serverRank,
      calculatedAt: snapshot.calculatedAt,
    };
  }

  /**
   * Retrieves paginated server rankings ordered by serverRank ascending (1, 2, 3...).
   */
  async getServerLeaderboard(
    guildId: string,
    options?: PaginationOptions,
    tx?: DatabaseClient,
  ): Promise<PaginatedResult<LeaderboardSnapshot>> {
    const client = this.getClient(tx);
    const limit = options?.limit ?? 10;
    const offset = options?.offset ?? 0;

    if (this.isSqlite(client)) {
      const items = await client.db
        .select()
        .from(sqliteSchema.leaderboardSnapshots)
        .where(eq(sqliteSchema.leaderboardSnapshots.guildId, guildId))
        .orderBy(asc(sqliteSchema.leaderboardSnapshots.serverRank))
        .limit(limit)
        .offset(offset);

      const [countRes] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.leaderboardSnapshots)
        .where(eq(sqliteSchema.leaderboardSnapshots.guildId, guildId));

      return {
        items: items as LeaderboardSnapshot[],
        total: Number(countRes?.count ?? 0),
        limit,
        offset,
      };
    } else {
      const items = await client.db
        .select()
        .from(pgSchema.leaderboardSnapshots)
        .where(eq(pgSchema.leaderboardSnapshots.guildId, guildId))
        .orderBy(asc(pgSchema.leaderboardSnapshots.serverRank))
        .limit(limit)
        .offset(offset);

      const [countRes] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.leaderboardSnapshots)
        .where(eq(pgSchema.leaderboardSnapshots.guildId, guildId));

      return {
        items: items as unknown as LeaderboardSnapshot[],
        total: Number(countRes?.count ?? 0),
        limit,
        offset,
      };
    }
  }

  /**
   * Retrieves paginated global rankings ordered by globalRank ascending.
   */
  async getGlobalLeaderboard(
    options?: PaginationOptions,
    tx?: DatabaseClient,
  ): Promise<PaginatedResult<LeaderboardSnapshot>> {
    const limit = options?.limit ?? 10;
    const offset = options?.offset ?? 0;

    // Global snapshots use guildId = 'global'
    return this.getServerLeaderboard('global', { limit, offset }, tx);
  }

  async delete(id: LeaderboardSnapshotId, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const deleted = await client.db
        .delete(sqliteSchema.leaderboardSnapshots)
        .where(
          and(
            eq(sqliteSchema.leaderboardSnapshots.userId, id.userId),
            eq(sqliteSchema.leaderboardSnapshots.guildId, id.guildId),
          ),
        )
        .returning({ userId: sqliteSchema.leaderboardSnapshots.userId });
      return deleted.length > 0;
    } else {
      const deleted = await client.db
        .delete(pgSchema.leaderboardSnapshots)
        .where(
          and(
            eq(pgSchema.leaderboardSnapshots.userId, id.userId),
            eq(pgSchema.leaderboardSnapshots.guildId, id.guildId),
          ),
        )
        .returning({ userId: pgSchema.leaderboardSnapshots.userId });
      return deleted.length > 0;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.leaderboardSnapshots);
      return Number(res?.count ?? 0);
    } else {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.leaderboardSnapshots);
      return Number(res?.count ?? 0);
    }
  }
}
