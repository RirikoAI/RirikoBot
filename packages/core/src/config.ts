import { z } from 'zod';
import { AppError } from './errors.js';
import { prefixSchema, snowflakeSchema } from './settings.js';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_DIALECT: z.enum(['sqlite', 'postgres']).default('sqlite'),
  DATABASE_URL: z.string().min(1).default('data/ririko.db'),
  DEFAULT_PREFIX: prefixSchema.default('!'),
  DISCORD_TOKEN: z.string().min(1).optional(),
  DISCORD_APPLICATION_ID: snowflakeSchema.optional(),
  DISCORD_GUILD_ID: snowflakeSchema.optional(),
  BOT_OWNER_IDS: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  HEALTH_HOST: z.string().default('127.0.0.1'),
  HEALTH_PORT: z.coerce.number().int().min(0).max(65535).default(3001),
});

/** Parsed process configuration never includes arbitrary environment variables. */
export interface RuntimeConfig {
  environment: 'development' | 'test' | 'production';
  database: { dialect: 'sqlite' | 'postgres'; url: string };
  defaultPrefix: string;
  discord: { token?: string; applicationId?: string; guildId?: string; ownerIds: string[] };
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  health: { host: string; port: number };
}

/** Validate configuration without echoing invalid values or secrets in errors. */
export function loadConfig(env: Record<string, string | undefined> = process.env): RuntimeConfig {
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new AppError('CONFIG', `Invalid configuration fields: ${[...new Set(result.error.issues.map((issue) => issue.path[0]))].join(', ')}.`);
  }
  const value = result.data;
  const ownerIds = value.BOT_OWNER_IDS.split(',').map((id) => id.trim()).filter(Boolean);
  if (!z.array(snowflakeSchema).safeParse(ownerIds).success) throw new AppError('CONFIG', 'Invalid configuration field: BOT_OWNER_IDS.');
  if (value.DATABASE_DIALECT === 'postgres') {
    try {
      const url = new URL(value.DATABASE_URL);
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) throw new Error();
    } catch {
      throw new AppError('CONFIG', 'DATABASE_URL must be a PostgreSQL connection URL.');
    }
  }
  return {
    environment: value.NODE_ENV,
    database: { dialect: value.DATABASE_DIALECT, url: value.DATABASE_URL },
    defaultPrefix: value.DEFAULT_PREFIX,
    discord: {
      ...(value.DISCORD_TOKEN ? { token: value.DISCORD_TOKEN } : {}),
      ...(value.DISCORD_APPLICATION_ID ? { applicationId: value.DISCORD_APPLICATION_ID } : {}),
      ...(value.DISCORD_GUILD_ID ? { guildId: value.DISCORD_GUILD_ID } : {}),
      ownerIds,
    },
    logLevel: value.LOG_LEVEL,
    health: { host: value.HEALTH_HOST, port: value.HEALTH_PORT },
  };
}

/** Validate mandatory gateway credentials at startup, separately from offline CLI commands. */
export function requireDiscordCredentials(config: RuntimeConfig): { token: string; applicationId: string } {
  if (!config.discord.token || !config.discord.applicationId) {
    throw new AppError('CONFIG', 'DISCORD_TOKEN and DISCORD_APPLICATION_ID are required.');
  }
  return { token: config.discord.token, applicationId: config.discord.applicationId };
}
