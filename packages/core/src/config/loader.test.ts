import { beforeEach, describe, expect, it } from 'vitest';
import { ConfigurationError, getConfig, loadConfig, resetConfig } from './loader.js';

describe('Config Loader', () => {
  beforeEach(() => {
    resetConfig();
  });

  it('loads valid configuration with defaults', () => {
    const validEnv = {
      DISCORD_TOKEN: 'mock-discord-token',
      DISCORD_CLIENT_ID: '123456789012345678',
    };

    const config = loadConfig(validEnv);

    expect(config.DISCORD_TOKEN).toBe('mock-discord-token');
    expect(config.DISCORD_CLIENT_ID).toBe('123456789012345678');
    expect(config.NODE_ENV).toBe('development');
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.PORT).toBe(3000);
    expect(config.DATABASE_URL).toBe('./data/ririko.sqlite');
    expect(config.DATABASE_DIALECT).toBe('sqlite');
  });

  it('caches loaded configuration and returns via getConfig', () => {
    const validEnv = {
      DISCORD_TOKEN: 'mock-discord-token',
      DISCORD_CLIENT_ID: '123456789012345678',
    };

    loadConfig(validEnv);
    const cached = getConfig();
    expect(cached.DISCORD_TOKEN).toBe('mock-discord-token');
  });

  it('coerces string PORT to integer', () => {
    const validEnv = {
      DISCORD_TOKEN: 'mock-token',
      DISCORD_CLIENT_ID: 'mock-client-id',
      PORT: '8080',
    };

    const config = loadConfig(validEnv);
    expect(config.PORT).toBe(8080);
  });

  it('throws ConfigurationError when required fields are missing', () => {
    expect(() => loadConfig({})).toThrow(ConfigurationError);

    try {
      loadConfig({});
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigurationError);
      const configErr = err as ConfigurationError;
      expect(configErr.validationErrors).toBeDefined();
      expect(configErr.validationErrors).toContain('DISCORD_TOKEN: DISCORD_TOKEN is required');
      expect(configErr.validationErrors).toContain(
        'DISCORD_CLIENT_ID: DISCORD_CLIENT_ID is required',
      );
    }
  });

  it('rejects invalid enum values for NODE_ENV and DATABASE_DIALECT', () => {
    expect(() =>
      loadConfig({
        DISCORD_TOKEN: 'mock-token',
        DISCORD_CLIENT_ID: 'mock-client-id',
        NODE_ENV: 'staging' as unknown as 'development',
      }),
    ).toThrow(ConfigurationError);

    expect(() =>
      loadConfig({
        DISCORD_TOKEN: 'mock-token',
        DISCORD_CLIENT_ID: 'mock-client-id',
        DATABASE_DIALECT: 'mysql' as unknown as 'sqlite',
      }),
    ).toThrow(ConfigurationError);
  });

  it('validates 64-character hex SECRET_VAULT_KEY', () => {
    const validVaultKey = 'a'.repeat(64);
    const config = loadConfig({
      DISCORD_TOKEN: 'mock-token',
      DISCORD_CLIENT_ID: 'mock-client-id',
      SECRET_VAULT_KEY: validVaultKey,
    });
    expect(config.SECRET_VAULT_KEY).toBe(validVaultKey);

    expect(() =>
      loadConfig({
        DISCORD_TOKEN: 'mock-token',
        DISCORD_CLIENT_ID: 'mock-client-id',
        SECRET_VAULT_KEY: 'too-short',
      }),
    ).toThrow(ConfigurationError);
  });
});
