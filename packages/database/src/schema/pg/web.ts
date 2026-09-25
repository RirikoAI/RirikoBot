import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

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
    /** Time of the last passkey check in this session; null until one succeeds. */
    stepUpAt: timestamp('step_up_at', { withTimezone: true }),
    /** Pending WebAuthn challenge as `<purpose>:<challenge>`; single use. */
    webauthnChallenge: varchar('webauthn_challenge', { length: 128 }),
    webauthnChallengeExpiresAt: timestamp('webauthn_challenge_expires_at', { withTimezone: true }),
    discordAccessToken: text('discord_access_token').notNull(),
    discordRefreshToken: text('discord_refresh_token').notNull(),
    discordTokenExpiresAt: timestamp('discord_token_expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('idx_pg_web_sessions_user').on(table.userId),
    index('idx_pg_web_sessions_expires').on(table.expiresAt),
  ],
);

/**
 * WebAuthn passkeys enrolled by dashboard users. Only the public key is stored; the private key
 * never leaves the user's authenticator.
 */
export const webPasskeys = pgTable(
  'web_passkeys',
  {
    /** Credential ID, base64url. */
    id: varchar('id', { length: 1024 }).primaryKey(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    name: varchar('name', { length: 64 }).notNull(),
    /** COSE public key, base64url. */
    publicKey: text('public_key').notNull(),
    counter: integer('counter').notNull().default(0),
    transports: jsonb('transports').$type<string[]>().notNull().default([]),
    /** `singleDevice` (device-bound) or `multiDevice` (synced passkey). */
    deviceType: varchar('device_type', { length: 16 }).notNull(),
    backedUp: boolean('backed_up').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (table) => [index('idx_pg_web_passkeys_user').on(table.userId)],
);
