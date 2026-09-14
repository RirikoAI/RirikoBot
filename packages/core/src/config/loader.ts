import { AppConfig, AppConfigSchema } from './schema.js';

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

  const rawEnv = envOverrides ?? process.env;
  const result = AppConfigSchema.safeParse(rawEnv);

  if (!result.success) {
    const formattedErrors = result.error.errors.map(
      (err) => `${err.path.join('.')}: ${err.message}`,
    );

    const errorMessage = `Failed to validate application configuration:\n  - ${formattedErrors.join(
      '\n  - ',
    )}`;

    throw new ConfigurationError(errorMessage, formattedErrors);
  }

  if (options.cache !== false) {
    cachedConfig = result.data;
  }

  return result.data;
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
