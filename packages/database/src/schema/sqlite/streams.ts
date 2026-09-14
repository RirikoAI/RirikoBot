import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const streamers = sqliteTable('streamers', {
  id: text('id').primaryKey(),
  platform: text('platform').notNull(), // 'TWITCH' | 'YOUTUBE' | 'TIKTOK' | 'FACEBOOK'
  platformUserId: text('platform_user_id').notNull(),
  username: text('username').notNull(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  isLive: integer('is_live', { mode: 'boolean' }).notNull().default(false),
  lastCheckedAt: integer('last_checked_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const streamSubscriptions = sqliteTable(
  'stream_subscriptions',
  {
    id: text('id').primaryKey(),
    streamerId: text('streamer_id').notNull(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    customMessage: text('custom_message'),
    mentionRoleId: text('mention_role_id'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_stream_subs_streamer').on(table.streamerId),
    index('idx_stream_subs_guild').on(table.guildId),
  ],
);

export const streamEvents = sqliteTable('stream_events', {
  id: text('id').primaryKey(),
  streamerId: text('streamer_id').notNull(),
  streamId: text('stream_id').notNull(),
  title: text('title').notNull(),
  gameName: text('game_name'),
  viewerCount: integer('viewer_count').notNull().default(0),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
});

export const streamAnnouncements = sqliteTable(
  'stream_announcements',
  {
    id: text('id').primaryKey(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    messageId: text('message_id').notNull(),
    announcedAt: integer('announced_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('idx_stream_announcements_key').on(table.idempotencyKey)],
);

export const streamAssets = sqliteTable('stream_assets', {
  streamId: text('stream_id').primaryKey(),
  originalUrl: text('original_url').notNull(),
  discordAttachmentUrl: text('discord_attachment_url').notNull(),
  fileHash: text('file_hash').notNull(),
  cachedAt: integer('cached_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});
