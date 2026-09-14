import {
  pgTable,
  text,
  varchar,
  boolean,
  integer,
  uuid,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const musicGuildSettings = pgTable('music_guild_settings', {
  guildId: varchar('guild_id', { length: 32 }).primaryKey(),
  defaultVolume: integer('default_volume').notNull().default(80),
  djRoleId: varchar('dj_role_id', { length: 32 }),
  restrictVoiceChannelId: varchar('restrict_voice_channel_id', { length: 32 }),
  autoLeaveEmpty: boolean('auto_leave_empty').notNull().default(true),
  lyricsProvider: varchar('lyrics_provider', { length: 32 }).notNull().default('GENIUS'),
});

export const musicChannels = pgTable('music_channels', {
  guildId: varchar('guild_id', { length: 32 }).primaryKey(),
  channelId: varchar('channel_id', { length: 32 }).notNull(),
  lastMessageId: varchar('last_message_id', { length: 32 }),
});

export const musicHistory = pgTable(
  'music_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    trackTitle: text('track_title').notNull(),
    trackUrl: text('track_url').notNull(),
    durationSeconds: integer('duration_seconds').notNull(),
    sourceProvider: varchar('source_provider', { length: 32 }).notNull(),
    playedAt: timestamp('played_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_pg_music_history_guild_played').on(table.guildId, table.playedAt)],
);

export const musicSavedPlaylists = pgTable(
  'music_saved_playlists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    name: varchar('name', { length: 64 }).notNull(),
    description: text('description'),
    isPublic: boolean('is_public').notNull().default(false),
    playCount: integer('play_count').notNull().default(0),
    guildId: varchar('guild_id', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_pg_music_playlists_user').on(table.userId)],
);

export const musicPlaylistTracks = pgTable(
  'music_playlist_tracks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playlistId: uuid('playlist_id').notNull(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    duration: integer('duration').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    position: integer('position').notNull(),
  },
  (table) => [index('idx_pg_music_tracks_playlist').on(table.playlistId, table.position)],
);
