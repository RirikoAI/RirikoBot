import { describe, expect, it } from 'vitest';
import { parseConfig } from './loader.js';
import {
  AppConfigSchema,
  DEFAULT_PRIVACY_URL,
  DEFAULT_TERMS_URL,
  WebConfigSchema,
} from './schema.js';

const base = { DISCORD_TOKEN: 't', DISCORD_CLIENT_ID: 'c' };

describe('TERMS_URL and PRIVACY_URL (TASK-1931)', () => {
  it('default to the legal pages of the docs site', () => {
    const config = parseConfig(AppConfigSchema, base);

    expect(config.TERMS_URL).toBe('https://ririko.ai/docs/legal/terms');
    expect(config.PRIVACY_URL).toBe('https://ririko.ai/docs/legal/privacy');
    expect(DEFAULT_TERMS_URL).toBe(config.TERMS_URL);
    expect(DEFAULT_PRIVACY_URL).toBe(config.PRIVACY_URL);
  });

  it('count an empty value as unset', () => {
    const config = parseConfig(AppConfigSchema, { ...base, TERMS_URL: '', PRIVACY_URL: '' });

    expect(config.TERMS_URL).toBe(DEFAULT_TERMS_URL);
    expect(config.PRIVACY_URL).toBe(DEFAULT_PRIVACY_URL);
  });

  it("let a self-hoster link their own pages, also on the dashboard's schema", () => {
    const own = {
      TERMS_URL: 'https://example.org/tos',
      PRIVACY_URL: 'https://example.org/privacy',
    };

    expect(parseConfig(AppConfigSchema, { ...base, ...own })).toMatchObject(own);
    expect(
      parseConfig(WebConfigSchema, {
        ...base,
        ...own,
        DISCORD_CLIENT_SECRET: 's',
        DASHBOARD_URL: 'http://localhost:3000',
        SECRET_VAULT_KEY: 'a'.repeat(64),
      }),
    ).toMatchObject(own);
  });

  it('reject a value that is not a URL', () => {
    expect(() => parseConfig(AppConfigSchema, { ...base, TERMS_URL: 'terms page' })).toThrow(
      /TERMS_URL/,
    );
  });
});
