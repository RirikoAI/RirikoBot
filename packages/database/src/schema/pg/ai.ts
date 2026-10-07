import {
  pgTable,
  text,
  varchar,
  integer,
  timestamp,
  jsonb,
  index,
  boolean,
} from 'drizzle-orm/pg-core';
import { textPrimaryKey } from './text-id.js';

export const aiChannels = pgTable('ai_channels', {
  guildId: varchar('guild_id', { length: 32 }).primaryKey(),
  channelId: varchar('channel_id', { length: 32 }).notNull(),
});

export const aiConversations = pgTable(
  'ai_conversations',
  {
    id: textPrimaryKey('id'),
    userId: varchar('user_id', { length: 32 }).notNull(),
    guildId: varchar('guild_id', { length: 32 }),
    channelId: varchar('channel_id', { length: 32 }),
    provider: varchar('provider', { length: 32 }).notNull().default('GEMINI'),
    model: varchar('model', { length: 64 }).notNull(),
    summary: text('summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_pg_ai_conversations_user').on(table.userId, table.updatedAt)],
);

export const aiMessages = pgTable(
  'ai_messages',
  {
    id: textPrimaryKey('id'),
    conversationId: text('conversation_id').notNull(),
    role: varchar('role', { length: 32 }).notNull(),
    content: text('content').notNull(),
    toolCalls: jsonb('tool_calls').$type<Record<string, unknown>[]>(),
    tokenCount: integer('token_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_pg_ai_messages_conv_created').on(table.conversationId, table.createdAt)],
);

export const aiGuildPreferences = pgTable('ai_guild_preferences', {
  guildId: varchar('guild_id', { length: 32 }).primaryKey(),
  personalityPrompt: text('personality_prompt'),
  speakingStyle: varchar('speaking_style', { length: 64 }).notNull().default('FRIENDLY_ANIME'),
  allowedTools: jsonb('allowed_tools').$type<string[]>().notNull().default([]),
  // false turns tools off; otherwise allowed_tools lists them, empty meaning all.
  toolsEnabled: boolean('tools_enabled').notNull().default(true),
  providerOverride: varchar('provider_override', { length: 16 }), // 'gemini' | 'openai' | 'ollama'
  modelOverride: varchar('model_override', { length: 64 }),
});

export const aiUserPreferences = pgTable('ai_user_preferences', {
  userId: varchar('user_id', { length: 32 }).primaryKey(),
  nickname: varchar('nickname', { length: 64 }),
  timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),
  languagePreference: varchar('language_preference', { length: 16 }).notNull().default('en'),
});
