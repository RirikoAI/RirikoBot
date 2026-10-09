import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import type { EscalationStep } from '@ririko/core';

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
  /** The member who added the bot, from the audit log; null when Discord no longer says. */
  invitedById: text('invited_by_id'),
  /** How the inviter was learned: `oauth`, `audit_log` or `integration`; null with no inviter. */
  invitedVia: text('invited_via'),
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
  /** Warning escalation policy; null means the default policy. */
  escalationSteps: text('escalation_steps', { mode: 'json' }).$type<EscalationStep[]>(),
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
  /** Level-up messages go here; null posts in the channel where the member levelled up. */
  levelUpChannelId: text('level_up_channel_id'),
  /** Message and voice XP rate in percent; 100 is normal, 0 turns XP off. */
  xpRatePercent: integer('xp_rate_percent').notNull().default(100),
  noXpChannelIds: text('no_xp_channel_ids', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default([]),
  noXpRoleIds: text('no_xp_role_ids', { mode: 'json' }).$type<string[]>().notNull().default([]),
  /** Voice credits and XP; off until a manager turns it on. */
  voiceXpEnabled: integer('voice_xp_enabled', { mode: 'boolean' }).notNull().default(false),
  /** Largest mini-game wager in credits; null means no limit. */
  maxGameWager: integer('max_game_wager'),
  /** Waifu TCG card drops in this guild; off until a manager turns them on. */
  tcgDropsEnabled: integer('tcg_drops_enabled', { mode: 'boolean' }).notNull().default(false),
  /** Only messages here count toward a drop, and drops post here; null counts every channel. */
  tcgDropChannelId: text('tcg_drop_channel_id'),
  /** Unique members who must chat before a card drops. */
  tcgDropMessageThreshold: integer('tcg_drop_message_threshold').notNull().default(50),
  /** Drops happen from this hour (guild time zone, inclusive) until the end hour (exclusive). */
  tcgDropStartHour: integer('tcg_drop_start_hour').notNull().default(8),
  tcgDropEndHour: integer('tcg_drop_end_hour').notNull().default(23),
  tcgDropClaimTimeoutSeconds: integer('tcg_drop_claim_timeout_seconds').notNull().default(60),
  /** Minutes the last claimant must wait before claiming the next drop. */
  tcgDropCooldownMinutes: integer('tcg_drop_cooldown_minutes').notNull().default(5),
  /** Members with this role may use the guild TCG admin commands without Manage Server. */
  tcgManagerRoleId: text('tcg_manager_role_id'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});
