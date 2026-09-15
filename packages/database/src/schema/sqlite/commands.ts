import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const commands = sqliteTable('commands', {
  name: text('name').primaryKey(),
  category: text('category').notNull(),
  description: text('description').notNull(),
  slashEnabled: integer('slash_enabled', { mode: 'boolean' }).notNull().default(true),
  prefixEnabled: integer('prefix_enabled', { mode: 'boolean' }).notNull().default(true),
  defaultPermission: text('default_permission'),
  cooldownSeconds: integer('cooldown_seconds').notNull().default(3),
});

export const commandSettings = sqliteTable(
  'command_settings',
  {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id'),
    commandName: text('command_name').notNull(),
    isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
    cooldownOverride: integer('cooldown_override'),
    allowedRoles: text('allowed_roles', { mode: 'json' }).$type<string[]>().notNull().default([]),
    blockedRoles: text('blocked_roles', { mode: 'json' }).$type<string[]>().notNull().default([]),
  },
  (table) => [index('idx_command_settings_guild_cmd').on(table.guildId, table.commandName)],
);
