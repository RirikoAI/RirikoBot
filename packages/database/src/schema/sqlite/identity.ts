import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  profileBackgroundUrl: text('profile_background_url'),
  isBlacklisted: integer('is_blacklisted', { mode: 'boolean' }).notNull().default(false),
  warnCount: integer('warn_count').notNull().default(0),
  notifyLevelUp: integer('notify_level_up', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const guilds = sqliteTable('guilds', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  iconUrl: text('icon_url'),
  ownerId: text('owner_id').notNull(),
  joinedAt: integer('joined_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const guildMembers = sqliteTable(
  'guild_members',
  {
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    nickname: text('nickname'),
    joinedAt: integer('joined_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    roles: text('roles', { mode: 'json' }).$type<string[]>().notNull().default([]),
    isInGuild: integer('is_in_guild', { mode: 'boolean' }).notNull().default(true),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.userId] })],
);

export const guildSettings = sqliteTable('guild_settings', {
  guildId: text('guild_id').primaryKey(),
  prefix: text('prefix').notNull().default('!'),
  locale: text('locale').notNull().default('en-US'),
  timezone: text('timezone').notNull().default('UTC'),
  aiChannelId: text('ai_channel_id'),
  logChannelId: text('log_channel_id'),
  musicChannelId: text('music_channel_id'),
  welcomerChannelId: text('welcomer_channel_id'),
  welcomerEnabled: integer('welcomer_enabled', { mode: 'boolean' }).notNull().default(false),
  welcomerBg: text('welcomer_bg'),
  farewellChannelId: text('farewell_channel_id'),
  farewellEnabled: integer('farewell_enabled', { mode: 'boolean' }).notNull().default(false),
  farewellBg: text('farewell_bg'),
  karmaNotificationsEnabled: integer('karma_notifications_enabled', { mode: 'boolean' })
    .notNull()
    .default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});
