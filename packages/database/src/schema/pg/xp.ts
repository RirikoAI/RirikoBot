import {
  pgTable,
  varchar,
  integer,
  bigint,
  uuid,
  timestamp,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';

export const xpAccounts = pgTable(
  'xp_accounts',
  {
    userId: varchar('user_id', { length: 32 }).notNull(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    xp: bigint('xp', { mode: 'bigint' }).notNull().default(0n),
    level: integer('level').notNull().default(0),
    karma: integer('karma').notNull().default(0),
    lastXpAt: timestamp('last_xp_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.guildId] }),
    index('idx_pg_xp_accounts_guild_xp').on(table.guildId, table.xp),
  ],
);

export const xpEvents = pgTable(
  'xp_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    xpAwarded: integer('xp_awarded').notNull(),
    source: varchar('source', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_pg_xp_events_user_guild').on(table.userId, table.guildId)],
);

export const leaderboardSnapshots = pgTable(
  'leaderboard_snapshots',
  {
    userId: varchar('user_id', { length: 32 }).notNull(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    globalRank: integer('global_rank').notNull(),
    serverRank: integer('server_rank').notNull(),
    calculatedAt: timestamp('calculated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.guildId] }),
    index('idx_pg_leaderboard_server_rank').on(table.guildId, table.serverRank),
  ],
);
