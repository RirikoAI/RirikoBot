import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type {
  DungeonSeason,
  NewDungeonSeason,
  DungeonFloor,
  NewDungeonFloor,
  DungeonBoss,
  NewDungeonBoss,
  UserDungeonProgress,
  NewUserDungeonProgress,
} from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';

/**
 * Repository for Dungeon Seasons (Tutorial, S1 Infernal Crucible, S2 Abyssal Maelstrom, etc.).
 */
export class DungeonSeasonRepository extends BaseRepository<
  DungeonSeason,
  NewDungeonSeason,
  Partial<NewDungeonSeason>
> {
  async findById(id: string, tx?: DatabaseClient): Promise<DungeonSeason | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.dungeonSeasons)
        .where(eq(sqliteSchema.dungeonSeasons.id, id));
      return (row as DungeonSeason) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.dungeonSeasons)
        .where(eq(pgSchema.dungeonSeasons.id, id));
      return (row as DungeonSeason) ?? null;
    }
  }

  async findActiveSeason(tx?: DatabaseClient): Promise<DungeonSeason | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.dungeonSeasons)
        .where(
          and(
            eq(sqliteSchema.dungeonSeasons.isActive, true),
            eq(sqliteSchema.dungeonSeasons.isTutorial, false),
          ),
        )
        .orderBy(desc(sqliteSchema.dungeonSeasons.startsAt))
        .limit(1);
      return (row as DungeonSeason) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.dungeonSeasons)
        .where(
          and(
            eq(pgSchema.dungeonSeasons.isActive, true),
            eq(pgSchema.dungeonSeasons.isTutorial, false),
          ),
        )
        .orderBy(desc(pgSchema.dungeonSeasons.startsAt))
        .limit(1);
      return (row as DungeonSeason) ?? null;
    }
  }

  async findTutorialSeason(tx?: DatabaseClient): Promise<DungeonSeason | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.dungeonSeasons)
        .where(eq(sqliteSchema.dungeonSeasons.isTutorial, true))
        .limit(1);
      return (row as DungeonSeason) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.dungeonSeasons)
        .where(eq(pgSchema.dungeonSeasons.isTutorial, true))
        .limit(1);
      return (row as DungeonSeason) ?? null;
    }
  }

  async listAll(tx?: DatabaseClient): Promise<DungeonSeason[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.dungeonSeasons)
        .orderBy(desc(sqliteSchema.dungeonSeasons.startsAt));
      return rows as DungeonSeason[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.dungeonSeasons)
        .orderBy(desc(pgSchema.dungeonSeasons.startsAt));
      return rows as DungeonSeason[];
    }
  }

  async create(season: NewDungeonSeason, tx?: DatabaseClient): Promise<DungeonSeason> {
    const client = this.getClient(tx);
    const id = season.id || randomUUID();
    const payload = {
      ...season,
      id,
      createdAt: season.createdAt ?? new Date(),
    };

    if (this.isSqlite(client)) {
      const [inserted] = await client.db
        .insert(sqliteSchema.dungeonSeasons)
        .values(payload as typeof sqliteSchema.dungeonSeasons.$inferInsert)
        .returning();
      return inserted as DungeonSeason;
    } else {
      const [inserted] = await client.db
        .insert(pgSchema.dungeonSeasons)
        .values(payload as typeof pgSchema.dungeonSeasons.$inferInsert)
        .returning();
      return inserted as DungeonSeason;
    }
  }

  async update(
    id: string,
    data: Partial<NewDungeonSeason>,
    tx?: DatabaseClient,
  ): Promise<DungeonSeason> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [updated] = await client.db
        .update(sqliteSchema.dungeonSeasons)
        .set(data as typeof sqliteSchema.dungeonSeasons.$inferInsert)
        .where(eq(sqliteSchema.dungeonSeasons.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`DungeonSeason not found: ${id}`);
      return updated as DungeonSeason;
    } else {
      const [updated] = await client.db
        .update(pgSchema.dungeonSeasons)
        .set(data as typeof pgSchema.dungeonSeasons.$inferInsert)
        .where(eq(pgSchema.dungeonSeasons.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`DungeonSeason not found: ${id}`);
      return updated as DungeonSeason;
    }
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    const record = await this.findById(id, tx);
    return record !== null;
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const deleted = await client.db
        .delete(sqliteSchema.dungeonSeasons)
        .where(eq(sqliteSchema.dungeonSeasons.id, id))
        .returning({ id: sqliteSchema.dungeonSeasons.id });
      return deleted.length > 0;
    } else {
      const deleted = await client.db
        .delete(pgSchema.dungeonSeasons)
        .where(eq(pgSchema.dungeonSeasons.id, id))
        .returning({ id: pgSchema.dungeonSeasons.id });
      return deleted.length > 0;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [result] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.dungeonSeasons);
      return Number(result?.count ?? 0);
    } else {
      const [result] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.dungeonSeasons);
      return Number(result?.count ?? 0);
    }
  }
}

/**
 * Repository for Dungeon Floors (Tutorial T1–T4, Season Floors F1–F50+).
 */
export class DungeonFloorRepository extends BaseRepository<
  DungeonFloor,
  NewDungeonFloor,
  Partial<NewDungeonFloor>
> {
  async findById(id: string, tx?: DatabaseClient): Promise<DungeonFloor | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.dungeonFloors)
        .where(eq(sqliteSchema.dungeonFloors.id, id));
      return (row as DungeonFloor) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.dungeonFloors)
        .where(eq(pgSchema.dungeonFloors.id, id));
      return (row as DungeonFloor) ?? null;
    }
  }

  async findBySeasonAndFloor(
    seasonId: string,
    floorNumber: number,
    tx?: DatabaseClient,
  ): Promise<DungeonFloor | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.dungeonFloors)
        .where(
          and(
            eq(sqliteSchema.dungeonFloors.seasonId, seasonId),
            eq(sqliteSchema.dungeonFloors.floorNumber, floorNumber),
          ),
        );
      return (row as DungeonFloor) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.dungeonFloors)
        .where(
          and(
            eq(pgSchema.dungeonFloors.seasonId, seasonId),
            eq(pgSchema.dungeonFloors.floorNumber, floorNumber),
          ),
        );
      return (row as DungeonFloor) ?? null;
    }
  }

  async listFloorsForSeason(seasonId: string, tx?: DatabaseClient): Promise<DungeonFloor[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.dungeonFloors)
        .where(eq(sqliteSchema.dungeonFloors.seasonId, seasonId))
        .orderBy(asc(sqliteSchema.dungeonFloors.floorNumber));
      return rows as DungeonFloor[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.dungeonFloors)
        .where(eq(pgSchema.dungeonFloors.seasonId, seasonId))
        .orderBy(asc(pgSchema.dungeonFloors.floorNumber));
      return rows as DungeonFloor[];
    }
  }

  async create(floor: NewDungeonFloor, tx?: DatabaseClient): Promise<DungeonFloor> {
    const client = this.getClient(tx);
    const id = floor.id || randomUUID();
    const payload = {
      ...floor,
      id,
      createdAt: floor.createdAt ?? new Date(),
    };

    if (this.isSqlite(client)) {
      const [inserted] = await client.db
        .insert(sqliteSchema.dungeonFloors)
        .values(payload as typeof sqliteSchema.dungeonFloors.$inferInsert)
        .returning();
      return inserted as DungeonFloor;
    } else {
      const [inserted] = await client.db
        .insert(pgSchema.dungeonFloors)
        .values(payload as typeof pgSchema.dungeonFloors.$inferInsert)
        .returning();
      return inserted as DungeonFloor;
    }
  }

  async update(
    id: string,
    data: Partial<NewDungeonFloor>,
    tx?: DatabaseClient,
  ): Promise<DungeonFloor> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [updated] = await client.db
        .update(sqliteSchema.dungeonFloors)
        .set(data as typeof sqliteSchema.dungeonFloors.$inferInsert)
        .where(eq(sqliteSchema.dungeonFloors.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`DungeonFloor not found: ${id}`);
      return updated as DungeonFloor;
    } else {
      const [updated] = await client.db
        .update(pgSchema.dungeonFloors)
        .set(data as typeof pgSchema.dungeonFloors.$inferInsert)
        .where(eq(pgSchema.dungeonFloors.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`DungeonFloor not found: ${id}`);
      return updated as DungeonFloor;
    }
  }

  /**
   * Creates or replaces the floor row for (seasonId, floorNumber). Keeps the existing id.
   */
  async upsertBySeasonAndFloor(floor: NewDungeonFloor, tx?: DatabaseClient): Promise<DungeonFloor> {
    const existing = await this.findBySeasonAndFloor(floor.seasonId, floor.floorNumber, tx);
    if (!existing) return this.create(floor, tx);
    const { id: _ignored, createdAt: _created, ...data } = floor;
    return this.update(existing.id, data, tx);
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    const record = await this.findById(id, tx);
    return record !== null;
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const deleted = await client.db
        .delete(sqliteSchema.dungeonFloors)
        .where(eq(sqliteSchema.dungeonFloors.id, id))
        .returning({ id: sqliteSchema.dungeonFloors.id });
      return deleted.length > 0;
    } else {
      const deleted = await client.db
        .delete(pgSchema.dungeonFloors)
        .where(eq(pgSchema.dungeonFloors.id, id))
        .returning({ id: pgSchema.dungeonFloors.id });
      return deleted.length > 0;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [result] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.dungeonFloors);
      return Number(result?.count ?? 0);
    } else {
      const [result] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.dungeonFloors);
      return Number(result?.count ?? 0);
    }
  }
}

/**
 * Repository for User Dungeon Progress (highest cleared floor, attempts, clear count).
 */
export class UserDungeonProgressRepository extends BaseRepository<
  UserDungeonProgress,
  NewUserDungeonProgress,
  Partial<NewUserDungeonProgress>
> {
  async findById(id: string, tx?: DatabaseClient): Promise<UserDungeonProgress | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.userDungeonProgress)
        .where(eq(sqliteSchema.userDungeonProgress.id, id));
      return (row as UserDungeonProgress) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.userDungeonProgress)
        .where(eq(pgSchema.userDungeonProgress.id, id));
      return (row as UserDungeonProgress) ?? null;
    }
  }

  async findByUserAndSeason(
    userId: string,
    seasonId: string,
    tx?: DatabaseClient,
  ): Promise<UserDungeonProgress | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.userDungeonProgress)
        .where(
          and(
            eq(sqliteSchema.userDungeonProgress.userId, userId),
            eq(sqliteSchema.userDungeonProgress.seasonId, seasonId),
          ),
        );
      return (row as UserDungeonProgress) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.userDungeonProgress)
        .where(
          and(
            eq(pgSchema.userDungeonProgress.userId, userId),
            eq(pgSchema.userDungeonProgress.seasonId, seasonId),
          ),
        );
      return (row as UserDungeonProgress) ?? null;
    }
  }

  async create(data: NewUserDungeonProgress, tx?: DatabaseClient): Promise<UserDungeonProgress> {
    const client = this.getClient(tx);
    const id = data.id || randomUUID();
    const payload = {
      ...data,
      id,
      createdAt: data.createdAt ?? new Date(),
      updatedAt: data.updatedAt ?? new Date(),
    };

    if (this.isSqlite(client)) {
      const [inserted] = await client.db
        .insert(sqliteSchema.userDungeonProgress)
        .values(payload as typeof sqliteSchema.userDungeonProgress.$inferInsert)
        .returning();
      return inserted as UserDungeonProgress;
    } else {
      const [inserted] = await client.db
        .insert(pgSchema.userDungeonProgress)
        .values(payload as typeof pgSchema.userDungeonProgress.$inferInsert)
        .returning();
      return inserted as UserDungeonProgress;
    }
  }

  async update(
    id: string,
    data: Partial<NewUserDungeonProgress>,
    tx?: DatabaseClient,
  ): Promise<UserDungeonProgress> {
    const client = this.getClient(tx);
    const payload = {
      ...data,
      updatedAt: new Date(),
    };

    if (this.isSqlite(client)) {
      const [updated] = await client.db
        .update(sqliteSchema.userDungeonProgress)
        .set(payload as typeof sqliteSchema.userDungeonProgress.$inferInsert)
        .where(eq(sqliteSchema.userDungeonProgress.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`UserDungeonProgress not found: ${id}`);
      return updated as UserDungeonProgress;
    } else {
      const [updated] = await client.db
        .update(pgSchema.userDungeonProgress)
        .set(payload as typeof pgSchema.userDungeonProgress.$inferInsert)
        .where(eq(pgSchema.userDungeonProgress.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`UserDungeonProgress not found: ${id}`);
      return updated as UserDungeonProgress;
    }
  }

  async getOrCreateProgress(
    userId: string,
    seasonId: string,
    tx?: DatabaseClient,
  ): Promise<UserDungeonProgress> {
    const existing = await this.findByUserAndSeason(userId, seasonId, tx);
    if (existing) return existing;

    return this.create(
      {
        userId,
        seasonId,
        highestClearedFloor: 0,
        attemptsCount: 0,
        clearCount: 0,
        firstClearedAt: null,
        lastAttemptAt: new Date(),
      },
      tx,
    );
  }

  async recordFloorAttempt(
    userId: string,
    seasonId: string,
    floorNumber: number,
    cleared: boolean,
    tx?: DatabaseClient,
  ): Promise<UserDungeonProgress> {
    const progress = await this.getOrCreateProgress(userId, seasonId, tx);
    const client = this.getClient(tx);
    const now = new Date();

    const newHighest =
      cleared && floorNumber > progress.highestClearedFloor
        ? floorNumber
        : progress.highestClearedFloor;

    const firstClearedAt =
      cleared && !progress.firstClearedAt && floorNumber > 0 ? now : progress.firstClearedAt;

    const updates = {
      attemptsCount: progress.attemptsCount + 1,
      clearCount: cleared ? progress.clearCount + 1 : progress.clearCount,
      highestClearedFloor: newHighest,
      firstClearedAt,
      lastAttemptAt: now,
      updatedAt: now,
    };

    if (this.isSqlite(client)) {
      const [updated] = await client.db
        .update(sqliteSchema.userDungeonProgress)
        .set(updates as typeof sqliteSchema.userDungeonProgress.$inferInsert)
        .where(eq(sqliteSchema.userDungeonProgress.id, progress.id))
        .returning();
      return updated as UserDungeonProgress;
    } else {
      const [updated] = await client.db
        .update(pgSchema.userDungeonProgress)
        .set(updates as typeof pgSchema.userDungeonProgress.$inferInsert)
        .where(eq(pgSchema.userDungeonProgress.id, progress.id))
        .returning();
      return updated as UserDungeonProgress;
    }
  }

  async getSeasonLeaderboard(
    seasonId: string,
    limit: number = 25,
    tx?: DatabaseClient,
  ): Promise<UserDungeonProgress[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.userDungeonProgress)
        .where(eq(sqliteSchema.userDungeonProgress.seasonId, seasonId))
        .orderBy(
          desc(sqliteSchema.userDungeonProgress.highestClearedFloor),
          desc(sqliteSchema.userDungeonProgress.clearCount),
          asc(sqliteSchema.userDungeonProgress.lastAttemptAt),
        )
        .limit(limit);
      return rows as UserDungeonProgress[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.userDungeonProgress)
        .where(eq(pgSchema.userDungeonProgress.seasonId, seasonId))
        .orderBy(
          desc(pgSchema.userDungeonProgress.highestClearedFloor),
          desc(pgSchema.userDungeonProgress.clearCount),
          asc(pgSchema.userDungeonProgress.lastAttemptAt),
        )
        .limit(limit);
      return rows as UserDungeonProgress[];
    }
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    const record = await this.findById(id, tx);
    return record !== null;
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const deleted = await client.db
        .delete(sqliteSchema.userDungeonProgress)
        .where(eq(sqliteSchema.userDungeonProgress.id, id))
        .returning({ id: sqliteSchema.userDungeonProgress.id });
      return deleted.length > 0;
    } else {
      const deleted = await client.db
        .delete(pgSchema.userDungeonProgress)
        .where(eq(pgSchema.userDungeonProgress.id, id))
        .returning({ id: pgSchema.userDungeonProgress.id });
      return deleted.length > 0;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [result] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.userDungeonProgress);
      return Number(result?.count ?? 0);
    } else {
      const [result] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.userDungeonProgress);
      return Number(result?.count ?? 0);
    }
  }
}

/**
 * Repository for seasonal dungeon bosses (anime characters with combat definitions).
 */
export class DungeonBossRepository extends BaseRepository<
  DungeonBoss,
  NewDungeonBoss,
  Partial<NewDungeonBoss>
> {
  async findById(id: string, tx?: DatabaseClient): Promise<DungeonBoss | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.dungeonBosses)
        .where(eq(sqliteSchema.dungeonBosses.id, id));
      return (row as DungeonBoss) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.dungeonBosses)
        .where(eq(pgSchema.dungeonBosses.id, id));
      return (row as unknown as DungeonBoss) ?? null;
    }
  }

  async listForSeason(seasonId: string, tx?: DatabaseClient): Promise<DungeonBoss[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.dungeonBosses)
        .where(eq(sqliteSchema.dungeonBosses.seasonId, seasonId))
        .orderBy(asc(sqliteSchema.dungeonBosses.key));
      return rows as DungeonBoss[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.dungeonBosses)
        .where(eq(pgSchema.dungeonBosses.seasonId, seasonId))
        .orderBy(asc(pgSchema.dungeonBosses.key));
      return rows as unknown as DungeonBoss[];
    }
  }

  /**
   * Inserts the boss or replaces every field of the existing row with the same id.
   */
  async upsert(boss: NewDungeonBoss, tx?: DatabaseClient): Promise<DungeonBoss> {
    const client = this.getClient(tx);
    const now = new Date();
    const { id: _id, createdAt: _createdAt, ...fields } = boss;
    const updateSet = { ...fields, updatedAt: now };
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .insert(sqliteSchema.dungeonBosses)
        .values({ ...boss, createdAt: boss.createdAt ?? now, updatedAt: now })
        .onConflictDoUpdate({ target: sqliteSchema.dungeonBosses.id, set: updateSet })
        .returning();
      return row as DungeonBoss;
    } else {
      const [row] = await client.db
        .insert(pgSchema.dungeonBosses)
        .values({
          ...boss,
          createdAt: boss.createdAt ?? now,
          updatedAt: now,
        } as typeof pgSchema.dungeonBosses.$inferInsert)
        .onConflictDoUpdate({
          target: pgSchema.dungeonBosses.id,
          set: updateSet as Partial<typeof pgSchema.dungeonBosses.$inferInsert>,
        })
        .returning();
      return row as unknown as DungeonBoss;
    }
  }

  async update(
    id: string,
    data: Partial<NewDungeonBoss>,
    tx?: DatabaseClient,
  ): Promise<DungeonBoss> {
    const client = this.getClient(tx);
    const updateData = { ...data, updatedAt: new Date() };
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .update(sqliteSchema.dungeonBosses)
        .set(updateData)
        .where(eq(sqliteSchema.dungeonBosses.id, id))
        .returning();
      if (!row) throw new DatabaseError(`DungeonBoss not found: ${id}`);
      return row as DungeonBoss;
    } else {
      const [row] = await client.db
        .update(pgSchema.dungeonBosses)
        .set(updateData as Partial<typeof pgSchema.dungeonBosses.$inferInsert>)
        .where(eq(pgSchema.dungeonBosses.id, id))
        .returning();
      if (!row) throw new DatabaseError(`DungeonBoss not found: ${id}`);
      return row as unknown as DungeonBoss;
    }
  }

  async create(boss: NewDungeonBoss, tx?: DatabaseClient): Promise<DungeonBoss> {
    return this.upsert(boss, tx);
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    return (await this.findById(id, tx)) !== null;
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const deleted = await client.db
        .delete(sqliteSchema.dungeonBosses)
        .where(eq(sqliteSchema.dungeonBosses.id, id))
        .returning({ id: sqliteSchema.dungeonBosses.id });
      return deleted.length > 0;
    } else {
      const deleted = await client.db
        .delete(pgSchema.dungeonBosses)
        .where(eq(pgSchema.dungeonBosses.id, id))
        .returning({ id: pgSchema.dungeonBosses.id });
      return deleted.length > 0;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [result] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.dungeonBosses);
      return Number(result?.count ?? 0);
    } else {
      const [result] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.dungeonBosses);
      return Number(result?.count ?? 0);
    }
  }
}
