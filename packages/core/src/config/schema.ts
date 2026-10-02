import { DEFAULT_IMAGE_DAILY_QUOTA } from './images.js';
import { z } from 'zod';
import { ResetConfigShape } from '../time/reset-config.js';
import { DEFAULT_COMMAND_PREFIX, PrefixSchema } from './guild-config.js';

export const NodeEnvSchema = z.enum(['development', 'production', 'test']).default('development');
export type NodeEnv = z.infer<typeof NodeEnvSchema>;

export const DatabaseDialectSchema = z.enum(['postgres', 'sqlite']).default('sqlite');
export type DatabaseDialect = z.infer<typeof DatabaseDialectSchema>;

/** SQLite file used when `DATABASE_URL` is unset, relative to the workspace root. */
export const DEFAULT_DATABASE_URL = './data/ririko.sqlite';

const HEX_KEY = /^[0-9a-fA-F]{64}$/;

/** `BOT_OWNER_ID`: comma-separated Discord user IDs of the bot owners. */
export const BotOwnerIdsSchema = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().regex(/^\d{17,20}$/, 'BOT_OWNER_ID must list Discord user IDs')));

export const LogLevelSchema = z
  .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
  .default('info');
export type LogLevel = z.infer<typeof LogLevelSchema>;

const BaseAppConfigSchema = z.object({
  // Runtime environment
  NODE_ENV: NodeEnvSchema,
  LOG_LEVEL: LogLevelSchema,
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  // Bot /health and /ready probes; 0 turns them off
  HEALTH_PORT: z.coerce.number().int().min(0).max(65535).default(8080),

  // Discord Bot Core Credentials
  DISCORD_TOKEN: z
    .string({ required_error: 'DISCORD_TOKEN is required' })
    .min(1, 'DISCORD_TOKEN cannot be empty'),
  DISCORD_CLIENT_ID: z
    .string({ required_error: 'DISCORD_CLIENT_ID is required' })
    .min(1, 'DISCORD_CLIENT_ID cannot be empty'),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  DISCORD_DEV_GUILD_ID: z.string().optional(),
  // Bot owners (comma-separated Discord user IDs). The dashboard owner console and the global
  // `/tcg-admin` rules are limited to them.
  BOT_OWNER_ID: BotOwnerIdsSchema,
  DEFAULT_PREFIX: PrefixSchema.default(DEFAULT_COMMAND_PREFIX),

  // Dual-Dialect Database
  DATABASE_URL: z.string().default(DEFAULT_DATABASE_URL),
  DATABASE_DIALECT: DatabaseDialectSchema,
  // A 1.4.0 SQLite database to migrate once on startup (the Docker image reads a read-only
  // mount at /app/legacy/ririko.db). It is copied, never written.
  LEGACY_DATABASE_PATH: z.string().optional(),

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

  // Optional Image Generation Providers & Quota
  IMAGE_DEFAULT_PROVIDER: z.enum(['gemini', 'replicate', 'comfyui', 'mock']).default('gemini'),
  IMAGE_DAILY_QUOTA: z.coerce.number().int().min(0).default(DEFAULT_IMAGE_DAILY_QUOTA),
  REPLICATE_API_TOKEN: z.string().optional(),
  COMFYUI_URL: z.string().url().optional(),
  COMFYUI_BASE_URL: z.string().url().optional(),
  SD_WEBUI_URL: z.string().url().optional(),

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

  // Optional Lavalink audio node (the bot uses its built-in player without one)
  LAVALINK_ENABLED: z.string().optional(),
  LAVALINK_HOST: z.string().optional(),
  // `true` loads the private music package into the fallback player used without Lavalink
  USE_PRIVATE_MUSIC_PACKAGE: z.string().optional(),

  // Daily Reset Boundary (shared by energy, shops and the daily reward)
  ...ResetConfigShape,
});

/**
 * 1.4.0 `AI_SERVICE_TYPE` values and the 2.0 provider each maps to. OpenRouter speaks the
 * OpenAI API, so it runs on the OpenAI provider with OpenRouter's base URL.
 */
const LEGACY_AI_SERVICES: Record<
  string,
  { provider: 'gemini' | 'openai' | 'ollama'; keyVar?: string; baseUrlVar?: string }
> = {
  google_ai: { provider: 'gemini', keyVar: 'GEMINI_API_KEY' },
  openai: { provider: 'openai', keyVar: 'OPENAI_API_KEY', baseUrlVar: 'OPENAI_BASE_URL' },
  openrouter: { provider: 'openai', keyVar: 'OPENAI_API_KEY', baseUrlVar: 'OPENAI_BASE_URL' },
  ollama: { provider: 'ollama', baseUrlVar: 'OLLAMA_BASE_URL' },
};
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/** Copies `from` to `to` when `to` is unset or empty and `from` has a value. */
function alias(raw: Record<string, unknown>, to: string, from: string): void {
  if (!raw[to] && raw[from]) raw[to] = raw[from];
}

/** Maps the 1.4.0 `AI_SERVICE_*` variables onto the 2.0 provider variables. */
function applyLegacyAiService(raw: Record<string, unknown>): void {
  const type = typeof raw.AI_SERVICE_TYPE === 'string' ? raw.AI_SERVICE_TYPE.toLowerCase() : '';
  const service = LEGACY_AI_SERVICES[type];
  if (!service) return;
  if (!raw.DEFAULT_AI_PROVIDER) raw.DEFAULT_AI_PROVIDER = service.provider;
  alias(raw, 'DEFAULT_AI_MODEL', 'AI_SERVICE_DEFAULT_MODEL');
  if (service.keyVar) alias(raw, service.keyVar, 'AI_SERVICE_API_KEY');
  if (service.baseUrlVar) alias(raw, service.baseUrlVar, 'AI_SERVICE_BASE_URL');
  if (type === 'openrouter' && !raw.OPENAI_BASE_URL) raw.OPENAI_BASE_URL = OPENROUTER_BASE_URL;
}

/**
 * Fills the 2.0 variable names from their 1.4.0 equivalents. A value that is already set always
 * wins. `DATABASE_NAME` is deliberately not mapped: the 1.4.0 file must never become the 2.0
 * database, so the bot refuses to start instead (apps/bot/src/legacy-layout.ts).
 */
export function applyLegacyAliases<T>(val: T): T {
  if (!val || typeof val !== 'object') return val;
  const raw = { ...(val as Record<string, unknown>) };
  alias(raw, 'DISCORD_TOKEN', 'DISCORD_BOT_TOKEN');
  alias(raw, 'DISCORD_CLIENT_ID', 'DISCORD_APPLICATION_ID');
  alias(raw, 'SPOTIFY_DC', 'SP_DC');
  alias(raw, 'DEFAULT_AI_PROVIDER', 'AI_PROVIDER');
  alias(raw, 'DEFAULT_AI_PROVIDER', 'AI_DEFAULT_PROVIDER');
  alias(raw, 'DEFAULT_AI_MODEL', 'AI_DEFAULT_MODEL');
  applyLegacyAiService(raw);
  return raw as T;
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
  // Discord HTTP API base without the version, as discord.js REST expects it. Tests point it at
  // a local fake; the bot token and client secret are sent here, so plain HTTP is loopback only.
  DISCORD_API_URL: z
    .string()
    .url('DISCORD_API_URL must be an absolute URL such as https://discord.com/api')
    .refine(isHttpsOrLoopback, 'DISCORD_API_URL must use https unless the host is loopback')
    .transform((url) => url.replace(/\/+$/, ''))
    .default('https://discord.com/api'),
});

function isHttpsOrLoopback(value: string): boolean {
  // `.url()` reports unparsable values; zod still runs this refinement after that check fails.
  if (!URL.canParse(value)) return true;
  const url = new URL(value);
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

export const WebConfigSchema = z.preprocess(applyLegacyAliases, BaseWebConfigSchema);

export type WebConfig = z.infer<typeof BaseWebConfigSchema>;
