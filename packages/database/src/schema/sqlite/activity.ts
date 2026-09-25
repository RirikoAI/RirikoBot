import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

/**
 * Commands run per guild and UTC day (TASK-1131). The bot buffers counts in memory and adds
 * them here on an interval; the dashboard reads them for the usage chart.
 */
export const commandUsageDaily = sqliteTable(
  'command_usage_daily',
  {
    guildId: text('guild_id').notNull(),
    /** UTC day as `YYYY-MM-DD`. */
    day: text('day').notNull(),
    commandName: text('command_name').notNull(),
    count: integer('count').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.day, table.commandName] })],
);

/**
 * The bot's own health, refreshed by the bot on a fixed interval. One row per bot process
 * (`id` = `bot`). A stale `updated_at` means the bot is offline.
 */
export const botStatus = sqliteTable('bot_status', {
  id: text('id').primaryKey(),
  /** Gateway heartbeat latency; null until the first heartbeat is acknowledged. */
  gatewayPingMs: integer('gateway_ping_ms'),
  guildCount: integer('guild_count').notNull(),
  version: text('version').notNull(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

/** Voice channels with at least one member, per guild. Guilds with none have no row. */
export const guildVoiceActivity = sqliteTable('guild_voice_activity', {
  guildId: text('guild_id').primaryKey(),
  channels: text('channels', { mode: 'json' })
    .$type<{ channelId: string; members: number }[]>()
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
