import { eq, and, desc, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type { WaifuCard, NewWaifuCard, UserCard, NewUserCard } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';

export class WaifuCardRepository extends BaseRepository<
  WaifuCard,
  NewWaifuCard,
  Partial<NewWaifuCard>
> {
  // ─── WAIFU CARDS ──────────────────────────────────────────────────────────

  async findById(id: string, tx?: DatabaseClient): Promise<WaifuCard | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.waifuCards)
        .where(eq(sqliteSchema.waifuCards.id, id));
      return (row as WaifuCard) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.waifuCards)
        .where(eq(pgSchema.waifuCards.id, id));
      return (row as unknown as WaifuCard) ?? null;
    }
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    const card = await this.findById(id, tx);
    return card !== null;
  }

  async findByAssetId(assetId: string, tx?: DatabaseClient): Promise<WaifuCard | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.waifuCards)
        .where(eq(sqliteSchema.waifuCards.assetId, assetId));
      return (row as WaifuCard) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.waifuCards)
        .where(eq(pgSchema.waifuCards.assetId, assetId));
      return (row as unknown as WaifuCard) ?? null;
    }
  }

  async create(data: NewWaifuCard, tx?: DatabaseClient): Promise<WaifuCard> {
    const client = this.getClient(tx);
    const id = data.id ?? randomUUID();

    try {
      if (this.isSqlite(client)) {
        const [row] = await client.db
          .insert(sqliteSchema.waifuCards)
          .values({
            id,
            assetId: data.assetId,
            name: data.name,
            rarity: data.rarity,
            element: data.element,
            attack: data.attack,
            defense: data.defense,
            speed: data.speed,
            health: data.health,
            critRate: data.critRate ?? 0.05,
            skillName: data.skillName ?? null,
            skillDescription: data.skillDescription ?? null,
            passiveName: data.passiveName ?? null,
            passiveDescription: data.passiveDescription ?? null,
            collectionNumber: data.collectionNumber,
            isActive: data.isActive ?? true,
          })
          .returning();
        return row as WaifuCard;
      } else {
        const [row] = await client.db
          .insert(pgSchema.waifuCards)
          .values({
            id,
            assetId: data.assetId,
            name: data.name,
            rarity: data.rarity,
            element: data.element,
            attack: data.attack,
            defense: data.defense,
            speed: data.speed,
            health: data.health,
            critRate: data.critRate ?? 0.05,
            skillName: data.skillName ?? null,
            skillDescription: data.skillDescription ?? null,
            passiveName: data.passiveName ?? null,
            passiveDescription: data.passiveDescription ?? null,
            collectionNumber: data.collectionNumber,
            isActive: data.isActive ?? true,
          })
          .returning();
        return row as unknown as WaifuCard;
      }
    } catch (err: unknown) {
      throw new DatabaseError(
        `Failed to create waifu card: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err instanceof Error ? err : undefined },
      );
    }
  }

  async listCards(
    options?: {
      rarity?: string;
      element?: string;
      isActive?: boolean;
      limit?: number;
      offset?: number;
    },
    tx?: DatabaseClient,
  ): Promise<WaifuCard[]> {
    const client = this.getClient(tx);
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    if (this.isSqlite(client)) {
      const conditions = [];
      if (options?.rarity) conditions.push(eq(sqliteSchema.waifuCards.rarity, options.rarity));
      if (options?.element) conditions.push(eq(sqliteSchema.waifuCards.element, options.element));
      if (options?.isActive !== undefined)
        conditions.push(eq(sqliteSchema.waifuCards.isActive, options.isActive));

      const query = client.db
        .select()
        .from(sqliteSchema.waifuCards)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .limit(limit)
        .offset(offset);

      const rows = await query;
      return rows as WaifuCard[];
    } else {
      const conditions = [];
      if (options?.rarity) conditions.push(eq(pgSchema.waifuCards.rarity, options.rarity));
      if (options?.element) conditions.push(eq(pgSchema.waifuCards.element, options.element));
      if (options?.isActive !== undefined)
        conditions.push(eq(pgSchema.waifuCards.isActive, options.isActive));

      const query = client.db
        .select()
        .from(pgSchema.waifuCards)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .limit(limit)
        .offset(offset);

      const rows = await query;
      return rows as unknown as WaifuCard[];
    }
  }

  async countCards(
    options?: { rarity?: string; element?: string },
    tx?: DatabaseClient,
  ): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const conditions = [];
      if (options?.rarity) conditions.push(eq(sqliteSchema.waifuCards.rarity, options.rarity));
      if (options?.element) conditions.push(eq(sqliteSchema.waifuCards.element, options.element));

      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.waifuCards)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      return Number(res?.count ?? 0);
    } else {
      const conditions = [];
      if (options?.rarity) conditions.push(eq(pgSchema.waifuCards.rarity, options.rarity));
      if (options?.element) conditions.push(eq(pgSchema.waifuCards.element, options.element));

      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.waifuCards)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      return Number(res?.count ?? 0);
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    return this.countCards(undefined, tx);
  }

  async update(id: string, data: Partial<NewWaifuCard>, tx?: DatabaseClient): Promise<WaifuCard> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [updated] = await client.db
        .update(sqliteSchema.waifuCards)
        .set(data)
        .where(eq(sqliteSchema.waifuCards.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`Waifu card ${id} not found for update`);
      return updated as WaifuCard;
    } else {
      const [updated] = await client.db
        .update(pgSchema.waifuCards)
        .set(data as unknown as Partial<typeof pgSchema.waifuCards.$inferInsert>)
        .where(eq(pgSchema.waifuCards.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`Waifu card ${id} not found for update`);
      return updated as unknown as WaifuCard;
    }
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const result = await client.db
        .delete(sqliteSchema.waifuCards)
        .where(eq(sqliteSchema.waifuCards.id, id));
      return (result.changes ?? 0) > 0;
    } else {
      const [deleted] = await client.db
        .delete(pgSchema.waifuCards)
        .where(eq(pgSchema.waifuCards.id, id))
        .returning();
      return !!deleted;
    }
  }

  // ─── USER CARDS ───────────────────────────────────────────────────────────

  async createUserCard(data: NewUserCard, tx?: DatabaseClient): Promise<UserCard> {
    const client = this.getClient(tx);
    const id = data.id ?? randomUUID();

    try {
      if (this.isSqlite(client)) {
        const [row] = await client.db
          .insert(sqliteSchema.userCards)
          .values({
            id,
            userId: data.userId,
            cardId: data.cardId,
            serialNumber: data.serialNumber,
            level: data.level ?? 1,
            exp: data.exp ?? 0,
            state: data.state ?? 'IDLE',
            isFavorite: data.isFavorite ?? false,
            obtainedAt: data.obtainedAt ?? new Date(),
          })
          .returning();
        return row as UserCard;
      } else {
        const [row] = await client.db
          .insert(pgSchema.userCards)
          .values({
            id,
            userId: data.userId,
            cardId: data.cardId,
            serialNumber: data.serialNumber,
            level: data.level ?? 1,
            exp: data.exp ?? 0,
            state: data.state ?? 'IDLE',
            isFavorite: data.isFavorite ?? false,
            obtainedAt: data.obtainedAt ?? new Date(),
          })
          .returning();
        return row as unknown as UserCard;
      }
    } catch (err: unknown) {
      throw new DatabaseError(
        `Failed to create user card: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err instanceof Error ? err : undefined },
      );
    }
  }

  async findUserCardById(id: string, tx?: DatabaseClient): Promise<UserCard | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.userCards)
        .where(eq(sqliteSchema.userCards.id, id));
      return (row as UserCard) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.userCards)
        .where(eq(pgSchema.userCards.id, id));
      return (row as unknown as UserCard) ?? null;
    }
  }

  async listUserCards(
    userId: string,
    options?: {
      state?: string;
      isFavorite?: boolean;
      limit?: number;
      offset?: number;
    },
    tx?: DatabaseClient,
  ): Promise<UserCard[]> {
    const client = this.getClient(tx);
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    if (this.isSqlite(client)) {
      const conditions = [eq(sqliteSchema.userCards.userId, userId)];
      if (options?.state) conditions.push(eq(sqliteSchema.userCards.state, options.state));
      if (options?.isFavorite !== undefined)
        conditions.push(eq(sqliteSchema.userCards.isFavorite, options.isFavorite));

      const rows = await client.db
        .select()
        .from(sqliteSchema.userCards)
        .where(and(...conditions))
        .orderBy(desc(sqliteSchema.userCards.obtainedAt))
        .limit(limit)
        .offset(offset);

      return rows as UserCard[];
    } else {
      const conditions = [eq(pgSchema.userCards.userId, userId)];
      if (options?.state) conditions.push(eq(pgSchema.userCards.state, options.state));
      if (options?.isFavorite !== undefined)
        conditions.push(eq(pgSchema.userCards.isFavorite, options.isFavorite));

      const rows = await client.db
        .select()
        .from(pgSchema.userCards)
        .where(and(...conditions))
        .orderBy(desc(pgSchema.userCards.obtainedAt))
        .limit(limit)
        .offset(offset);

      return rows as unknown as UserCard[];
    }
  }

  async countUserCards(
    userId: string,
    options?: { state?: string },
    tx?: DatabaseClient,
  ): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const conditions = [eq(sqliteSchema.userCards.userId, userId)];
      if (options?.state) conditions.push(eq(sqliteSchema.userCards.state, options.state));

      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.userCards)
        .where(and(...conditions));
      return Number(res?.count ?? 0);
    } else {
      const conditions = [eq(pgSchema.userCards.userId, userId)];
      if (options?.state) conditions.push(eq(pgSchema.userCards.state, options.state));

      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.userCards)
        .where(and(...conditions));
      return Number(res?.count ?? 0);
    }
  }

  async getHighestSerialNumber(cardId: string, tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [res] = await client.db
        .select({ maxSerial: sql<number>`max(${sqliteSchema.userCards.serialNumber})` })
        .from(sqliteSchema.userCards)
        .where(eq(sqliteSchema.userCards.cardId, cardId));
      return Number(res?.maxSerial ?? 0);
    } else {
      const [res] = await client.db
        .select({ maxSerial: sql<number>`max(${pgSchema.userCards.serialNumber})` })
        .from(pgSchema.userCards)
        .where(eq(pgSchema.userCards.cardId, cardId));
      return Number(res?.maxSerial ?? 0);
    }
  }

  async updateUserCardLevelAndExp(
    id: string,
    level: number,
    exp: number,
    tx?: DatabaseClient,
  ): Promise<UserCard | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .update(sqliteSchema.userCards)
        .set({ level, exp })
        .where(eq(sqliteSchema.userCards.id, id))
        .returning();
      return (row as UserCard) ?? null;
    } else {
      const [row] = await client.db
        .update(pgSchema.userCards)
        .set({ level, exp })
        .where(eq(pgSchema.userCards.id, id))
        .returning();
      return (row as unknown as UserCard) ?? null;
    }
  }

  async updateUserCardState(
    id: string,
    state: string,
    tx?: DatabaseClient,
  ): Promise<UserCard | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .update(sqliteSchema.userCards)
        .set({ state })
        .where(eq(sqliteSchema.userCards.id, id))
        .returning();
      return (row as UserCard) ?? null;
    } else {
      const [row] = await client.db
        .update(pgSchema.userCards)
        .set({ state })
        .where(eq(pgSchema.userCards.id, id))
        .returning();
      return (row as unknown as UserCard) ?? null;
    }
  }

  async incrementUserCardBattlesWon(
    id: string,
    delta: number = 1,
    tx?: DatabaseClient,
  ): Promise<UserCard | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .update(sqliteSchema.userCards)
        .set({ battlesWon: sql`${sqliteSchema.userCards.battlesWon} + ${delta}` })
        .where(eq(sqliteSchema.userCards.id, id))
        .returning();
      return (row as UserCard) ?? null;
    } else {
      const [row] = await client.db
        .update(pgSchema.userCards)
        .set({ battlesWon: sql`${pgSchema.userCards.battlesWon} + ${delta}` })
        .where(eq(pgSchema.userCards.id, id))
        .returning();
      return (row as unknown as UserCard) ?? null;
    }
  }

  async updateUserCardOwner(
    id: string,
    newUserId: string,
    newState: string = 'IDLE',
    tx?: DatabaseClient,
  ): Promise<UserCard | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .update(sqliteSchema.userCards)
        .set({ userId: newUserId, state: newState })
        .where(eq(sqliteSchema.userCards.id, id))
        .returning();
      return (row as UserCard) ?? null;
    } else {
      const [row] = await client.db
        .update(pgSchema.userCards)
        .set({ userId: newUserId, state: newState })
        .where(eq(pgSchema.userCards.id, id))
        .returning();
      return (row as unknown as UserCard) ?? null;
    }
  }

  async toggleUserCardFavorite(
    id: string,
    isFavorite: boolean,
    tx?: DatabaseClient,
  ): Promise<UserCard | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .update(sqliteSchema.userCards)
        .set({ isFavorite })
        .where(eq(sqliteSchema.userCards.id, id))
        .returning();
      return (row as UserCard) ?? null;
    } else {
      const [row] = await client.db
        .update(pgSchema.userCards)
        .set({ isFavorite })
        .where(eq(pgSchema.userCards.id, id))
        .returning();
      return (row as unknown as UserCard) ?? null;
    }
  }

  async deleteUserCard(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const res = await client.db
        .delete(sqliteSchema.userCards)
        .where(eq(sqliteSchema.userCards.id, id))
        .returning();
      return res.length > 0;
    } else {
      const res = await client.db
        .delete(pgSchema.userCards)
        .where(eq(pgSchema.userCards.id, id))
        .returning();
      return res.length > 0;
    }
  }
}
