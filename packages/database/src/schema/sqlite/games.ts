import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';

export const miniGames = sqliteTable('mini_games', {
  id: text('id').primaryKey(), // 'TICTACTOE' | 'RPS' | 'HIGHLOW' | 'COINFLIP' | 'DICE'
  name: text('name').notNull(),
  minPlayers: integer('min_players').notNull().default(1),
  maxPlayers: integer('max_players').notNull().default(2),
  allowWagers: integer('allow_wagers', { mode: 'boolean' }).notNull().default(true),
  cooldownSeconds: integer('cooldown_seconds').notNull().default(10),
});

export const gameSessions = sqliteTable(
  'game_sessions',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id').notNull(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    hostUserId: text('host_user_id').notNull(),
    opponentUserId: text('opponent_user_id'),
    wagerAmount: integer('wager_amount').notNull().default(0),
    state: text('state', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').notNull().default('WAITING'), // 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'TIMED_OUT'
    winnerUserId: text('winner_user_id'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('idx_game_sessions_guild_status').on(table.guildId, table.status)],
);

export const gameStatistics = sqliteTable(
  'game_statistics',
  {
    userId: text('user_id').notNull(),
    gameId: text('game_id').notNull(),
    wins: integer('wins').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    ties: integer('ties').notNull().default(0),
    totalWagered: integer('total_wagered').notNull().default(0),
    netProfit: integer('net_profit').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.gameId] })],
);
