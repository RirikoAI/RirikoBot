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
  },
  (table) => [index('idx_pg_reaction_roles_msg').on(table.messageId, table.emojiOrComponentId)],
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

export const welcomeConfigs = pgTable('welcome_configs', {
  guildId: varchar('guild_id', { length: 32 }).primaryKey(),
  channelId: varchar('channel_id', { length: 32 }).notNull(),
  messageTemplate: text('message_template').notNull().default('Welcome to {server}, {user}!'),
  cardTheme: varchar('card_theme', { length: 64 }).notNull().default('DEFAULT'),
  isEnabled: boolean('is_enabled').notNull().default(true),
});

export const farewellConfigs = pgTable('farewell_configs', {
  guildId: varchar('guild_id', { length: 32 }).primaryKey(),
  channelId: varchar('channel_id', { length: 32 }).notNull(),
  messageTemplate: text('message_template').notNull().default('Goodbye {user}!'),
  cardTheme: varchar('card_theme', { length: 64 }).notNull().default('DEFAULT'),
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_pg_audit_logs_guild_created').on(table.guildId, table.createdAt)],
);
