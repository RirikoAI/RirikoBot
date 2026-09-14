import {
  pgTable,
  text,
  varchar,
  boolean,
  integer,
  bigint,
  uuid,
  timestamp,
  jsonb,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';

export const miniGames = pgTable('mini_games', {
  id: varchar('id', { length: 32 }).primaryKey(),
  name: text('name').notNull(),
  minPlayers: integer('min_players').notNull().default(1),
  maxPlayers: integer('max_players').notNull().default(2),
  allowWagers: boolean('allow_wagers').notNull().default(true),
  cooldownSeconds: integer('cooldown_seconds').notNull().default(10),
});

export const gameSessions = pgTable(
  'game_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gameId: varchar('game_id', { length: 32 }).notNull(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    channelId: varchar('channel_id', { length: 32 }).notNull(),
    hostUserId: varchar('host_user_id', { length: 32 }).notNull(),
    opponentUserId: varchar('opponent_user_id', { length: 32 }),
    wagerAmount: bigint('wager_amount', { mode: 'bigint' }).notNull().default(0n),
    state: jsonb('state').$type<Record<string, unknown>>().notNull().default({}),
    status: varchar('status', { length: 32 }).notNull().default('WAITING'),
    winnerUserId: varchar('winner_user_id', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_pg_game_sessions_guild_status').on(table.guildId, table.status)],
);

export const gameStatistics = pgTable(
  'game_statistics',
  {
    userId: varchar('user_id', { length: 32 }).notNull(),
    gameId: varchar('game_id', { length: 32 }).notNull(),
    wins: integer('wins').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    ties: integer('ties').notNull().default(0),
    totalWagered: bigint('total_wagered', { mode: 'bigint' }).notNull().default(0n),
    netProfit: bigint('net_profit', { mode: 'bigint' }).notNull().default(0n),
  },
  (table) => [primaryKey({ columns: [table.userId, table.gameId] })],
);
