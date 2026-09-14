import {
  pgTable,
  text,
  varchar,
  boolean,
  integer,
  timestamp,
  jsonb,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: varchar('id', { length: 32 }).primaryKey(),
  username: text('username').notNull(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  profileBackgroundUrl: text('profile_background_url'),
  isBlacklisted: boolean('is_blacklisted').notNull().default(false),
  warnCount: integer('warn_count').notNull().default(0),
  notifyLevelUp: boolean('notify_level_up').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const guilds = pgTable('guilds', {
  id: varchar('id', { length: 32 }).primaryKey(),
  name: text('name').notNull(),
  iconUrl: text('icon_url'),
  ownerId: varchar('owner_id', { length: 32 }).notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const guildMembers = pgTable(
  'guild_members',
  {
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    nickname: text('nickname'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    roles: jsonb('roles').$type<string[]>().notNull().default([]),
    isInGuild: boolean('is_in_guild').notNull().default(true),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.userId] })],
);

export const guildSettings = pgTable('guild_settings', {
  guildId: varchar('guild_id', { length: 32 }).primaryKey(),
  prefix: varchar('prefix', { length: 10 }).notNull().default('!'),
  locale: varchar('locale', { length: 16 }).notNull().default('en-US'),
  timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),
  aiChannelId: varchar('ai_channel_id', { length: 32 }),
  logChannelId: varchar('log_channel_id', { length: 32 }),
  musicChannelId: varchar('music_channel_id', { length: 32 }),
  welcomerChannelId: varchar('welcomer_channel_id', { length: 32 }),
  welcomerEnabled: boolean('welcomer_enabled').notNull().default(false),
  welcomerBg: text('welcomer_bg'),
  farewellChannelId: varchar('farewell_channel_id', { length: 32 }),
  farewellEnabled: boolean('farewell_enabled').notNull().default(false),
  farewellBg: text('farewell_bg'),
  karmaNotificationsEnabled: boolean('karma_notifications_enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
