import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationFlags } from 'discord.js';
import {
  checkComfyUi,
  checkDatabase,
  checkDiscordApplication,
  checkDiscordOAuthSecret,
  checkGemini,
  checkLavalink,
  checkOllama,
  checkOpenAi,
  checkReplicate,
  checkSpotify,
  checkTwitch,
  checkYouTube,
  maskDatabaseUrl,
  redactSecrets,
  requiredPrivilegedIntents,
  type CheckDeps,
  type HealthLike,
} from './checks.js';

const APP_ID = '123456789012345678';
const TOKEN = 'MTIzNDU2Nzg5MDEyMzQ1Njc4.GabcDE.supersecrettokenvalue1234567';
const SECRET = 'oauthclientsecretvalue1234567890';
const ALL_INTENTS = ApplicationFlags.GatewayGuildMembers | ApplicationFlags.GatewayMessageContent;

type Handler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fakeFetch(handler: Handler) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input);
    calls.push({ url, init });
    return handler(url, init);
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

function noSecret(result: { message: string }, ...secrets: string[]) {
  for (const secret of secrets) expect(result.message).not.toContain(secret);
}

describe('redactSecrets and maskDatabaseUrl', () => {
  it('redacts long secrets and their URL-encoded form, and leaves short values alone', () => {
    expect(redactSecrets('a b/c-d-secret!', ['b/c-d-secret!'])).toBe('a ****');
    expect(redactSecrets('url=b%2Fc-d-secret!', ['b/c-d-secret!'])).toBe('url=****');
    expect(redactSecrets('network down', ['o', undefined, ''])).toBe('network down');
  });

  it('masks the password of a database URL', () => {
    expect(maskDatabaseUrl('postgresql://ririko:hunter2@db:5432/ririko')).toBe(
      'postgresql://ririko:****@db:5432/ririko',
    );
    expect(maskDatabaseUrl('postgresql://db/ririko')).toBe('postgresql://db/ririko');
  });
});

describe('requiredPrivilegedIntents', () => {
  it('lists Server Members and Message Content for the bot intents', () => {
    expect(requiredPrivilegedIntents().map((i) => i.label)).toEqual([
      'Server Members Intent',
      'Message Content Intent',
    ]);
  });

  it('includes the Presence intent when it is asked for', () => {
    // GuildPresences = 256
    expect(requiredPrivilegedIntents([256]).map((i) => i.label)).toEqual(['Presence Intent']);
  });
});

describe('checkDiscordApplication', () => {
  const run = (handler: Handler, extra: CheckDeps = {}, appId = APP_ID) => {
    const net = fakeFetch(handler);
    return {
      net,
      result: checkDiscordApplication(
        { token: TOKEN, applicationId: appId },
        { fetch: net.fetch, ...extra },
      ),
    };
  };

  it('passes when the token, the Application ID and the intents are right', async () => {
    const { net, result } = run(() => json({ id: APP_ID, name: 'Ririko', flags: ALL_INTENTS }));
    const r = await result;
    expect(r.status).toBe('pass');
    expect(r.message).toContain('Ririko');
    expect(net.calls[0]?.url).toBe('https://discord.com/api/v10/applications/@me');
    expect((net.calls[0]?.init?.headers as Record<string, string>).Authorization).toBe(
      `Bot ${TOKEN}`,
    );
    noSecret(r, TOKEN);
  });

  it('accepts the Limited flags (a bot in fewer than 100 servers)', async () => {
    const flags =
      ApplicationFlags.GatewayGuildMembersLimited | ApplicationFlags.GatewayMessageContentLimited;
    const { result } = run(() => json({ id: APP_ID, flags }));
    expect((await result).status).toBe('pass');
  });

  it('uses the injected API base', async () => {
    const { net, result } = run(() => json({ id: APP_ID, flags: ALL_INTENTS }), {
      discordApiBase: 'http://localhost:9999/api/',
    });
    await result;
    expect(net.calls[0]?.url).toBe('http://localhost:9999/api/applications/@me');
  });

  it('fails with guide step 4 when the token is rejected', async () => {
    const { result } = run(() => json({ message: '401: Unauthorized' }, 401));
    const r = await result;
    expect(r.status).toBe('fail');
    expect(r.message).toContain('rejected the bot token');
    expect(r.guideStep).toEqual({ guide: 'discord', step: 4 });
    noSecret(r, TOKEN);
  });

  it('fails with guide step 3 when the token belongs to another application', async () => {
    const { result } = run(() => json({ id: '999', flags: ALL_INTENTS }));
    const r = await result;
    expect(r.status).toBe('fail');
    expect(r.message).toContain('another application');
    expect(r.guideStep).toEqual({ guide: 'discord', step: 3 });
  });

  it('names a single missing intent and points at guide step 5', async () => {
    const { result } = run(() => json({ id: APP_ID, flags: ApplicationFlags.GatewayGuildMembers }));
    const r = await result;
    expect(r.status).toBe('fail');
    expect(r.message).toContain('Message Content Intent is switched off');
    expect(r.message).not.toContain('Server Members Intent');
    expect(r.guideStep).toEqual({ guide: 'discord', step: 5 });
  });

  it('names both missing intents', async () => {
    const { result } = run(() => json({ id: APP_ID }));
    const r = await result;
    expect(r.message).toContain(
      'Server Members Intent and Message Content Intent are switched off',
    );
  });

  it('fails on another HTTP status', async () => {
    const { result } = run(() => json({}, 500));
    const r = await result;
    expect(r.status).toBe('fail');
    expect(r.message).toContain('HTTP 500');
    expect(r.guideStep).toBeUndefined();
  });

  it('never throws and redacts the token from a network error', async () => {
    const { result } = run(() => {
      throw new Error(`connect failed for ${TOKEN}`);
    });
    const r = await result;
    expect(r.status).toBe('fail');
    expect(r.detail?.thrown).toBe(true);
    expect(r.guideStep).toEqual({ guide: 'discord', step: 4 });
    noSecret(r, TOKEN);
    expect(r.detail?.error).not.toContain(TOKEN);
  });

  it('stops after the timeout', async () => {
    const { result } = run(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
      { timeoutMs: 20 },
    );
    const r = await result;
    expect(r.status).toBe('fail');
    expect(r.message).toContain('did not answer within');
    expect(r.detail?.thrown).toBe(true);
  });
});

describe('checkDiscordOAuthSecret', () => {
  const run = (handler: Handler, extra: CheckDeps = {}) => {
    const net = fakeFetch(handler);
    return {
      net,
      result: checkDiscordOAuthSecret(
        { applicationId: APP_ID, clientSecret: SECRET },
        { fetch: net.fetch, ...extra },
      ),
    };
  };

  it('posts client_credentials with Basic auth and passes on 200', async () => {
    const { net, result } = run(() => json({ access_token: 'x', token_type: 'Bearer' }));
    const r = await result;
    expect(r.status).toBe('pass');
    const call = net.calls[0]!;
    expect(call.url).toBe('https://discord.com/api/v10/oauth2/token');
    expect(call.init?.method).toBe('POST');
    expect(String(call.init?.body)).toBe('grant_type=client_credentials&scope=identify');
    expect((call.init?.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from(`${APP_ID}:${SECRET}`).toString('base64')}`,
    );
    noSecret(r, SECRET);
  });

  it('reports a wrong secret on 401', async () => {
    const { result } = run(() => json({ error: 'invalid_client' }, 401));
    const r = await result;
    expect(r.status).toBe('fail');
    expect(r.message).toContain('Client Secret');
    expect(r.guideStep).toEqual({ guide: 'dashboard-oauth', step: 3 });
  });

  it('fails on another status and on a network error without leaking the secret', async () => {
    expect((await run(() => json({}, 503)).result).message).toContain('HTTP 503');
    const r = await run(() => {
      throw new Error(`boom ${SECRET}`);
    }).result;
    expect(r.status).toBe('fail');
    noSecret(r, SECRET);
  });
});

describe('checkDatabase (SQLite)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ririko-checks-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('passes for a writable existing folder (real file system) and creates nothing', async () => {
    const r = await checkDatabase({ dialect: 'sqlite', url: join(dir, 'ririko.sqlite') });
    expect(r.status).toBe('pass');
    expect(r.message).toContain('can be written to');
    const { readdirSync } = await import('node:fs');
    expect(readdirSync(dir)).toEqual([]);
  });

  it('passes for a folder that does not exist yet but can be created', async () => {
    const r = await checkDatabase({
      dialect: 'sqlite',
      url: `file:${join(dir, 'data', 'deep', 'ririko.sqlite')}`,
    });
    expect(r.status).toBe('pass');
    expect(r.message).toContain('will be created');
  });

  it('treats an in-memory database as fine', async () => {
    expect((await checkDatabase({ dialect: 'sqlite', url: ':memory:' })).status).toBe('pass');
  });

  it('fails when the folder cannot be written to', async () => {
    const r = await checkDatabase(
      { dialect: 'sqlite', url: '/locked/ririko.sqlite' },
      { fs: { isDirectory: () => true, canWrite: () => false } },
    );
    expect(r.status).toBe('fail');
    expect(r.message).toContain('cannot write');
  });

  it('fails when no parent folder exists at all', async () => {
    const r = await checkDatabase(
      { dialect: 'sqlite', url: '/nowhere/ririko.sqlite' },
      { fs: { isDirectory: () => false, canWrite: () => true } },
    );
    expect(r.status).toBe('fail');
    expect(r.message).toContain('cannot be created');
  });

  it('rejects an unsupported dialect', async () => {
    const r = await checkDatabase({ dialect: 'mysql', url: 'x' });
    expect(r.status).toBe('fail');
    expect(r.message).toContain('Unsupported');
  });
});

describe('checkDatabase (PostgreSQL)', () => {
  const URL_WITH_PASSWORD = 'postgresql://ririko:s3cretPassw0rd@db.internal:5432/ririko';

  function client(ping: { ok: boolean; latencyMs: number; error?: string }) {
    const close = vi.fn(async () => undefined);
    return { close, ping: vi.fn(async () => ping) };
  }

  it('connects, pings, closes the client and masks the password', async () => {
    const c = client({ ok: true, latencyMs: 4 });
    const create = vi.fn(async () => c);
    const r = await checkDatabase(
      { dialect: 'postgres', url: URL_WITH_PASSWORD },
      { createDatabaseClient: create, timeoutMs: 1000 },
    );
    expect(r.status).toBe('pass');
    expect(r.message).toContain('postgresql://ririko:****@db.internal:5432/ririko');
    expect(r.message).toContain('4ms');
    noSecret(r, 's3cretPassw0rd');
    expect(create).toHaveBeenCalledWith({
      dialect: 'postgres',
      url: URL_WITH_PASSWORD,
      connectionTimeoutMs: 1000,
    });
    expect(c.close).toHaveBeenCalledTimes(1);
  });

  it('fails with guide step 3 when the ping fails, and still closes', async () => {
    const c = client({ ok: false, latencyMs: 0, error: 'password authentication failed' });
    const r = await checkDatabase(
      { dialect: 'postgres', url: URL_WITH_PASSWORD },
      { createDatabaseClient: async () => c },
    );
    expect(r.status).toBe('fail');
    expect(r.message).toContain('password authentication failed');
    expect(r.guideStep).toEqual({ guide: 'postgres', step: 3 });
    expect(c.close).toHaveBeenCalledTimes(1);
  });

  it('fails without a ping error text', async () => {
    const c = client({ ok: false, latencyMs: 0 });
    const r = await checkDatabase(
      { dialect: 'postgres', url: URL_WITH_PASSWORD },
      { createDatabaseClient: async () => c },
    );
    expect(r.message).toContain('unknown error');
  });

  it('redacts the password and the URL from a connection error', async () => {
    const r = await checkDatabase(
      { dialect: 'postgres', url: URL_WITH_PASSWORD },
      {
        createDatabaseClient: async () => {
          throw new Error(`connect ECONNREFUSED ${URL_WITH_PASSWORD} s3cretPassw0rd`);
        },
      },
    );
    expect(r.status).toBe('fail');
    noSecret(r, 's3cretPassw0rd', URL_WITH_PASSWORD);
  });

  it('survives a close that rejects and a URL with an encoded password', async () => {
    const c = {
      close: vi.fn(async () => Promise.reject(new Error('x'))),
      ping: async () => ({ ok: true, latencyMs: 1 }),
    };
    const r = await checkDatabase(
      { dialect: 'postgres', url: 'postgresql://u:p%40ss%25word1@h/db' },
      { createDatabaseClient: async () => c },
    );
    expect(r.status).toBe('pass');
  });

  it('survives a malformed encoded password', async () => {
    const r = await checkDatabase(
      { dialect: 'postgres', url: 'postgresql://u:%E0%A4%A@h/db' },
      {
        createDatabaseClient: async () => {
          throw new Error('nope');
        },
      },
    );
    expect(r.status).toBe('fail');
  });
});

describe('AI provider checks', () => {
  const healthy = (extra: Partial<HealthLike> = {}): HealthLike => ({
    healthy: true,
    latencyMs: 12,
    ...extra,
  });

  it('Gemini: passes, fails with the provider error, and never throws', async () => {
    const ok = await checkGemini('gemini-key-0123456789', {
      aiProviders: { gemini: () => ({ checkHealth: async () => healthy() }) },
    });
    expect(ok).toMatchObject({ status: 'pass', detail: { latencyMs: 12 } });

    const bad = await checkGemini('gemini-key-0123456789', {
      aiProviders: {
        gemini: () => ({
          checkHealth: async () => ({ healthy: false, error: 'bad key gemini-key-0123456789' }),
        }),
      },
    });
    expect(bad.status).toBe('fail');
    expect(bad.guideStep).toEqual({ guide: 'gemini', step: 4 });
    noSecret(bad, 'gemini-key-0123456789');
    expect(bad.detail?.error).not.toContain('gemini-key-0123456789');

    const boom = await checkGemini('gemini-key-0123456789', {
      aiProviders: {
        gemini: () => ({
          checkHealth: async () => {
            throw new Error('network gemini-key-0123456789');
          },
        }),
      },
    });
    expect(boom.status).toBe('fail');
    expect(boom.detail?.thrown).toBe(true);
    noSecret(boom, 'gemini-key-0123456789');
  });

  it('Gemini: a failed health check without an error text still fails', async () => {
    const r = await checkGemini('gemini-key-0123456789', {
      aiProviders: { gemini: () => ({ checkHealth: async () => ({ healthy: false }) }) },
    });
    expect(r.message).toContain('no answer');
    expect(r.detail?.error).toBeUndefined();
  });

  it('OpenAI: passes the base URL to the provider, and treats an empty one as unset', async () => {
    const seen: unknown[] = [];
    const deps: CheckDeps = {
      aiProviders: {
        openai: (options) => {
          seen.push(options);
          return { checkHealth: async () => healthy() };
        },
      },
    };
    expect(
      (
        await checkOpenAi(
          { apiKey: 'sk-key-0123456789', baseUrl: 'https://openrouter.ai/api/v1' },
          deps,
        )
      ).status,
    ).toBe('pass');
    expect((await checkOpenAi({ apiKey: 'sk-key-0123456789', baseUrl: '' }, deps)).status).toBe(
      'pass',
    );
    expect(seen).toEqual([
      { apiKey: 'sk-key-0123456789', baseURL: 'https://openrouter.ai/api/v1' },
      { apiKey: 'sk-key-0123456789', baseURL: undefined },
    ]);
    const bad = await checkOpenAi(
      { apiKey: 'sk-key-0123456789' },
      {
        aiProviders: {
          openai: () => ({
            checkHealth: async () => ({ healthy: false, error: 'quota sk-key-0123456789' }),
          }),
        },
      },
    );
    expect(bad.status).toBe('fail');
    expect(bad.guideStep).toEqual({ guide: 'openai', step: 3 });
    noSecret(bad, 'sk-key-0123456789');
  });

  it('Ollama: lists models, fails when unreachable, and never throws', async () => {
    const ok = await checkOllama('http://localhost:11434', {
      aiProviders: {
        ollama: (o) => {
          expect(o).toEqual({ baseURL: 'http://localhost:11434' });
          return { checkHealth: async () => healthy({ models: ['llama3.3'] }) };
        },
      },
    });
    expect(ok).toMatchObject({ status: 'pass', detail: { models: ['llama3.3'] } });

    const down = await checkOllama('http://x:1', {
      aiProviders: {
        ollama: () => ({ checkHealth: async () => ({ healthy: false, error: 'ECONNREFUSED' }) }),
      },
    });
    expect(down.status).toBe('fail');
    expect(down.guideStep).toEqual({ guide: 'ollama', step: 3 });

    const boom = await checkOllama('http://x:1', {
      aiProviders: {
        ollama: () => ({
          checkHealth: async () => {
            throw new Error('refused');
          },
        }),
      },
    });
    expect(boom.detail).toMatchObject({ thrown: true, error: 'refused' });
  });
});

describe('checkComfyUi', () => {
  it('passes when /system_stats answers 2xx (trailing slashes removed)', async () => {
    const net = fakeFetch(() => json({}));
    const r = await checkComfyUi('http://127.0.0.1:8188///', { fetch: net.fetch });
    expect(r.status).toBe('pass');
    expect(net.calls.map((c) => c.url)).toEqual(['http://127.0.0.1:8188/system_stats']);
    expect(r.detail).toMatchObject({ reachable: true, httpStatus: 200 });
  });

  it('warns when something other than ComfyUI answers below 500', async () => {
    const r = await checkComfyUi('http://sd:7860', { fetch: fakeFetch(() => json({}, 404)).fetch });
    expect(r.status).toBe('warn');
    expect(r.detail?.httpStatus).toBe(404);
  });

  it('falls back to the server root when /system_stats cannot connect', async () => {
    const net = fakeFetch((url) => {
      if (url.endsWith('/system_stats')) throw new Error('stats missing');
      return json({}, 200);
    });
    const r = await checkComfyUi('http://sd:7860', { fetch: net.fetch });
    expect(net.calls.map((c) => c.url)).toEqual(['http://sd:7860/system_stats', 'http://sd:7860']);
    expect(r.status).toBe('warn');
  });

  it('fails on a 5xx answer', async () => {
    const r = await checkComfyUi('http://sd:7860', { fetch: fakeFetch(() => json({}, 503)).fetch });
    expect(r.status).toBe('fail');
    expect(r.detail).toMatchObject({ reachable: true, httpStatus: 503 });
  });

  it('fails when nothing answers (both requests rejected)', async () => {
    const net = fakeFetch(() => {
      throw new Error('ECONNREFUSED');
    });
    const r = await checkComfyUi('http://sd:7860', { fetch: net.fetch });
    expect(r.status).toBe('fail');
    expect(net.calls).toHaveLength(2);
    expect(r.detail?.reachable).toBe(false);
    expect(r.guideStep).toEqual({ guide: 'comfyui', step: 2 });
  });

  it('uses the global fetch at call time when none is injected', async () => {
    const stub = vi.fn(async () => json({}));
    vi.stubGlobal('fetch', stub);
    try {
      const r = await checkComfyUi('http://sd:1');
      expect(r.status).toBe('pass');
      expect(stub).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('checkReplicate', () => {
  const REPLICATE = 'r8_abcdefghijklmnopqrstuvwxyz';

  it('calls /account with the bearer token and passes on 200', async () => {
    const net = fakeFetch(() => json({ username: 'ririko' }));
    const r = await checkReplicate(REPLICATE, { fetch: net.fetch });
    expect(r.status).toBe('pass');
    expect(net.calls[0]?.url).toBe('https://api.replicate.com/v1/account');
    expect((net.calls[0]?.init?.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${REPLICATE}`,
    );
  });

  it('fails on 401, on another status, and on a network error', async () => {
    const unauthorized = await checkReplicate(REPLICATE, {
      fetch: fakeFetch(() => json({}, 401)).fetch,
      replicateApiBase: 'http://localhost:1/v1/',
    });
    expect(unauthorized.status).toBe('fail');
    expect(unauthorized.message).toContain('rejected');
    expect(unauthorized.guideStep).toEqual({ guide: 'replicate', step: 2 });

    expect(
      (await checkReplicate(REPLICATE, { fetch: fakeFetch(() => json({}, 502)).fetch })).message,
    ).toContain('HTTP 502');

    const boom = await checkReplicate(REPLICATE, {
      fetch: fakeFetch(() => {
        throw new Error(`down ${REPLICATE}`);
      }).fetch,
    });
    expect(boom.status).toBe('fail');
    noSecret(boom, REPLICATE);
  });
});

describe('checkLavalink', () => {
  const PASSWORD = 'lavalink-password-value-123';
  const values = { host: '192.0.2.10', port: '2333', password: PASSWORD, secure: false };
  const text = (body: string, status = 200): Response => new Response(body, { status });

  it('asks /version with the password in the Authorization header and passes', async () => {
    const net = fakeFetch(() => text('4.0.8'));
    const r = await checkLavalink(values, { fetch: net.fetch });
    expect(r.status).toBe('pass');
    expect(r.message).toContain('4.0.8');
    expect(net.calls[0]?.url).toBe('http://192.0.2.10:2333/version');
    expect((net.calls[0]?.init?.headers as Record<string, string>).Authorization).toBe(PASSWORD);
    noSecret(r, PASSWORD);
  });

  it('uses https for a secure connection and brackets an IPv6 address', async () => {
    const net = fakeFetch(() => text('4.0.8'));
    await checkLavalink({ ...values, host: '2001:db8::1', secure: true }, { fetch: net.fetch });
    expect(net.calls[0]?.url).toBe('https://[2001:db8::1]:2333/version');
  });

  it('names a wrong password and points at the password step of the guide', async () => {
    for (const status of [401, 403]) {
      const r = await checkLavalink(values, { fetch: fakeFetch(() => text('', status)).fetch });
      expect(r.status).toBe('fail');
      expect(r.message).toContain('refused the password');
      expect(r.guideStep).toEqual({ guide: 'lavalink', step: 3 });
      expect(r.detail?.httpStatus).toBe(status);
      noSecret(r, PASSWORD);
    }
  });

  it('says nothing answered when the connection fails, without the password', async () => {
    const r = await checkLavalink(values, {
      fetch: fakeFetch(() => {
        throw new Error(`connect ECONNREFUSED 192.0.2.10:2333 ${PASSWORD}`);
      }).fetch,
    });
    expect(r.status).toBe('fail');
    expect(r.message).toContain('Nothing answered at 192.0.2.10:2333');
    expect(r.guideStep).toEqual({ guide: 'lavalink', step: 2 });
    expect(r.detail?.reachable).toBe(false);
    expect(r.detail?.error).not.toContain(PASSWORD);
    noSecret(r, PASSWORD);
  });

  it('fails on another status and on an address that is not usable', async () => {
    const other = await checkLavalink(values, { fetch: fakeFetch(() => text('', 500)).fetch });
    expect(other.status).toBe('fail');
    expect(other.message).toContain('HTTP 500');
    expect(other.guideStep).toEqual({ guide: 'lavalink', step: 1 });
    const net = fakeFetch(() => text('4.0.8'));
    const bad = await checkLavalink({ ...values, host: 'a b' }, { fetch: net.fetch });
    expect(bad.status).toBe('fail');
    expect(bad.message).toContain('not a usable address');
    expect(net.calls).toHaveLength(0);
  });

  it('gives up after the timeout', async () => {
    const hang = (_url: string, init: RequestInit | undefined) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const r = await checkLavalink(values, { fetch: fakeFetch(hang).fetch, timeoutMs: 20 });
    expect(r.status).toBe('fail');
    expect(r.message).toContain('did not answer within');
    expect(r.guideStep).toEqual({ guide: 'lavalink', step: 2 });
  });
});

describe('checkTwitch', () => {
  const values = { clientId: 'twitchclientid123', clientSecret: 'twitchclientsecret123456' };

  it('requests an app access token and passes', async () => {
    const net = fakeFetch(() => json({ access_token: 'abc', expires_in: 100 }));
    const r = await checkTwitch(values, { fetch: net.fetch });
    expect(r.status).toBe('pass');
    expect(net.calls[0]?.url).toBe('https://id.twitch.tv/oauth2/token');
    expect(String(net.calls[0]?.init?.body)).toContain('grant_type=client_credentials');
    noSecret(r, values.clientSecret);
  });

  it('fails when Twitch rejects the credentials', async () => {
    for (const status of [400, 401, 403]) {
      const r = await checkTwitch(values, { fetch: fakeFetch(() => json({}, status)).fetch });
      expect(r.status).toBe('fail');
      expect(r.message).toContain('Client ID');
      expect(r.guideStep).toEqual({ guide: 'twitch', step: 4 });
    }
  });

  it('fails on another status, a missing token, and a network error', async () => {
    expect(
      (await checkTwitch(values, { fetch: fakeFetch(() => json({}, 500)).fetch })).message,
    ).toContain('HTTP 500');
    expect(
      (await checkTwitch(values, { fetch: fakeFetch(() => json({})).fetch })).message,
    ).toContain('without an access token');
    expect(
      (await checkTwitch(values, { fetch: fakeFetch(() => new Response('not json')).fetch }))
        .status,
    ).toBe('fail');
    const boom = await checkTwitch(values, {
      fetch: fakeFetch(() => {
        throw new Error(`dns ${values.clientSecret}`);
      }).fetch,
      twitchTokenUrl: 'http://localhost:1/token',
    });
    noSecret(boom, values.clientSecret);
  });
});

describe('checkYouTube', () => {
  const KEY = 'AIzaSyFakeYouTubeKey0123456789abc';

  it('makes one Data API call with the key and passes on 200', async () => {
    const net = fakeFetch(() => json({ items: [] }));
    const r = await checkYouTube(KEY, { fetch: net.fetch });
    expect(r.status).toBe('pass');
    expect(net.calls).toHaveLength(1);
    expect(net.calls[0]?.url).toContain('https://www.googleapis.com/youtube/v3/channels?');
    expect(net.calls[0]?.url).toContain('forHandle=%40YouTube');
    noSecret(r, KEY);
  });

  it('distinguishes a rejected key (400) from a disabled API or quota (403)', async () => {
    const rejected = await checkYouTube(KEY, { fetch: fakeFetch(() => json({}, 400)).fetch });
    expect(rejected.message).toContain('rejected the API key');
    expect(rejected.guideStep).toEqual({ guide: 'youtube', step: 4 });
    const forbidden = await checkYouTube(KEY, {
      fetch: fakeFetch(() => json({}, 403)).fetch,
      youtubeApiBase: 'http://localhost:1/v3/',
    });
    expect(forbidden.message).toContain('Data API v3');
    expect(forbidden.guideStep).toEqual({ guide: 'youtube', step: 2 });
  });

  it('fails on another status and redacts the key from a network error', async () => {
    expect(
      (await checkYouTube(KEY, { fetch: fakeFetch(() => json({}, 500)).fetch })).message,
    ).toContain('HTTP 500');
    const boom = await checkYouTube(KEY, {
      fetch: fakeFetch((url) => {
        throw new Error(`failed to fetch ${url}`);
      }).fetch,
    });
    expect(boom.status).toBe('fail');
    noSecret(boom, KEY);
  });
});

describe('checkSpotify', () => {
  const values = { clientId: 'spotifyclientid', clientSecret: 'spotifyclientsecret123456' };

  it('passes with a token and sends Basic auth', async () => {
    const net = fakeFetch(() => json({ access_token: 'x' }));
    const r = await checkSpotify(values, { fetch: net.fetch });
    expect(r.status).toBe('pass');
    expect((net.calls[0]?.init?.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from(`${values.clientId}:${values.clientSecret}`).toString('base64')}`,
    );
  });

  it('fails on rejected credentials, other statuses and network errors', async () => {
    const rejected = await checkSpotify(values, {
      fetch: fakeFetch(() => json({ error: 'invalid_client' }, 400)).fetch,
      spotifyTokenUrl: 'http://localhost:1/token',
    });
    expect(rejected.guideStep).toEqual({ guide: 'spotify', step: 4 });
    expect(
      (await checkSpotify(values, { fetch: fakeFetch(() => json({}, 500)).fetch })).message,
    ).toContain('HTTP 500');
    const boom = await checkSpotify(values, {
      fetch: fakeFetch(() => {
        throw new Error(`x ${values.clientSecret}`);
      }).fetch,
    });
    noSecret(boom, values.clientSecret);
  });
});
