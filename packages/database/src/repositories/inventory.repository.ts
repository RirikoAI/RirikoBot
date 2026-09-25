import { eq, and, desc, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type { EconomyInventory, NewEconomyInventory, EconomyItem } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { withTransaction } from '../transactions/index.js';
import { DatabaseError } from '@ririko/core';

export interface InventoryWithItem {
  inventory: EconomyInventory;
  item: EconomyItem | null;
}

/**
 * Repository for user inventory bags and item holding slots.
 */
export class InventoryRepository extends BaseRepository<
  EconomyInventory,
  NewEconomyInventory,
  Partial<NewEconomyInventory>,
  string
> {
  async findById(id: string, tx?: DatabaseClient): Promise<EconomyInventory | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.economyInventories)
        .where(eq(sqliteSchema.economyInventories.id, id));
      return (row as EconomyInventory) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.economyInventories)
        .where(eq(pgSchema.economyInventories.id, id));
      return (row as unknown as EconomyInventory) ?? null;
    }
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    const found = await this.findById(id, tx);
    return found !== null;
  }

  async getItemSlot(
    userId: string,
    itemId: string,
    tx?: DatabaseClient,
  ): Promise<EconomyInventory | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.economyInventories)
        .where(
          and(
            eq(sqliteSchema.economyInventories.userId, userId),
            eq(sqliteSchema.economyInventories.itemId, itemId),
          ),
        );
      return (row as EconomyInventory) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.economyInventories)
        .where(
          and(
            eq(pgSchema.economyInventories.userId, userId),
            eq(pgSchema.economyInventories.itemId, itemId),
          ),
        );
      return (row as unknown as EconomyInventory) ?? null;
    }
  }

  async getItemQuantity(userId: string, itemId: string, tx?: DatabaseClient): Promise<number> {
    const slot = await this.getItemSlot(userId, itemId, tx);
    return slot ? slot.quantity : 0;
  }

  async getUserInventory(userId: string, tx?: DatabaseClient): Promise<EconomyInventory[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.economyInventories)
        .where(eq(sqliteSchema.economyInventories.userId, userId))
        .orderBy(desc(sqliteSchema.economyInventories.acquiredAt));
      return rows as EconomyInventory[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.economyInventories)
        .where(eq(pgSchema.economyInventories.userId, userId))
        .orderBy(desc(pgSchema.economyInventories.acquiredAt));
      return rows as unknown as EconomyInventory[];
    }
  }

  async getUserInventoryWithItems(
    userId: string,
    tx?: DatabaseClient,
  ): Promise<InventoryWithItem[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select({
          inventory: sqliteSchema.economyInventories,
          item: sqliteSchema.economyItems,
        })
        .from(sqliteSchema.economyInventories)
        .leftJoin(
          sqliteSchema.economyItems,
          eq(sqliteSchema.economyInventories.itemId, sqliteSchema.economyItems.id),
        )
        .where(eq(sqliteSchema.economyInventories.userId, userId))
        .orderBy(desc(sqliteSchema.economyInventories.acquiredAt));

      return rows.map((r) => ({
        inventory: r.inventory as EconomyInventory,
        item: r.item as EconomyItem | null,
      }));
    } else {
      const rows = await client.db
        .select({
          inventory: pgSchema.economyInventories,
          item: pgSchema.economyItems,
        })
        .from(pgSchema.economyInventories)
        .leftJoin(
          pgSchema.economyItems,
          eq(pgSchema.economyInventories.itemId, pgSchema.economyItems.id),
        )
        .where(eq(pgSchema.economyInventories.userId, userId))
        .orderBy(desc(pgSchema.economyInventories.acquiredAt));

      return rows.map((r) => ({
        inventory: r.inventory as unknown as EconomyInventory,
        item: r.item
          ? ({
              ...r.item,
              price: Number(r.item.price),
            } as unknown as EconomyItem)
          : null,
      }));
    }
  }

  async create(data: NewEconomyInventory, tx?: DatabaseClient): Promise<EconomyInventory> {
    const client = this.getClient(tx);
    const id = data.id ?? randomUUID();
    const now = new Date();
    const insertData = {
      ...data,
      id,
      quantity: data.quantity ?? 1,
      acquiredAt: data.acquiredAt ?? now,
    };

    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.economyInventories)
        .values(insertData)
        .returning();
      if (!created) throw new DatabaseError('Failed to create inventory record in SQLite');
      return created as EconomyInventory;
    } else {
      const [created] = await client.db
        .insert(pgSchema.economyInventories)
        .values(insertData as unknown as typeof pgSchema.economyInventories.$inferInsert)
        .returning();
      if (!created) throw new DatabaseError('Failed to create inventory record in PostgreSQL');
      return created as unknown as EconomyInventory;
    }
  }

  async update(
    id: string,
    data: Partial<NewEconomyInventory>,
    tx?: DatabaseClient,
  ): Promise<EconomyInventory> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [updated] = await client.db
        .update(sqliteSchema.economyInventories)
        .set(data)
        .where(eq(sqliteSchema.economyInventories.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`Inventory ${id} not found for update in SQLite`);
      return updated as EconomyInventory;
    } else {
      const [updated] = await client.db
        .update(pgSchema.economyInventories)
        .set(data as unknown as Partial<typeof pgSchema.economyInventories.$inferInsert>)
        .where(eq(pgSchema.economyInventories.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`Inventory ${id} not found for update in PostgreSQL`);
      return updated as unknown as EconomyInventory;
    }
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const deleted = await client.db
        .delete(sqliteSchema.economyInventories)
        .where(eq(sqliteSchema.economyInventories.id, id))
        .returning({ id: sqliteSchema.economyInventories.id });
      return deleted.length > 0;
    } else {
      const deleted = await client.db
        .delete(pgSchema.economyInventories)
        .where(eq(pgSchema.economyInventories.id, id))
        .returning({ id: pgSchema.economyInventories.id });
      return deleted.length > 0;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.economyInventories);
      return Number(res?.count ?? 0);
    } else {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.economyInventories);
      return Number(res?.count ?? 0);
    }
  }

  /**
   * Atomically adds items to a user's inventory bag slot.
   */
  async addItem(
    userId: string,
    itemId: string,
    quantity = 1,
    tx?: DatabaseClient,
  ): Promise<EconomyInventory> {
    if (quantity <= 0) {
      throw new DatabaseError('Added quantity must be greater than zero');
    }
    const client = this.getClient(tx);

    return withTransaction(client, async (txClient) => {
      const existing = await this.getItemSlot(userId, itemId, txClient);
      if (existing) {
        return this.update(existing.id, { quantity: existing.quantity + quantity }, txClient);
      } else {
        return this.create(
          {
            id: randomUUID(),
            userId,
            itemId,
            quantity,
            acquiredAt: new Date(),
          },
          txClient,
        );
      }
    });
  }

  /**
   * Atomically removes items from a user's inventory bag slot.
   */
  async removeItem(
    userId: string,
    itemId: string,
    quantity = 1,
    tx?: DatabaseClient,
  ): Promise<EconomyInventory | null> {
    if (quantity <= 0) {
      throw new DatabaseError('Removed quantity must be greater than zero');
    }
    const client = this.getClient(tx);

    return withTransaction(client, async (txClient) => {
      const existing = await this.getItemSlot(userId, itemId, txClient);
      if (!existing || existing.quantity < quantity) {
        throw new DatabaseError(
          `Insufficient item quantity in inventory (have ${existing?.quantity ?? 0}, needed ${quantity})`,
        );
      }

      if (existing.quantity === quantity) {
        await this.delete(existing.id, txClient);
        return null;
      } else {
        return this.update(existing.id, { quantity: existing.quantity - quantity }, txClient);
      }
    });
  }
}
