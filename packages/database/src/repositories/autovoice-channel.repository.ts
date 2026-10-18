import { eq, sql } from 'drizzle-orm';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type { AutoVoiceChannel, NewAutoVoiceChannel } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';

/**
 * Records of the temporary voice channels the auto voice service created, keyed by channel ID.
 */
export class AutoVoiceChannelRepository extends BaseRepository<
  AutoVoiceChannel,
  NewAutoVoiceChannel,
  Partial<Omit<NewAutoVoiceChannel, 'channelId'>>
> {
  async findById(channelId: string, tx?: DatabaseClient): Promise<AutoVoiceChannel | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.autoVoiceChannels)
        .where(eq(sqliteSchema.autoVoiceChannels.channelId, channelId));
      return (row as AutoVoiceChannel) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.autoVoiceChannels)
        .where(eq(pgSchema.autoVoiceChannels.channelId, channelId));
      return (row as unknown as AutoVoiceChannel) ?? null;
    }
  }

  async listByGuildId(guildId: string, tx?: DatabaseClient): Promise<AutoVoiceChannel[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.autoVoiceChannels)
        .where(eq(sqliteSchema.autoVoiceChannels.guildId, guildId));
      return rows as AutoVoiceChannel[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.autoVoiceChannels)
        .where(eq(pgSchema.autoVoiceChannels.guildId, guildId));
      return rows as unknown as AutoVoiceChannel[];
    }
  }

  async exists(channelId: string, tx?: DatabaseClient): Promise<boolean> {
    return (await this.findById(channelId, tx)) !== null;
  }

  async create(data: NewAutoVoiceChannel, tx?: DatabaseClient): Promise<AutoVoiceChannel> {
    const client = this.getClient(tx);
    const payload = { ...data, createdAt: data.createdAt ?? new Date() };
    if (this.isSqlite(client)) {
      await client.db.insert(sqliteSchema.autoVoiceChannels).values(payload);
      return (await this.findById(data.channelId, tx))!;
    } else {
      const [inserted] = await client.db
        .insert(pgSchema.autoVoiceChannels)
        .values(payload)
        .returning();
      return inserted as unknown as AutoVoiceChannel;
    }
  }

  async update(
    channelId: string,
    data: Partial<Omit<NewAutoVoiceChannel, 'channelId'>>,
    tx?: DatabaseClient,
  ): Promise<AutoVoiceChannel> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      await client.db
        .update(sqliteSchema.autoVoiceChannels)
        .set(data)
        .where(eq(sqliteSchema.autoVoiceChannels.channelId, channelId));
      const updated = await this.findById(channelId, tx);
      if (!updated) {
        throw new DatabaseError(`Failed to update auto voice channel record: ${channelId}`);
      }
      return updated;
    } else {
      const [updated] = await client.db
        .update(pgSchema.autoVoiceChannels)
        .set(data)
        .where(eq(pgSchema.autoVoiceChannels.channelId, channelId))
        .returning();
      if (!updated) {
        throw new DatabaseError(`Failed to update auto voice channel record: ${channelId}`);
      }
      return updated as unknown as AutoVoiceChannel;
    }
  }

  async delete(channelId: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const result = await client.db
        .delete(sqliteSchema.autoVoiceChannels)
        .where(eq(sqliteSchema.autoVoiceChannels.channelId, channelId));
      return (result.changes ?? 0) > 0;
    } else {
      const result = await client.db
        .delete(pgSchema.autoVoiceChannels)
        .where(eq(pgSchema.autoVoiceChannels.channelId, channelId))
        .returning({ channelId: pgSchema.autoVoiceChannels.channelId });
      return result.length > 0;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.autoVoiceChannels);
      return Number(row?.count ?? 0);
    } else {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.autoVoiceChannels);
      return Number(row?.count ?? 0);
    }
  }
}
