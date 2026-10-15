import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckResult } from './checks.js';
import { startInstallerServer, type InstallerServer, type InstallerServerDeps } from './server.js';
import type { CheckId, Profile } from './steps.js';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const CLIENT_ID = '123456789012345678';
const TOKEN = 'MTIzNDU2Nzg5MDEyMzQ1Njc4.Gabcde.secret-bot-token-value-1234567890';

interface Response {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

interface Started {
  server: InstallerServer;
  root: string;
  runCheck: ReturnType<typeof vi.fn>;
  startPath: string;
  cookie: string;
  csrf: string;
}

const roots: string[] = [];
const servers: InstallerServer[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ririko-wizard-'));
  roots.push(root);
  mkdirSync(join(root, 'docs'), { recursive: true });
  cpSync(join(REPO_ROOT, 'assets', 'installer'), join(root, 'assets', 'installer'), {
    recursive: true,
  });
  cpSync(join(REPO_ROOT, 'docs', 'legal'), join(root, 'docs', 'legal'), { recursive: true });
  for (const name of ['.env.example', '.env.production.example']) {
    cpSync(join(REPO_ROOT, name), join(root, name));
  }
  return root;
}

function send(
  server: InstallerServer,
  options: {
    method?: string;
    path: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: server.port,
        method: options.method ?? 'GET',
        path: options.path,
        headers: { Host: `127.0.0.1:${server.port}`, ...options.headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf-8'),
          }),
        );
      },
    );
    req.on('error', reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

const PASS: CheckResult = { status: 'pass', message: 'Checked.' };

async function start(
  overrides: {
    profile?: Profile;
    root?: string;
    envFile?: string;
    deps?: InstallerServerDeps;
    port?: number;
    login?: boolean;
  } = {},
): Promise<Started> {
  const root = overrides.root ?? makeRoot();
  const runCheck = vi.fn(async (_id: CheckId): Promise<CheckResult> => PASS);
  const server = await startInstallerServer(
    {
      profile: overrides.profile ?? 'source',
      root,
      ...(overrides.envFile ? { envFile: overrides.envFile } : {}),
      port: overrides.port ?? 0,
    },
    {
      runCheck,
      generate: { hex: (bytes) => 'ab'.repeat(bytes) },
      now: () => new Date('2026-10-14T10:00:00Z'),
      finishGraceMs: 0,
      ...overrides.deps,
    },
  );
  servers.push(server);
  const startPath = new URL(server.url).pathname + new URL(server.url).search;
  let cookie = '';
  let csrf = '';
  if (overrides.login !== false) {
    const first = await send(server, { path: startPath });
    cookie = String(first.headers['set-cookie']).split(';')[0] ?? '';
    const page = await send(server, { path: '/step/welcome', headers: { Cookie: cookie } });
    csrf = /name="_csrf" value="([^"]+)"/.exec(page.body)?.[1] ?? '';
  }
  return { server, root, runCheck, startPath, cookie, csrf };
}

function get(s: Started, path: string, headers: Record<string, string> = {}): Promise<Response> {
  return send(s.server, { path, headers: { Cookie: s.cookie, ...headers } });
}

function post(
  s: Started,
  path: string,
  fields: Record<string, string>,
  headers: Record<string, string> = {},
): Promise<Response> {
  const body = new URLSearchParams({ _csrf: s.csrf, ...fields }).toString();
  return send(s.server, {
    method: 'POST',
    path,
    headers: {
      Cookie: s.cookie,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...headers,
    },
    body,
  });
}

const DISCORD_FIELDS = {
  DISCORD_CLIENT_ID: CLIENT_ID,
  DISCORD_TOKEN: TOKEN,
  action: 'next',
};

/** Walks a source install with every feature off to the Install page. */
async function reachInstall(s: Started): Promise<void> {
  expect((await post(s, '/step/welcome', { action: 'next' })).status).toBe(303);
  expect((await post(s, '/step/discord', DISCORD_FIELDS)).status).toBe(303);
  expect((await post(s, '/step/ai', { action: 'next' })).status).toBe(303);
  expect((await post(s, '/step/streams', { action: 'next' })).status).toBe(303);
  expect(
    (await post(s, '/step/database', { DATABASE_DIALECT: 'sqlite', action: 'next' })).status,
  ).toBe(303);
  expect((await post(s, '/step/dashboard', { action: 'next' })).status).toBe(303);
}

const ACCEPT = { accept_tos: 'true', accept_privacypolicy: 'true' };

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('start', () => {
  it('listens on the loopback address and returns a start URL with a token', async () => {
    const s = await start({ login: false });
    const url = new URL(s.server.url);
    expect(url.hostname).toBe('127.0.0.1');
    expect(url.searchParams.get('token')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(s.server.envFile).toBe(join(s.root, '.env'));
  });

  it('names --port when the port is in use and never picks another one', async () => {
    const first = await start({ login: false });
    await expect(
      startInstallerServer({ profile: 'source', root: first.root, port: first.server.port }),
    ).rejects.toThrow(/already in use.*--port/);
  });

  it('refuses a settings file that is not the profile file of the root', async () => {
    const root = makeRoot();
    await expect(
      startInstallerServer({ profile: 'source', root, envFile: join(root, 'other.env'), port: 0 }),
    ).rejects.toThrow(/must be/);
  });

  it('refuses an envFile with the wrong name for the profile, in any folder', async () => {
    const root = makeRoot();
    const dir = mkdtempSync(join(tmpdir(), 'ririko-settings-'));
    roots.push(dir);
    for (const [profile, name] of [
      ['source', '.env.production'],
      ['docker', '.env'],
      ['source', 'settings.txt'],
      ['docker', '.env.production.bak'],
    ] as const) {
      await expect(
        startInstallerServer({ profile, root, envFile: join(dir, name), port: 0 }),
      ).rejects.toThrow(/must be named/);
    }
  });

  it('reads the assets from the root and writes only the profile file in the chosen folder', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ririko-settings-'));
    roots.push(dir);
    const s = await start({ envFile: join(dir, '.env') });
    expect(s.server.envFile).toBe(join(dir, '.env'));
    await reachInstall(s);
    const res = await post(s, '/finish', ACCEPT);
    expect(res.status).toBe(200);
    expect(readFileSync(join(dir, '.env'), 'utf-8')).toContain(`DISCORD_TOKEN=${TOKEN}`);
    expect(readdirSync(dir)).toEqual(['.env']);
    expect(existsSync(join(s.root, '.env'))).toBe(false);
    await s.server.stopped;
  });

  it('accepts the profile file as envFile', async () => {
    const root = makeRoot();
    const server = await startInstallerServer(
      { profile: 'source', root, envFile: join(root, '.env'), port: 0 },
      { runCheck: async () => PASS },
    );
    servers.push(server);
    expect(server.envFile).toBe(join(root, '.env'));
  });
});

describe('access', () => {
  it('answers 403 to every request without the cookie', async () => {
    const s = await start({ login: false });
    for (const path of ['/', '/step/welcome', '/assets/wizard.css', '/legal/terms', '/download']) {
      expect((await send(s.server, { path })).status, path).toBe(403);
    }
    const posted = await send(s.server, {
      method: 'POST',
      path: '/step/welcome',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'action=next',
    });
    expect(posted.status).toBe(403);
  });

  it('exchanges the token once for an HttpOnly SameSite=Strict cookie and redirects without it', async () => {
    const s = await start({ login: false });
    const wrong = await send(s.server, { path: '/?token=nope' });
    expect(wrong.status).toBe(403);

    const first = await send(s.server, { path: s.startPath });
    expect(first.status).toBe(302);
    expect(first.headers.location).toBe('/step/welcome');
    const cookie = String(first.headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);

    const again = await send(s.server, { path: s.startPath });
    expect(again.status).toBe(403);

    const page = await send(s.server, {
      path: '/step/welcome',
      headers: { Cookie: cookie.split(';')[0] ?? '' },
    });
    expect(page.status).toBe(200);
  });

  it('refuses a cookie value it did not issue', async () => {
    const s = await start();
    const res = await send(s.server, {
      path: '/step/welcome',
      headers: { Cookie: 'ririko_setup=forged' },
    });
    expect(res.status).toBe(403);
  });

  it('refuses a foreign Host header (DNS rebinding) and accepts localhost with the port', async () => {
    const s = await start();
    expect((await get(s, '/step/welcome', { Host: 'evil.example:3999' })).status).toBe(403);
    expect((await get(s, '/step/welcome', { Host: `evil.example:${s.server.port}` })).status).toBe(
      403,
    );
    expect((await get(s, '/step/welcome', { Host: 'localhost' })).status).toBe(403);
    expect((await get(s, '/step/welcome', { Host: `localhost:${s.server.port}` })).status).toBe(
      200,
    );
    expect((await get(s, '/step/welcome', { Host: `[::1]:${s.server.port}` })).status).toBe(200);
  });

  it('refuses a foreign Origin', async () => {
    const s = await start();
    expect((await get(s, '/step/welcome', { Origin: 'https://evil.example' })).status).toBe(403);
    expect((await get(s, '/step/welcome', { Origin: 'null' })).status).toBe(403);
    expect(
      (
        await get(s, '/step/welcome', {
          Origin: `http://127.0.0.1:${s.server.port}`,
        })
      ).status,
    ).toBe(200);
    const posted = await post(s, '/step/discord', DISCORD_FIELDS, {
      Origin: 'https://evil.example',
    });
    expect(posted.status).toBe(403);
  });

  it('refuses a POST without the form token or with a wrong one', async () => {
    const s = await start();
    const missing = await send(s.server, {
      method: 'POST',
      path: '/step/welcome',
      headers: { Cookie: s.cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'action=next',
    });
    expect(missing.status).toBe(403);
    s.csrf = 'wrong';
    expect((await post(s, '/step/welcome', { action: 'next' })).status).toBe(403);
  });

  it('refuses other content types, other methods and oversized bodies', async () => {
    const s = await start();
    const json = await send(s.server, {
      method: 'POST',
      path: '/step/welcome',
      headers: { Cookie: s.cookie, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(json.status).toBe(415);
    const put = await send(s.server, {
      method: 'PUT',
      path: '/step/welcome',
      headers: { Cookie: s.cookie },
    });
    expect(put.status).toBe(405);
    const big = await send(s.server, {
      method: 'POST',
      path: '/step/welcome',
      headers: { Cookie: s.cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `x=${'a'.repeat(300 * 1024)}`,
    });
    expect(big.status).toBe(413);
  });

  it('sends the security headers on every response', async () => {
    const s = await start();
    for (const res of [await get(s, '/step/welcome'), await send(s.server, { path: '/' })]) {
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['referrer-policy']).toBe('same-origin');
    }
  });

  it('lets a browser POST: the served referrer policy makes it send a matching Origin', async () => {
    const s = await start();
    const page = await get(s, '/step/welcome');
    const policy = String(page.headers['referrer-policy']);
    // With no-referrer a browser sends "Origin: null" on a form POST and the wizard refuses it.
    expect(policy).not.toBe('no-referrer');
    expect(page.body).not.toContain('content="no-referrer"');
    // Fetch spec: same-origin (or looser) keeps the real origin on a same-origin POST.
    const origin = policy === 'same-origin' ? `http://127.0.0.1:${s.server.port}` : 'null';
    const posted = await post(s, '/step/welcome', { action: 'next' }, { Origin: origin });
    expect(posted.status).toBe(303);
    expect((await post(s, '/step/welcome', { action: 'next' }, { Origin: 'null' })).status).toBe(
      403,
    );
  });

  it('answers 404 to unknown paths and pages', async () => {
    const s = await start();
    expect((await get(s, '/nothing')).status).toBe(404);
    expect((await get(s, '/step/unknown')).status).toBe(404);
    expect((await get(s, '/')).status).toBe(303);
  });
});

describe('pages', () => {
  it('renders the welcome page with the file, the profile and no script', async () => {
    const s = await start();
    const res = await get(s, '/step/welcome');
    expect(res.status).toBe(200);
    expect(res.body).toContain('From source');
    expect(res.body).toContain(join(s.root, '.env').replace(/&/g, '&amp;'));
    expect(res.body).toContain('does not exist yet');
    expect(res.body).not.toMatch(/<script/i);
    expect(res.body).not.toMatch(/https?:\/\/(?!discord\.com)[^"'\s]*\.(js|css)/);
    expect(res.body).toContain('href="/assets/wizard.css"');
  });

  it('refuses a later page by URL until the earlier pages pass', async () => {
    const s = await start();
    for (const id of ['ai', 'streams', 'database', 'dashboard', 'install']) {
      const res = await get(s, `/step/${id}`);
      expect(res.status, id).toBe(303);
      expect(res.headers.location, id).toBe('/step/discord');
    }
    expect((await post(s, '/step/install', { action: 'next' })).headers.location).toBe(
      '/step/discord',
    );
    expect((await post(s, '/finish', ACCEPT)).headers.location).toBe('/step/discord');
    expect((await post(s, '/download', ACCEPT)).headers.location).toBe('/step/discord');
  });

  it('shows validation errors next to the field and does not run the checks', async () => {
    const s = await start();
    await post(s, '/step/welcome', { action: 'next' });
    const res = await post(s, '/step/discord', { DISCORD_CLIENT_ID: 'abc', action: 'next' });
    expect(res.status).toBe(422);
    expect(res.body).toContain('Application ID must be a Discord ID');
    expect(res.body).toContain('Bot token is required');
    expect(res.body).toContain('aria-invalid="true"');
    expect(s.runCheck).not.toHaveBeenCalled();
  });

  it('shows a failed check at its field with the guide step to read, and opens the guide', async () => {
    const s = await start();
    s.runCheck.mockResolvedValue({
      status: 'fail',
      message: 'Discord rejected the bot token.',
      guideStep: { guide: 'discord', step: 4 },
    });
    const res = await post(s, '/step/discord', DISCORD_FIELDS);
    expect(res.status).toBe(422);
    expect(res.body).toContain('Discord rejected the bot token.');
    expect(res.body).toContain('href="#guide-discord-step-4"');
    expect(res.body).toContain('id="guide-discord-step-4"');
    expect(res.body).toMatch(/<details class="guide" id="guide-discord" open>/);
    // The same page is not completed, so the next page is still closed.
    expect((await get(s, '/step/ai')).status).toBe(303);
  });

  it('runs a check again only after its values change', async () => {
    const s = await start();
    await post(s, '/step/discord', DISCORD_FIELDS);
    expect(s.runCheck).toHaveBeenCalledTimes(1);
    await post(s, '/step/discord', DISCORD_FIELDS);
    expect(s.runCheck).toHaveBeenCalledTimes(1);

    // A new token: the old result no longer counts, so later pages close again.
    s.runCheck.mockResolvedValue({ status: 'fail', message: 'Rejected.' });
    const changed = await post(s, '/step/discord', {
      ...DISCORD_FIELDS,
      DISCORD_TOKEN: `${TOKEN}-changed`,
      action: 'verify',
    });
    expect(changed.status).toBe(422);
    expect(s.runCheck).toHaveBeenCalledTimes(2);
    expect((await get(s, '/step/ai')).headers.location).toBe('/step/discord');
  });

  it('requires a new check when a value changes even if the new value is only saved', async () => {
    const s = await start();
    await post(s, '/step/discord', DISCORD_FIELDS);
    await post(s, '/step/discord', {
      ...DISCORD_FIELDS,
      DISCORD_CLIENT_ID: '223456789012345678',
      action: 'back',
    });
    expect((await get(s, '/step/ai')).headers.location).toBe('/step/discord');
  });

  it('keeps the answers when going back and never puts a secret into the page', async () => {
    const s = await start();
    await post(s, '/step/discord', DISCORD_FIELDS);
    const back = await post(s, '/step/ai', { action: 'back' });
    expect(back.headers.location).toBe('/step/discord');
    const page = await get(s, '/step/discord');
    expect(page.body).toContain(`value="${CLIENT_ID}"`);
    expect(page.body).not.toContain(TOKEN);
    expect(page.body).toContain('Leave this empty to keep the current value.');

    // An empty secret keeps the stored one; the check result stays valid.
    const again = await post(s, '/step/discord', {
      DISCORD_CLIENT_ID: CLIENT_ID,
      DISCORD_TOKEN: '',
      action: 'next',
    });
    expect(again.status).toBe(303);
    expect(s.runCheck).toHaveBeenCalledTimes(1);
  });

  it('shows the check results and runs the checks on "Test the connection"', async () => {
    const s = await start();
    const res = await post(s, '/step/discord', { ...DISCORD_FIELDS, action: 'verify' });
    expect(res.status).toBe(200);
    expect(res.body).toContain('class="check pass"');
    expect(res.body).toContain('Checked.');
    expect(res.body).not.toContain(TOKEN);
  });

  it('treats a throwing check as a failed check', async () => {
    const s = await start();
    s.runCheck.mockRejectedValue(new Error('boom'));
    const res = await post(s, '/step/discord', DISCORD_FIELDS);
    expect(res.status).toBe(422);
    expect(res.body).toContain('The check could not run.');
  });

  it('runs a feature check only while its switch is on and requires its fields', async () => {
    const s = await start();
    await post(s, '/step/discord', DISCORD_FIELDS);
    s.runCheck.mockClear();

    const missing = await post(s, '/step/ai', {
      'switch_ai-chat': 'on',
      DEFAULT_AI_PROVIDER: 'gemini',
      action: 'next',
    });
    expect(missing.status).toBe(422);
    expect(missing.body).toContain('Gemini API key (shared by chat and images) is required.');
    expect(s.runCheck).not.toHaveBeenCalled();

    const ok = await post(s, '/step/ai', {
      'switch_ai-chat': 'on',
      DEFAULT_AI_PROVIDER: 'gemini',
      GEMINI_API_KEY__chat: 'gemini-key-value-123456',
      action: 'next',
    });
    expect(ok.status).toBe(303);
    expect(s.runCheck.mock.calls.map((call) => call[0])).toEqual(['ai-provider']);
  });

  it('serves the conditional stylesheet generated from the page model', async () => {
    const s = await start();
    const css = await get(s, '/assets/conditions.css');
    expect(css.status).toBe(200);
    expect(css.headers['content-type']).toContain('text/css');
    expect(css.body).toContain('[data-gate] { display: none; }');
    expect(css.body).toContain('input[name="switch_ai-chat"]:checked');
    expect(css.body).toContain('[data-field="GEMINI_API_KEY__chat"]');
    expect(css.body).toContain('[data-field="GEMINI_API_KEY__images"]');
  });

  it('escapes every value it puts into the page', async () => {
    const s = await start();
    const evil = '"><script>alert(1)</script>';
    const res = await post(s, '/step/discord', {
      DISCORD_CLIENT_ID: evil,
      BOT_OWNER_ID: evil,
      action: 'next',
    });
    expect(res.status).toBe(422);
    expect(res.body).not.toContain('<script>alert(1)</script>');
    expect(res.body).toContain('value="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"');
  });

  it('shows the docker profile with an always-on dashboard switch', async () => {
    const s = await start({ profile: 'docker' });
    const welcome = await get(s, '/step/welcome');
    expect(welcome.body).toContain('Docker');
    expect(s.server.envFile).toBe(join(s.root, '.env.production'));
    await post(s, '/step/discord', DISCORD_FIELDS);
    await post(s, '/step/ai', { action: 'next' });
    await post(s, '/step/streams', { action: 'next' });
    const database = await get(s, '/step/database');
    expect(database.body).not.toContain('name="DATABASE_DIALECT"');
    await post(s, '/step/database', { action: 'next' });
    const dashboard = await get(s, '/step/dashboard');
    expect(dashboard.body).toContain('name="switch_dashboard" value="on" checked');
    expect(dashboard.body).not.toContain('Enable the web dashboard');
  });
});

describe('assets and legal texts', () => {
  it('serves the stylesheet and the guide images from assets/installer', async () => {
    const s = await start();
    const css = await get(s, '/assets/wizard.css');
    expect(css.status).toBe(200);
    expect(css.headers['content-type']).toContain('text/css');
    expect(css.body).toContain('--color-sakura-strong');
    const image = await get(s, '/assets/images/twitch-step1.png');
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');
  });

  it('serves the self-hosted Karla font with its license, and no stylesheet uses another host', async () => {
    const s = await start();
    const css = await get(s, '/assets/wizard.css');
    expect(css.body).toContain("font-family: 'Karla'");
    expect(css.body).not.toMatch(/https?:\/\//);
    // Six tabs must fit: the width limit is a sixth, not the fifth of the 1.x installer.
    expect(css.body).toContain('max-width: calc(100% / 6 - 6px)');
    expect(css.body).not.toContain('calc(20% - 6px)');
    for (const file of ['karla-latin.woff2', 'karla-latin-ext.woff2']) {
      expect(css.body).toContain(`/assets/fonts/${file}`);
      const font = await get(s, `/assets/fonts/${file}`);
      expect(font.status, file).toBe(200);
      expect(font.headers['content-type']).toBe('font/woff2');
    }
    const license = await get(s, '/assets/fonts/OFL.txt');
    expect(license.status).toBe(200);
    expect(license.body).toContain('SIL Open Font License');
    expect((await get(s, '/assets/fonts/missing.woff2')).status).toBe(404);
    expect((await get(s, '/')).headers['content-security-policy']).not.toContain('font-src *');
  });

  it('lays the step tabs in a left column from 1024px and keeps the icon row below', async () => {
    const s = await start();
    const css = (await get(s, '/assets/wizard.css')).body;
    const wide = css.slice(css.indexOf('@media (min-width: 1024px)'));
    expect(wide).toContain('grid-template-columns: 240px minmax(0, 1fr)');
    // One tab per row; the title stays on one line and is never broken inside a word.
    expect(wide).toContain('display: block;');
    expect(wide).toContain('white-space: nowrap');
    expect(wide).toContain('overflow-wrap: normal');
    expect(css).toContain('@media (max-width: 1023px)');
    expect(css).not.toContain('max-width: 1199px');
    const page = await get(s, '/step/welcome');
    expect(page.body).toMatch(
      /<div class="layout">\s*<nav class="steps"[\s\S]*<form class="content"/,
    );
  });

  it('refuses paths outside assets/installer', async () => {
    const s = await start();
    for (const path of [
      '/assets/images/..%2F..%2F.env.example',
      '/assets/../.env.example',
      '/assets/images/nothing.png',
      '/assets/images/twitch-step1.txt',
      '/assets/other.css',
      '/assets/images/%2e%2e',
    ]) {
      expect((await get(s, path)).status, path).toBe(404);
    }
  });

  it('serves the terms and the privacy policy from docs/legal', async () => {
    const s = await start();
    for (const [path, file] of [
      ['/legal/terms', 'terms.md'],
      ['/legal/privacy', 'privacy.md'],
    ] as const) {
      const res = await get(s, path);
      const firstLine = readFileSync(join(REPO_ROOT, 'docs', 'legal', file), 'utf-8')
        .split('\n')[0]
        ?.replace(/^#\s+/, '');
      expect(res.status).toBe(200);
      expect(res.body).toContain(firstLine);
      expect(res.body).not.toMatch(/<script/i);
    }
  });

  it('answers 404 when a legal file is missing', async () => {
    const s = await start();
    rmSync(join(s.root, 'docs', 'legal', 'terms.md'));
    expect((await get(s, '/legal/terms')).status).toBe(404);
  });
});

describe('install', () => {
  it('shows a masked summary, the invite link and the two tick-boxes', async () => {
    const s = await start();
    await reachInstall(s);
    const res = await get(s, '/step/install');
    expect(res.status).toBe(200);
    expect(res.body).not.toContain(TOKEN);
    expect(res.body).toContain('MTIzND...****...7890');
    expect(res.body).toContain(
      `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&amp;scope=bot%20applications.commands&amp;permissions=626721090433015`,
    );
    expect(res.body).toContain('href="/legal/terms"');
    expect(res.body).toContain('href="/legal/privacy"');
    expect(res.body).toContain('name="accept_tos"');
    expect(res.body).toContain('name="accept_privacypolicy"');
    expect(res.body).toContain('formaction="/download"');
    expect(res.body).toContain('formaction="/finish"');
  });

  it('refuses Finish without both tick-boxes and writes nothing', async () => {
    const s = await start();
    await reachInstall(s);
    const none = await post(s, '/finish', {});
    expect(none.status).toBe(422);
    expect(none.body.match(/You need to accept this to continue/g)).toHaveLength(2);
    const one = await post(s, '/finish', { accept_tos: 'true' });
    expect(one.status).toBe(422);
    expect(existsSync(join(s.root, '.env'))).toBe(false);
  });

  it('writes the file on Finish, shows the next commands and stops the server', async () => {
    const s = await start();
    await reachInstall(s);
    const res = await post(s, '/finish', ACCEPT);
    expect(res.status).toBe(200);
    expect(res.body).toContain('The settings are written');
    for (const command of [
      'pnpm db:reset',
      'pnpm tcg:card-builder --rerender',
      'pnpm tcg:boss-builder --all',
      'pnpm lavalink:install',
      'pnpm lavalink:start',
      'pnpm dev:bot',
    ]) {
      expect(res.body).toContain(command);
    }
    expect(res.body).not.toContain('pnpm dev:web');
    expect(res.body).not.toContain(TOKEN);

    const file = readFileSync(join(s.root, '.env'), 'utf-8');
    expect(file).toContain(`DISCORD_CLIENT_ID=${CLIENT_ID}`);
    expect(file).toContain(`DISCORD_TOKEN=${TOKEN}`);
    expect(file).toContain(`LAVALINK_PASSWORD=${'ab'.repeat(16)}`);
    expect(statSync(join(s.root, '.env')).isFile()).toBe(true);

    await expect(s.server.stopped).resolves.toBe('finished');
    await expect(send(s.server, { path: '/step/welcome' })).rejects.toThrow();
  });

  it('shows the error and writes nothing when the file cannot be planned', async () => {
    const s = await start();
    await reachInstall(s);
    rmSync(join(s.root, '.env.example'));
    const res = await post(s, '/finish', ACCEPT);
    expect(res.status).toBe(500);
    expect(res.body).toContain('.env.example was not found');
    expect(existsSync(join(s.root, '.env'))).toBe(false);
  });

  it('lists the dashboard command when the dashboard is on and leaves out db:reset when updating', async () => {
    const root = makeRoot();
    writeFileSync(
      join(root, '.env'),
      [
        `DISCORD_CLIENT_ID=${CLIENT_ID}`,
        `DISCORD_TOKEN=${TOKEN}`,
        'DISCORD_CLIENT_SECRET=oauth-secret-value-1234',
        'DASHBOARD_URL=http://localhost:3000',
        'SECRET_VAULT_KEY=' + 'cd'.repeat(32),
        '',
      ].join('\n'),
    );
    const s = await start({ root });
    const welcome = await get(s, '/step/welcome');
    expect(welcome.body).toContain('The file exists.');

    // Secrets of the file are not shown; "keep" notes appear instead.
    const discord = await get(s, '/step/discord');
    expect(discord.status).toBe(200);
    expect(discord.body).not.toContain(TOKEN);
    expect(discord.body).toContain(`value="${CLIENT_ID}"`);
    await post(s, '/step/discord', {
      DISCORD_CLIENT_ID: CLIENT_ID,
      DISCORD_TOKEN: '',
      action: 'next',
    });
    await post(s, '/step/ai', { action: 'next' });
    await post(s, '/step/streams', { action: 'next' });
    await post(s, '/step/database', { DATABASE_DIALECT: 'sqlite', action: 'next' });
    const dashboard = await get(s, '/step/dashboard');
    expect(dashboard.body).toContain('name="switch_dashboard" value="on" checked');
    expect(dashboard.body).not.toContain('oauth-secret-value-1234');
    const next = await post(s, '/step/dashboard', {
      switch_dashboard: 'on',
      DASHBOARD_URL: 'http://localhost:3000',
      DISCORD_CLIENT_SECRET: '',
      action: 'next',
    });
    expect(next.status).toBe(303);

    const res = await post(s, '/finish', ACCEPT);
    expect(res.status).toBe(200);
    expect(res.body).toContain('pnpm dev:web');
    expect(res.body).not.toContain('pnpm db:reset');
    expect(res.body).toContain('was updated');
    const backups = readFileSync(join(root, '.env'), 'utf-8');
    expect(backups).toContain('DISCORD_CLIENT_SECRET=oauth-secret-value-1234');
    expect(backups).toContain('SECRET_VAULT_KEY=' + 'cd'.repeat(32));
  });

  it('returns the planned file as an attachment, matching what Finish writes', async () => {
    const s = await start();
    await reachInstall(s);
    expect((await get(s, '/download')).headers.location).toBe('/step/install');

    const rejected = await post(s, '/download', {});
    expect(rejected.status).toBe(422);

    const res = await post(s, '/download', ACCEPT);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename=".env"');
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).toContain(`DISCORD_CLIENT_ID=${CLIENT_ID}`);
    expect(existsSync(join(s.root, '.env'))).toBe(false);

    // After the boxes are saved the plain link works too.
    const link = await get(s, '/download');
    expect(link.status).toBe(200);
    expect(link.body).toBe(res.body);

    await post(s, '/finish', ACCEPT);
    expect(readFileSync(join(s.root, '.env'), 'utf-8')).toBe(res.body);
  });

  it('shows the planning error for the download and the finish', async () => {
    const s = await start();
    await reachInstall(s);
    rmSync(join(s.root, '.env.example'));
    const res = await post(s, '/download', ACCEPT);
    expect(res.status).toBe(500);
    expect(res.body).toContain('Nothing was written');
  });
});

describe('the shared Gemini key', () => {
  const GEMINI = 'gemini-key-value-123456';
  const OTHER = 'other-copy-value-654321';
  const chatOn = { 'switch_ai-chat': 'on', DEFAULT_AI_PROVIDER: 'gemini' };
  const imagesOn = { 'switch_ai-images': 'on', IMAGE_DEFAULT_PROVIDER: 'gemini' };

  /** Posts the AI page, walks to Install and returns the planned file. */
  async function planned(s: Started, fields: Record<string, string>): Promise<string> {
    await post(s, '/step/welcome', { action: 'next' });
    await post(s, '/step/discord', DISCORD_FIELDS);
    expect((await post(s, '/step/ai', { ...fields, action: 'next' })).status).toBe(303);
    await post(s, '/step/streams', { action: 'next' });
    await post(s, '/step/database', { DATABASE_DIALECT: 'sqlite', action: 'next' });
    await post(s, '/step/dashboard', { action: 'next' });
    return (await post(s, '/download', ACCEPT)).body;
  }

  it('takes the chat copy when only chat uses Gemini, and ignores the hidden image copy', async () => {
    const s = await start();
    const file = await planned(s, {
      ...chatOn,
      GEMINI_API_KEY__chat: GEMINI,
      GEMINI_API_KEY__images: OTHER,
    });
    expect(file).toContain(`GEMINI_API_KEY=${GEMINI}`);
    expect(file).not.toContain(OTHER);
  });

  it('takes the image copy when only image generation uses Gemini', async () => {
    const s = await start();
    const file = await planned(s, {
      ...imagesOn,
      GEMINI_API_KEY__chat: OTHER,
      GEMINI_API_KEY__images: GEMINI,
    });
    expect(file).toContain(`GEMINI_API_KEY=${GEMINI}`);
    expect(file).not.toContain(OTHER);
  });

  it('takes the chat copy when both use Gemini, and one key serves both', async () => {
    const s = await start();
    const file = await planned(s, {
      ...chatOn,
      ...imagesOn,
      GEMINI_API_KEY__chat: GEMINI,
      GEMINI_API_KEY__images: OTHER,
    });
    expect(file).toContain(`GEMINI_API_KEY=${GEMINI}`);
    expect(file).not.toContain(OTHER);
    expect(file.match(/^GEMINI_API_KEY=/gm)).toHaveLength(1);
  });

  it('takes the image copy when chat uses another provider', async () => {
    const s = await start();
    const file = await planned(s, {
      'switch_ai-chat': 'on',
      DEFAULT_AI_PROVIDER: 'ollama',
      OLLAMA_BASE_URL: 'http://localhost:11434',
      ...imagesOn,
      GEMINI_API_KEY__images: GEMINI,
    });
    expect(file).toContain(`GEMINI_API_KEY=${GEMINI}`);
  });

  it('names one field when the key is missing, in the copy the reader sees', async () => {
    const s = await start();
    await post(s, '/step/welcome', { action: 'next' });
    await post(s, '/step/discord', DISCORD_FIELDS);
    const res = await post(s, '/step/ai', { ...imagesOn, action: 'next' });
    expect(res.status).toBe(422);
    expect(
      res.body.match(/Gemini API key \(shared by chat and images\) is required\./g),
    ).toHaveLength(1);
    expect(res.body).toContain('id="f-GEMINI_API_KEY__images-error"');
    expect(res.body).not.toContain('id="f-GEMINI_API_KEY__chat-error"');
    expect(res.body).toContain('Gemini API key (shared by chat and images):');
  });

  it('keeps a saved key when the copy is left empty, and says so', async () => {
    const root = makeRoot();
    writeFileSync(join(root, '.env'), `GEMINI_API_KEY=${GEMINI}\nIMAGE_DEFAULT_PROVIDER=gemini\n`);
    const s = await start({ root });
    await post(s, '/step/welcome', { action: 'next' });
    await post(s, '/step/discord', DISCORD_FIELDS);
    const page = await get(s, '/step/ai');
    expect(page.body).toContain('id="f-GEMINI_API_KEY__chat-keep"');
    expect(page.body).not.toContain(GEMINI);
    // Images only: the saved value serves it without typing it again.
    expect((await post(s, '/step/ai', { ...imagesOn, action: 'next' })).status).toBe(303);
    await post(s, '/step/streams', { action: 'next' });
    await post(s, '/step/database', { DATABASE_DIALECT: 'sqlite', action: 'next' });
    await post(s, '/step/dashboard', { action: 'next' });
    expect((await post(s, '/download', ACCEPT)).body).toContain(`GEMINI_API_KEY=${GEMINI}`);
  });

  it('runs the image check with the key of the shown copy', async () => {
    const s = await start();
    await post(s, '/step/welcome', { action: 'next' });
    await post(s, '/step/discord', DISCORD_FIELDS);
    s.runCheck.mockClear();
    await post(s, '/step/ai', { ...imagesOn, GEMINI_API_KEY__images: GEMINI, action: 'next' });
    expect(s.runCheck.mock.calls.map((call) => call[0])).toEqual(['image-provider']);
    const answers = s.runCheck.mock.calls[0]?.[1] as { values: Record<string, string> };
    expect(answers.values.GEMINI_API_KEY).toBe(GEMINI);
  });
});

describe('the Lavalink choices', () => {
  const REMOTE = {
    LAVALINK_HOST: '192.0.2.10',
    LAVALINK_PORT: '2333',
    LAVALINK_PASSWORD: 'lavalink-password-value-123',
  };

  async function toDatabase(s: Started): Promise<void> {
    await post(s, '/step/welcome', { action: 'next' });
    await post(s, '/step/discord', DISCORD_FIELDS);
    await post(s, '/step/ai', { action: 'next' });
    await post(s, '/step/streams', { action: 'next' });
  }

  it('shows the local choice first and needs nothing else for it', async () => {
    const s = await start();
    await toDatabase(s);
    const page = await get(s, '/step/database');
    expect(page.body).toContain('Music server (Lavalink):');
    expect(page.body).toMatch(/<option value="local" selected>Run Lavalink on this computer/);
    expect(page.body).toContain('Use a Lavalink server I already have');
    s.runCheck.mockClear();
    const ok = await post(s, '/step/database', { DATABASE_DIALECT: 'sqlite', action: 'next' });
    expect(ok.status).toBe(303);
    expect(s.runCheck).not.toHaveBeenCalled();
  });

  it('asks for the address and the password of a server the reader has, and checks them', async () => {
    const s = await start();
    await toDatabase(s);
    s.runCheck.mockClear();
    const missing = await post(s, '/step/database', {
      DATABASE_DIALECT: 'sqlite',
      LAVALINK_MODE: 'remote',
      action: 'next',
    });
    expect(missing.status).toBe(422);
    expect(missing.body).toContain('Lavalink address is required.');
    expect(missing.body).toContain('Lavalink password is required.');
    expect(s.runCheck).not.toHaveBeenCalled();

    const ok = await post(s, '/step/database', {
      DATABASE_DIALECT: 'sqlite',
      LAVALINK_MODE: 'remote',
      ...REMOTE,
      LAVALINK_SECURE: 'false',
      action: 'next',
    });
    expect(ok.status).toBe(303);
    expect(s.runCheck.mock.calls.map((call) => call[0])).toEqual(['lavalink']);
  });

  it('shows a wrong password under the password and an unreachable server under the address', async () => {
    const wrong: CheckResult = {
      status: 'fail',
      message: 'Lavalink refused the password.',
      guideStep: { guide: 'lavalink', step: 3 },
      detail: { httpStatus: 401 },
    };
    const s = await start();
    await toDatabase(s);
    s.runCheck.mockResolvedValue(wrong);
    const res = await post(s, '/step/database', {
      DATABASE_DIALECT: 'sqlite',
      LAVALINK_MODE: 'remote',
      ...REMOTE,
      action: 'next',
    });
    expect(res.status).toBe(422);
    expect(res.body).toContain('id="f-LAVALINK_PASSWORD-error"');
    expect(res.body).not.toContain('id="f-LAVALINK_HOST-error"');
    expect(res.body).toContain('href="#guide-lavalink-step-3"');

    s.runCheck.mockResolvedValue({
      status: 'fail',
      message: 'Nothing answered.',
      guideStep: { guide: 'lavalink', step: 2 },
    });
    const down = await post(s, '/step/database', {
      DATABASE_DIALECT: 'sqlite',
      LAVALINK_MODE: 'remote',
      ...REMOTE,
      LAVALINK_PORT: '2334',
      action: 'verify',
    });
    expect(down.body).toContain('id="f-LAVALINK_HOST-error"');
    expect(down.body).not.toContain('id="f-LAVALINK_PASSWORD-error"');
  });

  it('starts on the choice the existing settings file shows', async () => {
    const root = makeRoot();
    writeFileSync(join(root, '.env'), 'LAVALINK_HOST=192.0.2.10\nLAVALINK_PORT=2334\n');
    const s = await start({ root });
    await toDatabase(s);
    const page = await get(s, '/step/database');
    expect(page.body).toMatch(/<option value="remote" selected>Use a Lavalink server/);
    expect(page.body).toContain('value="192.0.2.10"');
    expect(page.body).toContain('value="2334"');

    const local = makeRoot();
    writeFileSync(join(local, '.env'), 'LAVALINK_HOST=127.0.0.1\n');
    const t = await start({ root: local });
    await toDatabase(t);
    expect((await get(t, '/step/database')).body).toMatch(
      /<option value="local" selected>Run Lavalink on this computer/,
    );
  });

  it('writes a Lavalink server elsewhere, and leaves out the install and start commands', async () => {
    const s = await start();
    await toDatabase(s);
    await post(s, '/step/database', {
      DATABASE_DIALECT: 'sqlite',
      LAVALINK_MODE: 'remote',
      ...REMOTE,
      LAVALINK_SECURE: 'true',
      action: 'next',
    });
    await post(s, '/step/dashboard', { action: 'next' });
    const done = await post(s, '/finish', ACCEPT);
    expect(done.body).not.toContain('pnpm lavalink:install');
    expect(done.body).not.toContain('pnpm lavalink:start');
    const file = readFileSync(join(s.root, '.env'), 'utf-8');
    expect(file).toContain('LAVALINK_HOST=192.0.2.10');
    expect(file).toContain('LAVALINK_PASSWORD=lavalink-password-value-123');
    expect(file).toContain('LAVALINK_SECURE=true');
  });

  describe('with Docker', () => {
    const DASHBOARD = {
      DISCORD_CLIENT_SECRET: 'oauth-client-secret-value',
      DASHBOARD_URL: 'https://dashboard.example.com',
      action: 'next',
    };

    it('offers the bundled Lavalink first and shows the plain compose command', async () => {
      const s = await start({ profile: 'docker' });
      await toDatabase(s);
      const page = await get(s, '/step/database');
      expect(page.body).toMatch(/<option value="bundled" selected>Bundled Lavalink/);
      expect(page.body).toContain('Remote Lavalink node');
      expect(page.body).not.toContain('name="LAVALINK_SECURE"');
      s.runCheck.mockClear();
      expect((await post(s, '/step/database', { action: 'next' })).status).toBe(303);
      expect(s.runCheck).not.toHaveBeenCalled();
      await post(s, '/step/dashboard', DASHBOARD);
      const install = await get(s, '/step/install');
      expect(install.body).not.toContain('docker-compose.remote-lavalink.yml');
      const done = await post(s, '/finish', ACCEPT);
      expect(done.body).not.toContain('docker-compose.remote-lavalink.yml');
      const file = readFileSync(join(s.root, '.env.production'), 'utf-8');
      expect(file).not.toMatch(/^LAVALINK_HOST=/m);
    });

    it('writes the address of a remote node and adds the override file to the commands', async () => {
      const s = await start({ profile: 'docker' });
      await toDatabase(s);
      const res = await post(s, '/step/database', {
        LAVALINK_MODE_DOCKER: 'remote',
        ...REMOTE,
        action: 'next',
      });
      expect(res.status).toBe(303);
      expect(s.runCheck.mock.calls.map((call) => call[0])).toContain('lavalink');
      await post(s, '/step/dashboard', DASHBOARD);
      const install = await get(s, '/step/install');
      expect(install.body).toContain('-f docker-compose.remote-lavalink.yml');
      const done = await post(s, '/finish', ACCEPT);
      expect(done.body.match(/-f docker-compose\.remote-lavalink\.yml/g)?.length).toBeGreaterThan(
        3,
      );
      const file = readFileSync(join(s.root, '.env.production'), 'utf-8');
      expect(file).toMatch(/^LAVALINK_HOST=192\.0\.2\.10$/m);
      expect(file).toMatch(/^LAVALINK_PORT=2333$/m);
      expect(file).toMatch(/^LAVALINK_PASSWORD=lavalink-password-value-123$/m);
      expect(file).not.toMatch(/^DATABASE_URL=/m);
    });

    it('starts on the remote node when the settings file has an address', async () => {
      const root = makeRoot();
      writeFileSync(join(root, '.env.production'), 'LAVALINK_HOST=192.0.2.20\n');
      const s = await start({ profile: 'docker', root });
      await toDatabase(s);
      expect((await get(s, '/step/database')).body).toMatch(
        /<option value="remote" selected>Remote Lavalink node/,
      );
    });
  });
});

describe('stopping', () => {
  it('keeps serving for the grace period after Finish so the result page gets its stylesheet', async () => {
    const s = await start({ deps: { finishGraceMs: 400 } });
    await reachInstall(s);
    expect((await post(s, '/finish', ACCEPT)).status).toBe(200);
    expect((await get(s, '/assets/wizard.css')).status).toBe(200);
    await expect(s.server.stopped).resolves.toBe('finished');
  });

  it('stops after 30 minutes without a request (here: a short idle time)', async () => {
    const s = await start({ login: false, deps: { idleMs: 60 } });
    await expect(s.server.stopped).resolves.toBe('idle');
  });

  it('a request resets the idle timer', async () => {
    const s = await start({ login: false, deps: { idleMs: 150 } });
    const started = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 90));
    await send(s.server, { path: '/' });
    await expect(s.server.stopped).resolves.toBe('idle');
    expect(Date.now() - started).toBeGreaterThanOrEqual(200);
  });

  it('close() stops the server', async () => {
    const s = await start({ login: false });
    await s.server.close();
    await expect(s.server.stopped).resolves.toBe('closed');
    await s.server.close();
  });
});

describe('failures', () => {
  it('answers 500 without request data and logs only the error name', async () => {
    const log = vi.fn();
    const s = await start({ deps: { log } });
    rmSync(join(s.root, 'docs', 'legal', 'terms.md'));
    // A directory in place of the file: it exists but cannot be read.
    mkdirSync(join(s.root, 'docs', 'legal', 'terms.md'));
    const res = await get(s, '/legal/terms');
    expect(res.status).toBe(500);
    expect(res.body).toContain('Something went wrong');
    expect(log).toHaveBeenCalledWith('request failed: Error');
  });
});
