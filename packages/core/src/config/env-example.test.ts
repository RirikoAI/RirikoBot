import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseConfig } from './loader.js';
import { AppConfigSchema, WebConfigSchema, applyLegacyAliases } from './schema.js';

/** Reads `KEY=value` lines of an example file, skipping comments. */
function readExample(name: string): Record<string, string> {
  const path = fileURLToPath(new URL(`../../../../${name}`, import.meta.url));
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match?.[1]) env[match[1]] = match[2] ?? '';
  }
  return env;
}

describe('empty values count as unset', () => {
  it('drops empty strings from the returned copy and leaves the input alone', () => {
    const input = { A: '', B: 'x' };
    expect(applyLegacyAliases(input)).toEqual({ B: 'x' });
    expect(input).toEqual({ A: '', B: 'x' });
  });

  it('lets the untouched .env.example pass AppConfigSchema', () => {
    const env = readExample('.env.example');
    expect(env.OPENAI_BASE_URL).toBe('');
    expect(env.COMFYUI_URL).toBe('');
    const config = parseConfig(AppConfigSchema, env);
    expect(config.OPENAI_BASE_URL).toBeUndefined();
    expect(config.COMFYUI_URL).toBeUndefined();
    expect(config.DATABASE_DIALECT).toBe('sqlite');
  });

  it('lets .env.example pass WebConfigSchema once the dashboard-only secrets are added', () => {
    const env = {
      ...readExample('.env.example'),
      DISCORD_CLIENT_SECRET: 'secret',
      SECRET_VAULT_KEY: 'a'.repeat(64),
    };
    expect(parseConfig(WebConfigSchema, env).DASHBOARD_URL).toBe('http://localhost:3000');
  });

  it('still names a required variable that is left empty', () => {
    expect(() =>
      parseConfig(AppConfigSchema, { DISCORD_TOKEN: '', DISCORD_CLIENT_ID: 'x' }),
    ).toThrow(/DISCORD_TOKEN/);
  });

  it('keeps the empty-string behaviour of DB_AUTO_MIGRATE, BOT_OWNER_ID and CLIENT_IP_HEADER', () => {
    const base = { DISCORD_TOKEN: 't', DISCORD_CLIENT_ID: 'c' };
    const app = parseConfig(AppConfigSchema, {
      ...base,
      DB_AUTO_MIGRATE: '',
      BOT_OWNER_ID: '',
    });
    expect(app.DB_AUTO_MIGRATE).toBe(true);
    expect(app.BOT_OWNER_ID).toEqual([]);
    const web = parseConfig(WebConfigSchema, {
      ...base,
      DISCORD_CLIENT_SECRET: 's',
      DASHBOARD_URL: 'http://localhost:3000',
      SECRET_VAULT_KEY: 'b'.repeat(64),
      CLIENT_IP_HEADER: '',
    });
    expect(web.CLIENT_IP_HEADER).toBeUndefined();
  });
});
