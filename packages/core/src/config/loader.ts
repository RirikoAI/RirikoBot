import { z } from 'zod';
import {
  AppConfig,
  AppConfigSchema,
  DbAutoMigrateSchema,
  WebConfig,
  WebConfigSchema,
} from './schema.js';

let cachedConfig: AppConfig | null = null;

export class ConfigurationError extends Error {
  constructor(
    message: string,
    public readonly validationErrors?: string[],
  ) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export interface LoadConfigOptions {
  reload?: boolean;
  cache?: boolean;
}

/**
 * Validates and loads application configuration.
 * Throws a detailed ConfigurationError if required environment variables are invalid or missing.
 */
export function loadConfig(
  envOverrides?: Record<string, string | undefined>,
  options: LoadConfigOptions = {},
): AppConfig {
  if (cachedConfig && !options.reload && !envOverrides) {
    return cachedConfig;
  }

  const config = parseConfig(AppConfigSchema, envOverrides ?? process.env);

  if (options.cache !== false) {
    cachedConfig = config;
  }

  return config;
}

/**
 * Validates the environment against a config schema.
 * Throws a ConfigurationError listing every invalid or missing variable.
 */
export function parseConfig<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  env: Record<string, string | undefined>,
): z.output<TSchema> {
  const result = schema.safeParse(env);

  if (!result.success) {
    const formattedErrors = result.error.errors.map(
      (err) => `${err.path.join('.')}: ${err.message}`,
    );

    const errorMessage = `Failed to validate application configuration:\n  - ${formattedErrors.join(
      '\n  - ',
    )}`;

    throw new ConfigurationError(errorMessage, formattedErrors);
  }

  return result.data;
}

/**
 * Validates and loads the web dashboard configuration (not cached; the dashboard keeps its own
 * server-only singleton).
 */
export function loadWebConfig(env: Record<string, string | undefined> = process.env): WebConfig {
  return parseConfig(WebConfigSchema, env);
}

/**
 * `DB_AUTO_MIGRATE` on its own (default `true`), for the entry points that read the environment
 * directly. Throws a ConfigurationError for a value that is not true or false.
 */
export function dbAutoMigrateFromEnv(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return parseConfig(z.object({ DB_AUTO_MIGRATE: DbAutoMigrateSchema }), env).DB_AUTO_MIGRATE;
}

/**
 * Returns the currently cached application configuration.
 * Calls loadConfig() if not already initialized.
 */
export function getConfig(): AppConfig {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}

/**
 * Resets the cached configuration (primarily for testing).
 */
export function resetConfig(): void {
  cachedConfig = null;
}
