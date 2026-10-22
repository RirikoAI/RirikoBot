import {
  pgTable,
  varchar,
  boolean,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Per-server starboard settings (STORY-201). One row per guild, created the first time it is saved.
 * A null `channelId` means the starboard is off. `emoji` is a unicode emoji or a custom emoji id.
 */
export const starboardSettings = pgTable('starboard_settings', {
  guildId: varchar('guild_id', { length: 32 }).primaryKey(),
  channelId: varchar('channel_id', { length: 32 }),
  emoji: varchar('emoji', { length: 64 }).notNull().default('⭐'),
  threshold: integer('threshold').notNull().default(3),
  allowSelfStar: boolean('allow_self_star').notNull().default(false),
  ignoredChannelIds: jsonb('ignored_channel_ids').$type<string[]>().notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One starred message: the original, and the copy Ririko posted to the starboard channel.
 * `starboardMessageId` is null until the copy exists. `removed` is true when staff deleted the
 * copy, so the message is never posted again. It holds the author id, so it is in the user-data
 * inventory.
 */
export const starboardPosts = pgTable(
  'starboard_posts',
  {
    messageId: varchar('message_id', { length: 32 }).primaryKey(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    channelId: varchar('channel_id', { length: 32 }).notNull(),
    authorId: varchar('author_id', { length: 32 }).notNull(),
    starboardMessageId: varchar('starboard_message_id', { length: 32 }),
    starCount: integer('star_count').notNull().default(0),
    removed: boolean('removed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pg_starboard_posts_guild').on(table.guildId),
    uniqueIndex('uq_pg_starboard_posts_starboard_message').on(table.starboardMessageId),
  ],
);
