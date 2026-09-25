import { pgTable, varchar, integer, timestamp, jsonb, primaryKey } from 'drizzle-orm/pg-core';

/**
 * Commands run per guild and UTC day (TASK-1131). The bot buffers counts in memory and adds
 * them here on an interval; the dashboard reads them for the usage chart.
 */
export const commandUsageDaily = pgTable(
  'command_usage_daily',
  {
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    /** UTC day as `YYYY-MM-DD`. */
    day: varchar('day', { length: 10 }).notNull(),
    commandName: varchar('command_name', { length: 64 }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.day, table.commandName] })],
);

/**
 * The bot's own health, refreshed by the bot on a fixed interval. One row per bot process
 * (`id` = `bot`). A stale `updated_at` means the bot is offline.
 */
export const botStatus = pgTable('bot_status', {
  id: varchar('id', { length: 32 }).primaryKey(),
  /** Gateway heartbeat latency; null until the first heartbeat is acknowledged. */
  gatewayPingMs: integer('gateway_ping_ms'),
  guildCount: integer('guild_count').notNull(),
  version: varchar('version', { length: 32 }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

/** Voice channels with at least one member, per guild. Guilds with none have no row. */
export const guildVoiceActivity = pgTable('guild_voice_activity', {
  guildId: varchar('guild_id', { length: 32 }).primaryKey(),
  channels: jsonb('channels').$type<{ channelId: string; members: number }[]>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});
