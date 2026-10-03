import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabaseClient } from '@ririko/database';
import {
  ids,
  startFakeDiscord,
  type FakeDiscordServer,
} from '../../../../../tests/support/fake-discord';

const taint = vi.hoisted(() => ({
  objects: [] as Array<{ message: string; object: unknown }>,
  values: [] as Array<{ message: string; value: unknown }>,
}));

// The taint APIs only exist in React's server build; record what the module asks to taint.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  experimental_taintObjectReference: (message: string, object: unknown) => {
    taint.objects.push({ message, object });
  },
  experimental_taintUniqueValue: (message: string, _lifetime: object, value: unknown) => {
    taint.values.push({ message, value });
  },
}));

const VAULT_KEY = 'ab'.repeat(32);
const TOKEN = 'bot-token-0123456789-abcdefghij';
const CLIENT_SECRET = 'oauth-client-secret-0123456789';
const PREVIOUS_KEY = 'cd'.repeat(32);

let fake: FakeDiscordServer;
let dir: string;
let dbPath: string;
let envBefore: NodeJS.ProcessEnv;

function setEnv(overrides: Record<string, string | undefined> = {}): void {
  const env: Record<string, string | undefined> = {
    DISCORD_TOKEN: TOKEN,
    DISCORD_CLIENT_ID: ids.application,
    DISCORD_CLIENT_SECRET: CLIENT_SECRET,
    DASHBOARD_URL: 'https://dash.example.com',
    SECRET_VAULT_KEY: VAULT_KEY,
    SECRET_VAULT_PREVIOUS_KEYS: `0:${PREVIOUS_KEY}`,
    DATABASE_DIALECT: 'sqlite',
    DATABASE_URL: dbPath,
    DISCORD_API_URL: fake.apiUrl,
    BOT_OWNER_ID: '100000000000000009',
    ...overrides,
  };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

// Each test re-imports the services module (and the packages behind it) so it gets fresh state;
// that is slow when the whole suite runs under coverage.
describe('getWebServices', { timeout: 60_000 }, () => {
  beforeAll(async () => {
    envBefore = { ...process.env };
    fake = await startFakeDiscord();
    dir = await mkdtemp(path.join(tmpdir(), 'ririko-web-services-'));
    dbPath = path.join(dir, 'web.sqlite');
    // The bot creates the schema at startup; the dashboard only connects to it.
    const migrated = await createDatabaseClient({
      dialect: 'sqlite',
      url: dbPath,
      autoMigrate: true,
    });
    await migrated.close();
  }, 60_000);

  afterAll(async () => {
    const globals = globalThis as { __ririkoWebDatabase?: Promise<{ close(): Promise<void> }> };
    await (await globals.__ririkoWebDatabase)?.close();
    delete globals.__ririkoWebDatabase;
    await fake.close();
    await rm(dir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, envBefore);
  }, 60_000);

  it('does not keep a failed start: a broken config rejects, then a fixed one works', async () => {
    vi.resetModules();
    const { getWebServices } = await import('./services');
    setEnv({ SECRET_VAULT_KEY: 'not-a-key' });
    await expect(getWebServices()).rejects.toThrow(/SECRET_VAULT_KEY/);

    setEnv();
    const services = await getWebServices();
    expect(services.config.DASHBOARD_URL).toBe('https://dash.example.com');
  });

  it('builds one set of services per module instance and taints the credentials', async () => {
    vi.resetModules();
    taint.objects.length = 0;
    taint.values.length = 0;
    setEnv();
    const { getWebServices } = await import('./services');
    const services = await getWebServices();
    expect(await getWebServices()).toBe(services);

    expect(taint.objects.map((entry) => entry.object)).toEqual([services.config]);
    const tainted = taint.values.map((entry) => entry.value);
    expect(tainted).toEqual(
      expect.arrayContaining([TOKEN, CLIENT_SECRET, VAULT_KEY, PREVIOUS_KEY]),
    );
    // Short, low-entropy values are not tainted: the database path is not a secret here and
    // the owner ID must stay usable in components.
    expect(tainted).not.toContain('100000000000000009');
    expect(tainted).not.toContain('sqlite');
  });

  it('talks to the configured Discord API with the bot token', async () => {
    vi.resetModules();
    setEnv();
    const { getWebServices } = await import('./services');
    const { guildResources } = await getWebServices();

    const channels = await guildResources.messageChannels(ids.mainGuild);
    expect(channels.map((channel) => channel.id)).toContain(ids.generalChannel);
    expect(channels.map((channel) => channel.id)).not.toContain(ids.voiceChannel);

    const [request] = fake.find('GET', `/guilds/${ids.mainGuild}/channels`);
    expect(request?.auth).toEqual({ kind: 'bot' });
    expect(fake.unhandled).toEqual([]);
  });

  it('builds the OAuth client against the same API and the dashboard callback', async () => {
    vi.resetModules();
    setEnv();
    const { getWebServices } = await import('./services');
    const { oauth } = await getWebServices();
    const url = new URL(oauth.authorizationUrl({ state: 's', codeChallenge: 'c' }));
    expect(url.origin + url.pathname).toBe(`${fake.apiUrl}/v10/oauth2/authorize`);
    expect(url.searchParams.get('redirect_uri')).toBe('https://dash.example.com/api/auth/callback');
    expect(url.searchParams.get('client_id')).toBe(ids.application);
  });

  it('wires the repositories and audit log to the shared database', async () => {
    vi.resetModules();
    setEnv();
    const { getWebServices } = await import('./services');
    const { guildConfig, audit } = await getWebServices();

    const actor = {
      userId: ids.admin,
      source: 'dashboard' as const,
      ipAddress: null,
      userAgent: null,
    };
    const saved = await guildConfig.update(ids.mainGuild, 'general', { prefix: '?' }, actor);
    expect(saved.values.prefix).toBe('?');
    expect(saved.changes).toEqual([{ field: 'prefix', before: expect.anything(), after: '?' }]);

    const [entry] = await audit.listByGuild(ids.mainGuild, { limit: 5 });
    expect(entry).toMatchObject({ guildId: ids.mainGuild, actorUserId: ids.admin });
  });
});
