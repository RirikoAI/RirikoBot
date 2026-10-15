import { accessSync, constants, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { GeminiProvider, OllamaProvider, OpenAIProvider } from '@ririko/ai';
import { DEFAULT_GATEWAY_INTENTS } from '@ririko/discord';
import { createDatabaseClient, pingDatabase } from '@ririko/database';
import { ApplicationFlags, GatewayIntentBits } from 'discord.js';
import type { GuideId } from './guides.js';

/**
 * The live checks of the setup wizard (TASK-1922). One function per check, each taking plain
 * values and a `deps` object. Every function:
 *   - returns a result and never throws;
 *   - never puts a secret in its message (secrets are masked or redacted);
 *   - stops after `deps.timeoutMs`;
 *   - reaches the network only through `deps.fetch` (or an injected client factory), so tests
 *     run offline.
 * The terminal wizards (`ai:configure --test`, `image-configure --test`) print the same results.
 */

export type CheckStatus = 'pass' | 'warn' | 'fail';

/** The guide step that fixes a problem, for example the Discord guide's step 4. */
export interface GuideStepRef {
  guide: GuideId;
  step: number;
}

/** Facts for callers that print their own wording (the terminal wizards). */
export interface CheckDetail {
  latencyMs?: number;
  models?: string[];
  /** The provider's or the exception's message, with secrets redacted. */
  error?: string;
  /** The check could not run at all (an exception or a timeout) rather than get an answer. */
  thrown?: boolean;
  /** The HTTP status of the answer that decided the result. */
  httpStatus?: number;
  /** False when nothing answered. */
  reachable?: boolean;
}

export interface CheckResult {
  status: CheckStatus;
  message: string;
  guideStep?: GuideStepRef;
  detail?: CheckDetail;
}

export interface HealthLike {
  healthy: boolean;
  latencyMs?: number | undefined;
  error?: string | undefined;
  models?: string[] | undefined;
}

export interface DatabaseClientLike {
  close(): Promise<void>;
  ping(): Promise<{ ok: boolean; latencyMs: number; error?: string | undefined }>;
}

export interface FsOps {
  /** True when the path is an existing directory. */
  isDirectory(path: string): boolean;
  /** True when files can be created in the existing directory. */
  canWrite(path: string): boolean;
}

export interface CheckDeps {
  fetch?: typeof fetch;
  /** Default https://discord.com/api/v10. */
  discordApiBase?: string;
  /** Default 8000. */
  timeoutMs?: number;
  /** Builds a PostgreSQL client; the default is `createDatabaseClient`. */
  createDatabaseClient?: (config: {
    dialect: 'postgres';
    url: string;
    connectionTimeoutMs: number;
  }) => Promise<DatabaseClientLike>;
  fs?: FsOps;
  /** Provider factories; the defaults are the real provider classes. */
  aiProviders?: {
    gemini?: (options: { apiKey: string }) => { checkHealth(): Promise<HealthLike> };
    openai?: (options: { apiKey: string; baseURL: string | undefined }) => {
      checkHealth(): Promise<HealthLike>;
    };
    ollama?: (options: { baseURL: string }) => { checkHealth(): Promise<HealthLike> };
  };
  replicateApiBase?: string;
  twitchTokenUrl?: string;
  youtubeApiBase?: string;
  spotifyTokenUrl?: string;
}

export const DEFAULT_DISCORD_API_BASE = 'https://discord.com/api/v10';
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_REPLICATE_API_BASE = 'https://api.replicate.com/v1';
const DEFAULT_TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const DEFAULT_YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const DEFAULT_SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
/** Secrets shorter than this are not redacted from messages (they would mangle ordinary words). */
const MIN_REDACTED_SECRET_LENGTH = 8;

// -- helpers ----------------------------------------------------------------------------------

/** The fetch to use. Resolved at call time so a stubbed global is honoured. */
function fetcher(deps: CheckDeps): typeof fetch {
  return deps.fetch ?? ((input, init) => globalThis.fetch(input, init));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Replaces every secret (and its URL-encoded form) in `text` with `****`. */
export function redactSecrets(text: string, secrets: ReadonlyArray<string | undefined>): string {
  let result = text;
  for (const secret of secrets) {
    if (!secret || secret.length < MIN_REDACTED_SECRET_LENGTH) continue;
    for (const form of new Set([secret, encodeURIComponent(secret)])) {
      result = result.split(form).join('****');
    }
  }
  return result;
}

/** A database URL with the password replaced by `****`. */
export function maskDatabaseUrl(url: string): string {
  return url.replace(/(:\/\/[^:/@\s]*):[^@\s]*@/, '$1:****@');
}

class CheckTimeoutError extends Error {}

/**
 * Runs `fn` with a deadline. The request is aborted through the signal on timeout. Never throws:
 * an exception or a timeout becomes a failed result.
 */
async function guarded(
  label: string,
  deps: CheckDeps,
  secrets: ReadonlyArray<string | undefined>,
  fn: (signal: AbortSignal) => Promise<CheckResult>,
  guideStep?: GuideStepRef,
): Promise<CheckResult> {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new CheckTimeoutError(`${label} did not answer within ${timeoutMs / 1000} seconds.`));
    }, timeoutMs);
  });
  try {
    const result = await Promise.race([fn(controller.signal), deadline]);
    return { ...result, message: redactSecrets(result.message, secrets) };
  } catch (err: unknown) {
    const raw = redactSecrets(errorMessage(err), secrets);
    const message =
      err instanceof CheckTimeoutError ? raw : `${label} could not be checked: ${raw}`;
    return {
      status: 'fail',
      message,
      ...(guideStep ? { guideStep } : {}),
      detail: { error: raw, thrown: true },
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function basicAuth(id: string, secret: string): string {
  return `Basic ${Buffer.from(`${id}:${secret}`, 'utf8').toString('base64')}`;
}

// -- Discord ----------------------------------------------------------------------------------

interface PrivilegedIntent {
  label: string;
  flags: number[];
}

/** The privileged intents among `intents`, with the application flags that show each is on. */
export function requiredPrivilegedIntents(
  intents: readonly GatewayIntentBits[] = DEFAULT_GATEWAY_INTENTS,
): PrivilegedIntent[] {
  const wanted: PrivilegedIntent[] = [];
  if (intents.includes(GatewayIntentBits.GuildPresences)) {
    wanted.push({
      label: 'Presence Intent',
      flags: [ApplicationFlags.GatewayPresence, ApplicationFlags.GatewayPresenceLimited],
    });
  }
  if (intents.includes(GatewayIntentBits.GuildMembers)) {
    wanted.push({
      label: 'Server Members Intent',
      flags: [ApplicationFlags.GatewayGuildMembers, ApplicationFlags.GatewayGuildMembersLimited],
    });
  }
  if (intents.includes(GatewayIntentBits.MessageContent)) {
    wanted.push({
      label: 'Message Content Intent',
      flags: [
        ApplicationFlags.GatewayMessageContent,
        ApplicationFlags.GatewayMessageContentLimited,
      ],
    });
  }
  return wanted;
}

function joinAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Reads the application with the bot token: the token must be accepted, belong to the Application
 * ID entered, and have every privileged intent of `DEFAULT_GATEWAY_INTENTS` switched on.
 */
export async function checkDiscordApplication(
  values: { token: string; applicationId: string },
  deps: CheckDeps = {},
): Promise<CheckResult> {
  const base = (deps.discordApiBase ?? DEFAULT_DISCORD_API_BASE).replace(/\/+$/, '');
  return guarded(
    'Discord',
    deps,
    [values.token],
    async (signal) => {
      const res = await fetcher(deps)(`${base}/applications/@me`, {
        headers: { Authorization: `Bot ${values.token}` },
        signal,
      });
      if (res.status === 401 || res.status === 403) {
        return {
          status: 'fail',
          message: 'Discord rejected the bot token. Reset it (guide step 4) and paste the new one.',
          guideStep: { guide: 'discord', step: 4 },
          detail: { httpStatus: res.status },
        };
      }
      if (res.status < 200 || res.status >= 300) {
        return {
          status: 'fail',
          message: `Discord answered HTTP ${res.status}. Try again in a moment.`,
          detail: { httpStatus: res.status },
        };
      }
      const app = (await res.json()) as { id?: unknown; name?: unknown; flags?: unknown };
      if (String(app.id ?? '') !== values.applicationId.trim()) {
        return {
          status: 'fail',
          message:
            'This bot token belongs to another application than the Application ID you entered. Copy the Application ID of the same application (guide step 3).',
          guideStep: { guide: 'discord', step: 3 },
          detail: { httpStatus: res.status },
        };
      }
      const flags = Number(app.flags ?? 0);
      const missing = requiredPrivilegedIntents()
        .filter((intent) => !intent.flags.some((flag) => (flags & flag) !== 0))
        .map((intent) => intent.label);
      if (missing.length > 0) {
        return {
          status: 'fail',
          message: `${joinAnd(missing)} ${missing.length === 1 ? 'is' : 'are'} switched off. Turn ${missing.length === 1 ? 'it' : 'them'} on in the Developer Portal under Bot (guide step 5), save, and check again.`,
          guideStep: { guide: 'discord', step: 5 },
          detail: { httpStatus: res.status },
        };
      }
      const name = typeof app.name === 'string' && app.name ? ` "${app.name}"` : '';
      return {
        status: 'pass',
        message: `Discord accepted the token for the application${name} and its privileged intents are on.`,
        detail: { httpStatus: res.status },
      };
    },
    { guide: 'discord', step: 4 },
  );
}

/** Asks Discord for a client_credentials token: a 401 means the client secret is wrong. */
export async function checkDiscordOAuthSecret(
  values: { applicationId: string; clientSecret: string },
  deps: CheckDeps = {},
): Promise<CheckResult> {
  const base = (deps.discordApiBase ?? DEFAULT_DISCORD_API_BASE).replace(/\/+$/, '');
  return guarded(
    'Discord',
    deps,
    [values.clientSecret],
    async (signal) => {
      const res = await fetcher(deps)(`${base}/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: basicAuth(values.applicationId.trim(), values.clientSecret),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'identify' }),
        signal,
      });
      if (res.status === 401) {
        return {
          status: 'fail',
          message:
            'Discord rejected the Client Secret. Copy it again from the OAuth2 page (guide step 3), or reset it there.',
          guideStep: { guide: 'dashboard-oauth', step: 3 },
          detail: { httpStatus: res.status },
        };
      }
      if (res.status < 200 || res.status >= 300) {
        return {
          status: 'fail',
          message: `Discord answered HTTP ${res.status}. Try again in a moment.`,
          detail: { httpStatus: res.status },
        };
      }
      return {
        status: 'pass',
        message: 'Discord accepted the Client Secret.',
        detail: { httpStatus: res.status },
      };
    },
    { guide: 'dashboard-oauth', step: 3 },
  );
}

// -- Database ---------------------------------------------------------------------------------

const defaultFs: FsOps = {
  isDirectory: (path) => {
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  },
  canWrite: (path) => {
    try {
      accessSync(path, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  },
};

/** The folder that would hold the SQLite file, or null for an in-memory database. */
function sqliteFolder(url: string): string | null {
  const file = url.trim().replace(/^file:(\/\/)?/i, '');
  if (!file || file === ':memory:') return null;
  return dirname(resolve(file));
}

/**
 * SQLite: the folder of the file exists (or its nearest existing parent can hold it) and can be
 * written to. Nothing is created. PostgreSQL: connects, pings and closes the client.
 */
export async function checkDatabase(
  values: { dialect: string; url: string },
  deps: CheckDeps = {},
): Promise<CheckResult> {
  if (values.dialect === 'sqlite') {
    return guarded('SQLite', deps, [], async () => {
      const fs = deps.fs ?? defaultFs;
      const folder = sqliteFolder(values.url);
      if (folder === null) return { status: 'pass', message: 'SQLite will use memory only.' };
      let probe = folder;
      while (!fs.isDirectory(probe)) {
        const parent = dirname(probe);
        if (parent === probe) {
          return {
            status: 'fail',
            message: `The folder ${folder} cannot be created: no parent folder exists.`,
          };
        }
        probe = parent;
      }
      if (!fs.canWrite(probe)) {
        return {
          status: 'fail',
          message: `Ririko cannot write to ${probe}, so it cannot keep the SQLite file in ${folder}. Pick a folder you can write to.`,
        };
      }
      return {
        status: 'pass',
        message:
          probe === folder
            ? `The folder ${folder} can be written to.`
            : `The folder ${folder} will be created and can be written to.`,
      };
    });
  }

  if (values.dialect !== 'postgres') {
    return { status: 'fail', message: `Unsupported database '${values.dialect}'.` };
  }
  const password = passwordOf(values.url);
  return guarded(
    'PostgreSQL',
    deps,
    [values.url, password],
    async () => {
      const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const create =
        deps.createDatabaseClient ??
        (async (config) => (await createDatabaseClient(config)) as DatabaseClientLike);
      const client = await create({
        dialect: 'postgres',
        url: values.url,
        connectionTimeoutMs: timeoutMs,
      });
      try {
        const ping = await pingDatabase(client as Parameters<typeof pingDatabase>[0]);
        if (!ping.ok) {
          return {
            status: 'fail',
            message: `PostgreSQL did not answer the ping: ${ping.error ?? 'unknown error'}`,
            guideStep: { guide: 'postgres', step: 3 },
          };
        }
        return {
          status: 'pass',
          message: `PostgreSQL connected (${maskDatabaseUrl(values.url)}, ${ping.latencyMs}ms).`,
          detail: { latencyMs: ping.latencyMs },
        };
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    { guide: 'postgres', step: 3 },
  );
}

// -- Lavalink ---------------------------------------------------------------------------------

/** The text of a Lavalink version answer, trimmed to a short single line. */
function shortLine(text: string): string {
  const line = (text.split(/\r?\n/)[0] ?? '').trim();
  return line.length > 40 ? `${line.slice(0, 40)}...` : line;
}

/**
 * A Lavalink 4 server: `GET <http|https>://host:port/version` with the password in the
 * Authorization header. A version answer passes; a 401 means the password is wrong; no answer
 * means the address, the port or the connection type is wrong or Lavalink is not running.
 */
export async function checkLavalink(
  values: { host: string; port: string; password: string; secure: boolean },
  deps: CheckDeps = {},
): Promise<CheckResult> {
  const addressStep: GuideStepRef = { guide: 'lavalink', step: 2 };
  const passwordStep: GuideStepRef = { guide: 'lavalink', step: 3 };
  const host = values.host.trim();
  const shownHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  const address = `${shownHost}:${values.port.trim()}`;
  return guarded(
    'Lavalink',
    deps,
    [values.password],
    async (signal) => {
      const url = `${values.secure ? 'https' : 'http'}://${address}/version`;
      if (!URL.canParse(url)) {
        return {
          status: 'fail',
          message: `Lavalink: ${address} is not a usable address and port. Check them in the Lavalink guide (step 2).`,
          guideStep: addressStep,
        };
      }
      let res: Response;
      try {
        res = await fetcher(deps)(url, {
          headers: { Authorization: values.password },
          signal,
        });
      } catch (err: unknown) {
        // A timeout is reported by `guarded`; anything else is "nothing answered".
        if (signal.aborted) throw err;
        return {
          status: 'fail',
          message: `Nothing answered at ${address}. Check that Lavalink is running, that the address and port are right and that the connection type matches (Lavalink guide, step 2).`,
          guideStep: addressStep,
          detail: { reachable: false, error: redactSecrets(errorMessage(err), [values.password]) },
        };
      }
      if (res.status === 401 || res.status === 403) {
        return {
          status: 'fail',
          message: `Lavalink at ${address} refused the password. Copy it again from the application.yml of the Lavalink server (Lavalink guide, step 3).`,
          guideStep: passwordStep,
          detail: { httpStatus: res.status, reachable: true },
        };
      }
      if (res.status < 200 || res.status >= 300) {
        return {
          status: 'fail',
          message: `Lavalink at ${address} answered HTTP ${res.status}. Check that this is a Lavalink 4 server (Lavalink guide, step 1).`,
          guideStep: { guide: 'lavalink', step: 1 },
          detail: { httpStatus: res.status, reachable: true },
        };
      }
      const version = shortLine(await res.text().catch(() => ''));
      return {
        status: 'pass',
        message: `Lavalink${version ? ` ${version}` : ''} accepted the password at ${address}.`,
        detail: { httpStatus: res.status, reachable: true },
      };
    },
    addressStep,
  );
}

function passwordOf(url: string): string | undefined {
  const match = /:\/\/[^:/@\s]*:([^@\s]*)@/.exec(url);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

// -- AI providers -----------------------------------------------------------------------------

function fromHealth(label: string, health: HealthLike, guideStep: GuideStepRef): CheckResult {
  if (health.healthy) {
    return {
      status: 'pass',
      message: `${label} answered (${health.latencyMs ?? 0}ms).`,
      detail: {
        ...(health.latencyMs !== undefined ? { latencyMs: health.latencyMs } : {}),
        ...(health.models ? { models: health.models } : {}),
      },
    };
  }
  return {
    status: 'fail',
    message: `${label} did not accept the connection: ${health.error ?? 'no answer'}`,
    guideStep,
    detail: {
      ...(health.error !== undefined ? { error: health.error } : {}),
      ...(health.latencyMs !== undefined ? { latencyMs: health.latencyMs } : {}),
    },
  };
}

export async function checkGemini(apiKey: string, deps: CheckDeps = {}): Promise<CheckResult> {
  const guideStep: GuideStepRef = { guide: 'gemini', step: 4 };
  return guarded(
    'Google Gemini',
    deps,
    [apiKey],
    async () => {
      const make = deps.aiProviders?.gemini ?? ((o) => new GeminiProvider(o));
      return withRedactedError(await make({ apiKey }).checkHealth(), 'Google Gemini', guideStep, [
        apiKey,
      ]);
    },
    guideStep,
  );
}

export async function checkOpenAi(
  values: { apiKey: string; baseUrl?: string | undefined },
  deps: CheckDeps = {},
): Promise<CheckResult> {
  const guideStep: GuideStepRef = { guide: 'openai', step: 3 };
  return guarded(
    'OpenAI',
    deps,
    [values.apiKey],
    async () => {
      const make = deps.aiProviders?.openai ?? ((o) => new OpenAIProvider(o));
      const health = await make({
        apiKey: values.apiKey,
        baseURL: values.baseUrl || undefined,
      }).checkHealth();
      return withRedactedError(health, 'OpenAI', guideStep, [values.apiKey]);
    },
    guideStep,
  );
}

export async function checkOllama(baseUrl: string, deps: CheckDeps = {}): Promise<CheckResult> {
  const guideStep: GuideStepRef = { guide: 'ollama', step: 3 };
  return guarded(
    'Ollama',
    deps,
    [],
    async () => {
      const make = deps.aiProviders?.ollama ?? ((o) => new OllamaProvider(o));
      return fromHealth('Ollama', await make({ baseURL: baseUrl }).checkHealth(), guideStep);
    },
    guideStep,
  );
}

function withRedactedError(
  health: HealthLike,
  label: string,
  guideStep: GuideStepRef,
  secrets: string[],
): CheckResult {
  const result = fromHealth(label, health, guideStep);
  if (result.detail?.error !== undefined) {
    result.detail.error = redactSecrets(result.detail.error, secrets);
  }
  return result;
}

// -- Image providers --------------------------------------------------------------------------

/**
 * ComfyUI (or an SD-WebUI): `GET <url>/system_stats`; when that cannot connect, the server root.
 * Pass means `/system_stats` answered 2xx; anything else that answers below 500 is a warning.
 */
export async function checkComfyUi(url: string, deps: CheckDeps = {}): Promise<CheckResult> {
  const guideStep: GuideStepRef = { guide: 'comfyui', step: 2 };
  return guarded(
    'ComfyUI',
    deps,
    [],
    async (signal) => {
      const get = fetcher(deps);
      const trimmed = url.replace(/\/+$/, '');
      let viaStats = true;
      let res: { status: number } | undefined;
      try {
        res = await get(`${trimmed}/system_stats`, { signal });
      } catch {
        viaStats = false;
        try {
          res = await get(url, { signal });
        } catch {
          res = undefined;
        }
      }
      if (!res) {
        return {
          status: 'fail',
          message: `Could not reach ${url}. Make sure the image server is running (guide step 1).`,
          guideStep,
          detail: { reachable: false },
        };
      }
      const detail: CheckDetail = { reachable: true, httpStatus: res.status };
      if (res.status >= 500) {
        return {
          status: 'fail',
          message: `The image server at ${url} answered HTTP ${res.status}.`,
          guideStep,
          detail,
        };
      }
      if (viaStats && res.status >= 200 && res.status < 300) {
        return { status: 'pass', message: `ComfyUI answered at ${url}.`, detail };
      }
      return {
        status: 'warn',
        message: `Something answered at ${url} (HTTP ${res.status}) but it does not look like ComfyUI. Check the address.`,
        guideStep,
        detail,
      };
    },
    guideStep,
  );
}

/** Replicate: `GET /account` with the token. */
export async function checkReplicate(token: string, deps: CheckDeps = {}): Promise<CheckResult> {
  const base = (deps.replicateApiBase ?? DEFAULT_REPLICATE_API_BASE).replace(/\/+$/, '');
  const guideStep: GuideStepRef = { guide: 'replicate', step: 2 };
  return guarded(
    'Replicate',
    deps,
    [token],
    async (signal) => {
      const res = await fetcher(deps)(`${base}/account`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (res.status === 401 || res.status === 403) {
        return {
          status: 'fail',
          message: 'Replicate rejected the API token. Copy it again from the API tokens page.',
          guideStep,
          detail: { httpStatus: res.status },
        };
      }
      if (res.status < 200 || res.status >= 300) {
        return {
          status: 'fail',
          message: `Replicate answered HTTP ${res.status}. Try again in a moment.`,
          detail: { httpStatus: res.status },
        };
      }
      return {
        status: 'pass',
        message: 'Replicate accepted the API token.',
        detail: { httpStatus: res.status },
      };
    },
    guideStep,
  );
}

// -- Stream providers -------------------------------------------------------------------------

/** Twitch: an app access token (client_credentials) with the Client ID and Secret. */
export async function checkTwitch(
  values: { clientId: string; clientSecret: string },
  deps: CheckDeps = {},
): Promise<CheckResult> {
  const guideStep: GuideStepRef = { guide: 'twitch', step: 4 };
  return guarded(
    'Twitch',
    deps,
    [values.clientSecret],
    async (signal) => {
      const res = await fetcher(deps)(deps.twitchTokenUrl ?? DEFAULT_TWITCH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: values.clientId,
          client_secret: values.clientSecret,
          grant_type: 'client_credentials',
        }),
        signal,
      });
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        return {
          status: 'fail',
          message: 'Twitch rejected the Client ID or the Client Secret. Copy both again.',
          guideStep,
          detail: { httpStatus: res.status },
        };
      }
      if (res.status < 200 || res.status >= 300) {
        return {
          status: 'fail',
          message: `Twitch answered HTTP ${res.status}. Try again in a moment.`,
          detail: { httpStatus: res.status },
        };
      }
      const body = (await res.json().catch(() => ({}))) as { access_token?: unknown };
      if (typeof body.access_token !== 'string' || !body.access_token) {
        return {
          status: 'fail',
          message: 'Twitch answered without an access token.',
          guideStep,
          detail: { httpStatus: res.status },
        };
      }
      return {
        status: 'pass',
        message: 'Twitch issued an app access token.',
        detail: { httpStatus: res.status },
      };
    },
    guideStep,
  );
}

/** YouTube: one Data API v3 call (`channels.list`) with the key. */
export async function checkYouTube(apiKey: string, deps: CheckDeps = {}): Promise<CheckResult> {
  const base = (deps.youtubeApiBase ?? DEFAULT_YOUTUBE_API_BASE).replace(/\/+$/, '');
  const keyStep: GuideStepRef = { guide: 'youtube', step: 4 };
  const apiStep: GuideStepRef = { guide: 'youtube', step: 2 };
  return guarded(
    'YouTube',
    deps,
    [apiKey],
    async (signal) => {
      const url = new URL(`${base}/channels`);
      url.searchParams.set('part', 'id');
      url.searchParams.set('forHandle', '@YouTube');
      url.searchParams.set('key', apiKey);
      const res = await fetcher(deps)(url.toString(), { signal });
      if (res.status === 400) {
        return {
          status: 'fail',
          message: 'YouTube rejected the API key. Copy it again.',
          guideStep: keyStep,
          detail: { httpStatus: res.status },
        };
      }
      if (res.status === 403) {
        return {
          status: 'fail',
          message:
            'The key is not allowed to use the YouTube Data API v3. Turn the API on for the project, or check the quota.',
          guideStep: apiStep,
          detail: { httpStatus: res.status },
        };
      }
      if (res.status < 200 || res.status >= 300) {
        return {
          status: 'fail',
          message: `YouTube answered HTTP ${res.status}. Try again in a moment.`,
          detail: { httpStatus: res.status },
        };
      }
      return {
        status: 'pass',
        message: 'YouTube accepted the API key.',
        detail: { httpStatus: res.status },
      };
    },
    keyStep,
  );
}

/** Spotify: a client_credentials token with the Client ID and Secret. */
export async function checkSpotify(
  values: { clientId: string; clientSecret: string },
  deps: CheckDeps = {},
): Promise<CheckResult> {
  const guideStep: GuideStepRef = { guide: 'spotify', step: 4 };
  return guarded(
    'Spotify',
    deps,
    [values.clientSecret],
    async (signal) => {
      const res = await fetcher(deps)(deps.spotifyTokenUrl ?? DEFAULT_SPOTIFY_TOKEN_URL, {
        method: 'POST',
        headers: {
          Authorization: basicAuth(values.clientId, values.clientSecret),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ grant_type: 'client_credentials' }),
        signal,
      });
      if (res.status === 400 || res.status === 401) {
        return {
          status: 'fail',
          message: 'Spotify rejected the Client ID or the Client Secret. Copy both again.',
          guideStep,
          detail: { httpStatus: res.status },
        };
      }
      if (res.status < 200 || res.status >= 300) {
        return {
          status: 'fail',
          message: `Spotify answered HTTP ${res.status}. Try again in a moment.`,
          detail: { httpStatus: res.status },
        };
      }
      return {
        status: 'pass',
        message: 'Spotify issued an access token.',
        detail: { httpStatus: res.status },
      };
    },
    guideStep,
  );
}
