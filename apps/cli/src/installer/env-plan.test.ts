import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseEnvContent } from '../utils/env-editor.js';
import {
  DOCKER_MANAGED_VARIABLES,
  PROFILE_FILES,
  backupStamp,
  checkPlannedEnv,
  cryptoSecretGenerator,
  planEnv,
  prefillValues,
  realValue,
  writeEnv,
  type SecretGenerator,
} from './env-plan.js';
import type { Answers, Profile } from './steps.js';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const GOLDEN = fileURLToPath(new URL('./__golden__/', import.meta.url));
const NOW = () => new Date('2026-10-12T09:30:15.123Z');
const ID = '123456789012345678';

/** Each call returns a different, fixed hex string, so the files are byte-identical. */
function fixedGenerator(): SecretGenerator {
  let call = 0;
  return {
    hex: (bytes) => {
      call += 1;
      return call
        .toString(16)
        .repeat(bytes * 2)
        .slice(0, bytes * 2);
    },
  };
}

const FULL: Answers = {
  values: {
    DISCORD_CLIENT_ID: ID,
    DISCORD_TOKEN: 'fake-bot-token',
    BOT_OWNER_ID: '223456789012345678',
    DISCORD_DEV_GUILD_ID: '323456789012345678',
    DEFAULT_AI_PROVIDER: 'openai',
    OPENAI_API_KEY: 'sk-fake-openai',
    OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
    IMAGE_DEFAULT_PROVIDER: 'comfyui',
    COMFYUI_URL: 'http://127.0.0.1:7860',
    TWITCH_CLIENT_ID: 'fake-twitch-id',
    TWITCH_CLIENT_SECRET: 'fake-twitch-secret',
    YOUTUBE_API_KEY: 'fake-youtube-key',
    DATABASE_DIALECT: 'postgres',
    DATABASE_URL: 'postgresql://ririko:fake@localhost:5432/ririko',
    SPOTIFY_CLIENT_ID: 'fake-spotify-id',
    SPOTIFY_CLIENT_SECRET: 'fake-spotify-secret',
    DISCORD_CLIENT_SECRET: 'fake-oauth-secret',
    DASHBOARD_URL: 'https://dashboard.example.org',
    accept_tos: 'true',
    accept_privacypolicy: 'true',
  },
  switches: {
    'ai-chat': true,
    'ai-images': true,
    twitch: true,
    youtube: true,
    spotify: true,
    dashboard: true,
  },
};

const MINIMAL: Answers = {
  values: {
    DISCORD_CLIENT_ID: ID,
    DISCORD_TOKEN: 'fake-bot-token',
    DATABASE_DIALECT: 'sqlite',
    accept_tos: 'true',
    accept_privacypolicy: 'true',
  },
  switches: {},
};

/** Docker always has the dashboard, so its smallest valid answers include it. */
const DOCKER_MINIMAL: Answers = {
  values: {
    ...MINIMAL.values,
    DISCORD_CLIENT_SECRET: 'fake-oauth-secret',
    DASHBOARD_URL: 'https://dashboard.example.org',
  },
  switches: {},
};

let root: string;

function seed(profile: Profile): void {
  const { example } = PROFILE_FILES[profile];
  writeFileSync(join(root, example), readFileSync(join(REPO, example), 'utf-8'));
}

function read(profile: Profile): string {
  return readFileSync(join(root, PROFILE_FILES[profile].env), 'utf-8');
}

function golden(name: string, actual: string): void {
  const path = join(GOLDEN, name);
  if (process.env.UPDATE_GOLDEN === '1') {
    mkdirSync(GOLDEN, { recursive: true });
    writeFileSync(path, actual, 'utf-8');
  }
  expect(actual).toBe(readFileSync(path, 'utf-8').replace(/\r\n/g, '\n'));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ririko-installer-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('golden files', () => {
  for (const profile of ['source', 'docker'] as const) {
    for (const [label, answers] of [
      ['full', FULL],
      ['minimal', profile === 'docker' ? DOCKER_MINIMAL : MINIMAL],
    ] as const) {
      it(`writes the same ${profile} file for the same ${label} answers`, () => {
        seed(profile);
        const result = writeEnv({ root, profile, answers, generate: fixedGenerator(), now: NOW });
        expect(result.ok).toBe(true);
        const first = read(profile);
        golden(`${profile}.${label}.env`, first);

        rmSync(join(root, PROFILE_FILES[profile].env));
        writeEnv({ root, profile, answers, generate: fixedGenerator(), now: NOW });
        expect(read(profile)).toBe(first);
      });
    }
  }
});

describe('writing a new file', () => {
  it('copies the example, fills it in place and keeps its comments and order', () => {
    seed('source');
    const result = writeEnv({
      root,
      profile: 'source',
      answers: FULL,
      generate: fixedGenerator(),
      now: NOW,
    });
    expect(result).toMatchObject({ ok: true, created: true, backup: null });
    const text = read('source');
    const example = readFileSync(join(REPO, '.env.example'), 'utf-8').replace(/\r\n/g, '\n');
    expect(text).toContain('# Discord Bot Credentials');
    expect(text).toContain('DISCORD_TOKEN=fake-bot-token');
    expect(text).toContain('SECRET_VAULT_KEY=');
    expect(text).not.toContain('# SECRET_VAULT_KEY=');
    // Untouched example lines stay where they are.
    const keep = 'RIRIKO_RESET_OFFSET_MINUTES=480';
    expect(text.indexOf(keep)).toBeGreaterThan(-1);
    expect(text.indexOf('LOG_LEVEL=info') - text.indexOf(keep)).toBe(
      example.indexOf('LOG_LEVEL=info') - example.indexOf(keep),
    );
  });

  it('generates the secrets from the injected generator', () => {
    seed('source');
    const result = writeEnv({
      root,
      profile: 'source',
      answers: FULL,
      generate: fixedGenerator(),
      now: NOW,
    });
    if (!result.ok) throw new Error('expected a write');
    expect(result.generatedKeys).toEqual(['SECRET_VAULT_KEY', 'LAVALINK_PASSWORD']);
    const env = parseEnvContent(read('source'));
    expect(env.SECRET_VAULT_KEY).toMatch(/^[0-9a-f]{64}$/);
    expect(env.LAVALINK_PASSWORD).toHaveLength(32);
    expect(env.LAVALINK_PASSWORD).not.toBe('youshallnotpass');
  });

  it('generates POSTGRES_PASSWORD for docker and never writes the compose-managed variables', () => {
    seed('docker');
    const result = writeEnv({
      root,
      profile: 'docker',
      answers: FULL,
      generate: fixedGenerator(),
      now: NOW,
    });
    if (!result.ok) throw new Error('expected a write');
    expect(result.generatedKeys).toEqual([
      'SECRET_VAULT_KEY',
      'LAVALINK_PASSWORD',
      'POSTGRES_PASSWORD',
    ]);
    const text = read('docker');
    for (const name of DOCKER_MANAGED_VARIABLES) {
      expect(text).not.toMatch(new RegExp(`^${name}=`, 'm'));
    }
    expect(parseEnvContent(text).POSTGRES_PASSWORD).toHaveLength(32);
  });

  it('starts the dashboard fields from the answers for docker without a switch', () => {
    seed('docker');
    const answers: Answers = { values: FULL.values, switches: {} };
    const result = writeEnv({
      root,
      profile: 'docker',
      answers,
      generate: fixedGenerator(),
      now: NOW,
    });
    expect(result.ok).toBe(true);
    expect(parseEnvContent(read('docker')).DASHBOARD_URL).toBe('https://dashboard.example.org');
  });

  it('writes with mode 0600 where the platform has modes', () => {
    seed('source');
    writeEnv({ root, profile: 'source', answers: MINIMAL, generate: fixedGenerator(), now: NOW });
    if (process.platform !== 'win32') {
      expect(statSync(join(root, '.env')).mode & 0o777).toBe(0o600);
    }
  });

  it('throws when the example is missing', () => {
    expect(() => writeEnv({ root, profile: 'source', answers: MINIMAL })).toThrow(/\.env\.example/);
  });

  it('uses the real generator by default', () => {
    seed('source');
    const result = writeEnv({ root, profile: 'source', answers: MINIMAL });
    expect(result.ok).toBe(true);
    expect(cryptoSecretGenerator.hex(32)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('update mode', () => {
  const EXISTING = [
    '# my notes',
    'DISCORD_TOKEN=old-token',
    'DISCORD_CLIENT_ID=999999999999999999',
    'MY_OWN_SETTING=keep me',
    `SECRET_VAULT_KEY=${'ab'.repeat(32)}`,
    'LAVALINK_PASSWORD=my-lavalink',
    'OPENAI_API_KEY=sk-existing',
    '',
  ].join('\n');

  it('keeps unknown variables, comments and existing secrets, and backs the file up', () => {
    seed('source');
    writeFileSync(join(root, '.env'), EXISTING);
    const result = writeEnv({
      root,
      profile: 'source',
      answers: FULL,
      generate: fixedGenerator(),
      now: NOW,
    });
    if (!result.ok) throw new Error('expected a write');
    expect(result.created).toBe(false);
    expect(result.generatedKeys).toEqual([]);
    const text = read('source');
    expect(text).toContain('# my notes');
    expect(text).toContain('MY_OWN_SETTING=keep me');
    expect(text).toContain(`SECRET_VAULT_KEY=${'ab'.repeat(32)}`);
    expect(text).toContain('LAVALINK_PASSWORD=my-lavalink');
    expect(text).toContain('DISCORD_TOKEN=fake-bot-token');
    expect(result.backup).toBe(join(root, '.env.bak-20261012T093015Z'));
    expect(readFileSync(result.backup!, 'utf-8')).toBe(EXISTING);
  });

  it('never replaces SECRET_VAULT_KEY or POSTGRES_PASSWORD once set', () => {
    seed('docker');
    writeFileSync(
      join(root, '.env.production'),
      `SECRET_VAULT_KEY=${'cd'.repeat(32)}\nPOSTGRES_PASSWORD=pg-existing\n`,
    );
    const result = writeEnv({
      root,
      profile: 'docker',
      answers: FULL,
      generate: fixedGenerator(),
      now: NOW,
    });
    if (!result.ok) throw new Error('expected a write');
    const env = parseEnvContent(read('docker'));
    expect(env.SECRET_VAULT_KEY).toBe('cd'.repeat(32));
    expect(env.POSTGRES_PASSWORD).toBe('pg-existing');
    expect(result.generatedKeys).toEqual(['LAVALINK_PASSWORD']);
  });

  it('leaves the variables of a feature that is off alone', () => {
    seed('source');
    writeFileSync(join(root, '.env'), EXISTING);
    const result = writeEnv({
      root,
      profile: 'source',
      answers: MINIMAL,
      generate: fixedGenerator(),
      now: NOW,
    });
    expect(result.ok).toBe(true);
    const env = parseEnvContent(read('source'));
    expect(env.OPENAI_API_KEY).toBe('sk-existing');
    expect(env.SECRET_VAULT_KEY).toBe('ab'.repeat(32));
  });

  it('does not rotate a generated secret on a second run', () => {
    seed('source');
    writeEnv({ root, profile: 'source', answers: FULL, generate: fixedGenerator(), now: NOW });
    const before = parseEnvContent(read('source'));
    const second = writeEnv({
      root,
      profile: 'source',
      answers: FULL,
      generate: cryptoSecretGenerator,
      now: NOW,
    });
    expect(second.ok).toBe(true);
    const after = parseEnvContent(read('source'));
    expect(after.SECRET_VAULT_KEY).toBe(before.SECRET_VAULT_KEY);
    expect(after.LAVALINK_PASSWORD).toBe(before.LAVALINK_PASSWORD);
    expect(readdirSync(root).filter((name) => name.startsWith('.env.bak-'))).toHaveLength(1);
  });
});

describe('refusing to write', () => {
  it('writes nothing when a page is invalid and names the variables', () => {
    seed('source');
    const answers: Answers = { values: { ...MINIMAL.values, DISCORD_TOKEN: '' }, switches: {} };
    const result = writeEnv({ root, profile: 'source', answers, now: NOW });
    expect(result).toEqual({
      ok: false,
      errors: [{ variable: 'DISCORD_TOKEN', message: 'Bot token is required.' }],
    });
    expect(readdirSync(root)).toEqual(['.env.example']);
  });

  it('writes nothing when the planned file fails the schema', () => {
    seed('docker');
    writeFileSync(join(root, '.env.production'), 'SECRET_VAULT_KEY=too-short\n');
    const result = writeEnv({
      root,
      profile: 'docker',
      answers: FULL,
      generate: fixedGenerator(),
      now: NOW,
    });
    if (result.ok) throw new Error('expected a refusal');
    expect(result.errors.map((error) => error.variable)).toEqual(['SECRET_VAULT_KEY']);
    expect(readFileSync(join(root, '.env.production'), 'utf-8')).toBe(
      'SECRET_VAULT_KEY=too-short\n',
    );
    expect(readdirSync(root).filter((name) => name.includes('.bak-'))).toEqual([]);
  });
});

describe('planEnv', () => {
  it('writes nothing for features that are off', () => {
    const plan = planEnv(MINIMAL, {}, 'source', fixedGenerator());
    expect(Object.keys(plan.updates)).toEqual([
      'DISCORD_CLIENT_ID',
      'DISCORD_TOKEN',
      'DATABASE_DIALECT',
      'LAVALINK_PASSWORD',
    ]);
  });

  it('clears an optional value the reader emptied', () => {
    const answers: Answers = { values: { ...MINIMAL.values, BOT_OWNER_ID: '' }, switches: {} };
    const plan = planEnv(answers, { BOT_OWNER_ID: ID }, 'source', fixedGenerator());
    expect(plan.updates.BOT_OWNER_ID).toBe('');
  });

  it('puts SQLite back when the file held a PostgreSQL address', () => {
    const plan = planEnv(
      MINIMAL,
      { DATABASE_URL: 'postgresql://u:p@h:5432/db' },
      'source',
      fixedGenerator(),
    );
    expect(plan.updates.DATABASE_URL).toBe('./data/ririko.sqlite');
    const keep = planEnv(MINIMAL, { DATABASE_URL: './mine.sqlite' }, 'source', fixedGenerator());
    expect(keep.updates.DATABASE_URL).toBeUndefined();
  });

  it('treats the example placeholders as unset', () => {
    const plan = planEnv(
      MINIMAL,
      { LAVALINK_PASSWORD: 'youshallnotpass' },
      'source',
      fixedGenerator(),
    );
    expect(plan.generated).toEqual(['LAVALINK_PASSWORD']);
    expect(realValue({ A: 'your_bot_token_here', B: ' x ', C: '' }, 'A')).toBe('');
    expect(realValue({ B: ' x ' }, 'B')).toBe('x');
    expect(prefillValues({ A: 'your_client_id_here', B: 'x', C: '' })).toEqual({ B: 'x' });
  });
});

describe('checkPlannedEnv', () => {
  it('parses with the web schema only when the dashboard is on', () => {
    const planned = { DISCORD_TOKEN: 't', DISCORD_CLIENT_ID: 'c' };
    expect(checkPlannedEnv(planned, 'source', MINIMAL)).toEqual([]);
    const errors = checkPlannedEnv(planned, 'source', {
      ...MINIMAL,
      switches: { dashboard: true },
    });
    expect(errors.map((error) => error.variable)).toEqual([
      'DISCORD_CLIENT_SECRET',
      'SECRET_VAULT_KEY',
      'DASHBOARD_URL',
    ]);
  });

  it('names a list item by its variable', () => {
    const errors = checkPlannedEnv(
      { DISCORD_TOKEN: 't', DISCORD_CLIENT_ID: 'c', BOT_OWNER_ID: 'nope' },
      'source',
      MINIMAL,
    );
    expect(errors).toEqual([
      { variable: 'BOT_OWNER_ID', message: 'BOT_OWNER_ID must list Discord user IDs' },
    ]);
  });
});

describe('backupStamp', () => {
  it('is the UTC time without separators', () => {
    expect(backupStamp(new Date('2026-01-02T03:04:05.678Z'))).toBe('20260102T030405Z');
  });
});
