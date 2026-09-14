import {
  pgTable,
  text,
  varchar,
  boolean,
  integer,
  uuid,
  timestamp,
  jsonb,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';

export const imageProviders = pgTable('image_providers', {
  id: varchar('id', { length: 32 }).primaryKey(),
  name: text('name').notNull(),
  isEnabled: boolean('is_enabled').notNull().default(true),
  isFreeTier: boolean('is_free_tier').notNull().default(false),
  rateLimitPerMin: integer('rate_limit_per_min').notNull().default(10),
  capabilities: jsonb('capabilities').$type<string[]>().notNull().default([]),
});

export const imageJobs = pgTable(
  'image_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    guildId: varchar('guild_id', { length: 32 }),
    providerId: varchar('provider_id', { length: 32 }).notNull(),
    prompt: text('prompt').notNull(),
    negativePrompt: text('negative_prompt'),
    status: varchar('status', { length: 32 }).notNull().default('QUEUED'),
    resultUrl: text('result_url'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [index('idx_pg_image_jobs_user_status').on(table.userId, table.status)],
);

export const imagePresets = pgTable('image_presets', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 64 }).notNull(),
  positivePromptPrefix: text('positive_prompt_prefix').notNull(),
  negativePromptPreset: text('negative_prompt_preset'),
  isSystemPreset: boolean('is_system_preset').notNull().default(false),
});

export const imageUsage = pgTable(
  'image_usage',
  {
    userId: varchar('user_id', { length: 32 }).notNull(),
    providerId: varchar('provider_id', { length: 32 }).notNull(),
    imagesGeneratedToday: integer('images_generated_today').notNull().default(0),
    lastResetAt: timestamp('last_reset_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.providerId] })],
);
