import { eq, and, asc, sql } from 'drizzle-orm';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type { EconomyItem, NewEconomyItem } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';

export interface ItemFindOptions {
  categoryId?: string | undefined;
  isPurchasable?: boolean | undefined;
}

/**
 * Repository for economy shop items, catalogs, and item definitions.
 */
export class ItemRepository extends BaseRepository<
  EconomyItem,
  NewEconomyItem,
  Partial<NewEconomyItem>,
  string
> {
  async findById(id: string, tx?: DatabaseClient): Promise<EconomyItem | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.economyItems)
        .where(eq(sqliteSchema.economyItems.id, id));
      return (row as EconomyItem) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.economyItems)
        .where(eq(pgSchema.economyItems.id, id));
      if (!row) return null;
      return {
        ...row,
        price: Number(row.price),
      } as unknown as EconomyItem;
    }
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    const found = await this.findById(id, tx);
    return found !== null;
  }

  async findAll(options?: ItemFindOptions, tx?: DatabaseClient): Promise<EconomyItem[]> {
    const client = this.getClient(tx);
    const conditions = [];

    if (this.isSqlite(client)) {
      if (options?.categoryId !== undefined) {
        conditions.push(eq(sqliteSchema.economyItems.categoryId, options.categoryId));
      }
      if (options?.isPurchasable !== undefined) {
        conditions.push(eq(sqliteSchema.economyItems.isPurchasable, options.isPurchasable));
      }

      const query = client.db.select().from(sqliteSchema.economyItems);
      const rows =
        conditions.length > 0
          ? await query.where(and(...conditions)).orderBy(asc(sqliteSchema.economyItems.price))
          : await query.orderBy(asc(sqliteSchema.economyItems.price));

      return rows as EconomyItem[];
    } else {
      if (options?.categoryId !== undefined) {
        conditions.push(eq(pgSchema.economyItems.categoryId, options.categoryId));
      }
      if (options?.isPurchasable !== undefined) {
        conditions.push(eq(pgSchema.economyItems.isPurchasable, options.isPurchasable));
      }

      const query = client.db.select().from(pgSchema.economyItems);
      const rows =
        conditions.length > 0
          ? await query.where(and(...conditions)).orderBy(asc(pgSchema.economyItems.price))
          : await query.orderBy(asc(pgSchema.economyItems.price));

      return rows.map((r) => ({
        ...r,
        price: Number(r.price),
      })) as unknown as EconomyItem[];
    }
  }

  async findPurchasable(tx?: DatabaseClient): Promise<EconomyItem[]> {
    return this.findAll({ isPurchasable: true }, tx);
  }

  async create(data: NewEconomyItem, tx?: DatabaseClient): Promise<EconomyItem> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [created] = await client.db.insert(sqliteSchema.economyItems).values(data).returning();
      if (!created) throw new DatabaseError(`Failed to create item ${data.id} in SQLite`);
      return created as EconomyItem;
    } else {
      const [created] = await client.db
        .insert(pgSchema.economyItems)
        .values({
          ...data,
          price: BigInt(data.price),
        } as unknown as typeof pgSchema.economyItems.$inferInsert)
        .returning();
      if (!created) throw new DatabaseError(`Failed to create item ${data.id} in PostgreSQL`);
      return {
        ...created,
        price: Number(created.price),
      } as unknown as EconomyItem;
    }
  }

  async update(
    id: string,
    data: Partial<NewEconomyItem>,
    tx?: DatabaseClient,
  ): Promise<EconomyItem> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [updated] = await client.db
        .update(sqliteSchema.economyItems)
        .set(data)
        .where(eq(sqliteSchema.economyItems.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`Item ${id} not found for update in SQLite`);
      return updated as EconomyItem;
    } else {
      const updateData = {
        ...data,
        ...(data.price !== undefined ? { price: BigInt(data.price) } : {}),
      };
      const [updated] = await client.db
        .update(pgSchema.economyItems)
        .set(updateData as unknown as Partial<typeof pgSchema.economyItems.$inferInsert>)
        .where(eq(pgSchema.economyItems.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`Item ${id} not found for update in PostgreSQL`);
      return {
        ...updated,
        price: Number(updated.price),
      } as unknown as EconomyItem;
    }
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const deleted = await client.db
        .delete(sqliteSchema.economyItems)
        .where(eq(sqliteSchema.economyItems.id, id))
        .returning({ id: sqliteSchema.economyItems.id });
      return deleted.length > 0;
    } else {
      const deleted = await client.db
        .delete(pgSchema.economyItems)
        .where(eq(pgSchema.economyItems.id, id))
        .returning({ id: pgSchema.economyItems.id });
      return deleted.length > 0;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.economyItems);
      return Number(res?.count ?? 0);
    } else {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.economyItems);
      return Number(res?.count ?? 0);
    }
  }

  /**
   * Pre-populates canonical shop items if they do not already exist.
   */
  async seedDefaultCatalog(tx?: DatabaseClient): Promise<number> {
    const defaults: NewEconomyItem[] = [
      {
        id: 'candy_minor',
        name: 'Minor Energy Candy',
        description: 'A sweet candy that restores 20 stamina. Town shop limit: 1 per user per day.',
        price: 100,
        rarity: 'COMMON',
        categoryId: 'consumable',
        isPurchasable: true,
        metadata: {
          itemType: 'ENERGY_RESTORE',
          energyRestored: 20,
          dailyPurchaseLimit: 1,
        },
      },
      {
        id: 'stamina_potion',
        name: 'Stamina Potion',
        description:
          'Restores 50 stamina. Hard anti-abuse ceiling: max 3 potions consumed per day.',
        price: 350,
        rarity: 'UNCOMMON',
        categoryId: 'consumable',
        isPurchasable: true,
        metadata: {
          itemType: 'ENERGY_RESTORE',
          energyRestored: 50,
          dailyUsageCeiling: 3,
        },
      },
      {
        id: 'exp_potion_small',
        name: 'Small EXP Potion',
        description: 'Instantly grants 150 experience points to your server leveling rank.',
        price: 250,
        rarity: 'COMMON',
        categoryId: 'consumable',
        isPurchasable: true,
        metadata: {
          itemType: 'XP_GRANT',
          xpAwarded: 150,
        },
      },
      {
        id: 'profile_bg_voucher',
        name: 'Profile Background Voucher',
        description:
          'Voucher allowing you to set a custom validated profile banner (/profile background <url>).',
        price: 1500,
        rarity: 'RARE',
        categoryId: 'cosmetic',
        isPurchasable: true,
        metadata: {
          itemType: 'PROFILE_BG_TOKEN',
        },
      },
    ];

    let inserted = 0;
    for (const item of defaults) {
      const exists = await this.exists(item.id, tx);
      if (!exists) {
        await this.create(item, tx);
        inserted++;
      }
    }

    return inserted;
  }
}
