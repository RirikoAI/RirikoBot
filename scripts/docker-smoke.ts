/**
 * Smoke checks for the production images built from the root Dockerfile.
 *
 *   docker build --target bot-runner -t ririko-bot:smoke .
 *   docker build --target web-runner -t ririko-web:smoke .
 *   node scripts/docker-smoke.ts bot web
 *
 * Checks images that are already built; it never builds one. Every check goes through
 * `docker run`, `exec`, `logs`, `inspect` and `diff` only (no bind mounts, no host ports), so it
 * also works against a remote Docker engine such as CircleCI's. Containers run without a network,
 * with every capability dropped.
 * No dependencies: Node runs this file with TypeScript type stripping (keep to erasable syntax:
 * no enums, no parameter properties, type-only imports).
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const APP_UID = '10001';
const START_TIMEOUT_MS = 90_000;
const LOG_PROBLEMS = ['EACCES', 'EROFS', 'ERR_MODULE_NOT_FOUND', 'Cannot find module'];

interface DockerResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

interface Check {
  name: string;
  run: () => string | null; // null when the check passes, otherwise why it failed
}

interface Target {
  image: string;
  /** Directories the app user must be able to write, relative to /app. */
  writableDirs: string[];
  /** App files and folders the app user must not be able to write, relative to /app. */
  readOnlyPaths: string[];
  extraChecks: (image: string) => Check[];
}

/** A container started by `withContainer`, for checks that inspect it while it runs. */
interface RunningContainer {
  name: string;
  logs: () => string;
  exec: (args: string[]) => DockerResult;
}

function docker(args: string[], timeoutMs = 120_000): DockerResult {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: timeoutMs });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function output(result: DockerResult): string {
  return `${result.stdout}${result.stderr}`.trim();
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function lastLines(text: string, count = 40): string {
  return text.split('\n').slice(-count).join('\n');
}

/** Runs a shell snippet from /app in a throwaway container as the image's own user. */
function shell(image: string, script: string): DockerResult {
  return docker(['run', '--rm', '--network', 'none', image, 'sh', '-c', `cd /app && ${script}`]);
}

/**
 * Starts the image's own command with `env`, without a network or capabilities, and waits until
 * its logs contain `readyMarker` or it exits. `inspect` then returns the problems it finds; the
 * container's log is checked for permission and module errors and it is always removed.
 */
function withContainer(
  image: string,
  env: Record<string, string>,
  readyMarker: string,
  inspect: (container: RunningContainer) => string[],
): string | null {
  const name = `ririko-smoke-${process.pid}-${Date.now()}`;
  const envArgs = Object.entries(env).flatMap(([key, value]) => ['--env', `${key}=${value}`]);
  const started = docker([
    'run',
    '--detach',
    '--name',
    name,
    '--network',
    'none',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    ...envArgs,
    image,
  ]);
  if (started.status !== 0) return `docker run failed: ${output(started)}`;
  const container: RunningContainer = {
    name,
    logs: () => output(docker(['logs', name])),
    exec: (args) => docker(['exec', name, ...args]),
  };
  try {
    const deadline = Date.now() + START_TIMEOUT_MS;
    let logs = container.logs();
    while (!logs.includes(readyMarker) && Date.now() < deadline) {
      const running = docker(['inspect', '--format', '{{.State.Running}}', name]);
      if (running.stdout.trim() !== 'true') break;
      sleep(1000);
      logs = container.logs();
    }
    const problems = logs.includes(readyMarker) ? inspect(container) : [];
    if (!logs.includes(readyMarker)) problems.push(`never logged "${readyMarker}"`);
    logs = container.logs();
    for (const marker of LOG_PROBLEMS) {
      if (logs.includes(marker)) problems.push(`logs contain ${marker}`);
    }
    if (problems.length === 0) return null;
    return `${problems.join('; ')}\n--- container logs ---\n${lastLines(logs)}`;
  } finally {
    docker(['rm', '--force', name]);
  }
}

/** True when the container created /app/data/ririko.sqlite (the default DATABASE_URL). */
function createdDatabase(container: RunningContainer): boolean {
  return /^A \/app\/data\/ririko\.sqlite$/m.test(docker(['diff', container.name]).stdout);
}

function uidCheck(image: string): Check {
  return {
    name: `runs as uid ${APP_UID}`,
    run: () => {
      const result = shell(image, 'id -u && id -g');
      const ids = result.stdout.trim().split(/\s+/);
      return ids[0] === APP_UID && ids[1] === APP_UID
        ? null
        : `id -u / id -g printed "${output(result)}"`;
    },
  };
}

function filesystemCheck(image: string, target: Target): Check {
  return {
    name: 'only the data directories are writable',
    run: () => {
      const lines = [
        ...target.writableDirs.map(
          (dir) =>
            `if touch "${dir}/.smoke" 2>/dev/null; then echo "ok ${dir}"; else echo "no ${dir}"; fi`,
        ),
        ...target.readOnlyPaths.map(
          (path) => `if [ -w "${path}" ]; then echo "writable ${path}"; else echo "ok ${path}"; fi`,
        ),
        'if touch .smoke 2>/dev/null; then echo "writable /app"; else echo "ok /app"; fi',
      ];
      const result = shell(image, lines.join('\n'));
      const failures = result.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('ok '));
      if (result.status !== 0) return `shell exited ${result.status}: ${output(result)}`;
      return failures.length ? failures.join('; ') : null;
    },
  };
}

/**
 * Starts the bot with dummy credentials. Startup gets as far as registering the commands
 * (database, services and command set all load) and then fails to reach Discord.
 */
function botBootCheck(image: string): Check {
  return {
    name: 'boots to command registration and creates the SQLite database',
    run: () =>
      withContainer(
        image,
        { DISCORD_TOKEN: 'smoke-test-token', DISCORD_CLIENT_ID: '100000000000000001' },
        '✓ Registered',
        (container) =>
          createdDatabase(container) ? [] : ['no /app/data/ririko.sqlite was created'],
      ),
  };
}

/** Requests `path` from inside the container; prints `<status> <location>`. */
function request(container: RunningContainer, path: string): string {
  const script = `fetch('http://127.0.0.1:3000${path}', { redirect: 'manual' })
    .then((r) => console.log(r.status, r.headers.get('location') ?? ''))
    .catch((e) => console.log('error', e.message));`;
  return container.exec(['node', '-e', script]).stdout.trim();
}

/**
 * Starts the dashboard with dummy credentials. The sign-in route builds the dashboard services,
 * which opens (and creates) the SQLite database, then redirects to Discord's authorize page.
 */
function webServeCheck(image: string): Check {
  return {
    name: 'serves the dashboard and creates the SQLite database',
    run: () =>
      withContainer(
        image,
        {
          DISCORD_TOKEN: 'smoke-test-token',
          DISCORD_CLIENT_ID: '100000000000000001',
          DISCORD_CLIENT_SECRET: 'smoke-test-client-secret',
          DASHBOARD_URL: 'http://localhost:3000',
          SECRET_VAULT_KEY: `${'0'.repeat(63)}1`,
        },
        'Ready in',
        (container) => {
          const problems: string[] = [];
          const home = request(container, '/');
          if (!home.startsWith('200')) problems.push(`GET / answered "${home}"`);
          const login = request(container, '/api/auth/login');
          if (!/^30[27] https:\/\/discord\.com\/api\/v10\/oauth2\/authorize/.test(login)) {
            problems.push(`GET /api/auth/login answered "${login}"`);
          }
          if (!createdDatabase(container)) problems.push('no /app/data/ririko.sqlite was created');
          return problems;
        },
      ),
  };
}

/** Loads every native package Next.js left external (linked from .next/node_modules). */
function webExternalsCheck(image: string): Check {
  const script = `
    const fs = require('node:fs');
    const path = require('node:path');
    const root = '/app/apps/web/.next/node_modules';
    const entries = fs.readdirSync(root).flatMap((name) =>
      name.startsWith('@')
        ? fs.readdirSync(path.join(root, name)).map((inner) => path.join(root, name, inner))
        : [path.join(root, name)],
    );
    if (entries.length === 0) console.log('FAIL no external packages found');
    for (const entry of entries) {
      try { require(entry); console.log('ok', path.basename(entry)); }
      catch (error) { console.log('FAIL', path.basename(entry), error.message); }
    }`;
  return {
    name: 'native packages Next.js leaves external load',
    run: () => {
      const result = docker(['run', '--rm', '--network', 'none', image, 'node', '-e', script]);
      const failures = result.stdout.split('\n').filter((line) => line.startsWith('FAIL'));
      if (result.status !== 0) return `node exited ${result.status}: ${output(result)}`;
      return failures.length ? failures.join('; ') : null;
    },
  };
}

const TARGETS: Record<string, Target> = {
  bot: {
    image: 'ririko-bot:smoke',
    writableDirs: ['data', 'public/cards', 'public/bosses', 'storage/welcomer-backgrounds'],
    readOnlyPaths: ['apps/bot/dist/main.js', 'packages/core/dist/index.js', 'assets'],
    extraChecks: (image) => [
      {
        name: 'ffmpeg runs',
        run: () => {
          const result = shell(image, 'ffmpeg -hide_banner -version');
          return result.status === 0 && result.stdout.startsWith('ffmpeg version')
            ? null
            : `ffmpeg -version failed: ${output(result)}`;
        },
      },
      botBootCheck(image),
    ],
  },
  web: {
    image: 'ririko-web:smoke',
    writableDirs: ['data', 'public/cards', 'storage/welcomer-backgrounds', 'apps/web/.next/cache'],
    readOnlyPaths: ['apps/web/.next/BUILD_ID', 'apps/web/next.config.ts', 'assets'],
    extraChecks: (image) => [webExternalsCheck(image), webServeCheck(image)],
  },
};

export function main(argv: string[]): number {
  const names = argv.length ? argv : Object.keys(TARGETS);
  const unknown = names.filter((name) => !(name in TARGETS));
  if (unknown.length) {
    console.error(
      `Unknown target(s): ${unknown.join(', ')}. Known: ${Object.keys(TARGETS).join(', ')}.`,
    );
    return 2;
  }

  let failed = 0;
  for (const name of names) {
    const target = TARGETS[name]!;
    const present = docker(['image', 'inspect', target.image]);
    if (present.status !== 0) {
      console.error(`✖ ${name}: image ${target.image} not found; build it first.`);
      failed++;
      continue;
    }
    const checks = [
      uidCheck(target.image),
      filesystemCheck(target.image, target),
      ...target.extraChecks(target.image),
    ];
    for (const check of checks) {
      const problem = check.run();
      if (problem === null) {
        console.log(`✓ ${name}: ${check.name}`);
      } else {
        console.error(`✖ ${name}: ${check.name}\n  ${problem.replace(/\n/g, '\n  ')}`);
        failed++;
      }
    }
  }
  console.log(failed ? `\n${failed} check(s) failed.` : '\nAll smoke checks passed.');
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
