import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type {
  MusicGuildSettings,
  NewMusicGuildSettings,
  MusicChannel,
  NewMusicChannel,
  MusicHistory,
  NewMusicHistory,
  MusicPlaylist,
  NewMusicPlaylist,
  MusicTrack,
  NewMusicTrack,
} from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';

export class MusicRepository extends BaseRepository<
  MusicGuildSettings,
  NewMusicGuildSettings,
  Partial<NewMusicGuildSettings>
> {
  // --- BaseRepository Compliance ---

  async findById(guildId: string, tx?: DatabaseClient): Promise<MusicGuildSettings | null> {
    return this.getGuildSettings(guildId, tx);
  }

  async create(data: NewMusicGuildSettings, tx?: DatabaseClient): Promise<MusicGuildSettings> {
    return this.upsertGuildSettings(data.guildId, data, tx);
  }

  async update(
    guildId: string,
    data: Partial<NewMusicGuildSettings>,
    tx?: DatabaseClient,
  ): Promise<MusicGuildSettings> {
    return this.upsertGuildSettings(guildId, data, tx);
  }

  async exists(guildId: string, tx?: DatabaseClient): Promise<boolean> {
    const settings = await this.getGuildSettings(guildId, tx);
    return settings !== null;
  }

  async delete(guildId: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const deleted = await client.db
        .delete(sqliteSchema.musicGuildSettings)
        .where(eq(sqliteSchema.musicGuildSettings.guildId, guildId))
        .returning({ guildId: sqliteSchema.musicGuildSettings.guildId });
      return deleted.length > 0;
    } else {
      const deleted = await client.db
        .delete(pgSchema.musicGuildSettings)
        .where(eq(pgSchema.musicGuildSettings.guildId, guildId))
        .returning({ guildId: pgSchema.musicGuildSettings.guildId });
      return deleted.length > 0;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.musicGuildSettings);
      return Number(res?.count ?? 0);
    } else {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.musicGuildSettings);
      return Number(res?.count ?? 0);
    }
  }

  // --- Guild Settings ---

  async getGuildSettings(guildId: string, tx?: DatabaseClient): Promise<MusicGuildSettings | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.musicGuildSettings)
        .where(eq(sqliteSchema.musicGuildSettings.guildId, guildId));
      return (row as MusicGuildSettings) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.musicGuildSettings)
        .where(eq(pgSchema.musicGuildSettings.guildId, guildId));
      return (row as unknown as MusicGuildSettings) ?? null;
    }
  }

  async upsertGuildSettings(
    guildId: string,
    settings: Partial<NewMusicGuildSettings>,
    tx?: DatabaseClient,
  ): Promise<MusicGuildSettings> {
    const client = this.getClient(tx);
    const insertData: NewMusicGuildSettings = {
      guildId,
      defaultVolume: settings.defaultVolume ?? 20,
      djRoleId: settings.djRoleId ?? null,
      restrictVoiceChannelId: settings.restrictVoiceChannelId ?? null,
      autoLeaveEmpty: settings.autoLeaveEmpty ?? true,
      lyricsProvider: settings.lyricsProvider ?? 'GENIUS',
    };

    if (this.isSqlite(client)) {
      const [upserted] = await client.db
        .insert(sqliteSchema.musicGuildSettings)
        .values(insertData)
        .onConflictDoUpdate({
          target: sqliteSchema.musicGuildSettings.guildId,
          set: settings,
        })
        .returning();
      if (!upserted) throw new DatabaseError(`Failed to upsert music settings for guild ${guildId}`);
      return upserted as MusicGuildSettings;
    } else {
      const [upserted] = await client.db
        .insert(pgSchema.musicGuildSettings)
        .values(insertData as unknown as typeof pgSchema.musicGuildSettings.$inferInsert)
        .onConflictDoUpdate({
          target: pgSchema.musicGuildSettings.guildId,
          set: settings as unknown as Partial<typeof pgSchema.musicGuildSettings.$inferInsert>,
        })
        .returning();
      if (!upserted) throw new DatabaseError(`Failed to upsert music settings for guild ${guildId}`);
      return upserted as unknown as MusicGuildSettings;
    }
  }

  // --- Dedicated Music Channels ---

  async getMusicChannel(guildId: string, tx?: DatabaseClient): Promise<MusicChannel | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.musicChannels)
        .where(eq(sqliteSchema.musicChannels.guildId, guildId));
      return (row as MusicChannel) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.musicChannels)
        .where(eq(pgSchema.musicChannels.guildId, guildId));
      return (row as unknown as MusicChannel) ?? null;
    }
  }

  async setMusicChannel(
    guildId: string,
    channelId: string,
    lastMessageId?: string | null,
    tx?: DatabaseClient,
  ): Promise<MusicChannel> {
    const client = this.getClient(tx);
    const data: NewMusicChannel = {
      guildId,
      channelId,
      lastMessageId: lastMessageId ?? null,
    };

    if (this.isSqlite(client)) {
      const [upserted] = await client.db
        .insert(sqliteSchema.musicChannels)
        .values(data)
        .onConflictDoUpdate({
          target: sqliteSchema.musicChannels.guildId,
          set: { channelId, lastMessageId: data.lastMessageId },
        })
        .returning();
      if (!upserted) throw new DatabaseError(`Failed to set music channel for guild ${guildId}`);
      return upserted as MusicChannel;
    } else {
      const [upserted] = await client.db
        .insert(pgSchema.musicChannels)
        .values(data as unknown as typeof pgSchema.musicChannels.$inferInsert)
        .onConflictDoUpdate({
          target: pgSchema.musicChannels.guildId,
          set: { channelId, lastMessageId: data.lastMessageId },
        })
        .returning();
      if (!upserted) throw new DatabaseError(`Failed to set music channel for guild ${guildId}`);
      return upserted as unknown as MusicChannel;
    }
  }

  async deleteMusicChannel(guildId: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const deleted = await client.db
        .delete(sqliteSchema.musicChannels)
        .where(eq(sqliteSchema.musicChannels.guildId, guildId))
        .returning({ guildId: sqliteSchema.musicChannels.guildId });
      return deleted.length > 0;
    } else {
      const deleted = await client.db
        .delete(pgSchema.musicChannels)
        .where(eq(pgSchema.musicChannels.guildId, guildId))
        .returning({ guildId: pgSchema.musicChannels.guildId });
      return deleted.length > 0;
    }
  }

  // --- Playback History ---

  async recordHistory(
    entry: Omit<NewMusicHistory, 'id' | 'playedAt'> & { id?: string; playedAt?: Date },
    tx?: DatabaseClient,
  ): Promise<MusicHistory> {
    const client = this.getClient(tx);
    const id = entry.id ?? randomUUID();
    const playedAt = entry.playedAt ?? new Date();

    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.musicHistory)
        .values({
          id,
          guildId: entry.guildId,
          userId: entry.userId,
          trackTitle: entry.trackTitle,
          trackUrl: entry.trackUrl,
          durationSeconds: entry.durationSeconds,
          sourceProvider: entry.sourceProvider,
          playedAt,
        })
        .returning();
      if (!created) throw new DatabaseError('Failed to record music history');
      return created as MusicHistory;
    } else {
      const [created] = await client.db
        .insert(pgSchema.musicHistory)
        .values({
          id,
          guildId: entry.guildId,
          userId: entry.userId,
          trackTitle: entry.trackTitle,
          trackUrl: entry.trackUrl,
          durationSeconds: entry.durationSeconds,
          sourceProvider: entry.sourceProvider,
          playedAt,
        } as unknown as typeof pgSchema.musicHistory.$inferInsert)
        .returning();
      if (!created) throw new DatabaseError('Failed to record music history');
      return created as unknown as MusicHistory;
    }
  }

  async getGuildHistory(guildId: string, limit = 20, tx?: DatabaseClient): Promise<MusicHistory[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.musicHistory)
        .where(eq(sqliteSchema.musicHistory.guildId, guildId))
        .orderBy(desc(sqliteSchema.musicHistory.playedAt))
        .limit(limit);
      return rows as MusicHistory[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.musicHistory)
        .where(eq(pgSchema.musicHistory.guildId, guildId))
        .orderBy(desc(pgSchema.musicHistory.playedAt))
        .limit(limit);
      return rows as unknown as MusicHistory[];
    }
  }

  async getUserHistory(userId: string, limit = 20, tx?: DatabaseClient): Promise<MusicHistory[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.musicHistory)
        .where(eq(sqliteSchema.musicHistory.userId, userId))
        .orderBy(desc(sqliteSchema.musicHistory.playedAt))
        .limit(limit);
      return rows as MusicHistory[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.musicHistory)
        .where(eq(pgSchema.musicHistory.userId, userId))
        .orderBy(desc(pgSchema.musicHistory.playedAt))
        .limit(limit);
      return rows as unknown as MusicHistory[];
    }
  }

  // --- Saved Playlists ---

  async createPlaylist(
    userId: string,
    name: string,
    options?: {
      description?: string | null;
      isPublic?: boolean;
      guildId?: string | null;
    },
    tx?: DatabaseClient,
  ): Promise<MusicPlaylist> {
    const client = this.getClient(tx);
    const id = randomUUID();
    const data: NewMusicPlaylist = {
      id,
      userId,
      name,
      description: options?.description ?? null,
      isPublic: options?.isPublic ?? false,
      playCount: 0,
      guildId: options?.guildId ?? null,
      createdAt: new Date(),
    };

    if (this.isSqlite(client)) {
      const [created] = await client.db.insert(sqliteSchema.musicSavedPlaylists).values(data).returning();
      if (!created) throw new DatabaseError(`Failed to create playlist "${name}"`);
      return created as MusicPlaylist;
    } else {
      const [created] = await client.db
        .insert(pgSchema.musicSavedPlaylists)
        .values(data as unknown as typeof pgSchema.musicSavedPlaylists.$inferInsert)
        .returning();
      if (!created) throw new DatabaseError(`Failed to create playlist "${name}"`);
      return created as unknown as MusicPlaylist;
    }
  }

  async getPlaylistById(playlistId: string, tx?: DatabaseClient): Promise<MusicPlaylist | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.musicSavedPlaylists)
        .where(eq(sqliteSchema.musicSavedPlaylists.id, playlistId));
      return (row as MusicPlaylist) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.musicSavedPlaylists)
        .where(eq(pgSchema.musicSavedPlaylists.id, playlistId));
      return (row as unknown as MusicPlaylist) ?? null;
    }
  }

  async getUserPlaylists(userId: string, tx?: DatabaseClient): Promise<MusicPlaylist[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.musicSavedPlaylists)
        .where(eq(sqliteSchema.musicSavedPlaylists.userId, userId))
        .orderBy(desc(sqliteSchema.musicSavedPlaylists.createdAt));
      return rows as MusicPlaylist[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.musicSavedPlaylists)
        .where(eq(pgSchema.musicSavedPlaylists.userId, userId))
        .orderBy(desc(pgSchema.musicSavedPlaylists.createdAt));
      return rows as unknown as MusicPlaylist[];
    }
  }

  async getPublicPlaylists(limit = 50, tx?: DatabaseClient): Promise<MusicPlaylist[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.musicSavedPlaylists)
        .where(eq(sqliteSchema.musicSavedPlaylists.isPublic, true))
        .orderBy(desc(sqliteSchema.musicSavedPlaylists.playCount))
        .limit(limit);
      return rows as MusicPlaylist[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.musicSavedPlaylists)
        .where(eq(pgSchema.musicSavedPlaylists.isPublic, true))
        .orderBy(desc(pgSchema.musicSavedPlaylists.playCount))
        .limit(limit);
      return rows as unknown as MusicPlaylist[];
    }
  }

  async incrementPlaylistPlayCount(playlistId: string, tx?: DatabaseClient): Promise<void> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      await client.db
        .update(sqliteSchema.musicSavedPlaylists)
        .set({ playCount: sql`${sqliteSchema.musicSavedPlaylists.playCount} + 1` })
        .where(eq(sqliteSchema.musicSavedPlaylists.id, playlistId));
    } else {
      await client.db
        .update(pgSchema.musicSavedPlaylists)
        .set({ playCount: sql`${pgSchema.musicSavedPlaylists.playCount} + 1` })
        .where(eq(pgSchema.musicSavedPlaylists.id, playlistId));
    }
  }

  async deletePlaylist(playlistId: string, userId: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    // Delete tracks first, then playlist
    await this.clearPlaylistTracks(playlistId, tx);

    if (this.isSqlite(client)) {
      const deleted = await client.db
        .delete(sqliteSchema.musicSavedPlaylists)
        .where(
          and(
            eq(sqliteSchema.musicSavedPlaylists.id, playlistId),
            eq(sqliteSchema.musicSavedPlaylists.userId, userId),
          ),
        )
        .returning({ id: sqliteSchema.musicSavedPlaylists.id });
      return deleted.length > 0;
    } else {
      const deleted = await client.db
        .delete(pgSchema.musicSavedPlaylists)
        .where(
          and(
            eq(pgSchema.musicSavedPlaylists.id, playlistId),
            eq(pgSchema.musicSavedPlaylists.userId, userId),
          ),
        )
        .returning({ id: pgSchema.musicSavedPlaylists.id });
      return deleted.length > 0;
    }
  }

  // --- Playlist Tracks ---

  async addTrackToPlaylist(
    playlistId: string,
    track: {
      title: string;
      url: string;
      duration: number;
      thumbnailUrl?: string | null;
    },
    tx?: DatabaseClient,
  ): Promise<MusicTrack> {
    const client = this.getClient(tx);
    const id = randomUUID();

    // Determine current highest position
    let nextPosition: number;
    if (this.isSqlite(client)) {
      const [posRow] = await client.db
        .select({ maxPos: sql<number>`COALESCE(MAX(${sqliteSchema.musicPlaylistTracks.position}), -1)` })
        .from(sqliteSchema.musicPlaylistTracks)
        .where(eq(sqliteSchema.musicPlaylistTracks.playlistId, playlistId));
      nextPosition = (posRow?.maxPos ?? -1) + 1;
    } else {
      const [posRow] = await client.db
        .select({ maxPos: sql<number>`COALESCE(MAX(${pgSchema.musicPlaylistTracks.position}), -1)` })
        .from(pgSchema.musicPlaylistTracks)
        .where(eq(pgSchema.musicPlaylistTracks.playlistId, playlistId));
      nextPosition = (posRow?.maxPos ?? -1) + 1;
    }

    const data: NewMusicTrack = {
      id,
      playlistId,
      title: track.title,
      url: track.url,
      duration: track.duration,
      thumbnailUrl: track.thumbnailUrl ?? null,
      position: nextPosition,
    };

    if (this.isSqlite(client)) {
      const [created] = await client.db.insert(sqliteSchema.musicPlaylistTracks).values(data).returning();
      if (!created) throw new DatabaseError(`Failed to add track to playlist ${playlistId}`);
      return created as MusicTrack;
    } else {
      const [created] = await client.db
        .insert(pgSchema.musicPlaylistTracks)
        .values(data as unknown as typeof pgSchema.musicPlaylistTracks.$inferInsert)
        .returning();
      if (!created) throw new DatabaseError(`Failed to add track to playlist ${playlistId}`);
      return created as unknown as MusicTrack;
    }
  }

  async removeTrackFromPlaylist(
    playlistId: string,
    trackId: string,
    tx?: DatabaseClient,
  ): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const deleted = await client.db
        .delete(sqliteSchema.musicPlaylistTracks)
        .where(
          and(
            eq(sqliteSchema.musicPlaylistTracks.id, trackId),
            eq(sqliteSchema.musicPlaylistTracks.playlistId, playlistId),
          ),
        )
        .returning({ id: sqliteSchema.musicPlaylistTracks.id });
      return deleted.length > 0;
    } else {
      const deleted = await client.db
        .delete(pgSchema.musicPlaylistTracks)
        .where(
          and(
            eq(pgSchema.musicPlaylistTracks.id, trackId),
            eq(pgSchema.musicPlaylistTracks.playlistId, playlistId),
          ),
        )
        .returning({ id: pgSchema.musicPlaylistTracks.id });
      return deleted.length > 0;
    }
  }

  async getPlaylistTracks(playlistId: string, tx?: DatabaseClient): Promise<MusicTrack[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.musicPlaylistTracks)
        .where(eq(sqliteSchema.musicPlaylistTracks.playlistId, playlistId))
        .orderBy(asc(sqliteSchema.musicPlaylistTracks.position));
      return rows as MusicTrack[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.musicPlaylistTracks)
        .where(eq(pgSchema.musicPlaylistTracks.playlistId, playlistId))
        .orderBy(asc(pgSchema.musicPlaylistTracks.position));
      return rows as unknown as MusicTrack[];
    }
  }

  async clearPlaylistTracks(playlistId: string, tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const deleted = await client.db
        .delete(sqliteSchema.musicPlaylistTracks)
        .where(eq(sqliteSchema.musicPlaylistTracks.playlistId, playlistId))
        .returning({ id: sqliteSchema.musicPlaylistTracks.id });
      return deleted.length;
    } else {
      const deleted = await client.db
        .delete(pgSchema.musicPlaylistTracks)
        .where(eq(pgSchema.musicPlaylistTracks.playlistId, playlistId))
        .returning({ id: pgSchema.musicPlaylistTracks.id });
      return deleted.length;
    }
  }
}
