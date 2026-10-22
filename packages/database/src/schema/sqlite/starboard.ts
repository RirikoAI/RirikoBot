import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Per-server starboard settings (STORY-201). One row per guild, created the first time it is saved.
 * A null `channelId` means the starboard is off. `emoji` is a unicode emoji or a custom emoji id.
 */
export const starboardSettings = sqliteTable('starboard_settings', {
  guildId: text('guild_id').primaryKey(),
  channelId: text('channel_id'),
  emoji: text('emoji').notNull().default('⭐'),
  threshold: integer('threshold').notNull().default(3),
  allowSelfStar: integer('allow_self_star', { mode: 'boolean' }).notNull().default(false),
  ignoredChannelIds: text('ignored_channel_ids', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default([]),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * One starred message: the original, and the copy Ririko posted to the starboard channel.
 * `starboardMessageId` is null until the copy exists. `removed` is true when staff deleted the
 * copy, so the message is never posted again. It holds the author id, so it is in the user-data
 * inventory.
 */
export const starboardPosts = sqliteTable(
  'starboard_posts',
  {
    messageId: text('message_id').primaryKey(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    authorId: text('author_id').notNull(),
    starboardMessageId: text('starboard_message_id'),
    starCount: integer('star_count').notNull().default(0),
    removed: integer('removed', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_starboard_posts_guild').on(table.guildId),
    uniqueIndex('uq_starboard_posts_starboard_message').on(table.starboardMessageId),
  ],
);
