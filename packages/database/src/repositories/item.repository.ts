import { randomUUID } from 'node:crypto';
import { eq, and, asc, sql } from 'drizzle-orm';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type { EconomyItem, NewEconomyItem } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';
import { ItemCategoryRepository } from './item-category.repository.js';

/** Categories of the default catalog; the bot seeds any that are missing, by code. */
const DEFAULT_ITEM_CATEGORIES = [
  { code: 'consumable', name: 'Consumables', description: 'Potions and candy, used up on use.' },
  { code: 'cosmetic', name: 'Cosmetics', description: 'Profile customization.' },
] as const;

/** Items of the default catalog; the bot seeds any that are missing, by code. */
const DEFAULT_SHOP_ITEMS: (Omit<NewEconomyItem, 'id' | 'categoryId' | 'code'> & {
  code: string;
  categoryCode: (typeof DEFAULT_ITEM_CATEGORIES)[number]['code'];
})[] = [
  {
    code: 'candy_minor',
    categoryCode: 'consumable',
    name: 'Minor Energy Candy',
    description: 'A sweet candy that restores 20 stamina. Town shop limit: 1 per user per day.',
    price: 100,
    rarity: 'COMMON',
    isPurchasable: true,
    metadata: { itemType: 'ENERGY_RESTORE', energyRestored: 20, dailyPurchaseLimit: 1 },
  },
  {
    code: 'stamina_potion',
    categoryCode: 'consumable',
    name: 'Stamina Potion',
    description: 'Restores 50 stamina. Hard anti-abuse ceiling: max 3 potions consumed per day.',
    price: 350,
    rarity: 'UNCOMMON',
    isPurchasable: true,
    metadata: { itemType: 'ENERGY_RESTORE', energyRestored: 50, dailyUsageCeiling: 3 },
  },
  {
    code: 'exp_potion_small',
    categoryCode: 'consumable',
    name: 'Small EXP Potion',
    description: 'Instantly grants 150 experience points to your server leveling rank.',
    price: 250,
    rarity: 'COMMON',
    isPurchasable: true,
    metadata: { itemType: 'XP_GRANT', xpAwarded: 150 },
  },
  {
    code: 'profile_bg_voucher',
    categoryCode: 'cosmetic',
    name: 'Profile Background Voucher',
    description:
      'Voucher allowing you to set a custom validated profile banner (/profile background <url>).',
    price: 1500,
    rarity: 'RARE',
    isPurchasable: true,
    metadata: { itemType: 'PROFILE_BG_TOKEN' },
  },
];

export const DEFAULT_ITEM_CATEGORY_CODES: readonly string[] = DEFAULT_ITEM_CATEGORIES.map(
  (category) => category.code,
);
export const DEFAULT_SHOP_ITEM_CODES: readonly string[] = DEFAULT_SHOP_ITEMS.map(
  (item) => item.code,
);

/** Item and category IDs are uuids on Postgres; anything else can match no row there. */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      if (!UUID_PATTERN.test(id)) return null;
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

  /** The item with the given stable code (`candy_minor`), if any. */
  async findByCode(code: string, tx?: DatabaseClient): Promise<EconomyItem | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.economyItems)
        .where(eq(sqliteSchema.economyItems.code, code));
      return (row as EconomyItem) ?? null;
    }
    const [row] = await client.db
      .select()
      .from(pgSchema.economyItems)
      .where(eq(pgSchema.economyItems.code, code));
    return row ? ({ ...row, price: Number(row.price) } as unknown as EconomyItem) : null;
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
          price: Number(data.price),
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
        ...(data.price !== undefined ? { price: Number(data.price) } : {}),
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
   * Adds the default categories and items that are missing, found by code, with uuid IDs on
   * both dialects. It never changes an existing row, so owner edits stay. Older SQLite
   * databases stored the items with their code as the ID (and a category code as the category
   * ID); those rows only get their code and category filled in, so inventories keep working.
   * Returns how many items were added.
   */
  async seedDefaultCatalog(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    const categories = new ItemCategoryRepository(client);

    const categoryIds = new Map<string, string>();
    for (const category of DEFAULT_ITEM_CATEGORIES) {
      const existing =
        (await categories.findByCode(category.code, tx)) ??
        (await categories.create({ id: randomUUID(), ...category }, tx));
      categoryIds.set(category.code, existing.id);
    }

    let inserted = 0;
    for (const { categoryCode, ...item } of DEFAULT_SHOP_ITEMS) {
      if (await this.findByCode(item.code, tx)) continue;
      const categoryId = categoryIds.get(categoryCode) ?? null;
      const legacy = this.isSqlite(client) ? await this.findById(item.code, tx) : null;
      if (legacy) {
        await this.update(
          legacy.id,
          {
            code: item.code,
            ...(legacy.categoryId === categoryCode ? { categoryId } : {}),
          },
          tx,
        );
        continue;
      }
      await this.create({ ...item, id: randomUUID(), categoryId }, tx);
      inserted++;
    }

    return inserted;
  }
}
