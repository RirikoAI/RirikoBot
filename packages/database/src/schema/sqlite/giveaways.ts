import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';

export const giveaways = sqliteTable(
  'giveaways',
  {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    messageId: text('message_id').notNull(),
    prize: text('prize').notNull(),
    winnerCount: integer('winner_count').notNull().default(1),
    startsAt: integer('starts_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    endsAt: integer('ends_at', { mode: 'timestamp_ms' }).notNull(),
    isEnded: integer('is_ended', { mode: 'boolean' }).notNull().default(false),
    requirements: text('requirements', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .default({}),
    createdBy: text('created_by').notNull(),
  },
  (table) => [index('idx_giveaways_guild_active').on(table.guildId, table.isEnded)],
);

export const giveawayEntries = sqliteTable(
  'giveaway_entries',
  {
    giveawayId: text('giveaway_id').notNull(),
    userId: text('user_id').notNull(),
    bonusMultiplier: integer('bonus_multiplier').notNull().default(1),
    enteredAt: integer('entered_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.giveawayId, table.userId] })],
);

export const giveawayWinners = sqliteTable(
  'giveaway_winners',
  {
    giveawayId: text('giveaway_id').notNull(),
    userId: text('user_id').notNull(),
    wonAt: integer('won_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    isReroll: integer('is_reroll', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.giveawayId, table.userId] })],
);
