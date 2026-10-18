import { pgTable, text, varchar, boolean, integer, uuid, jsonb, index } from 'drizzle-orm/pg-core';

export const commands = pgTable('commands', {
  name: varchar('name', { length: 64 }).primaryKey(),
  category: varchar('category', { length: 64 }).notNull(),
  description: text('description').notNull(),
  slashEnabled: boolean('slash_enabled').notNull().default(true),
  prefixEnabled: boolean('prefix_enabled').notNull().default(true),
  defaultPermission: varchar('default_permission', { length: 64 }),
  cooldownSeconds: integer('cooldown_seconds').notNull().default(3),
});

export const commandSettings = pgTable(
  'command_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    channelId: varchar('channel_id', { length: 32 }),
    commandName: varchar('command_name', { length: 64 }).notNull(),
    isEnabled: boolean('is_enabled').notNull().default(true),
    cooldownOverride: integer('cooldown_override'),
    allowedRoles: jsonb('allowed_roles').$type<string[]>().notNull().default([]),
    blockedRoles: jsonb('blocked_roles').$type<string[]>().notNull().default([]),
  },
  (table) => [index('idx_pg_command_settings_guild_cmd').on(table.guildId, table.commandName)],
);
