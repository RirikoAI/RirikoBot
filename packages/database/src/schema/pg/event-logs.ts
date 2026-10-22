import { pgTable, varchar, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';

/**
 * Per-server event log settings: one channel per category (message, member, server, voice).
 * A category with no channel is off. One row per guild, created the first time it is saved.
 */
export const eventLogSettings = pgTable('event_log_settings', {
  guildId: varchar('guild_id', { length: 32 }).primaryKey(),
  messageChannelId: varchar('message_channel_id', { length: 32 }),
  memberChannelId: varchar('member_channel_id', { length: 32 }),
  serverChannelId: varchar('server_channel_id', { length: 32 }),
  voiceChannelId: varchar('voice_channel_id', { length: 32 }),
  ignoredChannelIds: jsonb('ignored_channel_ids').$type<string[]>().notNull().default([]),
  ignoreBots: boolean('ignore_bots').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
