import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core';

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
    /** Time of the last passkey check in this session; null until one succeeds. */
    stepUpAt: integer('step_up_at', { mode: 'timestamp_ms' }),
    /** Pending WebAuthn challenge as `<purpose>:<challenge>`; single use. */
    webauthnChallenge: text('webauthn_challenge'),
    webauthnChallengeExpiresAt: integer('webauthn_challenge_expires_at', { mode: 'timestamp_ms' }),
    discordAccessToken: text('discord_access_token').notNull(),
    discordRefreshToken: text('discord_refresh_token').notNull(),
    discordTokenExpiresAt: integer('discord_token_expires_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('idx_web_sessions_user').on(table.userId),
    index('idx_web_sessions_expires').on(table.expiresAt),
  ],
);

/**
 * WebAuthn passkeys enrolled by dashboard users. Only the public key is stored; the private key
 * never leaves the user's authenticator.
 */
export const webPasskeys = sqliteTable(
  'web_passkeys',
  {
    /** Credential ID, base64url. */
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    /** COSE public key, base64url. */
    publicKey: text('public_key').notNull(),
    counter: integer('counter').notNull().default(0),
    transports: text('transports', { mode: 'json' }).$type<string[]>().notNull().default([]),
    /** `singleDevice` (device-bound) or `multiDevice` (synced passkey). */
    deviceType: text('device_type').notNull(),
    backedUp: integer('backed_up', { mode: 'boolean' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
  },
  (table) => [index('idx_web_passkeys_user').on(table.userId)],
);

/**
 * Browsers a user has signed in from (TASK-1172). `device_hash` is the SHA-256 of the random
 * `__Host-ririko_device` cookie; a sign-in whose cookie is not listed triggers a new-device DM.
 */
export const webKnownDevices = sqliteTable(
  'web_known_devices',
  {
    userId: text('user_id').notNull(),
    deviceHash: text('device_hash').notNull(),
    firstSeenAt: integer('first_seen_at', { mode: 'timestamp_ms' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.deviceHash] }),
    index('idx_web_known_devices_last_seen').on(table.lastSeenAt),
  ],
);
