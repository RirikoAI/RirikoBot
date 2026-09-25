import { z } from 'zod';
import { ResetConfigShape } from '../time/reset-config.js';
import { DEFAULT_COMMAND_PREFIX, PrefixSchema } from './guild-config.js';

export const NodeEnvSchema = z.enum(['development', 'production', 'test']).default('development');
export type NodeEnv = z.infer<typeof NodeEnvSchema>;

export const DatabaseDialectSchema = z.enum(['postgres', 'sqlite']).default('sqlite');
export type DatabaseDialect = z.infer<typeof DatabaseDialectSchema>;

const HEX_KEY = /^[0-9a-fA-F]{64}$/;

export const LogLevelSchema = z
  .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
  .default('info');
export type LogLevel = z.infer<typeof LogLevelSchema>;

const BaseAppConfigSchema = z.object({
  // Runtime environment
  NODE_ENV: NodeEnvSchema,
  LOG_LEVEL: LogLevelSchema,
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  // Discord Bot Core Credentials
  DISCORD_TOKEN: z
    .string({ required_error: 'DISCORD_TOKEN is required' })
    .min(1, 'DISCORD_TOKEN cannot be empty'),
  DISCORD_CLIENT_ID: z
    .string({ required_error: 'DISCORD_CLIENT_ID is required' })
    .min(1, 'DISCORD_CLIENT_ID cannot be empty'),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  DISCORD_DEV_GUILD_ID: z.string().optional(),
  // Bot owners (comma-separated Discord user IDs). The dashboard owner console is limited to them.
  BOT_OWNER_ID: z
    .string()
    .optional()
    .transform((value) =>
      (value ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().regex(/^\d{17,20}$/, 'BOT_OWNER_ID must list Discord user IDs'))),
  DEFAULT_PREFIX: PrefixSchema.default(DEFAULT_COMMAND_PREFIX),

  // Dual-Dialect Database
  DATABASE_URL: z.string().default('./data/ririko.sqlite'),
  DATABASE_DIALECT: DatabaseDialectSchema,

  // AppSec & Credential Vault (AES-256-GCM 32-byte hex key)
  SECRET_VAULT_KEY: z
    .string()
    .regex(HEX_KEY, 'SECRET_VAULT_KEY must be a 64-character hex string (32 bytes)')
    .optional(),
  // Version stamped into every ciphertext so the key can be rotated without breaking old data.
  SECRET_VAULT_KEY_VERSION: z.coerce.number().int().min(1).default(1),
  // Retired keys still accepted for decryption during rotation: "1:<hex>,2:<hex>".
  SECRET_VAULT_PREVIOUS_KEYS: z
    .string()
    .regex(
      /^\d+:[0-9a-fA-F]{64}(,\d+:[0-9a-fA-F]{64})*$/,
      'SECRET_VAULT_PREVIOUS_KEYS must be a comma-separated list of <version>:<64-char hex key>',
    )
    .optional(),

  // Optional AI Provider Keys & Configuration
  DEFAULT_AI_PROVIDER: z.enum(['gemini', 'openai', 'ollama']).default('gemini'),
  DEFAULT_AI_MODEL: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  OLLAMA_BASE_URL: z.string().url().optional(),

  // Optional Streaming & External Integrations
  TWITCH_CLIENT_ID: z.string().optional(),
  TWITCH_CLIENT_SECRET: z.string().optional(),
  YOUTUBE_API_KEY: z.string().optional(),
  TIKTOK_SESSION_ID: z.string().optional(),
  TIKTOK_API_KEY: z.string().optional(),
  STREAM_CHECK_INTERVAL_MS: z.coerce.number().int().min(5000).max(86400000).default(60000),
  SPOTIFY_CLIENT_ID: z.string().optional(),
  SPOTIFY_CLIENT_SECRET: z.string().optional(),
  SPOTIFY_REFRESH_TOKEN: z.string().optional(),
  SPOTIFY_DC: z.string().optional(),
  SPOTIFY_KEY: z.string().optional(),

  // Optional YouTube BotGuard & Authentication Credentials
  YOUTUBE_COOKIE: z.string().optional(),
  YOUTUBE_PO_TOKEN: z.string().optional(),
  YOUTUBE_VISITOR_DATA: z.string().optional(),

  // Daily Reset Boundary (shared by energy, shops and the daily reward)
  ...ResetConfigShape,
});

function applyLegacyAliases(val: unknown): unknown {
  if (val && typeof val === 'object') {
    const raw = { ...(val as Record<string, unknown>) };
    // Legacy 1.4.0 environment variable compatibility
    if (!raw.DISCORD_TOKEN && raw.DISCORD_BOT_TOKEN) {
      raw.DISCORD_TOKEN = raw.DISCORD_BOT_TOKEN;
    }
    if (!raw.DISCORD_CLIENT_ID && raw.DISCORD_APPLICATION_ID) {
      raw.DISCORD_CLIENT_ID = raw.DISCORD_APPLICATION_ID;
    }
    if (!raw.SPOTIFY_DC && raw.SP_DC) {
      raw.SPOTIFY_DC = raw.SP_DC;
    }
    if (!raw.DEFAULT_AI_PROVIDER && raw.AI_PROVIDER) {
      raw.DEFAULT_AI_PROVIDER = raw.AI_PROVIDER;
    }
    if (!raw.DEFAULT_AI_PROVIDER && raw.AI_DEFAULT_PROVIDER) {
      raw.DEFAULT_AI_PROVIDER = raw.AI_DEFAULT_PROVIDER;
    }
    if (!raw.DEFAULT_AI_MODEL && raw.AI_DEFAULT_MODEL) {
      raw.DEFAULT_AI_MODEL = raw.AI_DEFAULT_MODEL;
    }
    return raw;
  }
  return val;
}

export const AppConfigSchema = z.preprocess(applyLegacyAliases, BaseAppConfigSchema);

export type AppConfig = z.infer<typeof BaseAppConfigSchema>;
export type AppConfigInput = z.input<typeof AppConfigSchema>;

/**
 * Web dashboard (apps/web) configuration. The OAuth2 secret, public URL and vault key are
 * optional for the bot but required for the dashboard.
 */
const BaseWebConfigSchema = BaseAppConfigSchema.extend({
  DISCORD_CLIENT_SECRET: z
    .string({ required_error: 'DISCORD_CLIENT_SECRET is required for the web dashboard' })
    .min(1, 'DISCORD_CLIENT_SECRET cannot be empty'),
  // Public origin of the dashboard. The OAuth2 redirect URI is `${DASHBOARD_URL}/api/auth/callback`.
  DASHBOARD_URL: z
    .string({ required_error: 'DASHBOARD_URL is required for the web dashboard' })
    .url('DASHBOARD_URL must be an absolute URL such as http://localhost:3000')
    .transform((url) => new URL(url).origin),
  SECRET_VAULT_KEY: z
    .string({ required_error: 'SECRET_VAULT_KEY is required for the web dashboard' })
    .regex(HEX_KEY, 'SECRET_VAULT_KEY must be a 64-character hex string (32 bytes)'),
});

export const WebConfigSchema = z.preprocess(applyLegacyAliases, BaseWebConfigSchema);

export type WebConfig = z.infer<typeof BaseWebConfigSchema>;
