import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/**
 * Web dashboard sessions (ADR-013). The primary key is the SHA-256 hash of the session cookie,
 * never the cookie itself, and the Discord OAuth2 tokens are AES-256-GCM ciphertexts.
 */
export const webSessions = sqliteTable(
  'web_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    stepUpAt: integer('step_up_at', { mode: 'timestamp_ms' }),
    discordAccessToken: text('discord_access_token').notNull(),
    discordRefreshToken: text('discord_refresh_token').notNull(),
    discordTokenExpiresAt: integer('discord_token_expires_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('idx_web_sessions_user').on(table.userId),
    index('idx_web_sessions_expires').on(table.expiresAt),
  ],
);
