import {
  pgTable,
  text,
  varchar,
  boolean,
  integer,
  uuid,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

export const reactionRoles = pgTable(
  'reaction_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    channelId: varchar('channel_id', { length: 32 }).notNull(),
    messageId: varchar('message_id', { length: 32 }).notNull(),
    emojiOrComponentId: varchar('emoji_or_component_id', { length: 64 }).notNull(),
    roleId: varchar('role_id', { length: 32 }).notNull(),
    type: varchar('type', { length: 32 }).notNull().default('EMOJI'),
    mode: varchar('mode', { length: 32 }).notNull().default('TOGGLE'),
    groupId: varchar('group_id', { length: 64 }),
    label: text('label'),
    description: text('description'),
  },
  (table) => [index('idx_pg_reaction_roles_msg').on(table.messageId, table.emojiOrComponentId)],
);

export const guildAutoRoles = pgTable('guild_auto_roles', {
  guildId: varchar('guild_id', { length: 32 }).primaryKey(),
  humanRoleIds: jsonb('human_role_ids').$type<string[]>().notNull().default([]),
  botRoleIds: jsonb('bot_role_ids').$type<string[]>().notNull().default([]),
  verificationRoleId: varchar('verification_role_id', { length: 32 }),
  verificationChannelId: varchar('verification_channel_id', { length: 32 }),
  verificationMessageId: varchar('verification_message_id', { length: 32 }),
  isEnabled: boolean('is_enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const temporaryRoles = pgTable(
  'temporary_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    roleId: varchar('role_id', { length: 32 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    assignedBy: varchar('assigned_by', { length: 32 }).notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('idx_pg_temporary_roles_expires').on(table.expiresAt)],
);

export const autoVoiceConfigs = pgTable('auto_voice_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  guildId: varchar('guild_id', { length: 32 }).notNull(),
  parentChannelId: varchar('parent_channel_id', { length: 32 }).notNull(),
  channelNameTemplate: text('channel_name_template').notNull().default("{user}'s Room"),
  userLimit: integer('user_limit').notNull().default(0),
  bitrate: integer('bitrate').notNull().default(64000),
});

export const reminders = pgTable(
  'reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    guildId: varchar('guild_id', { length: 32 }),
    channelId: varchar('channel_id', { length: 32 }).notNull(),
    message: text('message').notNull(),
    triggerAt: timestamp('trigger_at', { withTimezone: true }).notNull(),
    repeatInterval: varchar('repeat_interval', { length: 32 }).notNull().default('NONE'),
    isCompleted: boolean('is_completed').notNull().default(false),
  },
  (table) => [index('idx_pg_reminders_trigger').on(table.triggerAt, table.isCompleted)],
);

export const guildWelcomer = pgTable('guild_welcomer', {
  guildId: varchar('guild_id', { length: 32 }).primaryKey(),
  channelId: varchar('channel_id', { length: 32 }).notNull(),
  messageTemplate: text('message_template').notNull().default('Welcome to {server}, {user}!'),
  cardTheme: varchar('card_theme', { length: 64 }).notNull().default('DEFAULT'),
  backgroundUrl: text('background_url'),
  textColor: varchar('text_color', { length: 7 }).notNull().default('#ffffff'),
  isEnabled: boolean('is_enabled').notNull().default(true),
});

export const guildFarewell = pgTable('guild_farewell', {
  guildId: varchar('guild_id', { length: 32 }).primaryKey(),
  channelId: varchar('channel_id', { length: 32 }).notNull(),
  messageTemplate: text('message_template').notNull().default('Goodbye {user}!'),
  cardTheme: varchar('card_theme', { length: 64 }).notNull().default('DEFAULT'),
  backgroundUrl: text('background_url'),
  textColor: varchar('text_color', { length: 7 }).notNull().default('#ffffff'),
  isEnabled: boolean('is_enabled').notNull().default(true),
});

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: varchar('guild_id', { length: 32 }),
    actorUserId: varchar('actor_user_id', { length: 32 }).notNull(),
    action: varchar('action', { length: 64 }).notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().default({}),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_pg_audit_logs_guild_created').on(table.guildId, table.createdAt)],
);
