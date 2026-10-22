import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Per-server event log settings: one channel per category (message, member, server, voice).
 * A category with no channel is off. One row per guild, created the first time it is saved.
 */
export const eventLogSettings = sqliteTable('event_log_settings', {
  guildId: text('guild_id').primaryKey(),
  messageChannelId: text('message_channel_id'),
  memberChannelId: text('member_channel_id'),
  serverChannelId: text('server_channel_id'),
  voiceChannelId: text('voice_channel_id'),
  ignoredChannelIds: text('ignored_channel_ids', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default([]),
  ignoreBots: integer('ignore_bots', { mode: 'boolean' }).notNull().default(true),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});
