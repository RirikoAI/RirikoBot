import { pgTable, text, varchar, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * Web dashboard sessions (ADR-013). The primary key is the SHA-256 hash of the session cookie,
 * never the cookie itself, and the Discord OAuth2 tokens are AES-256-GCM ciphertexts.
 */
export const webSessions = pgTable(
  'web_sessions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: text('user_agent'),
    stepUpAt: timestamp('step_up_at', { withTimezone: true }),
    discordAccessToken: text('discord_access_token').notNull(),
    discordRefreshToken: text('discord_refresh_token').notNull(),
    discordTokenExpiresAt: timestamp('discord_token_expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('idx_pg_web_sessions_user').on(table.userId),
    index('idx_pg_web_sessions_expires').on(table.expiresAt),
  ],
);
