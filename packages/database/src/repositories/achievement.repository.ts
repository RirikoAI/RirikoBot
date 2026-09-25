import { eq, and, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type {
  GameAchievement,
  NewGameAchievement,
  UserAchievement,
  NewUserAchievement,
} from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';

export class AchievementRepository extends BaseRepository<
  GameAchievement,
  NewGameAchievement,
  Partial<NewGameAchievement>
> {
  private normalizeAchievement(row: Record<string, unknown>): GameAchievement {
    return {
      id: String(row['id']),
      code: String(row['code']),
      title: String(row['title']),
      description: String(row['description']),
      category: String(row['category']),
      tier: String(row['tier'] ?? 'BRONZE'),
      requirementType: String(row['requirementType']),
      requirementTarget: Number(row['requirementTarget'] ?? 1),
      rewardXp: Number(row['rewardXp'] ?? 0),
      rewardCredits: Number(row['rewardCredits'] ?? 0),
      rewardCardId: row['rewardCardId'] ? String(row['rewardCardId']) : null,
      rewardItemId: row['rewardItemId'] ? String(row['rewardItemId']) : null,
      rewardConsumables: (row['rewardConsumables'] as Record<string, unknown>) ?? {},
      rewardTitle: row['rewardTitle'] ? String(row['rewardTitle']) : null,
      badgeIcon: row['badgeIcon'] ? String(row['badgeIcon']) : null,
      isHidden: Boolean(row['isHidden']),
      createdAt:
        row['createdAt'] instanceof Date
          ? row['createdAt']
          : new Date(row['createdAt'] as string | number),
    } as unknown as GameAchievement;
  }

  private normalizeUserAchievement(row: Record<string, unknown>): UserAchievement {
    return {
      id: String(row['id']),
      userId: String(row['userId']),
      achievementId: String(row['achievementId']),
      progress: Number(row['progress'] ?? 0),
      isUnlocked: Boolean(row['isUnlocked']),
      isClaimed: Boolean(row['isClaimed']),
      unlockedAt: row['unlockedAt']
        ? row['unlockedAt'] instanceof Date
          ? row['unlockedAt']
          : new Date(row['unlockedAt'] as string | number)
        : null,
      claimedAt: row['claimedAt']
        ? row['claimedAt'] instanceof Date
          ? row['claimedAt']
          : new Date(row['claimedAt'] as string | number)
        : null,
    } as unknown as UserAchievement;
  }

  async findById(id: string, tx?: DatabaseClient): Promise<GameAchievement | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.gameAchievements)
        .where(eq(sqliteSchema.gameAchievements.id, id));
      return row ? this.normalizeAchievement(row as unknown as Record<string, unknown>) : null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.gameAchievements)
        .where(eq(pgSchema.gameAchievements.id, id));
      return row ? this.normalizeAchievement(row as unknown as Record<string, unknown>) : null;
    }
  }

  async findByCode(code: string, tx?: DatabaseClient): Promise<GameAchievement | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.gameAchievements)
        .where(eq(sqliteSchema.gameAchievements.code, code));
      return row ? this.normalizeAchievement(row as unknown as Record<string, unknown>) : null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.gameAchievements)
        .where(eq(pgSchema.gameAchievements.code, code));
      return row ? this.normalizeAchievement(row as unknown as Record<string, unknown>) : null;
    }
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    const ach = await this.findById(id, tx);
    return ach !== null;
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.gameAchievements);
      return Number(row?.count ?? 0);
    } else {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.gameAchievements);
      return Number(row?.count ?? 0);
    }
  }

  async create(data: NewGameAchievement, tx?: DatabaseClient): Promise<GameAchievement> {
    const client = this.getClient(tx);
    const id = data.id ?? randomUUID();
    const now = new Date();

    const insertValues = {
      id,
      code: data.code,
      title: data.title,
      description: data.description,
      category: data.category,
      tier: data.tier ?? 'BRONZE',
      requirementType: data.requirementType,
      requirementTarget: data.requirementTarget ?? 1,
      rewardXp: data.rewardXp ?? 0,
      rewardCredits: data.rewardCredits ?? 0,
      rewardCardId: data.rewardCardId ?? null,
      rewardItemId: data.rewardItemId ?? null,
      rewardConsumables: data.rewardConsumables ?? {},
      rewardTitle: data.rewardTitle ?? null,
      badgeIcon: data.badgeIcon ?? null,
      isHidden: data.isHidden ?? false,
      createdAt: now,
    };

    if (this.isSqlite(client)) {
      const [row] = await client.db
        .insert(sqliteSchema.gameAchievements)
        .values(insertValues)
        .returning();
      if (!row) throw new DatabaseError('Failed to create GameAchievement');
      return this.normalizeAchievement(row as unknown as Record<string, unknown>);
    } else {
      const [row] = await client.db
        .insert(pgSchema.gameAchievements)
        .values({
          ...insertValues,
          rewardCredits: BigInt(data.rewardCredits ?? 0),
        } as unknown as typeof pgSchema.gameAchievements.$inferInsert)
        .returning();
      if (!row) throw new DatabaseError('Failed to create GameAchievement');
      return this.normalizeAchievement(row as unknown as Record<string, unknown>);
    }
  }

  async update(
    id: string,
    data: Partial<NewGameAchievement>,
    tx?: DatabaseClient,
  ): Promise<GameAchievement> {
    const client = this.getClient(tx);
    const updateData: Record<string, unknown> = {};

    if (data.title !== undefined) updateData['title'] = data.title;
    if (data.description !== undefined) updateData['description'] = data.description;
    if (data.category !== undefined) updateData['category'] = data.category;
    if (data.tier !== undefined) updateData['tier'] = data.tier;
    if (data.requirementType !== undefined) updateData['requirementType'] = data.requirementType;
    if (data.requirementTarget !== undefined)
      updateData['requirementTarget'] = data.requirementTarget;
    if (data.rewardXp !== undefined) updateData['rewardXp'] = data.rewardXp;
    if (data.rewardCredits !== undefined) updateData['rewardCredits'] = data.rewardCredits;
    if (data.rewardCardId !== undefined) updateData['rewardCardId'] = data.rewardCardId;
    if (data.rewardItemId !== undefined) updateData['rewardItemId'] = data.rewardItemId;
    if (data.rewardConsumables !== undefined)
      updateData['rewardConsumables'] = data.rewardConsumables;
    if (data.rewardTitle !== undefined) updateData['rewardTitle'] = data.rewardTitle;
    if (data.badgeIcon !== undefined) updateData['badgeIcon'] = data.badgeIcon;
    if (data.isHidden !== undefined) updateData['isHidden'] = data.isHidden;

    if (this.isSqlite(client)) {
      const [row] = await client.db
        .update(sqliteSchema.gameAchievements)
        .set(updateData)
        .where(eq(sqliteSchema.gameAchievements.id, id))
        .returning();
      if (!row) throw new DatabaseError(`GameAchievement with id ${id} not found`);
      return this.normalizeAchievement(row as unknown as Record<string, unknown>);
    } else {
      const [row] = await client.db
        .update(pgSchema.gameAchievements)
        .set(updateData)
        .where(eq(pgSchema.gameAchievements.id, id))
        .returning();
      if (!row) throw new DatabaseError(`GameAchievement with id ${id} not found`);
      return this.normalizeAchievement(row as unknown as Record<string, unknown>);
    }
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const res = await client.db
        .delete(sqliteSchema.gameAchievements)
        .where(eq(sqliteSchema.gameAchievements.id, id));
      return res.changes > 0;
    } else {
      const res = await client.db
        .delete(pgSchema.gameAchievements)
        .where(eq(pgSchema.gameAchievements.id, id));
      return (res.rowCount ?? 0) > 0;
    }
  }

  async listAchievements(
    options?: { category?: string | undefined; tier?: string | undefined },
    tx?: DatabaseClient,
  ): Promise<GameAchievement[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const conditions = [];
      if (options?.category)
        conditions.push(eq(sqliteSchema.gameAchievements.category, options.category));
      if (options?.tier) conditions.push(eq(sqliteSchema.gameAchievements.tier, options.tier));

      const query = client.db.select().from(sqliteSchema.gameAchievements);
      const rows = conditions.length > 0 ? await query.where(and(...conditions)) : await query;
      return rows.map((r) => this.normalizeAchievement(r as unknown as Record<string, unknown>));
    } else {
      const conditions = [];
      if (options?.category)
        conditions.push(eq(pgSchema.gameAchievements.category, options.category));
      if (options?.tier) conditions.push(eq(pgSchema.gameAchievements.tier, options.tier));

      const query = client.db.select().from(pgSchema.gameAchievements);
      const rows = conditions.length > 0 ? await query.where(and(...conditions)) : await query;
      return rows.map((r) => this.normalizeAchievement(r as unknown as Record<string, unknown>));
    }
  }

  async bulkCreateAchievements(
    achievements: NewGameAchievement[],
    tx?: DatabaseClient,
  ): Promise<void> {
    for (const ach of achievements) {
      const existing = await this.findByCode(ach.code, tx);
      if (!existing) {
        await this.create(ach, tx);
      }
    }
  }

  // --- User Achievements Methods ---

  async getUserAchievement(
    userId: string,
    achievementId: string,
    tx?: DatabaseClient,
  ): Promise<UserAchievement | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.userAchievements)
        .where(
          and(
            eq(sqliteSchema.userAchievements.userId, userId),
            eq(sqliteSchema.userAchievements.achievementId, achievementId),
          ),
        );
      return row ? this.normalizeUserAchievement(row as unknown as Record<string, unknown>) : null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.userAchievements)
        .where(
          and(
            eq(pgSchema.userAchievements.userId, userId),
            eq(pgSchema.userAchievements.achievementId, achievementId),
          ),
        );
      return row ? this.normalizeUserAchievement(row as unknown as Record<string, unknown>) : null;
    }
  }

  async getOrCreateUserAchievement(
    userId: string,
    achievementId: string,
    tx?: DatabaseClient,
  ): Promise<UserAchievement> {
    const existing = await this.getUserAchievement(userId, achievementId, tx);
    if (existing) return existing;

    const client = this.getClient(tx);
    const id = randomUUID();
    const insertValues = {
      id,
      userId,
      achievementId,
      progress: 0,
      isUnlocked: false,
      isClaimed: false,
    };

    if (this.isSqlite(client)) {
      const [row] = await client.db
        .insert(sqliteSchema.userAchievements)
        .values(insertValues)
        .returning();
      if (!row) throw new DatabaseError('Failed to create UserAchievement');
      return this.normalizeUserAchievement(row as unknown as Record<string, unknown>);
    } else {
      const [row] = await client.db
        .insert(pgSchema.userAchievements)
        .values(insertValues)
        .returning();
      if (!row) throw new DatabaseError('Failed to create UserAchievement');
      return this.normalizeUserAchievement(row as unknown as Record<string, unknown>);
    }
  }

  async updateProgress(
    userId: string,
    achievementId: string,
    progress: number,
    isUnlocked = false,
    tx?: DatabaseClient,
  ): Promise<UserAchievement> {
    const current = await this.getOrCreateUserAchievement(userId, achievementId, tx);
    const client = this.getClient(tx);
    const now = new Date();

    const updateData: Record<string, unknown> = {
      progress,
    };

    if (isUnlocked && !current.isUnlocked) {
      updateData['isUnlocked'] = true;
      updateData['unlockedAt'] = now;
    }

    if (this.isSqlite(client)) {
      const [row] = await client.db
        .update(sqliteSchema.userAchievements)
        .set(updateData)
        .where(eq(sqliteSchema.userAchievements.id, current.id))
        .returning();
      if (!row) throw new DatabaseError('Failed to update UserAchievement');
      return this.normalizeUserAchievement(row as unknown as Record<string, unknown>);
    } else {
      const [row] = await client.db
        .update(pgSchema.userAchievements)
        .set(updateData)
        .where(eq(pgSchema.userAchievements.id, current.id))
        .returning();
      if (!row) throw new DatabaseError('Failed to update UserAchievement');
      return this.normalizeUserAchievement(row as unknown as Record<string, unknown>);
    }
  }

  async claimReward(id: string, tx?: DatabaseClient): Promise<UserAchievement> {
    const client = this.getClient(tx);
    const now = new Date();

    if (this.isSqlite(client)) {
      const [row] = await client.db
        .update(sqliteSchema.userAchievements)
        .set({
          isClaimed: true,
          claimedAt: now,
        })
        .where(eq(sqliteSchema.userAchievements.id, id))
        .returning();
      if (!row) throw new DatabaseError('Failed to claim UserAchievement');
      return this.normalizeUserAchievement(row as unknown as Record<string, unknown>);
    } else {
      const [row] = await client.db
        .update(pgSchema.userAchievements)
        .set({
          isClaimed: true,
          claimedAt: now,
        })
        .where(eq(pgSchema.userAchievements.id, id))
        .returning();
      if (!row) throw new DatabaseError('Failed to claim UserAchievement');
      return this.normalizeUserAchievement(row as unknown as Record<string, unknown>);
    }
  }

  async listUserAchievements(
    userId: string,
    options?: { isClaimed?: boolean | undefined; isUnlocked?: boolean | undefined },
    tx?: DatabaseClient,
  ): Promise<(UserAchievement & { achievement: GameAchievement })[]> {
    const client = this.getClient(tx);
    let userAchRows: UserAchievement[];

    if (this.isSqlite(client)) {
      const conditions = [eq(sqliteSchema.userAchievements.userId, userId)];
      if (options?.isClaimed !== undefined) {
        conditions.push(eq(sqliteSchema.userAchievements.isClaimed, options.isClaimed));
      }
      if (options?.isUnlocked !== undefined) {
        conditions.push(eq(sqliteSchema.userAchievements.isUnlocked, options.isUnlocked));
      }

      const rows = await client.db
        .select()
        .from(sqliteSchema.userAchievements)
        .where(and(...conditions));
      userAchRows = rows.map((r) =>
        this.normalizeUserAchievement(r as unknown as Record<string, unknown>),
      );
    } else {
      const conditions = [eq(pgSchema.userAchievements.userId, userId)];
      if (options?.isClaimed !== undefined) {
        conditions.push(eq(pgSchema.userAchievements.isClaimed, options.isClaimed));
      }
      if (options?.isUnlocked !== undefined) {
        conditions.push(eq(pgSchema.userAchievements.isUnlocked, options.isUnlocked));
      }

      const rows = await client.db
        .select()
        .from(pgSchema.userAchievements)
        .where(and(...conditions));
      userAchRows = rows.map((r) =>
        this.normalizeUserAchievement(r as unknown as Record<string, unknown>),
      );
    }

    const results: (UserAchievement & { achievement: GameAchievement })[] = [];
    for (const uAch of userAchRows) {
      const ach = await this.findById(uAch.achievementId, tx);
      if (ach) {
        results.push({
          ...uAch,
          achievement: ach,
        });
      }
    }

    return results;
  }
}
