import { eq, and, desc, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type {
  WaifuAsset,
  NewWaifuAsset,
  WaifuSource,
  NewWaifuSource,
} from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';

export class WaifuAssetRepository extends BaseRepository<
  WaifuAsset,
  NewWaifuAsset,
  Partial<NewWaifuAsset>
> {
  async findById(id: string, tx?: DatabaseClient): Promise<WaifuAsset | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.waifuAssets)
        .where(eq(sqliteSchema.waifuAssets.id, id));
      return (row as WaifuAsset) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.waifuAssets)
        .where(eq(pgSchema.waifuAssets.id, id));
      return (row as unknown as WaifuAsset) ?? null;
    }
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    const asset = await this.findById(id, tx);
    return asset !== null;
  }

  async findByImageHash(imageHash: string, tx?: DatabaseClient): Promise<WaifuAsset | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.waifuAssets)
        .where(eq(sqliteSchema.waifuAssets.imageHash, imageHash));
      return (row as WaifuAsset) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.waifuAssets)
        .where(eq(pgSchema.waifuAssets.imageHash, imageHash));
      return (row as unknown as WaifuAsset) ?? null;
    }
  }

  async findBySourceImageId(
    sourceId: string,
    sourceImageId: string,
    tx?: DatabaseClient,
  ): Promise<WaifuAsset | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.waifuAssets)
        .where(
          and(
            eq(sqliteSchema.waifuAssets.sourceId, sourceId),
            eq(sqliteSchema.waifuAssets.sourceImageId, sourceImageId),
          ),
        );
      return (row as WaifuAsset) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.waifuAssets)
        .where(
          and(
            eq(pgSchema.waifuAssets.sourceId, sourceId),
            eq(pgSchema.waifuAssets.sourceImageId, sourceImageId),
          ),
        );
      return (row as unknown as WaifuAsset) ?? null;
    }
  }

  async findAssetsByCharacter(
    characterName: string,
    limit = 20,
    tx?: DatabaseClient,
  ): Promise<WaifuAsset[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.waifuAssets)
        .where(eq(sqliteSchema.waifuAssets.characterName, characterName))
        .limit(limit);
      return rows as WaifuAsset[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.waifuAssets)
        .where(eq(pgSchema.waifuAssets.characterName, characterName))
        .limit(limit);
      return rows as unknown as WaifuAsset[];
    }
  }

  async findActiveAssets(limit = 50, offset = 0, tx?: DatabaseClient): Promise<WaifuAsset[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.waifuAssets)
        .where(eq(sqliteSchema.waifuAssets.isDeletedByRequest, false))
        .orderBy(desc(sqliteSchema.waifuAssets.createdAt))
        .limit(limit)
        .offset(offset);
      return rows as WaifuAsset[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.waifuAssets)
        .where(eq(pgSchema.waifuAssets.isDeletedByRequest, false))
        .orderBy(desc(pgSchema.waifuAssets.createdAt))
        .limit(limit)
        .offset(offset);
      return rows as unknown as WaifuAsset[];
    }
  }

  async create(data: NewWaifuAsset, tx?: DatabaseClient): Promise<WaifuAsset> {
    const client = this.getClient(tx);
    const id = data.id ?? randomUUID();
    const payload = {
      ...data,
      id,
      tags: data.tags ?? [],
    };

    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.waifuAssets)
        .values(payload)
        .returning();
      if (!created) {
        throw new DatabaseError(`Failed to insert waifu asset ${data.characterName}`);
      }
      return created as WaifuAsset;
    } else {
      const [created] = await client.db
        .insert(pgSchema.waifuAssets)
        .values(payload as unknown as typeof pgSchema.waifuAssets.$inferInsert)
        .returning();
      if (!created) {
        throw new DatabaseError(`Failed to insert waifu asset ${data.characterName}`);
      }
      return created as unknown as WaifuAsset;
    }
  }

  async update(
    id: string,
    data: Partial<NewWaifuAsset>,
    tx?: DatabaseClient,
  ): Promise<WaifuAsset> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [updated] = await client.db
        .update(sqliteSchema.waifuAssets)
        .set(data)
        .where(eq(sqliteSchema.waifuAssets.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`Waifu asset ${id} not found for update`);
      return updated as WaifuAsset;
    } else {
      const [updated] = await client.db
        .update(pgSchema.waifuAssets)
        .set(data as unknown as Partial<typeof pgSchema.waifuAssets.$inferInsert>)
        .where(eq(pgSchema.waifuAssets.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`Waifu asset ${id} not found for update`);
      return updated as unknown as WaifuAsset;
    }
  }

  async markDeletedByRequest(id: string, tx?: DatabaseClient): Promise<WaifuAsset> {
    return this.update(id, { isDeletedByRequest: true }, tx);
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const result = await client.db
        .delete(sqliteSchema.waifuAssets)
        .where(eq(sqliteSchema.waifuAssets.id, id));
      return (result.changes ?? 0) > 0;
    } else {
      const [deleted] = await client.db
        .delete(pgSchema.waifuAssets)
        .where(eq(pgSchema.waifuAssets.id, id))
        .returning();
      return !!deleted;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.waifuAssets);
      return Number(row?.count ?? 0);
    } else {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.waifuAssets);
      return Number(row?.count ?? 0);
    }
  }

  // --- Waifu Source Methods ---

  async findSourceById(id: string, tx?: DatabaseClient): Promise<WaifuSource | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.waifuSources)
        .where(eq(sqliteSchema.waifuSources.id, id));
      return (row as WaifuSource) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.waifuSources)
        .where(eq(pgSchema.waifuSources.id, id));
      return (row as unknown as WaifuSource) ?? null;
    }
  }

  async findAllSources(tx?: DatabaseClient): Promise<WaifuSource[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db.select().from(sqliteSchema.waifuSources);
      return rows as WaifuSource[];
    } else {
      const rows = await client.db.select().from(pgSchema.waifuSources);
      return rows as unknown as WaifuSource[];
    }
  }

  async createSource(data: NewWaifuSource, tx?: DatabaseClient): Promise<WaifuSource> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.waifuSources)
        .values(data)
        .returning();
      if (!created) throw new DatabaseError(`Failed to insert waifu source ${data.id}`);
      return created as WaifuSource;
    } else {
      const [created] = await client.db
        .insert(pgSchema.waifuSources)
        .values(data as unknown as typeof pgSchema.waifuSources.$inferInsert)
        .returning();
      if (!created) throw new DatabaseError(`Failed to insert waifu source ${data.id}`);
      return created as unknown as WaifuSource;
    }
  }

  async upsertSource(data: NewWaifuSource, tx?: DatabaseClient): Promise<WaifuSource> {
    const existing = await this.findSourceById(data.id, tx);
    if (existing) {
      const client = this.getClient(tx);
      if (this.isSqlite(client)) {
        const [updated] = await client.db
          .update(sqliteSchema.waifuSources)
          .set(data)
          .where(eq(sqliteSchema.waifuSources.id, data.id))
          .returning();
        return updated as WaifuSource;
      } else {
        const [updated] = await client.db
          .update(pgSchema.waifuSources)
          .set(data as unknown as Partial<typeof pgSchema.waifuSources.$inferInsert>)
          .where(eq(pgSchema.waifuSources.id, data.id))
          .returning();
        return updated as unknown as WaifuSource;
      }
    }
    return this.createSource(data, tx);
  }
}
