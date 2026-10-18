import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const moderationCases = sqliteTable(
  'moderation_cases',
  {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    caseNumber: integer('case_number').notNull(),
    type: text('type').notNull(), // 'WARN' | 'TIMEOUT' | 'KICK' | 'BAN' | 'SOFTBAN' | 'UNBAN'
    targetUserId: text('target_user_id').notNull(),
    moderatorUserId: text('moderator_user_id').notNull(),
    reason: text('reason').notNull().default('No reason provided'),
    durationSeconds: integer('duration_seconds'),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_mod_cases_guild_number').on(table.guildId, table.caseNumber),
    index('idx_mod_cases_target').on(table.guildId, table.targetUserId),
  ],
);

export const moderationWarnings = sqliteTable(
  'moderation_warnings',
  {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    moderatorId: text('moderator_id').notNull(),
    reason: text('reason').notNull(),
    severity: integer('severity').notNull().default(1),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('idx_mod_warnings_user').on(table.guildId, table.userId, table.isActive)],
);

export const moderationRules = sqliteTable('moderation_rules', {
  id: text('id').primaryKey(),
  guildId: text('guild_id').notNull(),
  ruleType: text('rule_type').notNull(), // 'INVITE_SPAM' | 'MENTION_SPAM' | 'SCAM_URL' | etc.
  action: text('action').notNull().default('WARN'), // 'DELETE' | 'WARN' | 'TIMEOUT'
  threshold: integer('threshold').notNull().default(3),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
  exemptRoles: text('exempt_roles', { mode: 'json' }).$type<string[]>().notNull().default([]),
  exemptChannels: text('exempt_channels', { mode: 'json' }).$type<string[]>().notNull().default([]),
});

export const moderationNotes = sqliteTable(
  'moderation_notes',
  {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    targetUserId: text('target_user_id').notNull(),
    authorUserId: text('author_user_id').notNull(),
    content: text('content').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('idx_mod_notes_user').on(table.guildId, table.targetUserId)],
);
