import { eq, and, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type {
  Streamer,
  NewStreamer,
  StreamSubscription,
  NewStreamSubscription,
  StreamEvent,
  NewStreamEvent,
  StreamAnnouncement,
  NewStreamAnnouncement,
  StreamAsset,
  NewStreamAsset,
} from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';

export interface UpsertStreamerInput {
  id?: string | undefined;
  platform: string;
  platformUserId: string;
  username: string;
  displayName?: string | null | undefined;
  avatarUrl?: string | null | undefined;
  isLive?: boolean | undefined;
  lastCheckedAt?: Date | undefined;
}

export interface AddSubscriptionInput {
  id?: string | undefined;
  streamerId: string;
  guildId: string;
  channelId: string;
  customMessage?: string | null | undefined;
  mentionRoleId?: string | null | undefined;
}

export interface RecordStreamEventInput {
  id?: string | undefined;
  streamerId: string;
  streamId: string;
  title: string;
  gameName?: string | null | undefined;
  viewerCount?: number | undefined;
  startedAt: Date;
  endedAt?: Date | null | undefined;
}

export interface RecordAnnouncementInput {
  id?: string | undefined;
  idempotencyKey: string;
  guildId: string;
  channelId: string;
  messageId: string;
  announcedAt?: Date | undefined;
}

export interface SaveStreamAssetInput {
  streamId: string;
  originalUrl: string;
  discordAttachmentUrl: string;
  fileHash: string;
  cachedAt?: Date | undefined;
}

export class StreamRepository extends BaseRepository<Streamer, NewStreamer, Partial<NewStreamer>> {
  // ==========================================
  // Streamers
  // ==========================================

  async findById(id: string, tx?: DatabaseClient): Promise<Streamer | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.streamers)
        .where(eq(sqliteSchema.streamers.id, id));
      return (row as Streamer) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.streamers)
        .where(eq(pgSchema.streamers.id, id));
      return (row as unknown as Streamer) ?? null;
    }
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    const streamer = await this.findById(id, tx);
    return streamer !== null;
  }

  async create(data: NewStreamer, tx?: DatabaseClient): Promise<Streamer> {
    const client = this.getClient(tx);
    const id = data.id ?? randomUUID();
    const payload = {
      ...data,
      id,
      platform: data.platform.toUpperCase(),
      lastCheckedAt: data.lastCheckedAt ?? new Date(),
    };

    if (this.isSqlite(client)) {
      const [created] = await client.db.insert(sqliteSchema.streamers).values(payload).returning();
      if (!created) throw new DatabaseError(`Failed to create streamer ${data.username}`);
      return created as Streamer;
    } else {
      const [created] = await client.db
        .insert(pgSchema.streamers)
        .values(payload as unknown as typeof pgSchema.streamers.$inferInsert)
        .returning();
      if (!created) throw new DatabaseError(`Failed to create streamer ${data.username}`);
      return created as unknown as Streamer;
    }
  }

  async update(id: string, data: Partial<NewStreamer>, tx?: DatabaseClient): Promise<Streamer> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [updated] = await client.db
        .update(sqliteSchema.streamers)
        .set(data)
        .where(eq(sqliteSchema.streamers.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`Streamer ${id} not found for update`);
      return updated as Streamer;
    } else {
      const [updated] = await client.db
        .update(pgSchema.streamers)
        .set(data as unknown as Partial<typeof pgSchema.streamers.$inferInsert>)
        .where(eq(pgSchema.streamers.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`Streamer ${id} not found for update`);
      return updated as unknown as Streamer;
    }
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const deleted = await client.db
        .delete(sqliteSchema.streamers)
        .where(eq(sqliteSchema.streamers.id, id))
        .returning();
      return deleted.length > 0;
    } else {
      const deleted = await client.db
        .delete(pgSchema.streamers)
        .where(eq(pgSchema.streamers.id, id))
        .returning();
      return deleted.length > 0;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.streamers);
      return Number(row?.count ?? 0);
    } else {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.streamers);
      return Number(row?.count ?? 0);
    }
  }

  async findByPlatformUser(
    platform: string,
    platformUserId: string,
    tx?: DatabaseClient,
  ): Promise<Streamer | null> {
    const client = this.getClient(tx);
    const upperPlatform = platform.toUpperCase();

    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.streamers)
        .where(
          and(
            sql`UPPER(${sqliteSchema.streamers.platform}) = ${upperPlatform}`,
            eq(sqliteSchema.streamers.platformUserId, platformUserId),
          ),
        );
      return (row as Streamer) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.streamers)
        .where(
          and(
            sql`UPPER(${pgSchema.streamers.platform}) = ${upperPlatform}`,
            eq(pgSchema.streamers.platformUserId, platformUserId),
          ),
        );
      return (row as unknown as Streamer) ?? null;
    }
  }

  async findByUsername(
    platform: string,
    username: string,
    tx?: DatabaseClient,
  ): Promise<Streamer | null> {
    const client = this.getClient(tx);
    const upperPlatform = platform.toUpperCase();
    const lowerUsername = username.toLowerCase();

    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.streamers)
        .where(
          and(
            sql`UPPER(${sqliteSchema.streamers.platform}) = ${upperPlatform}`,
            sql`LOWER(${sqliteSchema.streamers.username}) = ${lowerUsername}`,
          ),
        );
      return (row as Streamer) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.streamers)
        .where(
          and(
            sql`UPPER(${pgSchema.streamers.platform}) = ${upperPlatform}`,
            sql`LOWER(${pgSchema.streamers.username}) = ${lowerUsername}`,
          ),
        );
      return (row as unknown as Streamer) ?? null;
    }
  }

  async upsertStreamer(data: UpsertStreamerInput, tx?: DatabaseClient): Promise<Streamer> {
    const client = this.getClient(tx);
    const existing = await this.findByPlatformUser(data.platform, data.platformUserId, tx);

    if (existing) {
      const updateData = {
        username: data.username,
        displayName: data.displayName !== undefined ? data.displayName : existing.displayName,
        avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl : existing.avatarUrl,
        isLive: data.isLive !== undefined ? data.isLive : existing.isLive,
        lastCheckedAt: data.lastCheckedAt ?? new Date(),
      };

      if (this.isSqlite(client)) {
        const [updated] = await client.db
          .update(sqliteSchema.streamers)
          .set(updateData)
          .where(eq(sqliteSchema.streamers.id, existing.id))
          .returning();
        return updated as Streamer;
      } else {
        const [updated] = await client.db
          .update(pgSchema.streamers)
          .set(updateData)
          .where(eq(pgSchema.streamers.id, existing.id))
          .returning();
        return updated as unknown as Streamer;
      }
    }

    const streamerId = data.id ?? randomUUID();
    const insertPayload = {
      id: streamerId,
      platform: data.platform.toUpperCase(),
      platformUserId: data.platformUserId,
      username: data.username,
      displayName: data.displayName ?? null,
      avatarUrl: data.avatarUrl ?? null,
      isLive: data.isLive ?? false,
      lastCheckedAt: data.lastCheckedAt ?? new Date(),
    };

    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.streamers)
        .values(insertPayload)
        .returning();
      if (!created) throw new DatabaseError(`Failed to insert streamer ${data.username}`);
      return created as Streamer;
    } else {
      const [created] = await client.db
        .insert(pgSchema.streamers)
        .values(insertPayload as unknown as typeof pgSchema.streamers.$inferInsert)
        .returning();
      if (!created) throw new DatabaseError(`Failed to insert streamer ${data.username}`);
      return created as unknown as Streamer;
    }
  }

  async updateLiveStatus(
    id: string,
    isLive: boolean,
    lastCheckedAt?: Date,
    tx?: DatabaseClient,
  ): Promise<void> {
    const client = this.getClient(tx);
    const timestamp = lastCheckedAt ?? new Date();

    if (this.isSqlite(client)) {
      await client.db
        .update(sqliteSchema.streamers)
        .set({ isLive, lastCheckedAt: timestamp })
        .where(eq(sqliteSchema.streamers.id, id));
    } else {
      await client.db
        .update(pgSchema.streamers)
        .set({ isLive, lastCheckedAt: timestamp })
        .where(eq(pgSchema.streamers.id, id));
    }
  }

  async listAllStreamers(tx?: DatabaseClient): Promise<Streamer[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db.select().from(sqliteSchema.streamers);
      return rows as Streamer[];
    } else {
      const rows = await client.db.select().from(pgSchema.streamers);
      return rows as unknown as Streamer[];
    }
  }

  async listActiveMonitoredStreamers(tx?: DatabaseClient): Promise<Streamer[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .selectDistinct({
          id: sqliteSchema.streamers.id,
          platform: sqliteSchema.streamers.platform,
          platformUserId: sqliteSchema.streamers.platformUserId,
          username: sqliteSchema.streamers.username,
          displayName: sqliteSchema.streamers.displayName,
          avatarUrl: sqliteSchema.streamers.avatarUrl,
          isLive: sqliteSchema.streamers.isLive,
          lastCheckedAt: sqliteSchema.streamers.lastCheckedAt,
        })
        .from(sqliteSchema.streamers)
        .innerJoin(
          sqliteSchema.streamSubscriptions,
          eq(sqliteSchema.streamers.id, sqliteSchema.streamSubscriptions.streamerId),
        );
      return rows as Streamer[];
    } else {
      const rows = await client.db
        .selectDistinct({
          id: pgSchema.streamers.id,
          platform: pgSchema.streamers.platform,
          platformUserId: pgSchema.streamers.platformUserId,
          username: pgSchema.streamers.username,
          displayName: pgSchema.streamers.displayName,
          avatarUrl: pgSchema.streamers.avatarUrl,
          isLive: pgSchema.streamers.isLive,
          lastCheckedAt: pgSchema.streamers.lastCheckedAt,
        })
        .from(pgSchema.streamers)
        .innerJoin(
          pgSchema.streamSubscriptions,
          eq(pgSchema.streamers.id, pgSchema.streamSubscriptions.streamerId),
        );
      return rows as unknown as Streamer[];
    }
  }

  // ==========================================
  // Stream Subscriptions
  // ==========================================

  async addSubscription(
    data: AddSubscriptionInput,
    tx?: DatabaseClient,
  ): Promise<StreamSubscription> {
    const client = this.getClient(tx);
    const existing = await this.findSubscription(data.guildId, data.streamerId, tx);
    if (existing) {
      const updateData = {
        channelId: data.channelId,
        customMessage:
          data.customMessage !== undefined ? data.customMessage : existing.customMessage,
        mentionRoleId:
          data.mentionRoleId !== undefined ? data.mentionRoleId : existing.mentionRoleId,
      };

      if (this.isSqlite(client)) {
        const [updated] = await client.db
          .update(sqliteSchema.streamSubscriptions)
          .set(updateData)
          .where(eq(sqliteSchema.streamSubscriptions.id, existing.id))
          .returning();
        return updated as StreamSubscription;
      } else {
        const [updated] = await client.db
          .update(pgSchema.streamSubscriptions)
          .set(updateData)
          .where(eq(pgSchema.streamSubscriptions.id, existing.id))
          .returning();
        return updated as unknown as StreamSubscription;
      }
    }

    const subId = data.id ?? randomUUID();
    const insertPayload = {
      id: subId,
      streamerId: data.streamerId,
      guildId: data.guildId,
      channelId: data.channelId,
      customMessage: data.customMessage ?? null,
      mentionRoleId: data.mentionRoleId ?? null,
      createdAt: new Date(),
    };

    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.streamSubscriptions)
        .values(insertPayload)
        .returning();
      if (!created) throw new DatabaseError('Failed to create stream subscription');
      return created as StreamSubscription;
    } else {
      const [created] = await client.db
        .insert(pgSchema.streamSubscriptions)
        .values(insertPayload as unknown as typeof pgSchema.streamSubscriptions.$inferInsert)
        .returning();
      if (!created) throw new DatabaseError('Failed to create stream subscription');
      return created as unknown as StreamSubscription;
    }
  }

  async removeSubscription(
    guildId: string,
    streamerId: string,
    tx?: DatabaseClient,
  ): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const deleted = await client.db
        .delete(sqliteSchema.streamSubscriptions)
        .where(
          and(
            eq(sqliteSchema.streamSubscriptions.guildId, guildId),
            eq(sqliteSchema.streamSubscriptions.streamerId, streamerId),
          ),
        )
        .returning();
      return deleted.length > 0;
    } else {
      const deleted = await client.db
        .delete(pgSchema.streamSubscriptions)
        .where(
          and(
            eq(pgSchema.streamSubscriptions.guildId, guildId),
            eq(pgSchema.streamSubscriptions.streamerId, streamerId),
          ),
        )
        .returning();
      return deleted.length > 0;
    }
  }

  async findSubscription(
    guildId: string,
    streamerId: string,
    tx?: DatabaseClient,
  ): Promise<StreamSubscription | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.streamSubscriptions)
        .where(
          and(
            eq(sqliteSchema.streamSubscriptions.guildId, guildId),
            eq(sqliteSchema.streamSubscriptions.streamerId, streamerId),
          ),
        );
      return (row as StreamSubscription) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.streamSubscriptions)
        .where(
          and(
            eq(pgSchema.streamSubscriptions.guildId, guildId),
            eq(pgSchema.streamSubscriptions.streamerId, streamerId),
          ),
        );
      return (row as unknown as StreamSubscription) ?? null;
    }
  }

  async getSubscriptionsByGuild(
    guildId: string,
    tx?: DatabaseClient,
  ): Promise<StreamSubscription[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.streamSubscriptions)
        .where(eq(sqliteSchema.streamSubscriptions.guildId, guildId));
      return rows as StreamSubscription[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.streamSubscriptions)
        .where(eq(pgSchema.streamSubscriptions.guildId, guildId));
      return rows as unknown as StreamSubscription[];
    }
  }

  async listGuildSubscriptionsWithStreamers(
    guildId: string,
    tx?: DatabaseClient,
  ): Promise<Array<{ subscription: StreamSubscription; streamer: Streamer }>> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select({
          subscription: sqliteSchema.streamSubscriptions,
          streamer: sqliteSchema.streamers,
        })
        .from(sqliteSchema.streamSubscriptions)
        .innerJoin(
          sqliteSchema.streamers,
          eq(sqliteSchema.streamSubscriptions.streamerId, sqliteSchema.streamers.id),
        )
        .where(eq(sqliteSchema.streamSubscriptions.guildId, guildId));
      return rows as unknown as Array<{ subscription: StreamSubscription; streamer: Streamer }>;
    } else {
      const rows = await client.db
        .select({
          subscription: pgSchema.streamSubscriptions,
          streamer: pgSchema.streamers,
        })
        .from(pgSchema.streamSubscriptions)
        .innerJoin(
          pgSchema.streamers,
          eq(pgSchema.streamSubscriptions.streamerId, pgSchema.streamers.id),
        )
        .where(eq(pgSchema.streamSubscriptions.guildId, guildId));
      return rows as unknown as Array<{ subscription: StreamSubscription; streamer: Streamer }>;
    }
  }

  async getSubscriptionsByStreamer(
    streamerId: string,
    tx?: DatabaseClient,
  ): Promise<StreamSubscription[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.streamSubscriptions)
        .where(eq(sqliteSchema.streamSubscriptions.streamerId, streamerId));
      return rows as StreamSubscription[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.streamSubscriptions)
        .where(eq(pgSchema.streamSubscriptions.streamerId, streamerId));
      return rows as unknown as StreamSubscription[];
    }
  }

  // ==========================================
  // Stream Events
  // ==========================================

  async recordStreamEvent(data: RecordStreamEventInput, tx?: DatabaseClient): Promise<StreamEvent> {
    const client = this.getClient(tx);
    const eventId = data.id ?? randomUUID();
    const insertPayload = {
      id: eventId,
      streamerId: data.streamerId,
      streamId: data.streamId,
      title: data.title,
      gameName: data.gameName ?? null,
      viewerCount: data.viewerCount ?? 0,
      startedAt: data.startedAt,
      endedAt: data.endedAt ?? null,
    };

    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.streamEvents)
        .values(insertPayload)
        .returning();
      if (!created) throw new DatabaseError('Failed to record stream event');
      return created as StreamEvent;
    } else {
      const [created] = await client.db
        .insert(pgSchema.streamEvents)
        .values(insertPayload as unknown as typeof pgSchema.streamEvents.$inferInsert)
        .returning();
      if (!created) throw new DatabaseError('Failed to record stream event');
      return created as unknown as StreamEvent;
    }
  }

  async endStreamEvent(streamId: string, endedAt?: Date, tx?: DatabaseClient): Promise<void> {
    const client = this.getClient(tx);
    const timestamp = endedAt ?? new Date();

    if (this.isSqlite(client)) {
      await client.db
        .update(sqliteSchema.streamEvents)
        .set({ endedAt: timestamp })
        .where(eq(sqliteSchema.streamEvents.streamId, streamId));
    } else {
      await client.db
        .update(pgSchema.streamEvents)
        .set({ endedAt: timestamp })
        .where(eq(pgSchema.streamEvents.streamId, streamId));
    }
  }

  // ==========================================
  // Stream Announcements (Idempotency)
  // ==========================================

  async isAnnounced(idempotencyKey: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select({ id: sqliteSchema.streamAnnouncements.id })
        .from(sqliteSchema.streamAnnouncements)
        .where(eq(sqliteSchema.streamAnnouncements.idempotencyKey, idempotencyKey));
      return Boolean(row);
    } else {
      const [row] = await client.db
        .select({ id: pgSchema.streamAnnouncements.id })
        .from(pgSchema.streamAnnouncements)
        .where(eq(pgSchema.streamAnnouncements.idempotencyKey, idempotencyKey));
      return Boolean(row);
    }
  }

  async recordAnnouncement(
    data: RecordAnnouncementInput,
    tx?: DatabaseClient,
  ): Promise<StreamAnnouncement> {
    const client = this.getClient(tx);
    const announcementId = data.id ?? randomUUID();
    const insertPayload = {
      id: announcementId,
      idempotencyKey: data.idempotencyKey,
      guildId: data.guildId,
      channelId: data.channelId,
      messageId: data.messageId,
      announcedAt: data.announcedAt ?? new Date(),
    };

    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.streamAnnouncements)
        .values(insertPayload)
        .returning();
      if (!created) throw new DatabaseError('Failed to record stream announcement');
      return created as StreamAnnouncement;
    } else {
      const [created] = await client.db
        .insert(pgSchema.streamAnnouncements)
        .values(insertPayload as unknown as typeof pgSchema.streamAnnouncements.$inferInsert)
        .returning();
      if (!created) throw new DatabaseError('Failed to record stream announcement');
      return created as unknown as StreamAnnouncement;
    }
  }

  // ==========================================
  // Stream Assets (CDN Caching)
  // ==========================================

  async getCachedAsset(streamId: string, tx?: DatabaseClient): Promise<StreamAsset | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.streamAssets)
        .where(eq(sqliteSchema.streamAssets.streamId, streamId));
      return (row as StreamAsset) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.streamAssets)
        .where(eq(pgSchema.streamAssets.streamId, streamId));
      return (row as unknown as StreamAsset) ?? null;
    }
  }

  async saveCachedAsset(data: SaveStreamAssetInput, tx?: DatabaseClient): Promise<StreamAsset> {
    const client = this.getClient(tx);
    const existing = await this.getCachedAsset(data.streamId, tx);

    if (existing) {
      const updatePayload = {
        originalUrl: data.originalUrl,
        discordAttachmentUrl: data.discordAttachmentUrl,
        fileHash: data.fileHash,
        cachedAt: data.cachedAt ?? new Date(),
      };

      if (this.isSqlite(client)) {
        const [updated] = await client.db
          .update(sqliteSchema.streamAssets)
          .set(updatePayload)
          .where(eq(sqliteSchema.streamAssets.streamId, data.streamId))
          .returning();
        return updated as StreamAsset;
      } else {
        const [updated] = await client.db
          .update(pgSchema.streamAssets)
          .set(updatePayload)
          .where(eq(pgSchema.streamAssets.streamId, data.streamId))
          .returning();
        return updated as unknown as StreamAsset;
      }
    }

    const insertPayload = {
      streamId: data.streamId,
      originalUrl: data.originalUrl,
      discordAttachmentUrl: data.discordAttachmentUrl,
      fileHash: data.fileHash,
      cachedAt: data.cachedAt ?? new Date(),
    };

    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.streamAssets)
        .values(insertPayload)
        .returning();
      if (!created) throw new DatabaseError('Failed to save stream asset');
      return created as StreamAsset;
    } else {
      const [created] = await client.db
        .insert(pgSchema.streamAssets)
        .values(insertPayload as unknown as typeof pgSchema.streamAssets.$inferInsert)
        .returning();
      if (!created) throw new DatabaseError('Failed to save stream asset');
      return created as unknown as StreamAsset;
    }
  }
}
