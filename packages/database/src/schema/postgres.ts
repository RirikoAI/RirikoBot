import { bigint, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import type { CommandPolicy, GuildSettings } from '@ririko/core';

/** PostgreSQL representation of the shared guild settings contract. */
export const guildSettings = pgTable('guild_settings', {
  guildId: text('guild_id').primaryKey(),
  prefix: text('prefix').notNull(),
  modules: jsonb('modules').$type<Record<string, boolean>>().notNull(),
  commands: jsonb('commands').$type<Record<string, CommandPolicy>>().notNull(),
  revision: bigint('revision', { mode: 'number' }).notNull(),
});

/** Append-only application audit rows, committed with their settings change. */
export const settingsAudit = pgTable('settings_audit', {
  id: text('id').primaryKey(),
  guildId: text('guild_id').notNull().references(() => guildSettings.guildId),
  actorId: text('actor_id').notNull(),
  beforeRevision: bigint('before_revision', { mode: 'number' }).notNull(),
  afterRevision: bigint('after_revision', { mode: 'number' }).notNull(),
  beforeSettings: jsonb('before_settings').$type<GuildSettings>(),
  afterSettings: jsonb('after_settings').$type<GuildSettings>().notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [uniqueIndex('settings_audit_guild_revision').on(table.guildId, table.afterRevision)]);
