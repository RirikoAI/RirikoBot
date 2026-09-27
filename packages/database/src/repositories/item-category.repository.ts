import { asc, eq, sql } from 'drizzle-orm';

import { DatabaseError } from '@ririko/core';
import type { DatabaseClient } from '../client/types.js';
import type { EconomyItemCategory, NewEconomyItemCategory } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { UUID_PATTERN } from './item.repository.js';

/** Dual-dialect store for shop item categories (`economy_item_categories`). */
export class ItemCategoryRepository {
  constructor(protected readonly client: DatabaseClient) {}

  protected getClient(tx?: DatabaseClient): DatabaseClient {
    return tx ?? this.client;
  }

  /** Every category, by name. */
  async findAll(tx?: DatabaseClient): Promise<EconomyItemCategory[]> {
    const client = this.getClient(tx);
    return client.dialect === 'sqlite'
      ? client.db
          .select()
          .from(sqliteSchema.economyItemCategories)
          .orderBy(asc(sqliteSchema.economyItemCategories.name))
      : client.db
          .select()
          .from(pgSchema.economyItemCategories)
          .orderBy(asc(pgSchema.economyItemCategories.name));
  }

  async findById(id: string, tx?: DatabaseClient): Promise<EconomyItemCategory | null> {
    const client = this.getClient(tx);
    if (client.dialect === 'postgres' && !UUID_PATTERN.test(id)) return null;
    const [row] =
      client.dialect === 'sqlite'
        ? await client.db
            .select()
            .from(sqliteSchema.economyItemCategories)
            .where(eq(sqliteSchema.economyItemCategories.id, id))
        : await client.db
            .select()
            .from(pgSchema.economyItemCategories)
            .where(eq(pgSchema.economyItemCategories.id, id));
    return row ?? null;
  }

  async findByCode(code: string, tx?: DatabaseClient): Promise<EconomyItemCategory | null> {
    const client = this.getClient(tx);
    const [row] =
      client.dialect === 'sqlite'
        ? await client.db
            .select()
            .from(sqliteSchema.economyItemCategories)
            .where(eq(sqliteSchema.economyItemCategories.code, code))
        : await client.db
            .select()
            .from(pgSchema.economyItemCategories)
            .where(eq(pgSchema.economyItemCategories.code, code));
    return row ?? null;
  }

  async create(data: NewEconomyItemCategory, tx?: DatabaseClient): Promise<EconomyItemCategory> {
    const client = this.getClient(tx);
    const [row] =
      client.dialect === 'sqlite'
        ? await client.db.insert(sqliteSchema.economyItemCategories).values(data).returning()
        : await client.db.insert(pgSchema.economyItemCategories).values(data).returning();
    if (!row) throw new DatabaseError(`Failed to create item category ${data.id}`);
    return row;
  }

  async update(
    id: string,
    data: Partial<Omit<NewEconomyItemCategory, 'id'>>,
    tx?: DatabaseClient,
  ): Promise<EconomyItemCategory> {
    const client = this.getClient(tx);
    const [row] =
      client.dialect === 'sqlite'
        ? await client.db
            .update(sqliteSchema.economyItemCategories)
            .set(data)
            .where(eq(sqliteSchema.economyItemCategories.id, id))
            .returning()
        : await client.db
            .update(pgSchema.economyItemCategories)
            .set(data)
            .where(eq(pgSchema.economyItemCategories.id, id))
            .returning();
    if (!row) throw new DatabaseError(`Item category ${id} not found for update`);
    return row;
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    const deleted =
      client.dialect === 'sqlite'
        ? await client.db
            .delete(sqliteSchema.economyItemCategories)
            .where(eq(sqliteSchema.economyItemCategories.id, id))
            .returning({ id: sqliteSchema.economyItemCategories.id })
        : await client.db
            .delete(pgSchema.economyItemCategories)
            .where(eq(pgSchema.economyItemCategories.id, id))
            .returning({ id: pgSchema.economyItemCategories.id });
    return deleted.length > 0;
  }

  /** How many items are filed under the category. */
  async countItems(categoryId: string, tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    const [row] =
      client.dialect === 'sqlite'
        ? await client.db
            .select({ count: sql<number>`count(*)` })
            .from(sqliteSchema.economyItems)
            .where(eq(sqliteSchema.economyItems.categoryId, categoryId))
        : await client.db
            .select({ count: sql<number>`count(*)` })
            .from(pgSchema.economyItems)
            .where(eq(pgSchema.economyItems.categoryId, categoryId));
    return Number(row?.count ?? 0);
  }
}
