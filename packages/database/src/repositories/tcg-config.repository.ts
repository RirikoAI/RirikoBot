import { eq, sql } from 'drizzle-orm';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type { TcgSystemConfig, NewTcgSystemConfig } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';

export class TcgConfigRepository extends BaseRepository<
  TcgSystemConfig,
  NewTcgSystemConfig,
  Partial<NewTcgSystemConfig>
> {
  private normalizeConfig(row: Record<string, unknown>): TcgSystemConfig {
    return {
      key: String(row['key']),
      value: (row['value'] as Record<string, unknown>) ?? {},
      updatedBy: String(row['updatedBy']),
      updatedAt:
        row['updatedAt'] instanceof Date
          ? row['updatedAt']
          : new Date(row['updatedAt'] as string | number),
    } as unknown as TcgSystemConfig;
  }

  async findById(key: string, tx?: DatabaseClient): Promise<TcgSystemConfig | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.tcgSystemConfigs)
        .where(eq(sqliteSchema.tcgSystemConfigs.key, key));
      return row ? this.normalizeConfig(row as unknown as Record<string, unknown>) : null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.tcgSystemConfigs)
        .where(eq(pgSchema.tcgSystemConfigs.key, key));
      return row ? this.normalizeConfig(row as unknown as Record<string, unknown>) : null;
    }
  }

  async exists(key: string, tx?: DatabaseClient): Promise<boolean> {
    const cfg = await this.findById(key, tx);
    return cfg !== null;
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.tcgSystemConfigs);
      return Number(row?.count ?? 0);
    } else {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.tcgSystemConfigs);
      return Number(row?.count ?? 0);
    }
  }

  async getConfig<T = unknown>(key: string, tx?: DatabaseClient): Promise<T | null> {
    const cfg = await this.findById(key, tx);
    if (!cfg) return null;
    return (cfg.value as unknown as { val: T })?.val ?? (cfg.value as unknown as T);
  }

  async setConfig<T = unknown>(
    key: string,
    value: T,
    updatedBy: string,
    tx?: DatabaseClient,
  ): Promise<TcgSystemConfig> {
    const client = this.getClient(tx);
    const now = new Date();
    const wrappedValue = typeof value === 'object' && value !== null ? value : { val: value };

    if (this.isSqlite(client)) {
      const [row] = await client.db
        .insert(sqliteSchema.tcgSystemConfigs)
        .values({
          key,
          value: wrappedValue as Record<string, unknown>,
          updatedBy,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: sqliteSchema.tcgSystemConfigs.key,
          set: {
            value: wrappedValue as Record<string, unknown>,
            updatedBy,
            updatedAt: now,
          },
        })
        .returning();
      if (!row) throw new DatabaseError(`Failed to set TcgSystemConfig for key: ${key}`);
      return this.normalizeConfig(row as unknown as Record<string, unknown>);
    } else {
      const [row] = await client.db
        .insert(pgSchema.tcgSystemConfigs)
        .values({
          key,
          value: wrappedValue as Record<string, unknown>,
          updatedBy,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: pgSchema.tcgSystemConfigs.key,
          set: {
            value: wrappedValue as Record<string, unknown>,
            updatedBy,
            updatedAt: now,
          },
        })
        .returning();
      if (!row) throw new DatabaseError(`Failed to set TcgSystemConfig for key: ${key}`);
      return this.normalizeConfig(row as unknown as Record<string, unknown>);
    }
  }

  async getAllConfigs(tx?: DatabaseClient): Promise<Record<string, unknown>> {
    const client = this.getClient(tx);
    let rows: Record<string, unknown>[];
    if (this.isSqlite(client)) {
      rows = (await client.db.select().from(sqliteSchema.tcgSystemConfigs)) as unknown as Record<
        string,
        unknown
      >[];
    } else {
      rows = (await client.db.select().from(pgSchema.tcgSystemConfigs)) as unknown as Record<
        string,
        unknown
      >[];
    }

    const result: Record<string, unknown> = {};
    for (const r of rows) {
      const normalized = this.normalizeConfig(r);
      const valObj = normalized.value as { val?: unknown };
      result[normalized.key] = valObj?.val !== undefined ? valObj.val : normalized.value;
    }
    return result;
  }

  async create(data: NewTcgSystemConfig, tx?: DatabaseClient): Promise<TcgSystemConfig> {
    return this.setConfig(data.key, data.value, data.updatedBy, tx);
  }

  async update(
    key: string,
    data: Partial<NewTcgSystemConfig>,
    tx?: DatabaseClient,
  ): Promise<TcgSystemConfig> {
    if (!data.value || !data.updatedBy) {
      throw new DatabaseError('Value and updatedBy are required to update TcgSystemConfig');
    }
    return this.setConfig(key, data.value, data.updatedBy, tx);
  }

  async delete(key: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const res = await client.db
        .delete(sqliteSchema.tcgSystemConfigs)
        .where(eq(sqliteSchema.tcgSystemConfigs.key, key));
      return res.changes > 0;
    } else {
      const res = await client.db
        .delete(pgSchema.tcgSystemConfigs)
        .where(eq(pgSchema.tcgSystemConfigs.key, key));
      return (res.rowCount ?? 0) > 0;
    }
  }
}
