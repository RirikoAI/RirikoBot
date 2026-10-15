import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { findWorkspaceRoot } from '@ririko/core';
import { parseEnvContent } from '../utils/env-editor.js';
import type { CheckDeps, CheckResult } from './checks.js';
import { checkField, checkInputs, runInstallerCheck } from './check-runner.js';
import {
  PROFILE_FILES,
  cryptoSecretGenerator,
  planEnvFile,
  prefillValues,
  writeEnv,
  type SecretGenerator,
} from './env-plan.js';
import {
  buildInviteUrl,
  conditionalCss,
  nextCommands,
  renderLegalPage,
  renderMessagePage,
  renderResultPage,
  renderStepPage,
  summaryRows,
  type CheckLine,
  type FieldIssue,
  type StepView,
} from './render.js';
import {
  PAGES,
  activeChecks,
  activeFields,
  answerValue,
  effectiveSwitches,
  getPage,
  validatePage,
  type Answers,
  type CheckId,
  type Page,
  type PageId,
  type Profile,
  type SwitchId,
} from './steps.js';

/**
 * The local setup wizard server. One in-memory session; `node:http` only; every page is rendered
 * on the server from the step model and works without JavaScript. The server binds to the
 * loopback address by default and refuses a request that does not carry the session cookie.
 */

export const DEFAULT_INSTALLER_HOST = '127.0.0.1';
export const DEFAULT_INSTALLER_PORT = 3999;
/** The server stops after this long without a request. */
export const DEFAULT_IDLE_MS = 30 * 60 * 1000;

const COOKIE_NAME = 'ririko_setup';
const MAX_BODY_BYTES = 256 * 1024;
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];
const WILDCARD_HOSTS = ['0.0.0.0', '::', '[::]'];

export type StopReason = 'finished' | 'idle' | 'closed';

export interface InstallerServerOptions {
  profile: Profile;
  /**
   * The settings file. Its name must be `.env` (source) or `.env.production` (docker); its folder
   * is the one place the wizard reads and writes settings. Default: that file name in `root`.
   */
  envFile?: string | undefined;
  /** Address to listen on. Default 127.0.0.1. */
  host?: string | undefined;
  /** Port to listen on. Default 3999; 0 (a random port) is for tests. */
  port?: number | undefined;
  /**
   * The repository (or image) root: where the example file, assets/installer and docs/legal live.
   * It may differ from the settings folder (a Docker bind mount).
   */
  root?: string | undefined;
}

export interface InstallerServerDeps {
  /** Runs one page check; the default calls the real checks with `checkDeps`. */
  runCheck?:
    ((id: CheckId, answers: Answers, profile: Profile) => Promise<CheckResult>) | undefined;
  checkDeps?: CheckDeps | undefined;
  generate?: SecretGenerator | undefined;
  now?: (() => Date) | undefined;
  /** Idle time before the server stops. Default 30 minutes. */
  idleMs?: number | undefined;
  /** Source of the start token and the session secrets; tests inject fixed values. */
  randomToken?: (() => string) | undefined;
  /**
   * How long the server stays up after the Finish page is sent, so the browser can still load the
   * stylesheet of that page. Default 3000 ms.
   */
  finishGraceMs?: number | undefined;
  /** Receives a line when a request fails unexpectedly. Never receives request data. */
  log?: ((line: string) => void) | undefined;
}

export interface InstallerServer {
  /** The start URL, including the one-time token. */
  url: string;
  host: string;
  port: number;
  /** The settings file the wizard writes. */
  envFile: string;
  /** Resolves when the server has stopped. */
  stopped: Promise<StopReason>;
  /** Stops the server now. */
  close(): Promise<void>;
}

interface StoredCheck {
  fingerprint: string;
  result: CheckResult;
}

interface Session {
  id: string;
  csrf: string;
  salt: string;
  answers: Answers;
  checks: Map<CheckId, StoredCheck>;
}

interface Reply {
  status: number;
  type?: string;
  body: string;
  headers?: Record<string, string>;
  /** A file to send as the body (assets). */
  file?: string;
  /** Runs once the response is fully sent. */
  after?: () => void;
}

const SWITCH_SIGNS: Readonly<Record<SwitchId, readonly string[]>> = {
  'ai-chat': ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'OLLAMA_BASE_URL'],
  'ai-images': ['REPLICATE_API_TOKEN', 'COMFYUI_URL'],
  twitch: ['TWITCH_CLIENT_ID'],
  youtube: ['YOUTUBE_API_KEY'],
  spotify: ['SPOTIFY_CLIENT_ID'],
  dashboard: ['DISCORD_CLIENT_SECRET'],
};

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.includes(host.toLowerCase());
}

function defaultToken(): string {
  return randomBytes(32).toString('base64url');
}

/** The answers the wizard starts with: the profile's defaults, then the existing file's values. */
function initialAnswers(profile: Profile, current: Record<string, string> | null): Answers {
  const values: Record<string, string> = {};
  const names = new Set<string>();
  for (const page of PAGES) {
    for (const field of page.fields) {
      if (field.profiles && !field.profiles.includes(profile)) continue;
      names.add(field.name);
      const fallback = field.defaults?.[profile];
      if (fallback !== undefined) values[field.name] = fallback;
    }
  }
  const switches: Answers['switches'] = {};
  if (current) {
    const prefill = prefillValues(current);
    for (const name of names) {
      const value = prefill[name];
      if (value === undefined) continue;
      // A SQLite path is not a connection string for the PostgreSQL field.
      if (name === 'DATABASE_URL' && !/^postgres(?:ql)?:\/\//.test(value)) continue;
      values[name] = value;
    }
    for (const [id, signs] of Object.entries(SWITCH_SIGNS) as [SwitchId, readonly string[]][]) {
      switches[id] = signs.some((name) => (prefill[name] ?? '') !== '');
    }
  }
  return { values, switches };
}

/** A generator that returns the same values for the same calls, so Download matches Finish. */
function stableGenerator(base: SecretGenerator): SecretGenerator & { reset(): void } {
  const cache = new Map<string, string>();
  let position = 0;
  return {
    reset: () => {
      position = 0;
    },
    hex: (bytes) => {
      const key = `${position}:${bytes}`;
      position += 1;
      let value = cache.get(key);
      if (value === undefined) {
        value = base.hex(bytes);
        cache.set(key, value);
      }
      return value;
    },
  };
}

async function readBody(req: IncomingMessage): Promise<URLSearchParams | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf-8'));
}

function htmlReply(status: number, body: string): Reply {
  return { status, type: 'text/html; charset=utf-8', body };
}

function redirect(location: string, status = 303): Reply {
  return { status, body: '', headers: { Location: location } };
}

function forbidden(): Reply {
  return {
    status: 403,
    type: 'text/html; charset=utf-8',
    body: renderMessagePage(
      'Forbidden',
      'Open the address that the setup command printed in your terminal.',
    ),
  };
}

/** Starts the setup wizard server and returns once it is listening. */
export async function startInstallerServer(
  options: InstallerServerOptions,
  deps: InstallerServerDeps = {},
): Promise<InstallerServer> {
  const profile = options.profile;
  const host = options.host ?? DEFAULT_INSTALLER_HOST;
  const requestedPort = options.port ?? DEFAULT_INSTALLER_PORT;
  const root = resolve(options.root ?? findWorkspaceRoot());
  const files = PROFILE_FILES[profile];
  if (options.envFile !== undefined && basename(options.envFile) !== files.env) {
    throw new Error(
      `The settings file for the ${profile} install must be named ${files.env}, not ${basename(options.envFile)}.`,
    );
  }
  const settingsDir = options.envFile === undefined ? root : dirname(resolve(options.envFile));
  const target = join(settingsDir, files.env);
  const assetsDir = join(root, 'assets', 'installer');
  const legalDir = join(root, 'docs', 'legal');
  const randomToken = deps.randomToken ?? defaultToken;
  const now = deps.now ?? (() => new Date());
  const idleMs = deps.idleMs ?? DEFAULT_IDLE_MS;
  const generator = stableGenerator(deps.generate ?? cryptoSecretGenerator);
  const runCheck =
    deps.runCheck ??
    ((id: CheckId, answers: Answers) => runInstallerCheck(id, answers, deps.checkDeps ?? {}));

  const fileExists = existsSync(target);
  const startToken = randomToken();
  let tokenUsed = false;
  const session: Session = {
    id: randomToken(),
    csrf: randomToken(),
    salt: randomToken(),
    answers: initialAnswers(
      profile,
      fileExists ? parseEnvContent(readFileSync(target, 'utf-8')) : null,
    ),
    checks: new Map(),
  };
  let cookieIssued = false;
  let allowedHosts: string[] = [];

  // -- the model --------------------------------------------------------------------------

  const fingerprint = (id: CheckId): string =>
    createHmac('sha256', session.salt)
      .update(JSON.stringify([id, ...checkInputs(id, session.answers)]))
      .digest('hex');

  /** The stored result of a check when it was run for the current values. */
  const currentResult = (id: CheckId): CheckResult | null => {
    const stored = session.checks.get(id);
    return stored && stored.fingerprint === fingerprint(id) ? stored.result : null;
  };

  const pageComplete = (page: Page): boolean => {
    if (validatePage(page, profile, session.answers).length > 0) return false;
    return activeChecks(page, profile, session.answers).every((id) => {
      const result = currentResult(id);
      return result !== null && result.status !== 'fail';
    });
  };

  /** The first page before `index` that is not complete, or null. */
  const firstIncompleteBefore = (index: number): Page | null =>
    PAGES.slice(0, index).find((page) => !pageComplete(page)) ?? null;

  const runPageChecks = async (page: Page, force: boolean): Promise<void> => {
    for (const id of activeChecks(page, profile, session.answers)) {
      if (!force && currentResult(id) !== null) continue;
      const print = fingerprint(id);
      let result: CheckResult;
      try {
        result = await runCheck(id, session.answers, profile);
      } catch {
        result = { status: 'fail', message: 'The check could not run.' };
      }
      session.checks.set(id, { fingerprint: print, result });
    }
  };

  const issuesFor = (page: Page): Map<string, FieldIssue> => {
    const issues = new Map<string, FieldIssue>();
    for (const error of validatePage(page, profile, session.answers)) {
      issues.set(error.field, { message: error.message });
    }
    if (issues.size === 0) {
      for (const id of activeChecks(page, profile, session.answers)) {
        const result = currentResult(id);
        if (result?.status === 'fail') {
          const name = checkField(id, session.answers);
          if (!issues.has(name)) {
            issues.set(name, {
              message: result.message,
              ...(result.guideStep ? { guideStep: result.guideStep } : {}),
            });
          }
        }
      }
    }
    return issues;
  };

  const checkLinesFor = (page: Page): CheckLine[] => {
    const lines: CheckLine[] = [];
    for (const id of activeChecks(page, profile, session.answers)) {
      const result = currentResult(id);
      if (!result) continue;
      lines.push({
        id,
        status: result.status,
        message: result.message,
        ...(result.guideStep ? { guideStep: result.guideStep } : {}),
      });
    }
    return lines;
  };

  const inviteUrl = (): string | null => {
    const id = answerValue(session.answers, 'DISCORD_CLIENT_ID');
    return /^\d{17,20}$/.test(id) ? buildInviteUrl(id) : null;
  };

  const viewFor = (
    page: Page,
    issues: Map<string, FieldIssue>,
    writeErrors: string[] = [],
  ): StepView => ({
    profile,
    page,
    answers: session.answers,
    csrf: session.csrf,
    completed: new Set(PAGES.filter((candidate) => pageComplete(candidate)).map((p) => p.id)),
    issues,
    checkLines: checkLinesFor(page),
    targetFile: target,
    fileExists,
    install:
      page.id === 'install'
        ? {
            summary: summaryRows(profile, session.answers),
            inviteUrl: inviteUrl(),
            writeErrors,
          }
        : undefined,
  });

  const renderPage = (
    page: Page,
    status: number,
    issues: Map<string, FieldIssue>,
    writeErrors: string[] = [],
  ): Reply => htmlReply(status, renderStepPage(viewFor(page, issues, writeErrors)));

  /** Reads a posted page into the answers. Secrets left empty keep their current value. */
  const applyForm = (page: Page, form: URLSearchParams): void => {
    for (const def of page.switches) {
      if (def.alwaysOn?.includes(profile)) continue;
      if (def.profiles && !def.profiles.includes(profile)) continue;
      session.answers.switches[def.id] = form.get(`switch_${def.id}`) === 'on';
    }
    for (const field of page.fields) {
      if (field.profiles && !field.profiles.includes(profile)) continue;
      const posted = form.get(field.name);
      if (field.kind === 'checkbox') {
        session.answers.values[field.name] = posted === 'true' ? 'true' : '';
      } else if (posted === null) {
        continue;
      } else if (field.kind === 'secret') {
        if (posted.trim() !== '') session.answers.values[field.name] = posted.trim();
      } else {
        session.answers.values[field.name] = posted.trim();
      }
    }
  };

  const pageAt = (id: string): Page | null => PAGES.find((page) => page.id === id) ?? null;
  const stepUrl = (id: PageId): string => `/step/${id}`;
  const installPage = (): Page => getPage('install');
  const installIndex = PAGES.findIndex((page) => page.id === 'install');

  /** Redirect to the first page that blocks the install page, or null when all pages passed. */
  const installBlocker = (): Reply | null => {
    const blocker = firstIncompleteBefore(installIndex);
    return blocker ? redirect(stepUrl(blocker.id)) : null;
  };

  // -- the routes -------------------------------------------------------------------------

  const stepRoute = async (
    method: string,
    id: string,
    form: URLSearchParams | null,
  ): Promise<Reply> => {
    const page = pageAt(id);
    if (!page) return { status: 404, type: 'text/plain; charset=utf-8', body: 'Not found' };
    const index = PAGES.indexOf(page);
    const blocker = firstIncompleteBefore(index);
    if (blocker) return redirect(stepUrl(blocker.id));
    if (method === 'GET' || !form) return renderPage(page, 200, new Map());

    applyForm(page, form);
    const action = form.get('action') ?? 'next';
    const previous = PAGES[index - 1];
    if (action === 'back') return redirect(stepUrl((previous ?? page).id));
    if (action === 'verify') {
      if (validatePage(page, profile, session.answers).length === 0) {
        await runPageChecks(page, true);
      }
      const issues = issuesFor(page);
      return renderPage(page, issues.size > 0 ? 422 : 200, issues);
    }
    // Next: the answers first, then the checks for the values as they are now.
    if (validatePage(page, profile, session.answers).length === 0) {
      await runPageChecks(page, false);
    }
    const issues = issuesFor(page);
    if (issues.size > 0) return renderPage(page, 422, issues);
    const following = PAGES[index + 1];
    return redirect(stepUrl((following ?? page).id));
  };

  /** Validates the Install page's tick-boxes from a posted form. */
  const acceptIssues = (): Map<string, FieldIssue> => issuesFor(installPage());

  const finishRoute = (form: URLSearchParams | null): Reply => {
    const blocker = installBlocker();
    if (blocker) return blocker;
    const page = installPage();
    if (form) applyForm(page, form);
    const issues = acceptIssues();
    if (issues.size > 0) return renderPage(page, 422, issues);

    generator.reset();
    let written: ReturnType<typeof writeEnv>;
    try {
      written = writeEnv({
        root,
        settingsDir,
        profile,
        answers: session.answers,
        generate: generator,
        now,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The file could not be written.';
      return renderPage(page, 500, new Map(), [message]);
    }
    if (!written.ok) {
      return renderPage(
        page,
        422,
        new Map(),
        written.errors.map((error) => `${error.variable}: ${error.message}`),
      );
    }
    const on = effectiveSwitches(profile, session.answers.switches);
    return {
      ...htmlReply(
        200,
        renderResultPage({
          profile,
          file: written.file,
          backup: written.backup,
          created: written.created,
          generatedKeys: written.generatedKeys,
          inviteUrl: inviteUrl(),
          commands: nextCommands(profile, { update: !written.created, dashboard: on.dashboard }),
        }),
      ),
      after: () => {
        const timer = setTimeout(() => void stop('finished'), deps.finishGraceMs ?? 3000);
        timer.unref();
      },
    };
  };

  const downloadRoute = (form: URLSearchParams | null): Reply => {
    const blocker = installBlocker();
    if (blocker) return blocker;
    const page = installPage();
    if (form) applyForm(page, form);
    const issues = acceptIssues();
    if (issues.size > 0) {
      return form ? renderPage(page, 422, issues) : redirect(stepUrl('install'));
    }
    generator.reset();
    let planned: ReturnType<typeof planEnvFile>;
    try {
      planned = planEnvFile({
        root,
        settingsDir,
        profile,
        answers: session.answers,
        generate: generator,
        now,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The file could not be planned.';
      return renderPage(page, 500, new Map(), [message]);
    }
    if (!planned.ok) {
      return renderPage(
        page,
        422,
        new Map(),
        planned.errors.map((error) => `${error.variable}: ${error.message}`),
      );
    }
    return {
      status: 200,
      type: 'text/plain; charset=utf-8',
      body: planned.content,
      headers: { 'Content-Disposition': `attachment; filename="${files.env}"` },
    };
  };

  const assetRoute = (path: string): Reply => {
    if (path === '/assets/conditions.css') {
      return { status: 200, type: CONTENT_TYPES['.css'] ?? 'text/css', body: conditionalCss() };
    }
    const relative = path.slice('/assets/'.length);
    const segments = relative.split('/');
    const clean = segments.every((segment) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment));
    const allowed =
      clean &&
      ((segments.length === 1 && relative === 'wizard.css') ||
        (segments.length === 2 && (segments[0] === 'images' || segments[0] === 'fonts')));
    const type = CONTENT_TYPES[extname(relative).toLowerCase()];
    const file = join(assetsDir, ...segments);
    if (!allowed || !type || !existsSync(file)) {
      return { status: 404, type: 'text/plain; charset=utf-8', body: 'Not found' };
    }
    return { status: 200, type, body: '', file };
  };

  const legalRoute = (name: 'terms' | 'privacy'): Reply => {
    const file = join(legalDir, `${name}.md`);
    if (!existsSync(file)) {
      return { status: 404, type: 'text/plain; charset=utf-8', body: 'Not found' };
    }
    const title = name === 'terms' ? 'Terms of Service' : 'Privacy Policy';
    return htmlReply(200, renderLegalPage(title, readFileSync(file, 'utf-8')));
  };

  // -- the request handler ----------------------------------------------------------------

  const cookieValue = (req: IncomingMessage): string | null => {
    const header = req.headers.cookie;
    if (!header) return null;
    for (const part of header.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === COOKIE_NAME) return rest.join('=');
    }
    return null;
  };

  const route = async (req: IncomingMessage): Promise<Reply> => {
    const host = (req.headers.host ?? '').toLowerCase();
    if (!allowedHosts.includes(host)) return forbidden();
    const origin = req.headers.origin;
    if (origin !== undefined && !allowedHosts.some((allowed) => origin === `http://${allowed}`)) {
      return forbidden();
    }
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'POST') {
      return {
        status: 405,
        type: 'text/plain; charset=utf-8',
        body: 'Method not allowed',
        headers: { Allow: 'GET, POST' },
      };
    }
    const url = new URL(req.url ?? '/', `http://${host}`);
    const path = url.pathname;

    // The first visit exchanges the one-time token for the session cookie.
    const authorised = (() => {
      const cookie = cookieValue(req);
      return cookieIssued && cookie !== null && safeEqual(cookie, session.id);
    })();
    if (!authorised) {
      const token = url.searchParams.get('token');
      if (
        method === 'GET' &&
        path === '/' &&
        token !== null &&
        !tokenUsed &&
        safeEqual(token, startToken)
      ) {
        tokenUsed = true;
        cookieIssued = true;
        return {
          status: 302,
          body: '',
          headers: {
            Location: stepUrl('welcome'),
            'Set-Cookie': `${COOKIE_NAME}=${session.id}; HttpOnly; SameSite=Strict; Path=/`,
          },
        };
      }
      return forbidden();
    }

    let form: URLSearchParams | null = null;
    if (method === 'POST') {
      const type = (req.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase();
      if (type !== 'application/x-www-form-urlencoded') {
        return { status: 415, type: 'text/plain; charset=utf-8', body: 'Unsupported content type' };
      }
      form = await readBody(req);
      if (!form)
        return { status: 413, type: 'text/plain; charset=utf-8', body: 'Request too large' };
      const sent = form.get('_csrf');
      if (sent === null || !safeEqual(sent, session.csrf)) return forbidden();
    }

    if (method === 'GET' && path === '/') return redirect(stepUrl('welcome'));
    const step = /^\/step\/([a-z]+)$/.exec(path);
    if (step) return stepRoute(method, step[1] ?? '', form);
    if (method === 'POST' && path === '/finish') return finishRoute(form);
    if (path === '/download') {
      if (method === 'GET') {
        const accepted = ['accept_tos', 'accept_privacypolicy'].every(
          (name) => answerValue(session.answers, name) === 'true',
        );
        return accepted ? downloadRoute(null) : redirect(stepUrl('install'));
      }
      return downloadRoute(form);
    }
    if (method === 'GET' && path === '/legal/terms') return legalRoute('terms');
    if (method === 'GET' && path === '/legal/privacy') return legalRoute('privacy');
    if (method === 'GET' && path.startsWith('/assets/')) return assetRoute(path);
    return { status: 404, type: 'text/plain; charset=utf-8', body: 'Not found' };
  };

  // -- the server -------------------------------------------------------------------------

  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let stopReason: StopReason | null = null;
  let resolveStopped: (reason: StopReason) => void = () => undefined;
  const stopped = new Promise<StopReason>((done) => {
    resolveStopped = done;
  });
  let closing: Promise<void> | null = null;

  const armIdleTimer = (): void => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      void stop('idle');
    }, idleMs);
  };

  const send = (res: ServerResponse, reply: Reply, head: boolean): void => {
    const body: Buffer | string = reply.file ? readFileSync(reply.file) : reply.body;
    const headers: Record<string, string | number> = { ...SECURITY_HEADERS, ...reply.headers };
    if (reply.type) headers['Content-Type'] = reply.type;
    headers['Content-Length'] = Buffer.byteLength(body);
    res.writeHead(reply.status, headers);
    res.end(head ? undefined : body);
    if (reply.after) res.once('finish', reply.after);
  };

  const server: Server = createServer((req, res) => {
    armIdleTimer();
    route(req)
      .then((reply) => send(res, reply, req.method === 'HEAD'))
      .catch((error: unknown) => {
        deps.log?.(`request failed: ${error instanceof Error ? error.name : 'unknown error'}`);
        if (res.headersSent) {
          res.destroy();
          return;
        }
        send(
          res,
          {
            status: 500,
            type: 'text/html; charset=utf-8',
            body: renderMessagePage(
              'Something went wrong',
              'The setup could not handle that request. Try again.',
            ),
          },
          false,
        );
      });
  });

  function stop(reason: StopReason): Promise<void> {
    if (closing) return closing;
    stopReason = reason;
    if (idleTimer) clearTimeout(idleTimer);
    closing = new Promise<void>((done) => {
      server.close(() => {
        resolveStopped(stopReason ?? reason);
        done();
      });
      // Keep-alive connections would hold the server open. Idle ones close now; a response that
      // is still being delivered gets a moment before its connection is cut.
      server.closeIdleConnections();
      const grace = setTimeout(() => server.closeAllConnections(), 250);
      grace.unref();
    });
    return closing;
  }

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        rejectListen(
          new Error(
            `Port ${requestedPort} is already in use. Stop the program that uses it, or choose another port with --port.`,
          ),
        );
      } else if (error.code === 'EACCES') {
        rejectListen(
          new Error(
            `Port ${requestedPort} cannot be used (permission denied). Choose another port with --port.`,
          ),
        );
      } else {
        rejectListen(error);
      }
    });
    server.listen(requestedPort, host, resolveListen);
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : requestedPort;
  const hostLabel = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  allowedHosts = LOOPBACK_HOSTS.map((name) => `${name}:${port}`);
  if (!isLoopbackHost(hostLabel) && !WILDCARD_HOSTS.includes(host)) {
    allowedHosts.push(`${hostLabel.toLowerCase()}:${port}`.toLowerCase());
  }
  const shownHost = WILDCARD_HOSTS.includes(host) ? 'localhost' : hostLabel;
  armIdleTimer();

  return {
    url: `http://${shownHost}:${port}/?token=${encodeURIComponent(startToken)}`,
    host,
    port,
    envFile: target,
    stopped,
    close: () => stop('closed'),
  };
}
