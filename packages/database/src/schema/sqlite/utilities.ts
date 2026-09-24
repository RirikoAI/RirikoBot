import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const reactionRoles = sqliteTable(
  'reaction_roles',
  {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    messageId: text('message_id').notNull(),
    emojiOrComponentId: text('emoji_or_component_id').notNull(),
    roleId: text('role_id').notNull(),
    type: text('type').notNull().default('EMOJI'), // 'EMOJI' | 'BUTTON' | 'SELECT_MENU'
    mode: text('mode').notNull().default('TOGGLE'), // 'TOGGLE' | 'GIVE_ONLY' | 'REMOVE_ONLY' | 'UNIQUE'
    groupId: text('group_id'),
    label: text('label'),
    description: text('description'),
  },
  (table) => [index('idx_reaction_roles_msg').on(table.messageId, table.emojiOrComponentId)],
);

export const guildAutoRoles = sqliteTable('guild_auto_roles', {
  guildId: text('guild_id').primaryKey(),
  humanRoleIds: text('human_role_ids', { mode: 'json' }).$type<string[]>().notNull().default([]),
  botRoleIds: text('bot_role_ids', { mode: 'json' }).$type<string[]>().notNull().default([]),
  verificationRoleId: text('verification_role_id'),
  verificationChannelId: text('verification_channel_id'),
  verificationMessageId: text('verification_message_id'),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const temporaryRoles = sqliteTable(
  'temporary_roles',
  {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    roleId: text('role_id').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    assignedBy: text('assigned_by').notNull(),
    reason: text('reason'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('idx_temporary_roles_expires').on(table.expiresAt)],
);

export const autoVoiceConfigs = sqliteTable('auto_voice_configs', {
  id: text('id').primaryKey(),
  guildId: text('guild_id').notNull(),
  parentChannelId: text('parent_channel_id').notNull(),
  channelNameTemplate: text('channel_name_template').notNull().default("{user}'s Room"),
  userLimit: integer('user_limit').notNull().default(0),
  bitrate: integer('bitrate').notNull().default(64000),
});

export const reminders = sqliteTable(
  'reminders',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    guildId: text('guild_id'),
    channelId: text('channel_id').notNull(),
    message: text('message').notNull(),
    triggerAt: integer('trigger_at', { mode: 'timestamp_ms' }).notNull(),
    repeatInterval: text('repeat_interval').notNull().default('NONE'), // 'NONE' | 'DAILY' | 'WEEKLY'
    isCompleted: integer('is_completed', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [index('idx_reminders_trigger').on(table.triggerAt, table.isCompleted)],
);

export const guildWelcomer = sqliteTable('guild_welcomer', {
  guildId: text('guild_id').primaryKey(),
  channelId: text('channel_id').notNull(),
  messageTemplate: text('message_template').notNull().default('Welcome to {server}, {user}!'),
  cardTheme: text('card_theme').notNull().default('DEFAULT'),
  backgroundUrl: text('background_url'),
  textColor: text('text_color').notNull().default('#ffffff'),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
});

export const guildFarewell = sqliteTable('guild_farewell', {
  guildId: text('guild_id').primaryKey(),
  channelId: text('channel_id').notNull(),
  messageTemplate: text('message_template').notNull().default('Goodbye {user}!'),
  cardTheme: text('card_theme').notNull().default('DEFAULT'),
  backgroundUrl: text('background_url'),
  textColor: text('text_color').notNull().default('#ffffff'),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
});

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    guildId: text('guild_id'),
    actorUserId: text('actor_user_id').notNull(),
    action: text('action').notNull(),
    details: text('details', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
    ipAddress: text('ip_address'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('idx_audit_logs_guild_created').on(table.guildId, table.createdAt)],
);
