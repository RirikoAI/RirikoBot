import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core';

export const xpAccounts = sqliteTable(
  'xp_accounts',
  {
    userId: text('user_id').notNull(),
    guildId: text('guild_id').notNull(),
    xp: integer('xp').notNull().default(0),
    level: integer('level').notNull().default(0),
    karma: integer('karma').notNull().default(0),
    lastXpAt: integer('last_xp_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.guildId] }),
    index('idx_xp_accounts_guild_xp').on(table.guildId, table.xp),
  ],
);

export const xpEvents = sqliteTable(
  'xp_events',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    guildId: text('guild_id').notNull(),
    xpAwarded: integer('xp_awarded').notNull(),
    source: text('source').notNull(), // 'TEXT' | 'VOICE' | 'QUEST' | 'GAME'
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('idx_xp_events_user_guild').on(table.userId, table.guildId)],
);

export const leaderboardSnapshots = sqliteTable(
  'leaderboard_snapshots',
  {
    userId: text('user_id').notNull(),
    guildId: text('guild_id').notNull(),
    globalRank: integer('global_rank').notNull(),
    serverRank: integer('server_rank').notNull(),
    calculatedAt: integer('calculated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.guildId] }),
    index('idx_leaderboard_server_rank').on(table.guildId, table.serverRank),
  ],
);
