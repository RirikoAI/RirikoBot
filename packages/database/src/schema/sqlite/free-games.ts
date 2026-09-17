import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

export const freeGames = sqliteTable('free_games', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(), // 'EPIC' | 'STEAM' | 'GOG'
  title: text('title').notNull(),
  storeUrl: text('store_url').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  startDate: integer('start_date', { mode: 'timestamp_ms' }).notNull(),
  endDate: integer('end_date', { mode: 'timestamp_ms' }).notNull(),
});

export const freeGameAnnouncements = sqliteTable(
  'free_game_announcements',
  {
    gameId: text('game_id').notNull(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    messageId: text('message_id').notNull(),
    announcedAt: integer('announced_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.gameId, table.guildId] })],
);

export const freeGameChannels = sqliteTable('free_game_channels', {
  guildId: text('guild_id').primaryKey(),
  channelId: text('channel_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});
