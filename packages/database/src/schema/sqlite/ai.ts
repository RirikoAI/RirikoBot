import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const aiChannels = sqliteTable('ai_channels', {
  guildId: text('guild_id').primaryKey(),
  channelId: text('channel_id').notNull(),
});

export const aiConversations = sqliteTable(
  'ai_conversations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    guildId: text('guild_id'),
    channelId: text('channel_id'),
    provider: text('provider').notNull().default('GEMINI'), // 'GEMINI' | 'OPENAI' | 'OLLAMA'
    model: text('model').notNull(),
    summary: text('summary'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('idx_ai_conversations_user').on(table.userId, table.updatedAt)],
);

export const aiMessages = sqliteTable(
  'ai_messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').notNull(),
    role: text('role').notNull(), // 'SYSTEM' | 'USER' | 'ASSISTANT' | 'TOOL'
    content: text('content').notNull(),
    toolCalls: text('tool_calls', { mode: 'json' }).$type<Record<string, unknown>[]>(),
    tokenCount: integer('token_count').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('idx_ai_messages_conv_created').on(table.conversationId, table.createdAt)],
);

export const aiGuildPreferences = sqliteTable('ai_guild_preferences', {
  guildId: text('guild_id').primaryKey(),
  personalityPrompt: text('personality_prompt'),
  speakingStyle: text('speaking_style').notNull().default('FRIENDLY_ANIME'),
  allowedTools: text('allowed_tools', { mode: 'json' }).$type<string[]>().notNull().default([]),
  modelOverride: text('model_override'),
});

export const aiUserPreferences = sqliteTable('ai_user_preferences', {
  userId: text('user_id').primaryKey(),
  nickname: text('nickname'),
  timezone: text('timezone').notNull().default('UTC'),
  languagePreference: text('language_preference').notNull().default('en'),
});
