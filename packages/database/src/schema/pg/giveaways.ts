import {
  pgTable,
  text,
  varchar,
  boolean,
  integer,
  uuid,
  timestamp,
  jsonb,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';

export const giveaways = pgTable(
  'giveaways',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    channelId: varchar('channel_id', { length: 32 }).notNull(),
    messageId: varchar('message_id', { length: 32 }).notNull(),
    prize: text('prize').notNull(),
    winnerCount: integer('winner_count').notNull().default(1),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    isEnded: boolean('is_ended').notNull().default(false),
    requirements: jsonb('requirements').$type<Record<string, unknown>>().default({}),
    createdBy: varchar('created_by', { length: 32 }).notNull(),
  },
  (table) => [index('idx_pg_giveaways_guild_active').on(table.guildId, table.isEnded)],
);

export const giveawayEntries = pgTable(
  'giveaway_entries',
  {
    giveawayId: uuid('giveaway_id').notNull(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    bonusMultiplier: integer('bonus_multiplier').notNull().default(1),
    enteredAt: timestamp('entered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.giveawayId, table.userId] })],
);

export const giveawayWinners = pgTable(
  'giveaway_winners',
  {
    giveawayId: uuid('giveaway_id').notNull(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    wonAt: timestamp('won_at', { withTimezone: true }).notNull().defaultNow(),
    isReroll: boolean('is_reroll').notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.giveawayId, table.userId] })],
);
