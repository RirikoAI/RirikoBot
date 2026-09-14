import { pgTable, text, varchar, timestamp, primaryKey } from 'drizzle-orm/pg-core';

export const freeGames = pgTable('free_games', {
  id: varchar('id', { length: 64 }).primaryKey(),
  provider: varchar('provider', { length: 32 }).notNull(),
  title: text('title').notNull(),
  storeUrl: text('store_url').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
});

export const freeGameAnnouncements = pgTable(
  'free_game_announcements',
  {
    gameId: varchar('game_id', { length: 64 }).notNull(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    channelId: varchar('channel_id', { length: 32 }).notNull(),
    messageId: varchar('message_id', { length: 32 }).notNull(),
    announcedAt: timestamp('announced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.gameId, table.guildId] })],
);
