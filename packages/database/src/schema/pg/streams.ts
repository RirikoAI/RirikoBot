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

export const streamers = pgTable('streamers', {
  id: uuid('id').primaryKey().defaultRandom(),
  platform: varchar('platform', { length: 32 }).notNull(),
  platformUserId: varchar('platform_user_id', { length: 64 }).notNull(),
  username: varchar('username', { length: 64 }).notNull(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  isLive: boolean('is_live').notNull().default(false),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }).notNull().defaultNow(),
});

export const streamSubscriptions = pgTable(
  'stream_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    streamerId: uuid('streamer_id').notNull(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    channelId: varchar('channel_id', { length: 32 }).notNull(),
    customMessage: text('custom_message'),
    mentionRoleId: varchar('mention_role_id', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pg_stream_subs_streamer').on(table.streamerId),
    index('idx_pg_stream_subs_guild').on(table.guildId),
  ],
);

export const streamEvents = pgTable('stream_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  streamerId: uuid('streamer_id').notNull(),
  streamId: varchar('stream_id', { length: 64 }).notNull(),
  title: text('title').notNull(),
  gameName: varchar('game_name', { length: 128 }),
  viewerCount: integer('viewer_count').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
});

export const streamAnnouncements = pgTable(
  'stream_announcements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull().unique(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    channelId: varchar('channel_id', { length: 32 }).notNull(),
    messageId: varchar('message_id', { length: 32 }).notNull(),
    announcedAt: timestamp('announced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_pg_stream_announcements_key').on(table.idempotencyKey)],
);

export const streamAssets = pgTable('stream_assets', {
  streamId: varchar('stream_id', { length: 64 }).primaryKey(),
  originalUrl: text('original_url').notNull(),
  discordAttachmentUrl: text('discord_attachment_url').notNull(),
  fileHash: varchar('file_hash', { length: 64 }).notNull(),
  cachedAt: timestamp('cached_at', { withTimezone: true }).notNull().defaultNow(),
});
