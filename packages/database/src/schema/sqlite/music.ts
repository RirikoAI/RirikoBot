import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const musicGuildSettings = sqliteTable('music_guild_settings', {
  guildId: text('guild_id').primaryKey(),
  defaultVolume: integer('default_volume').notNull().default(80),
  djRoleId: text('dj_role_id'),
  restrictVoiceChannelId: text('restrict_voice_channel_id'),
  autoLeaveEmpty: integer('auto_leave_empty', { mode: 'boolean' }).notNull().default(true),
  lyricsProvider: text('lyrics_provider').notNull().default('GENIUS'),
});

export const musicChannels = sqliteTable('music_channels', {
  guildId: text('guild_id').primaryKey(),
  channelId: text('channel_id').notNull(),
  lastMessageId: text('last_message_id'),
});

export const musicHistory = sqliteTable(
  'music_history',
  {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    trackTitle: text('track_title').notNull(),
    trackUrl: text('track_url').notNull(),
    durationSeconds: integer('duration_seconds').notNull(),
    sourceProvider: text('source_provider').notNull(), // 'YOUTUBE' | 'SPOTIFY' | 'SOUNDCLOUD' | 'DEEZER'
    playedAt: integer('played_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('idx_music_history_guild_played').on(table.guildId, table.playedAt)],
);

export const musicSavedPlaylists = sqliteTable(
  'music_saved_playlists',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
    playCount: integer('play_count').notNull().default(0),
    guildId: text('guild_id'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('idx_music_playlists_user').on(table.userId)],
);

export const musicPlaylistTracks = sqliteTable(
  'music_playlist_tracks',
  {
    id: text('id').primaryKey(),
    playlistId: text('playlist_id').notNull(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    duration: integer('duration').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    position: integer('position').notNull(),
  },
  (table) => [index('idx_music_tracks_playlist').on(table.playlistId, table.position)],
);
