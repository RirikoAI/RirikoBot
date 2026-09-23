import { randomUUID } from 'node:crypto';
import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';

export const imageProviders = sqliteTable('image_providers', {
  id: text('id').primaryKey(), // 'GEMINI' | 'COMFYUI' | 'REPLICATE'
  name: text('name').notNull(),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
  isFreeTier: integer('is_free_tier', { mode: 'boolean' }).notNull().default(false),
  rateLimitPerMin: integer('rate_limit_per_min').notNull().default(10),
  capabilities: text('capabilities', { mode: 'json' }).$type<string[]>().notNull().default([]),
});

export const imageJobs = sqliteTable(
  'image_jobs',
  {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    userId: text('user_id').notNull(),
    guildId: text('guild_id'),
    providerId: text('provider_id').notNull(),
    prompt: text('prompt').notNull(),
    negativePrompt: text('negative_prompt'),
    status: text('status').notNull().default('QUEUED'), // 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
    resultUrl: text('result_url'),
    errorMessage: text('error_message'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  },
  (table) => [index('idx_image_jobs_user_status').on(table.userId, table.status)],
);

export const imagePresets = sqliteTable('image_presets', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  name: text('name').notNull(),
  positivePromptPrefix: text('positive_prompt_prefix').notNull(),
  negativePromptPreset: text('negative_prompt_preset'),
  isSystemPreset: integer('is_system_preset', { mode: 'boolean' }).notNull().default(false),
});

export const imageUsage = sqliteTable(
  'image_usage',
  {
    userId: text('user_id').notNull(),
    providerId: text('provider_id').notNull(),
    imagesGeneratedToday: integer('images_generated_today').notNull().default(0),
    lastResetAt: integer('last_reset_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.userId, table.providerId] })],
);
