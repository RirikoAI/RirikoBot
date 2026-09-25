import { eq, sql } from 'drizzle-orm';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type { PlayerEnergy, NewPlayerEnergy } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { withTransaction } from '../transactions/index.js';
import {
  DatabaseError,
  DEFAULT_RESET_SCHEDULE,
  getResetDayKey,
  type ResetSchedule,
} from '@ririko/core';

export interface ConsumePotionResult {
  success: boolean;
  reason?: string | undefined;
  energy: PlayerEnergy;
  potsUsedToday: number;
  energyRestored: number;
}

/**
 * Repository for player energy tracking, stamina replenishment, and anti-abuse daily potion ceilings.
 */
export class PlayerEnergyRepository extends BaseRepository<
  PlayerEnergy,
  NewPlayerEnergy,
  Partial<NewPlayerEnergy>,
  string
> {
  constructor(
    client: DatabaseClient,
    private readonly resetSchedule: ResetSchedule = DEFAULT_RESET_SCHEDULE,
  ) {
    super(client);
  }

  /** The reset-day key for the energy potion ceiling, honouring the configured boundary. */
  private currentDayKey(now: Date = new Date()): string {
    return getResetDayKey(now, this.resetSchedule);
  }

  async findById(userId: string, tx?: DatabaseClient): Promise<PlayerEnergy | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.playerEnergy)
        .where(eq(sqliteSchema.playerEnergy.userId, userId));
      return (row as PlayerEnergy) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.playerEnergy)
        .where(eq(pgSchema.playerEnergy.userId, userId));
      return (row as unknown as PlayerEnergy) ?? null;
    }
  }

  async exists(userId: string, tx?: DatabaseClient): Promise<boolean> {
    const found = await this.findById(userId, tx);
    return found !== null;
  }

  async create(data: NewPlayerEnergy, tx?: DatabaseClient): Promise<PlayerEnergy> {
    const client = this.getClient(tx);
    const now = new Date();
    const today = this.currentDayKey(now);
    const insertData = {
      ...data,
      currentEnergy: data.currentEnergy ?? 100,
      maxEnergy: data.maxEnergy ?? 100,
      bonusEnergy: data.bonusEnergy ?? 0,
      dailyEnergyPotsUsed: data.dailyEnergyPotsUsed ?? 0,
      lastReplenishedAt: data.lastReplenishedAt ?? now,
      lastResetDate: data.lastResetDate ?? today,
      updatedAt: now,
    };

    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.playerEnergy)
        .values(insertData)
        .returning();
      if (!created)
        throw new DatabaseError(`Failed to create player energy for ${data.userId} in SQLite`);
      return created as PlayerEnergy;
    } else {
      const [created] = await client.db
        .insert(pgSchema.playerEnergy)
        .values(insertData as unknown as typeof pgSchema.playerEnergy.$inferInsert)
        .returning();
      if (!created)
        throw new DatabaseError(`Failed to create player energy for ${data.userId} in PostgreSQL`);
      return created as unknown as PlayerEnergy;
    }
  }

  async getOrCreate(userId: string, tx?: DatabaseClient): Promise<PlayerEnergy> {
    const existing = await this.findById(userId, tx);
    if (existing) return existing;

    const client = this.getClient(tx);
    const now = new Date();
    const today = this.currentDayKey(now);

    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.playerEnergy)
        .values({
          userId,
          currentEnergy: 100,
          maxEnergy: 100,
          bonusEnergy: 0,
          dailyEnergyPotsUsed: 0,
          lastReplenishedAt: now,
          lastResetDate: today,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: sqliteSchema.playerEnergy.userId,
          set: { updatedAt: now },
        })
        .returning();

      if (!created) throw new DatabaseError(`Failed to get or create player energy for ${userId}`);
      return created as PlayerEnergy;
    } else {
      const [created] = await client.db
        .insert(pgSchema.playerEnergy)
        .values({
          userId,
          currentEnergy: 100,
          maxEnergy: 100,
          bonusEnergy: 0,
          dailyEnergyPotsUsed: 0,
          lastReplenishedAt: now,
          lastResetDate: today,
          updatedAt: now,
        } as unknown as typeof pgSchema.playerEnergy.$inferInsert)
        .onConflictDoUpdate({
          target: pgSchema.playerEnergy.userId,
          set: { updatedAt: now },
        })
        .returning();

      if (!created) throw new DatabaseError(`Failed to get or create player energy for ${userId}`);
      return created as unknown as PlayerEnergy;
    }
  }

  async update(
    userId: string,
    data: Partial<NewPlayerEnergy>,
    tx?: DatabaseClient,
  ): Promise<PlayerEnergy> {
    const client = this.getClient(tx);
    const updateData = { ...data, updatedAt: new Date() };

    if (this.isSqlite(client)) {
      const [updated] = await client.db
        .update(sqliteSchema.playerEnergy)
        .set(updateData)
        .where(eq(sqliteSchema.playerEnergy.userId, userId))
        .returning();
      if (!updated)
        throw new DatabaseError(`Player energy ${userId} not found for update in SQLite`);
      return updated as PlayerEnergy;
    } else {
      const [updated] = await client.db
        .update(pgSchema.playerEnergy)
        .set(updateData as unknown as Partial<typeof pgSchema.playerEnergy.$inferInsert>)
        .where(eq(pgSchema.playerEnergy.userId, userId))
        .returning();
      if (!updated)
        throw new DatabaseError(`Player energy ${userId} not found for update in PostgreSQL`);
      return updated as unknown as PlayerEnergy;
    }
  }

  async delete(userId: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const deleted = await client.db
        .delete(sqliteSchema.playerEnergy)
        .where(eq(sqliteSchema.playerEnergy.userId, userId))
        .returning({ userId: sqliteSchema.playerEnergy.userId });
      return deleted.length > 0;
    } else {
      const deleted = await client.db
        .delete(pgSchema.playerEnergy)
        .where(eq(pgSchema.playerEnergy.userId, userId))
        .returning({ userId: pgSchema.playerEnergy.userId });
      return deleted.length > 0;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.playerEnergy);
      return Number(res?.count ?? 0);
    } else {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.playerEnergy);
      return Number(res?.count ?? 0);
    }
  }

  /**
   * Consumes a stamina potion with automatic UTC daily reset and anti-abuse hard ceilings.
   */
  async consumeEnergyPotion(
    userId: string,
    energyRestored = 50,
    maxDailyLimit = 3,
    tx?: DatabaseClient,
  ): Promise<ConsumePotionResult> {
    const client = this.getClient(tx);

    return withTransaction(client, async (txClient) => {
      const energyRecord = await this.getOrCreate(userId, txClient);
      const today = this.currentDayKey();

      // Check if the reset day rolled over, which clears the daily usage count
      let currentPotsUsed = energyRecord.dailyEnergyPotsUsed;
      if (energyRecord.lastResetDate !== today) {
        currentPotsUsed = 0;
      }

      // Enforce anti-abuse ceiling
      if (currentPotsUsed >= maxDailyLimit) {
        return {
          success: false,
          reason: `Daily stamina potion ceiling reached (max ${maxDailyLimit} per day)`,
          energy: energyRecord,
          potsUsedToday: currentPotsUsed,
          energyRestored: 0,
        };
      }

      const totalCap = energyRecord.maxEnergy + energyRecord.bonusEnergy;
      const actualRestored = Math.min(
        energyRestored,
        Math.max(0, totalCap - energyRecord.currentEnergy),
      );
      const newEnergy = Math.min(totalCap, energyRecord.currentEnergy + energyRestored);
      const newPotsUsed = currentPotsUsed + 1;

      const updated = await this.update(
        userId,
        {
          currentEnergy: newEnergy,
          dailyEnergyPotsUsed: newPotsUsed,
          lastResetDate: today,
        },
        txClient,
      );

      return {
        success: true,
        energy: updated,
        potsUsedToday: newPotsUsed,
        energyRestored: actualRestored,
      };
    });
  }

  /**
   * Consumes energy for game activities (Expeditions, Dungeons, Boss Raids, PvP).
   */
  async consumeEnergy(
    userId: string,
    amount: number,
    tx?: DatabaseClient,
  ): Promise<{ success: boolean; currentEnergy: number; reason?: string }> {
    const client = this.getClient(tx);
    return withTransaction(client, async (txClient) => {
      const record = await this.getOrCreate(userId, txClient);
      if (record.currentEnergy < amount) {
        return {
          success: false,
          currentEnergy: record.currentEnergy,
          reason: `Insufficient energy! Required: ${amount} Energy, but you only have ${record.currentEnergy} Energy.`,
        };
      }
      const updated = await this.update(
        userId,
        { currentEnergy: record.currentEnergy - amount },
        txClient,
      );
      return {
        success: true,
        currentEnergy: updated.currentEnergy,
      };
    });
  }
}
