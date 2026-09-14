import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { CommandPolicy, GuildSettings } from '@ririko/core';

/** Persistent guild settings shared by every application transport. */
export const guildSettings = sqliteTable('guild_settings', {
  guildId: text('guild_id').primaryKey(),
  prefix: text('prefix').notNull(),
  modules: text('modules', { mode: 'json' }).$type<Record<string, boolean>>().notNull(),
  commands: text('commands', { mode: 'json' }).$type<Record<string, CommandPolicy>>().notNull(),
  revision: integer('revision').notNull(),
});

/** Each settings revision retains its actor and complete before/after values. */
export const settingsAudit = sqliteTable('settings_audit', {
  id: text('id').primaryKey(),
  guildId: text('guild_id').notNull().references(() => guildSettings.guildId),
  actorId: text('actor_id').notNull(),
  beforeRevision: integer('before_revision').notNull(),
  afterRevision: integer('after_revision').notNull(),
  beforeSettings: text('before_settings', { mode: 'json' }).$type<GuildSettings>(),
  afterSettings: text('after_settings', { mode: 'json' }).$type<GuildSettings>().notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [uniqueIndex('settings_audit_guild_revision').on(table.guildId, table.afterRevision)]);
