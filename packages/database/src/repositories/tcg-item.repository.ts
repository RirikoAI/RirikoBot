import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type {
  GameItem,
  NewGameItem,
  UserInventoryItem,
  NewUserInventoryItem,
} from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { withTransaction } from '../transactions/index.js';
import { DatabaseError } from '@ririko/core';

export interface GameItemFindOptions {
  type?: string | undefined;
  subtype?: string | undefined;
  rarity?: string | undefined;
  isShopBuyable?: boolean | undefined;
}

export interface UserInventoryFindOptions {
  slot?: string | undefined;
  state?: string | undefined;
  equippedToCardId?: string | null | undefined;
}

export interface InventoryItemWithDefinition {
  inventoryItem: UserInventoryItem;
  item: GameItem;
}

/**
 * Repository for Waifu TCG item catalog (Equipments, Accessories, Consumables).
 */
export class GameItemRepository extends BaseRepository<
  GameItem,
  NewGameItem,
  Partial<NewGameItem>
> {
  async findById(id: string, tx?: DatabaseClient): Promise<GameItem | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.gameItems)
        .where(eq(sqliteSchema.gameItems.id, id));
      return (row as GameItem) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.gameItems)
        .where(eq(pgSchema.gameItems.id, id));
      if (!row) return null;
      return {
        ...row,
        shopPrice: Number(row.shopPrice),
      } as unknown as GameItem;
    }
  }

  async findByCode(code: string, tx?: DatabaseClient): Promise<GameItem | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.gameItems)
        .where(eq(sqliteSchema.gameItems.code, code));
      return (row as GameItem) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.gameItems)
        .where(eq(pgSchema.gameItems.code, code));
      if (!row) return null;
      return {
        ...row,
        shopPrice: Number(row.shopPrice),
      } as unknown as GameItem;
    }
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    const item = await this.findById(id, tx);
    return item !== null;
  }

  async findAll(options?: GameItemFindOptions, tx?: DatabaseClient): Promise<GameItem[]> {
    const client = this.getClient(tx);

    if (this.isSqlite(client)) {
      const conditions = [];
      if (options?.type !== undefined) {
        conditions.push(eq(sqliteSchema.gameItems.type, options.type));
      }
      if (options?.subtype !== undefined) {
        conditions.push(eq(sqliteSchema.gameItems.subtype, options.subtype));
      }
      if (options?.rarity !== undefined) {
        conditions.push(eq(sqliteSchema.gameItems.rarity, options.rarity));
      }
      if (options?.isShopBuyable !== undefined) {
        conditions.push(eq(sqliteSchema.gameItems.isShopBuyable, options.isShopBuyable));
      }

      const rows = await client.db
        .select()
        .from(sqliteSchema.gameItems)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      return rows as GameItem[];
    } else {
      const conditions = [];
      if (options?.type !== undefined) {
        conditions.push(eq(pgSchema.gameItems.type, options.type));
      }
      if (options?.subtype !== undefined) {
        conditions.push(eq(pgSchema.gameItems.subtype, options.subtype));
      }
      if (options?.rarity !== undefined) {
        conditions.push(eq(pgSchema.gameItems.rarity, options.rarity));
      }
      if (options?.isShopBuyable !== undefined) {
        conditions.push(eq(pgSchema.gameItems.isShopBuyable, options.isShopBuyable));
      }

      const rows = await client.db
        .select()
        .from(pgSchema.gameItems)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      return rows.map((r) => ({
        ...r,
        shopPrice: Number(r.shopPrice),
      })) as unknown as GameItem[];
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.gameItems);
      return Number(res?.count ?? 0);
    } else {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.gameItems);
      return Number(res?.count ?? 0);
    }
  }

  async create(data: NewGameItem, tx?: DatabaseClient): Promise<GameItem> {
    const client = this.getClient(tx);
    const id = data.id ?? randomUUID();

    try {
      if (this.isSqlite(client)) {
        const [row] = await client.db
          .insert(sqliteSchema.gameItems)
          .values({
            id,
            code: data.code,
            name: data.name,
            description: data.description,
            type: data.type,
            subtype: data.subtype,
            rarity: data.rarity ?? 'COMMON',
            baseStats: data.baseStats ?? {},
            battlePerks: data.battlePerks ?? [],
            consumableEffect: data.consumableEffect ?? {},
            isShopBuyable: data.isShopBuyable ?? true,
            shopPrice: Number(data.shopPrice ?? 100),
            maxDailyPurchases: data.maxDailyPurchases ?? 5,
            isTradeable: data.isTradeable ?? true,
            createdAt: data.createdAt ?? new Date(),
          })
          .returning();
        if (!row) throw new DatabaseError('Failed to create GameItem in SQLite');
        return row as GameItem;
      } else {
        const [row] = await client.db
          .insert(pgSchema.gameItems)
          .values({
            id,
            code: data.code,
            name: data.name,
            description: data.description,
            type: data.type,
            subtype: data.subtype,
            rarity: data.rarity ?? 'COMMON',
            baseStats: data.baseStats ?? {},
            battlePerks: data.battlePerks ?? [],
            consumableEffect: data.consumableEffect ?? {},
            isShopBuyable: data.isShopBuyable ?? true,
            shopPrice: BigInt(data.shopPrice ?? 100),
            maxDailyPurchases: data.maxDailyPurchases ?? 5,
            isTradeable: data.isTradeable ?? true,
            createdAt: data.createdAt ?? new Date(),
          })
          .returning();
        if (!row) throw new DatabaseError('Failed to create GameItem in PostgreSQL');
        return {
          ...row,
          shopPrice: Number(row.shopPrice),
        } as unknown as GameItem;
      }
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(
        `Failed to create GameItem: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error instanceof Error ? error : undefined },
      );
    }
  }

  async update(id: string, data: Partial<NewGameItem>, tx?: DatabaseClient): Promise<GameItem> {
    const client = this.getClient(tx);

    try {
      if (this.isSqlite(client)) {
        const updateData: Record<string, unknown> = { ...data };
        if (data.shopPrice !== undefined) {
          updateData.shopPrice = Number(data.shopPrice);
        }
        const [row] = await client.db
          .update(sqliteSchema.gameItems)
          .set(updateData)
          .where(eq(sqliteSchema.gameItems.id, id))
          .returning();
        if (!row) throw new DatabaseError(`GameItem not found: ${id}`);
        return row as GameItem;
      } else {
        const updateData: Record<string, unknown> = { ...data };
        if (data.shopPrice !== undefined) {
          updateData.shopPrice = BigInt(data.shopPrice);
        }
        const [row] = await client.db
          .update(pgSchema.gameItems)
          .set(updateData)
          .where(eq(pgSchema.gameItems.id, id))
          .returning();
        if (!row) throw new DatabaseError(`GameItem not found: ${id}`);
        return {
          ...row,
          shopPrice: Number(row.shopPrice),
        } as unknown as GameItem;
      }
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(
        `Failed to update GameItem: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error instanceof Error ? error : undefined },
      );
    }
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const deleted = await client.db
        .delete(sqliteSchema.gameItems)
        .where(eq(sqliteSchema.gameItems.id, id))
        .returning({ id: sqliteSchema.gameItems.id });
      return deleted.length > 0;
    } else {
      const deleted = await client.db
        .delete(pgSchema.gameItems)
        .where(eq(pgSchema.gameItems.id, id))
        .returning({ id: pgSchema.gameItems.id });
      return deleted.length > 0;
    }
  }
}

/**
 * Repository for User Inventory Items (Equipments, Accessories, Consumables, Enhancements).
 */
export class UserInventoryItemRepository extends BaseRepository<
  UserInventoryItem,
  NewUserInventoryItem,
  Partial<NewUserInventoryItem>
> {
  async findById(id: string, tx?: DatabaseClient): Promise<UserInventoryItem | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.userInventoryItems)
        .where(eq(sqliteSchema.userInventoryItems.id, id));
      return (row as UserInventoryItem) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.userInventoryItems)
        .where(eq(pgSchema.userInventoryItems.id, id));
      return (row as unknown as UserInventoryItem) ?? null;
    }
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    const item = await this.findById(id, tx);
    return item !== null;
  }

  async findByUser(
    userId: string,
    options?: UserInventoryFindOptions,
    tx?: DatabaseClient,
  ): Promise<UserInventoryItem[]> {
    const client = this.getClient(tx);

    if (this.isSqlite(client)) {
      const conditions = [eq(sqliteSchema.userInventoryItems.userId, userId)];
      if (options?.slot !== undefined) {
        conditions.push(eq(sqliteSchema.userInventoryItems.slot, options.slot));
      }
      if (options?.state !== undefined) {
        conditions.push(eq(sqliteSchema.userInventoryItems.state, options.state));
      }
      if (options?.equippedToCardId !== undefined) {
        if (options.equippedToCardId === null) {
          conditions.push(sql`${sqliteSchema.userInventoryItems.equippedToCardId} IS NULL`);
        } else {
          conditions.push(
            eq(sqliteSchema.userInventoryItems.equippedToCardId, options.equippedToCardId),
          );
        }
      }

      const rows = await client.db
        .select()
        .from(sqliteSchema.userInventoryItems)
        .where(and(...conditions))
        .orderBy(desc(sqliteSchema.userInventoryItems.createdAt));
      return rows as UserInventoryItem[];
    } else {
      const conditions = [eq(pgSchema.userInventoryItems.userId, userId)];
      if (options?.slot !== undefined) {
        conditions.push(eq(pgSchema.userInventoryItems.slot, options.slot));
      }
      if (options?.state !== undefined) {
        conditions.push(eq(pgSchema.userInventoryItems.state, options.state));
      }
      if (options?.equippedToCardId !== undefined) {
        if (options.equippedToCardId === null) {
          conditions.push(sql`${pgSchema.userInventoryItems.equippedToCardId} IS NULL`);
        } else {
          conditions.push(
            eq(pgSchema.userInventoryItems.equippedToCardId, options.equippedToCardId),
          );
        }
      }

      const rows = await client.db
        .select()
        .from(pgSchema.userInventoryItems)
        .where(and(...conditions))
        .orderBy(desc(pgSchema.userInventoryItems.createdAt));
      return rows as unknown as UserInventoryItem[];
    }
  }

  async findEquippedByCard(cardId: string, tx?: DatabaseClient): Promise<UserInventoryItem[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.userInventoryItems)
        .where(
          and(
            eq(sqliteSchema.userInventoryItems.equippedToCardId, cardId),
            eq(sqliteSchema.userInventoryItems.state, 'EQUIPPED'),
          ),
        );
      return rows as UserInventoryItem[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.userInventoryItems)
        .where(
          and(
            eq(pgSchema.userInventoryItems.equippedToCardId, cardId),
            eq(pgSchema.userInventoryItems.state, 'EQUIPPED'),
          ),
        );
      return rows as unknown as UserInventoryItem[];
    }
  }

  async findCardSlot(
    cardId: string,
    slot: string,
    tx?: DatabaseClient,
  ): Promise<UserInventoryItem | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.userInventoryItems)
        .where(
          and(
            eq(sqliteSchema.userInventoryItems.equippedToCardId, cardId),
            eq(sqliteSchema.userInventoryItems.slot, slot),
            eq(sqliteSchema.userInventoryItems.state, 'EQUIPPED'),
          ),
        );
      return (row as UserInventoryItem) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.userInventoryItems)
        .where(
          and(
            eq(pgSchema.userInventoryItems.equippedToCardId, cardId),
            eq(pgSchema.userInventoryItems.slot, slot),
            eq(pgSchema.userInventoryItems.state, 'EQUIPPED'),
          ),
        );
      return (row as unknown as UserInventoryItem) ?? null;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.userInventoryItems);
      return Number(res?.count ?? 0);
    } else {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.userInventoryItems);
      return Number(res?.count ?? 0);
    }
  }

  async create(data: NewUserInventoryItem, tx?: DatabaseClient): Promise<UserInventoryItem> {
    const client = this.getClient(tx);
    const id = data.id ?? randomUUID();
    const now = new Date();

    try {
      if (this.isSqlite(client)) {
        const [row] = await client.db
          .insert(sqliteSchema.userInventoryItems)
          .values({
            id,
            userId: data.userId,
            itemId: data.itemId,
            quantity: data.quantity ?? 1,
            enhancementLevel: data.enhancementLevel ?? 0,
            equippedToCardId: data.equippedToCardId ?? null,
            slot: data.slot ?? 'NONE',
            state: data.state ?? 'IDLE',
            obtainedFrom: data.obtainedFrom ?? 'SHOP',
            createdAt: data.createdAt ?? now,
            updatedAt: data.updatedAt ?? now,
          })
          .returning();
        if (!row) throw new DatabaseError('Failed to create UserInventoryItem in SQLite');
        return row as UserInventoryItem;
      } else {
        const [row] = await client.db
          .insert(pgSchema.userInventoryItems)
          .values({
            id,
            userId: data.userId,
            itemId: data.itemId,
            quantity: data.quantity ?? 1,
            enhancementLevel: data.enhancementLevel ?? 0,
            equippedToCardId: data.equippedToCardId ?? null,
            slot: data.slot ?? 'NONE',
            state: data.state ?? 'IDLE',
            obtainedFrom: data.obtainedFrom ?? 'SHOP',
            createdAt: data.createdAt ?? now,
            updatedAt: data.updatedAt ?? now,
          })
          .returning();
        if (!row) throw new DatabaseError('Failed to create UserInventoryItem in PostgreSQL');
        return row as unknown as UserInventoryItem;
      }
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(
        `Failed to create UserInventoryItem: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error instanceof Error ? error : undefined },
      );
    }
  }

  async update(
    id: string,
    data: Partial<NewUserInventoryItem>,
    tx?: DatabaseClient,
  ): Promise<UserInventoryItem> {
    const client = this.getClient(tx);
    const updateData = {
      ...data,
      updatedAt: new Date(),
    };

    try {
      if (this.isSqlite(client)) {
        const [row] = await client.db
          .update(sqliteSchema.userInventoryItems)
          .set(updateData)
          .where(eq(sqliteSchema.userInventoryItems.id, id))
          .returning();
        if (!row) throw new DatabaseError(`UserInventoryItem not found: ${id}`);
        return row as UserInventoryItem;
      } else {
        const [row] = await client.db
          .update(pgSchema.userInventoryItems)
          .set(updateData)
          .where(eq(pgSchema.userInventoryItems.id, id))
          .returning();
        if (!row) throw new DatabaseError(`UserInventoryItem not found: ${id}`);
        return row as unknown as UserInventoryItem;
      }
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(
        `Failed to update UserInventoryItem: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error instanceof Error ? error : undefined },
      );
    }
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const deleted = await client.db
        .delete(sqliteSchema.userInventoryItems)
        .where(eq(sqliteSchema.userInventoryItems.id, id))
        .returning({ id: sqliteSchema.userInventoryItems.id });
      return deleted.length > 0;
    } else {
      const deleted = await client.db
        .delete(pgSchema.userInventoryItems)
        .where(eq(pgSchema.userInventoryItems.id, id))
        .returning({ id: pgSchema.userInventoryItems.id });
      return deleted.length > 0;
    }
  }

  /**
   * Points every inventory row holding `fromItemId` at `toItemId` and resets its slot to NONE.
   * Used to repair rows written with ids that never existed in game_items. Returns rows changed.
   */
  async remapItemId(fromItemId: string, toItemId: string, tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    const updateData = { itemId: toItemId, slot: 'NONE', updatedAt: new Date() };
    if (this.isSqlite(client)) {
      const rows = await client.db
        .update(sqliteSchema.userInventoryItems)
        .set(updateData)
        .where(eq(sqliteSchema.userInventoryItems.itemId, fromItemId))
        .returning({ id: sqliteSchema.userInventoryItems.id });
      return rows.length;
    } else {
      const rows = await client.db
        .update(pgSchema.userInventoryItems)
        .set(updateData)
        .where(eq(pgSchema.userInventoryItems.itemId, fromItemId))
        .returning({ id: pgSchema.userInventoryItems.id });
      return rows.length;
    }
  }

  /**
   * Equips an item to a card in a given slot, atomically unequipping any previously equipped item.
   */
  async equipToCard(
    userId: string,
    userItemId: string,
    cardId: string,
    slot: string,
    tx?: DatabaseClient,
  ): Promise<{ equippedItem: UserInventoryItem; unequippedItem?: UserInventoryItem | undefined }> {
    const client = this.getClient(tx);

    return withTransaction(client, async (txClient) => {
      // 1. Verify item exists and belongs to user
      const itemToEquip = await this.findById(userItemId, txClient);
      if (!itemToEquip || itemToEquip.userId !== userId) {
        throw new DatabaseError(`Item ${userItemId} does not belong to user ${userId}`);
      }

      // 2. Check if a piece is already equipped in this slot on the card
      const existingInSlot = await this.findCardSlot(cardId, slot, txClient);
      let unequippedItem: UserInventoryItem | undefined;

      if (existingInSlot) {
        unequippedItem = await this.update(
          existingInSlot.id,
          {
            equippedToCardId: null,
            slot: 'NONE',
            state: 'IDLE',
          },
          txClient,
        );
      }

      // 3. Equip new item
      const equippedItem = await this.update(
        userItemId,
        {
          equippedToCardId: cardId,
          slot,
          state: 'EQUIPPED',
        },
        txClient,
      );

      return { equippedItem, unequippedItem };
    });
  }

  /**
   * Unequips an item from a card, setting slot back to NONE and state to IDLE.
   */
  async unequipFromCard(
    userId: string,
    userItemId: string,
    tx?: DatabaseClient,
  ): Promise<UserInventoryItem> {
    const client = this.getClient(tx);
    return withTransaction(client, async (txClient) => {
      const item = await this.findById(userItemId, txClient);
      if (!item || item.userId !== userId) {
        throw new DatabaseError(`Item ${userItemId} does not belong to user ${userId}`);
      }
      if (item.state !== 'EQUIPPED') {
        throw new DatabaseError(`Item ${userItemId} is not currently equipped`);
      }

      return this.update(
        userItemId,
        {
          equippedToCardId: null,
          slot: 'NONE',
          state: 'IDLE',
        },
        txClient,
      );
    });
  }
}
