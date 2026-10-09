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
import type { EscalationStep } from '@ririko/core';

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
  /** The member who added the bot, from the audit log; null when Discord no longer says. */
  invitedById: varchar('invited_by_id', { length: 32 }),
  /** How the inviter was learned: `oauth`, `audit_log` or `integration`; null with no inviter. */
  invitedVia: varchar('invited_via', { length: 16 }),
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
  /** Warning escalation policy; null means the default policy. */
  escalationSteps: jsonb('escalation_steps').$type<EscalationStep[]>(),
  musicChannelId: varchar('music_channel_id', { length: 32 }),
  welcomerChannelId: varchar('welcomer_channel_id', { length: 32 }),
  welcomerEnabled: boolean('welcomer_enabled').notNull().default(false),
  welcomerBg: text('welcomer_bg'),
  farewellChannelId: varchar('farewell_channel_id', { length: 32 }),
  farewellEnabled: boolean('farewell_enabled').notNull().default(false),
  farewellBg: text('farewell_bg'),
  karmaNotificationsEnabled: boolean('karma_notifications_enabled').notNull().default(true),
  /** Level-up messages go here; null posts in the channel where the member levelled up. */
  levelUpChannelId: varchar('level_up_channel_id', { length: 32 }),
  /** Message and voice XP rate in percent; 100 is normal, 0 turns XP off. */
  xpRatePercent: integer('xp_rate_percent').notNull().default(100),
  noXpChannelIds: jsonb('no_xp_channel_ids').$type<string[]>().notNull().default([]),
  noXpRoleIds: jsonb('no_xp_role_ids').$type<string[]>().notNull().default([]),
  /** Voice credits and XP; off until a manager turns it on. */
  voiceXpEnabled: boolean('voice_xp_enabled').notNull().default(false),
  /** Largest mini-game wager in credits; null means no limit. */
  maxGameWager: integer('max_game_wager'),
  /** Waifu TCG card drops in this guild; off until a manager turns them on. */
  tcgDropsEnabled: boolean('tcg_drops_enabled').notNull().default(false),
  /** Only messages here count toward a drop, and drops post here; null counts every channel. */
  tcgDropChannelId: varchar('tcg_drop_channel_id', { length: 32 }),
  /** Unique members who must chat before a card drops. */
  tcgDropMessageThreshold: integer('tcg_drop_message_threshold').notNull().default(50),
  /** Drops happen from this hour (guild time zone, inclusive) until the end hour (exclusive). */
  tcgDropStartHour: integer('tcg_drop_start_hour').notNull().default(8),
  tcgDropEndHour: integer('tcg_drop_end_hour').notNull().default(23),
  tcgDropClaimTimeoutSeconds: integer('tcg_drop_claim_timeout_seconds').notNull().default(60),
  /** Minutes the last claimant must wait before claiming the next drop. */
  tcgDropCooldownMinutes: integer('tcg_drop_cooldown_minutes').notNull().default(5),
  /** Members with this role may use the guild TCG admin commands without Manage Server. */
  tcgManagerRoleId: varchar('tcg_manager_role_id', { length: 32 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
