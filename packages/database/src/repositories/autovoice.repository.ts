import { eq, and, sql } from 'drizzle-orm';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type { AutoVoiceConfig, NewAutoVoiceConfig } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';

export class AutoVoiceRepository extends BaseRepository<
  AutoVoiceConfig,
  NewAutoVoiceConfig,
  Partial<NewAutoVoiceConfig>
> {
  async findById(id: string, tx?: DatabaseClient): Promise<AutoVoiceConfig | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.autoVoiceConfigs)
        .where(eq(sqliteSchema.autoVoiceConfigs.id, id));
      return (row as AutoVoiceConfig) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.autoVoiceConfigs)
        .where(eq(pgSchema.autoVoiceConfigs.id, id));
      return (row as unknown as AutoVoiceConfig) ?? null;
    }
  }

  async findByParentChannelId(
    guildId: string,
    parentChannelId: string,
    tx?: DatabaseClient,
  ): Promise<AutoVoiceConfig | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.autoVoiceConfigs)
        .where(
          and(
            eq(sqliteSchema.autoVoiceConfigs.guildId, guildId),
            eq(sqliteSchema.autoVoiceConfigs.parentChannelId, parentChannelId),
          ),
        );
      return (row as AutoVoiceConfig) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.autoVoiceConfigs)
        .where(
          and(
            eq(pgSchema.autoVoiceConfigs.guildId, guildId),
            eq(pgSchema.autoVoiceConfigs.parentChannelId, parentChannelId),
          ),
        );
      return (row as unknown as AutoVoiceConfig) ?? null;
    }
  }

  async listByGuildId(guildId: string, tx?: DatabaseClient): Promise<AutoVoiceConfig[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.autoVoiceConfigs)
        .where(eq(sqliteSchema.autoVoiceConfigs.guildId, guildId));
      return rows as AutoVoiceConfig[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.autoVoiceConfigs)
        .where(eq(pgSchema.autoVoiceConfigs.guildId, guildId));
      return rows as unknown as AutoVoiceConfig[];
    }
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    const config = await this.findById(id, tx);
    return config !== null;
  }

  async create(data: NewAutoVoiceConfig, tx?: DatabaseClient): Promise<AutoVoiceConfig> {
    const client = this.getClient(tx);
    const id = data.id ?? crypto.randomUUID();
    const payload = {
      ...data,
      id,
      channelNameTemplate: data.channelNameTemplate ?? "{user}'s Room",
      userLimit: data.userLimit ?? 0,
      bitrate: data.bitrate ?? 64000,
    };

    if (this.isSqlite(client)) {
      await client.db.insert(sqliteSchema.autoVoiceConfigs).values(payload);
      return (await this.findById(id, tx))!;
    } else {
      const [inserted] = await client.db
        .insert(pgSchema.autoVoiceConfigs)
        .values(payload as any)
        .returning();
      return inserted as unknown as AutoVoiceConfig;
    }
  }

  async upsert(data: NewAutoVoiceConfig, tx?: DatabaseClient): Promise<AutoVoiceConfig> {
    const existing = await this.findByParentChannelId(data.guildId, data.parentChannelId, tx);
    if (existing) {
      return this.update(
        existing.id,
        {
          channelNameTemplate: data.channelNameTemplate,
          userLimit: data.userLimit,
          bitrate: data.bitrate,
        },
        tx,
      );
    }
    return this.create(data, tx);
  }

  async update(
    id: string,
    data: Partial<NewAutoVoiceConfig>,
    tx?: DatabaseClient,
  ): Promise<AutoVoiceConfig> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      await client.db
        .update(sqliteSchema.autoVoiceConfigs)
        .set(data)
        .where(eq(sqliteSchema.autoVoiceConfigs.id, id));
      const updated = await this.findById(id, tx);
      if (!updated) {
        throw new DatabaseError(`Failed to update auto voice config with ID: ${id}`);
      }
      return updated;
    } else {
      const [updated] = await client.db
        .update(pgSchema.autoVoiceConfigs)
        .set(data as any)
        .where(eq(pgSchema.autoVoiceConfigs.id, id))
        .returning();
      if (!updated) {
        throw new DatabaseError(`Failed to update auto voice config with ID: ${id}`);
      }
      return updated as unknown as AutoVoiceConfig;
    }
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const result = await client.db
        .delete(sqliteSchema.autoVoiceConfigs)
        .where(eq(sqliteSchema.autoVoiceConfigs.id, id));
      return (result.changes ?? 0) > 0;
    } else {
      const result = await client.db
        .delete(pgSchema.autoVoiceConfigs)
        .where(eq(pgSchema.autoVoiceConfigs.id, id))
        .returning({ id: pgSchema.autoVoiceConfigs.id });
      return result.length > 0;
    }
  }

  async deleteByParentChannelId(
    guildId: string,
    parentChannelId: string,
    tx?: DatabaseClient,
  ): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const result = await client.db
        .delete(sqliteSchema.autoVoiceConfigs)
        .where(
          and(
            eq(sqliteSchema.autoVoiceConfigs.guildId, guildId),
            eq(sqliteSchema.autoVoiceConfigs.parentChannelId, parentChannelId),
          ),
        );
      return (result.changes ?? 0) > 0;
    } else {
      const result = await client.db
        .delete(pgSchema.autoVoiceConfigs)
        .where(
          and(
            eq(pgSchema.autoVoiceConfigs.guildId, guildId),
            eq(pgSchema.autoVoiceConfigs.parentChannelId, parentChannelId),
          ),
        )
        .returning({ id: pgSchema.autoVoiceConfigs.id });
      return result.length > 0;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.autoVoiceConfigs);
      return Number(row?.count ?? 0);
    } else {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.autoVoiceConfigs);
      return Number(row?.count ?? 0);
    }
  }
}
