import { z } from 'zod';

export const NodeEnvSchema = z.enum(['development', 'production', 'test']).default('development');
export type NodeEnv = z.infer<typeof NodeEnvSchema>;

export const DatabaseDialectSchema = z.enum(['postgres', 'sqlite']).default('sqlite');
export type DatabaseDialect = z.infer<typeof DatabaseDialectSchema>;

export const LogLevelSchema = z
  .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
  .default('info');
export type LogLevel = z.infer<typeof LogLevelSchema>;

export const AppConfigSchema = z.object({
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

  // Dual-Dialect Database
  DATABASE_URL: z.string().default('./data/ririko.sqlite'),
  DATABASE_DIALECT: DatabaseDialectSchema,

  // AppSec & Credential Vault (AES-256-GCM 32-byte hex key)
  SECRET_VAULT_KEY: z
    .string()
    .length(64, 'SECRET_VAULT_KEY must be a 64-character hex string (32 bytes)')
    .optional(),

  // Optional AI Provider Keys
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().url().optional(),

  // Optional Streaming & External Integrations
  TWITCH_CLIENT_ID: z.string().optional(),
  TWITCH_CLIENT_SECRET: z.string().optional(),
  SPOTIFY_CLIENT_ID: z.string().optional(),
  SPOTIFY_CLIENT_SECRET: z.string().optional(),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type AppConfigInput = z.input<typeof AppConfigSchema>;
