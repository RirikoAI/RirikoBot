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

export const moderationCases = pgTable(
  'moderation_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    caseNumber: integer('case_number').notNull(),
    type: varchar('type', { length: 32 }).notNull(),
    targetUserId: varchar('target_user_id', { length: 32 }).notNull(),
    moderatorUserId: varchar('moderator_user_id', { length: 32 }).notNull(),
    reason: text('reason').notNull().default('No reason provided'),
    durationSeconds: integer('duration_seconds'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pg_mod_cases_guild_number').on(table.guildId, table.caseNumber),
    index('idx_pg_mod_cases_target').on(table.guildId, table.targetUserId),
  ],
);

export const moderationWarnings = pgTable(
  'moderation_warnings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    moderatorId: varchar('moderator_id', { length: 32 }).notNull(),
    reason: text('reason').notNull(),
    severity: integer('severity').notNull().default(1),
    isActive: boolean('is_active').notNull().default(true),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_pg_mod_warnings_user').on(table.guildId, table.userId, table.isActive)],
);

export const moderationRules = pgTable('moderation_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  guildId: varchar('guild_id', { length: 32 }).notNull(),
  ruleType: varchar('rule_type', { length: 64 }).notNull(),
  action: varchar('action', { length: 32 }).notNull().default('WARN'),
  threshold: integer('threshold').notNull().default(3),
  isEnabled: boolean('is_enabled').notNull().default(true),
  exemptRoles: jsonb('exempt_roles').$type<string[]>().notNull().default([]),
  exemptChannels: jsonb('exempt_channels').$type<string[]>().notNull().default([]),
});

export const moderationNotes = pgTable(
  'moderation_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    targetUserId: varchar('target_user_id', { length: 32 }).notNull(),
    authorUserId: varchar('author_user_id', { length: 32 }).notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_pg_mod_notes_user').on(table.guildId, table.targetUserId)],
);
