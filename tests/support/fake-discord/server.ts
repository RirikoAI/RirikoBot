/**
 * A fake Discord HTTP API (v10) on loopback for integration and E2E tests.
 *
 * discord.js REST (bot) and the dashboard's OAuth client point their API base at `apiUrl`, so
 * they send real requests that tests assert on through `requests`. Every route the fake does
 * not implement answers 404 and lands in `unhandled`; suites fail when that list is not empty,
 * so a missing route shows up as a test failure instead of a silent gap.
 *
 * Cross-process callers (Playwright specs) use the `/__fake/*` control routes.
 */
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  ChannelType,
  apiChannel,
  apiGuild,
  apiMember,
  apiPartialGuild,
  apiRole,
  apiUser,
  cloneFixture,
  defaultFixture,
  findChannel,
  findGuild,
  findUser,
  type FakeDiscordFixture,
  type FakeGuild,
} from './fixtures.js';

export type RequestAuth =
  | { kind: 'none' }
  | { kind: 'bot' }
  | { kind: 'bearer'; userId: string | undefined }
  | { kind: 'basic'; clientId: string };

export interface RecordedFile {
  field: string;
  filename: string;
  size: number;
}

export interface RecordedRequest {
  method: string;
  /** Path without the `/api/v10` prefix, e.g. `/channels/123/messages`. */
  path: string;
  query: Record<string, string>;
  auth: RequestAuth;
  /** Parsed JSON, form fields, or multipart `payload_json`; `undefined` without a body. */
  body: unknown;
  files: RecordedFile[];
  status: number;
  /** The JSON the fake answered with, e.g. the created message. */
  response: unknown;
}

export interface FakeDiscordServer {
  /** `http://127.0.0.1:<port>` */
  url: string;
  /** Unversioned API base for discord.js REST's `api` option and DISCORD_API_URL. */
  apiUrl: string;
  /** Live state; tests may mutate it (e.g. remove a member) between steps. */
  fixture: FakeDiscordFixture;
  requests: RecordedRequest[];
  unhandled: RecordedRequest[];
  /** Messages the bot created, by id (channel messages, interaction replies, follow-ups). */
  messages: ReadonlyMap<string, StoredMessage>;
  /** The original response message of an interaction, by interaction token. */
  originalMessage(token: string): StoredMessage | undefined;
  /** Recorded requests matching a method and a path (exact string or pattern). */
  find(method: string, path: string | RegExp): RecordedRequest[];
  /** Resolves with the first matching request, including ones already recorded. */
  waitFor(method: string, path: string | RegExp, timeoutMs?: number): Promise<RecordedRequest>;
  /** Clears recorded requests, stored messages and tokens, and restores the starting fixture. */
  reset(): void;
  close(): Promise<void>;
}

export interface StartFakeDiscordOptions {
  /** 0 (default) picks a free port. */
  port?: number;
  fixture?: FakeDiscordFixture;
}

interface Reply {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

interface RouteContext {
  params: string[];
  query: Record<string, string>;
  auth: RequestAuth;
  body: unknown;
  files: RecordedFile[];
  cookies: Record<string, string>;
}

type Handler = (ctx: RouteContext) => Reply;

export interface StoredMessage {
  [key: string]: unknown;
  id: string;
  channel_id: string;
}

interface AuthorizationCode {
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
}

/** Cookie a browser test sets on the fake's origin to choose who signs in. */
export const LOGIN_COOKIE = 'fake_discord_user';

const unknown = (message: string, code: number): Reply => ({
  status: 404,
  body: { message, code },
});
const unauthorized: Reply = { status: 401, body: { message: '401: Unauthorized', code: 0 } };
const noContent: Reply = { status: 204 };
const json = (body: unknown, status = 200): Reply => ({ status, body });

export async function startFakeDiscord(
  options: StartFakeDiscordOptions = {},
): Promise<FakeDiscordServer> {
  const initial = cloneFixture(options.fixture ?? defaultFixture());
  const events = new EventEmitter();
  const requests: RecordedRequest[] = [];
  const unhandled: RecordedRequest[] = [];

  let fixture = cloneFixture(initial);
  let nextId = 1_300_000_000_000_000_000n;
  const messages = new Map<string, StoredMessage>();
  /** Interaction token -> original response message. */
  const originals = new Map<string, StoredMessage>();
  const dmChannels = new Map<string, string>();
  const codes = new Map<string, AuthorizationCode>();
  const accessTokens = new Map<string, string>();
  const refreshTokens = new Map<string, string>();
  const commands = new Map<string, unknown[]>();

  const snowflake = () => (nextId++).toString();

  const botAuth = (auth: RequestAuth) => auth.kind === 'bot';
  const currentUserId = (auth: RequestAuth): string | undefined =>
    auth.kind === 'bot' ? fixture.bot.id : auth.kind === 'bearer' ? auth.userId : undefined;

  function createMessage(channelId: string, body: unknown, files: RecordedFile[]): StoredMessage {
    const data = (body ?? {}) as Record<string, unknown>;
    const guildId = findChannel(fixture, channelId)?.guild.id;
    const message: StoredMessage = {
      id: snowflake(),
      channel_id: channelId,
      ...(guildId ? { guild_id: guildId } : {}),
      author: apiUser(fixture.bot),
      content: typeof data.content === 'string' ? data.content : '',
      timestamp: new Date().toISOString(),
      edited_timestamp: null,
      tts: false,
      mention_everyone: false,
      mentions: [],
      mention_roles: [],
      attachments: attachmentsFor(channelId, files),
      embeds: Array.isArray(data.embeds) ? data.embeds : [],
      components: Array.isArray(data.components) ? data.components : [],
      pinned: false,
      type: data.message_reference ? 19 : 0,
      flags: typeof data.flags === 'number' ? data.flags : 0,
      ...(data.message_reference ? { message_reference: data.message_reference } : {}),
    };
    messages.set(message.id, message);
    return message;
  }

  function editMessage(message: StoredMessage, body: unknown, files: RecordedFile[]) {
    const data = (body ?? {}) as Record<string, unknown>;
    for (const key of ['content', 'embeds', 'components', 'flags'] as const) {
      if (key in data) message[key] = data[key];
    }
    if (files.length > 0) message.attachments = attachmentsFor(message.channel_id, files);
    message.edited_timestamp = new Date().toISOString();
    return message;
  }

  function guildOr404(id: string | undefined, handler: (guild: FakeGuild) => Reply): Reply {
    const guild = id ? findGuild(fixture, id) : undefined;
    return guild ? handler(guild) : unknown('Unknown Guild', 10004);
  }

  function interactionResponse(
    interactionId: string,
    token: string,
    body: unknown,
    withResponse: boolean,
  ): Reply {
    const data = (body ?? {}) as { type?: number; data?: unknown };
    const type = data.type ?? 0;
    let message: StoredMessage | undefined;
    // 4: reply, 5: deferred reply (loading placeholder the edit fills in).
    if (type === 4 || type === 5) {
      message = createMessage('0', type === 4 ? data.data : {}, []);
      originals.set(token, message);
    }
    // 7: update the message a component is attached to.
    if (type === 7) {
      message = originals.get(token) ?? createMessage('0', {}, []);
      editMessage(message, data.data, []);
      originals.set(token, message);
    }
    if (!withResponse) return noContent;
    return json({
      interaction: {
        id: interactionId,
        type: 2,
        activity_instance_id: null,
        response_message_id: message?.id ?? null,
        response_message_loading: type === 5,
        response_message_ephemeral: false,
      },
      resource: message ? { type, message } : { type },
    });
  }

  function oauthAuthorize(ctx: RouteContext): Reply {
    const {
      client_id,
      redirect_uri,
      response_type,
      state,
      code_challenge,
      code_challenge_method,
      scope,
    } = ctx.query;
    if (client_id !== fixture.applicationId) return json({ error: 'invalid_client' }, 400);
    if (response_type !== 'code' || !redirect_uri) return json({ error: 'invalid_request' }, 400);
    if (!code_challenge || code_challenge_method !== 'S256') {
      return json({ error: 'invalid_request', error_description: 'PKCE S256 is required' }, 400);
    }
    const login = ctx.cookies[LOGIN_COOKIE];
    const user = fixture.users.find((u) => u.id === login || u.username === login);
    if (!user) {
      return json(
        { error: 'access_denied', error_description: `Set the ${LOGIN_COOKIE} cookie` },
        400,
      );
    }
    const code = `code-${snowflake()}`;
    codes.set(code, {
      userId: user.id,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge,
      scope: scope ?? '',
    });
    const location = new URL(redirect_uri);
    location.searchParams.set('code', code);
    if (state !== undefined) location.searchParams.set('state', state);
    return { status: 302, headers: { Location: location.toString() } };
  }

  function issueTokens(userId: string, scope: string): Reply {
    const accessToken = `fake-access-${snowflake()}`;
    const refreshToken = `fake-refresh-${snowflake()}`;
    accessTokens.set(accessToken, userId);
    refreshTokens.set(refreshToken, userId);
    return json({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: 604800,
      scope,
    });
  }

  function oauthToken(ctx: RouteContext): Reply {
    if (ctx.auth.kind !== 'basic' || ctx.auth.clientId !== fixture.applicationId) {
      return json({ error: 'invalid_client' }, 401);
    }
    const form = (ctx.body ?? {}) as Record<string, string>;
    if (form.grant_type === 'authorization_code') {
      const grant = form.code ? codes.get(form.code) : undefined;
      if (form.code) codes.delete(form.code);
      const challenge = createHash('sha256')
        .update(form.code_verifier ?? '')
        .digest('base64url');
      if (!grant || grant.redirectUri !== form.redirect_uri || grant.codeChallenge !== challenge) {
        return json({ error: 'invalid_grant' }, 400);
      }
      return issueTokens(grant.userId, grant.scope);
    }
    if (form.grant_type === 'refresh_token') {
      const userId = form.refresh_token ? refreshTokens.get(form.refresh_token) : undefined;
      if (!userId || !form.refresh_token) return json({ error: 'invalid_grant' }, 400);
      refreshTokens.delete(form.refresh_token);
      return issueTokens(userId, 'identify guilds');
    }
    return json({ error: 'unsupported_grant_type' }, 400);
  }

  const routes: Array<[string, RegExp, Handler]> = [
    ['GET', /^\/oauth2\/authorize$/, oauthAuthorize],
    ['POST', /^\/oauth2\/token$/, oauthToken],

    [
      'GET',
      /^\/users\/@me$/,
      ({ auth }) => {
        const user = findUser(fixture, currentUserId(auth) ?? '');
        return user ? json(apiUser(user)) : unauthorized;
      },
    ],
    [
      'GET',
      /^\/users\/@me\/guilds$/,
      ({ auth }) => {
        const userId = currentUserId(auth);
        if (!userId) return unauthorized;
        return json(
          fixture.guilds
            .filter((g) => g.members.some((m) => m.userId === userId))
            .map((g) => apiPartialGuild(g, userId)),
        );
      },
    ],
    [
      'POST',
      /^\/users\/@me\/channels$/,
      ({ auth, body }) => {
        if (!botAuth(auth)) return unauthorized;
        const recipientId = (body as { recipient_id?: string } | undefined)?.recipient_id ?? '';
        const recipient = findUser(fixture, recipientId);
        if (!recipient) return unknown('Unknown User', 10013);
        let channelId = dmChannels.get(recipientId);
        if (!channelId) {
          channelId = snowflake();
          dmChannels.set(recipientId, channelId);
        }
        return json({
          id: channelId,
          type: ChannelType.DM,
          recipients: [apiUser(recipient)],
          last_message_id: null,
        });
      },
    ],
    [
      'GET',
      /^\/users\/(\d+)$/,
      ({ params }) => {
        const user = findUser(fixture, params[0] ?? '');
        return user ? json(apiUser(user)) : unknown('Unknown User', 10013);
      },
    ],

    ['GET', /^\/guilds\/(\d+)$/, ({ params }) => guildOr404(params[0], (g) => json(apiGuild(g)))],
    [
      'GET',
      /^\/guilds\/(\d+)\/roles$/,
      ({ params }) => guildOr404(params[0], (g) => json(g.roles.map(apiRole))),
    ],
    [
      'GET',
      /^\/guilds\/(\d+)\/channels$/,
      ({ params }) =>
        guildOr404(params[0], (g) => json(g.channels.map((c) => apiChannel(c, g.id)))),
    ],
    [
      'GET',
      /^\/guilds\/(\d+)\/members$/,
      ({ params }) =>
        guildOr404(params[0], (g) => json(g.members.map((m) => apiMember(fixture, m)))),
    ],
    [
      'GET',
      /^\/guilds\/(\d+)\/members\/(\d+)$/,
      ({ params }) =>
        guildOr404(params[0], (g) => {
          const member = g.members.find((m) => m.userId === params[1]);
          return member ? json(apiMember(fixture, member)) : unknown('Unknown Member', 10007);
        }),
    ],

    [
      'GET',
      /^\/channels\/(\d+)$/,
      ({ params }) => {
        const found = findChannel(fixture, params[0] ?? '');
        return found
          ? json(apiChannel(found.channel, found.guild.id))
          : unknown('Unknown Channel', 10003);
      },
    ],
    [
      'POST',
      /^\/channels\/(\d+)\/messages$/,
      ({ params, body, files, auth }) => {
        if (!botAuth(auth)) return unauthorized;
        return json(createMessage(params[0] ?? '', body, files));
      },
    ],
    [
      'GET',
      /^\/channels\/(\d+)\/messages$/,
      ({ params, query }) => {
        const limit = Number(query.limit ?? 50);
        const list = [...messages.values()].filter((m) => m.channel_id === params[0]).reverse();
        return json(list.slice(0, limit));
      },
    ],
    [
      'GET',
      /^\/channels\/(\d+)\/messages\/(\d+)$/,
      ({ params }) => {
        const message = messages.get(params[1] ?? '');
        return message ? json(message) : unknown('Unknown Message', 10008);
      },
    ],
    [
      'PATCH',
      /^\/channels\/(\d+)\/messages\/(\d+)$/,
      ({ params, body, files }) => {
        const message = messages.get(params[1] ?? '');
        return message
          ? json(editMessage(message, body, files))
          : unknown('Unknown Message', 10008);
      },
    ],
    [
      'DELETE',
      /^\/channels\/(\d+)\/messages\/(\d+)$/,
      ({ params }) =>
        messages.delete(params[1] ?? '') ? noContent : unknown('Unknown Message', 10008),
    ],
    ['POST', /^\/channels\/(\d+)\/typing$/, () => noContent],
    ['PUT', /^\/channels\/(\d+)\/messages\/(\d+)\/reactions\/[^/]+\/@me$/, () => noContent],
    ['DELETE', /^\/channels\/(\d+)\/messages\/(\d+)\/reactions(\/.*)?$/, () => noContent],

    [
      'POST',
      /^\/interactions\/(\d+)\/([^/]+)\/callback$/,
      ({ params, body, query }) =>
        interactionResponse(params[0] ?? '', params[1] ?? '', body, query.with_response === 'true'),
    ],
    [
      'GET',
      /^\/webhooks\/(\d+)\/([^/]+)\/messages\/@original$/,
      ({ params }) => {
        const message = originals.get(params[1] ?? '');
        return message ? json(message) : unknown('Unknown Message', 10008);
      },
    ],
    [
      'PATCH',
      /^\/webhooks\/(\d+)\/([^/]+)\/messages\/@original$/,
      ({ params, body, files }) => {
        const token = params[1] ?? '';
        const message = originals.get(token) ?? createMessage('0', {}, []);
        originals.set(token, message);
        return json(editMessage(message, body, files));
      },
    ],
    [
      'DELETE',
      /^\/webhooks\/(\d+)\/([^/]+)\/messages\/@original$/,
      ({ params }) =>
        originals.delete(params[1] ?? '') ? noContent : unknown('Unknown Message', 10008),
    ],
    [
      'POST',
      /^\/webhooks\/(\d+)\/([^/]+)$/,
      ({ body, files }) => json(createMessage('0', body, files)),
    ],
    [
      'PATCH',
      /^\/webhooks\/(\d+)\/([^/]+)\/messages\/(\d+)$/,
      ({ params, body, files }) => {
        const message = messages.get(params[2] ?? '');
        return message
          ? json(editMessage(message, body, files))
          : unknown('Unknown Message', 10008);
      },
    ],

    [
      'PUT',
      /^\/applications\/(\d+)(?:\/guilds\/(\d+))?\/commands$/,
      ({ params, body, auth }) => {
        if (!botAuth(auth)) return unauthorized;
        if (params[0] !== fixture.applicationId) return unknown('Unknown Application', 10002);
        const registered = (Array.isArray(body) ? body : []).map(
          (command: Record<string, unknown>) => ({
            ...command,
            id: snowflake(),
            application_id: fixture.applicationId,
            ...(params[1] ? { guild_id: params[1] } : {}),
            version: snowflake(),
          }),
        );
        commands.set(params[1] ?? 'global', registered);
        return json(registered);
      },
    ],
    [
      'GET',
      /^\/applications\/(\d+)(?:\/guilds\/(\d+))?\/commands$/,
      ({ params }) => json(commands.get(params[1] ?? 'global') ?? []),
    ],
  ];

  function control(path: string, method: string): Reply | undefined {
    if (path === '/__fake/health') return json({ ok: true });
    if (path === '/__fake/requests' && method === 'GET') return json(requests);
    if (path === '/__fake/unhandled' && method === 'GET') return json(unhandled);
    if (path === '/__fake/reset' && method === 'POST') {
      reset();
      return noContent;
    }
    return undefined;
  }

  function reset() {
    requests.length = 0;
    unhandled.length = 0;
    fixture = cloneFixture(initial);
    server.fixture = fixture;
    for (const store of [
      messages,
      originals,
      dmChannels,
      codes,
      accessTokens,
      refreshTokens,
      commands,
    ]) {
      store.clear();
    }
  }

  function parseAuth(header: string | undefined): RequestAuth {
    if (!header) return { kind: 'none' };
    const [scheme, value = ''] = header.split(' ', 2);
    if (scheme === 'Bot') return { kind: 'bot' };
    if (scheme === 'Bearer') return { kind: 'bearer', userId: accessTokens.get(value) };
    if (scheme === 'Basic') {
      const [clientId = ''] = Buffer.from(value, 'base64').toString('utf8').split(':');
      return { kind: 'basic', clientId };
    }
    return { kind: 'none' };
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://fake-discord');
    const method = req.method ?? 'GET';
    const raw = await readBody(req);

    const controlReply = control(url.pathname, method);
    if (controlReply) return send(res, controlReply);

    // discord.js percent-encodes route segments such as `@original` and reaction emoji.
    const path = decodeURIComponent(url.pathname).replace(/^\/api(\/v\d+)?/, '') || '/';
    const { body, files } = parseBody(req.headers['content-type'], raw);
    const ctx: RouteContext = {
      params: [],
      query: Object.fromEntries(url.searchParams),
      auth: parseAuth(req.headers.authorization),
      body,
      files,
      cookies: parseCookies(req.headers.cookie),
    };

    let reply: Reply | undefined;
    for (const [routeMethod, pattern, handler] of routes) {
      if (routeMethod !== method) continue;
      const match = pattern.exec(path);
      if (!match) continue;
      ctx.params = match.slice(1).map((p) => p ?? '');
      reply = handler(ctx);
      break;
    }
    const matched = reply !== undefined;
    reply ??= unknown(`Unknown route in the fake Discord API: ${method} ${path}`, 0);

    const recorded: RecordedRequest = {
      method,
      path,
      query: ctx.query,
      auth: ctx.auth,
      body,
      files,
      status: reply.status,
      response: reply.body,
    };
    requests.push(recorded);
    if (!matched) unhandled.push(recorded);
    events.emit('request', recorded);
    send(res, reply);
  }

  const httpServer = createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      send(res, json({ message: `Fake Discord API error: ${String(err)}`, code: 0 }, 500));
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(options.port ?? 0, '127.0.0.1', () => resolve());
  });
  const { port } = httpServer.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  const matches = (r: RecordedRequest, method: string, path: string | RegExp) =>
    r.method === method && (typeof path === 'string' ? r.path === path : path.test(r.path));

  const server: FakeDiscordServer = {
    url: baseUrl,
    apiUrl: `${baseUrl}/api`,
    fixture,
    requests,
    unhandled,
    messages,
    originalMessage: (token) => originals.get(token),
    find: (method, path) => requests.filter((r) => matches(r, method, path)),
    waitFor(method, path, timeoutMs = 5000) {
      const existing = requests.find((r) => matches(r, method, path));
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const onRequest = (r: RecordedRequest) => {
          if (!matches(r, method, path)) return;
          clearTimeout(timer);
          events.off('request', onRequest);
          resolve(r);
        };
        const timer = setTimeout(() => {
          events.off('request', onRequest);
          const seen = requests.map((r) => `${r.method} ${r.path}`).join(', ') || 'none';
          reject(new Error(`No ${method} ${String(path)} within ${timeoutMs} ms. Seen: ${seen}`));
        }, timeoutMs);
        events.on('request', onRequest);
      });
    },
    reset,
    close: () =>
      new Promise((resolve, reject) => {
        httpServer.closeAllConnections();
        httpServer.close((err) => (err ? reject(err) : resolve()));
      }),
  };
  return server;
}

function attachmentsFor(channelId: string, files: RecordedFile[]) {
  return files.map((f, i) => ({
    id: String(i),
    filename: f.filename,
    size: f.size,
    url: `https://cdn.discordapp.com/attachments/${channelId}/${i}/${f.filename}`,
    proxy_url: `https://media.discordapp.net/attachments/${channelId}/${i}/${f.filename}`,
  }));
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, reply: Reply) {
  const headers: Record<string, string> = { ...reply.headers };
  if (reply.body === undefined) {
    res.writeHead(reply.status, headers).end();
    return;
  }
  headers['Content-Type'] = 'application/json';
  res.writeHead(reply.status, headers).end(JSON.stringify(reply.body));
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of header?.split(';') ?? []) {
    const index = part.indexOf('=');
    if (index > 0)
      cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

function parseBody(
  contentType: string | undefined,
  raw: Buffer,
): { body: unknown; files: RecordedFile[] } {
  if (raw.length === 0) return { body: undefined, files: [] };
  const type = contentType ?? '';
  if (type.startsWith('application/json'))
    return { body: JSON.parse(raw.toString('utf8')), files: [] };
  if (type.startsWith('application/x-www-form-urlencoded')) {
    return { body: Object.fromEntries(new URLSearchParams(raw.toString('utf8'))), files: [] };
  }
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(type);
  if (type.startsWith('multipart/form-data') && boundary) {
    return parseMultipart(raw, boundary[1] ?? boundary[2] ?? '');
  }
  return { body: raw.toString('utf8'), files: [] };
}

/** discord.js sends attachments as multipart with the JSON body in a `payload_json` part. */
function parseMultipart(raw: Buffer, boundary: string): { body: unknown; files: RecordedFile[] } {
  let body: unknown;
  const files: RecordedFile[] = [];
  const text = raw.toString('latin1');
  for (const part of text.split(`--${boundary}`)) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd < 0) continue;
    const headers = part.slice(0, headerEnd);
    const content = part.slice(headerEnd + 4).replace(/\r\n$/, '');
    const field = /name="([^"]*)"/.exec(headers)?.[1] ?? '';
    const filename = /filename="([^"]*)"/.exec(headers)?.[1];
    if (filename !== undefined) {
      files.push({ field, filename, size: Buffer.byteLength(content, 'latin1') });
    } else if (field === 'payload_json') {
      body = JSON.parse(Buffer.from(content, 'latin1').toString('utf8'));
    }
  }
  return { body, files };
}
