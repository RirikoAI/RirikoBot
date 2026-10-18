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
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const APP_UID = '10001';
const BOT_IMAGE = 'ririko-bot:smoke';
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

function docker(args: string[], input?: string | Buffer): DockerResult {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 120_000, input });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Like `docker`, for commands whose stdout is binary (a tar stream). */
function dockerBytes(args: string[]): { status: number | null; stdout: Buffer; stderr: string } {
  const result = spawnSync('docker', args, { timeout: 120_000, maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr.toString() };
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
 * its logs contain `readyMarker` or it exits. `prepare` can copy files into the created container
 * before it starts (returning an error message stops the check). `inspect` then returns the
 * problems it finds; the container's log is checked for permission and module errors and it is
 * always removed. `createArgs` go to `docker create` (volume mounts, for example).
 */
function withContainer(
  image: string,
  env: Record<string, string>,
  readyMarker: string,
  inspect: (container: RunningContainer) => string[],
  prepare?: (name: string) => string | null,
  createArgs: string[] = [],
): string | null {
  const name = `ririko-smoke-${process.pid}-${Date.now()}`;
  const envArgs = Object.entries(env).flatMap(([key, value]) => ['--env', `${key}=${value}`]);
  const created = docker([
    'create',
    '--name',
    name,
    '--network',
    'none',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    ...envArgs,
    ...createArgs,
    image,
  ]);
  if (created.status !== 0) return `docker create failed: ${output(created)}`;
  const container: RunningContainer = {
    name,
    logs: () => output(docker(['logs', name])),
    exec: (args) => docker(['exec', name, ...args]),
  };
  try {
    const prepared = prepare?.(name) ?? null;
    if (prepared !== null) return prepared;
    const started = docker(['start', name]);
    if (started.status !== 0) return `docker start failed: ${output(started)}`;
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
        (container) => {
          const problems: string[] = [];
          if (!createdDatabase(container)) problems.push('no /app/data/ririko.sqlite was created');
          // The bot exits once Discord turns out to be unreachable, so the probes themselves are
          // checked by botHealthcheckCheck.
          if (!container.logs().includes('• Health probes on :8080')) {
            problems.push('the health probe server did not start');
          }
          return problems;
        },
      ),
  };
}

/**
 * Runs the operator CLI the way `docker exec <bot container> ririko <command>` does. `--help`
 * makes the CLI load every command module, so a command that needs a package the image does not
 * ship (a devDependency, a workspace package without its dist) fails here.
 */
function botCliCheck(image: string): Check {
  return {
    name: 'ririko CLI is on PATH and lists its commands',
    run: () => {
      const result = shell(image, 'ririko --help');
      if (result.status !== 0) return `ririko --help exited ${result.status}: ${output(result)}`;
      const missing = ['passkeys:reset', 'guild:config', 'economy:config', 'doctor'].filter(
        (command) => !result.stdout.includes(command),
      );
      return missing.length ? `ririko --help does not list: ${missing.join(', ')}` : null;
    },
  };
}

/** The image's HEALTHCHECK command (`CMD` form) as an argument list; null when it has none. */
function healthcheckCommand(image: string): string[] | null {
  const result = docker(['image', 'inspect', '--format', '{{json .Config.Healthcheck}}', image]);
  const config = JSON.parse(result.stdout.trim() || 'null') as { Test?: string[] } | null;
  return config?.Test?.[0] === 'CMD' ? config.Test.slice(1) : null;
}

/**
 * Runs the image's HEALTHCHECK command against the bot's real probe server, started inside the
 * image with a working database and a gateway that is not ready.
 */
function botHealthcheckCheck(image: string): Check {
  return {
    name: 'HEALTHCHECK passes against the probe server, and /ready waits for Discord',
    run: () => {
      const command = healthcheckCommand(image);
      if (!command) return 'the image has no HEALTHCHECK';
      const script = `
        import { spawn } from 'node:child_process';
        import { startHealthServer } from '/app/apps/bot/dist/health.js';
        const server = startHealthServer(8080, {
          version: 'smoke',
          ping: async () => ({ ok: true, dialect: 'sqlite', latencyMs: 0 }),
          gateway: () => ({ state: 'CONNECTING', pingMs: null }),
          started: () => true,
        });
        await new Promise((resolve) => server.once('listening', resolve));
        // Asynchronous, so this process keeps answering the probe the command sends.
        const status = await new Promise((resolve) =>
          spawn(process.env.CHECK_BIN, JSON.parse(process.env.CHECK_ARGS)).on('exit', resolve),
        );
        const ready = await fetch('http://127.0.0.1:8080/ready');
        console.log('healthcheck', status, 'ready', ready.status);
        server.close();`;
      const result = docker([
        'run',
        '--rm',
        '--network',
        'none',
        '--env',
        `CHECK_BIN=${command[0]}`,
        '--env',
        `CHECK_ARGS=${JSON.stringify(command.slice(1))}`,
        image,
        'node',
        '--input-type=module',
        '-e',
        script,
      ]);
      return /healthcheck 0 ready 503/.test(result.stdout)
        ? null
        : `expected "healthcheck 0 ready 503", got: ${output(result)}`;
    },
  };
}

/** The first regular file in a tar stream (as `docker cp <container>:<file> -` writes it). */
function firstTarFile(tar: Buffer): { content: Buffer; uid: number } | null {
  const field = (header: Buffer, start: number, length: number) =>
    parseInt(
      header
        .subarray(start, start + length)
        .toString('ascii')
        .replace(/\0.*$/s, '')
        .trim() || '0',
      8,
    );
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) return null;
    const size = field(header, 124, 12);
    const type = header[156];
    // '0' or NUL is a regular file; PAX ('x', 'g') and other headers are skipped.
    if (type === 0x30 || type === 0) {
      return {
        content: tar.subarray(offset + 512, offset + 512 + size),
        uid: field(header, 108, 8),
      };
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return null;
}

/** The real 1.4.0 schema the migration tests use (packages/database, TASK-1261). */
const LEGACY_SCHEMA_PATH = new URL(
  '../packages/database/src/migration/__fixtures__/legacy-1.4.0-schema.sql',
  import.meta.url,
);

/**
 * Builds a small 1.4.0 database (two users, 1500 coins) in a throwaway container with the image's
 * own better-sqlite3, and returns it as a tar of `legacy/ririko.db` plus the file's sha256.
 */
function buildLegacyDatabase(image: string): { tar: Buffer; sha256: string } | string {
  const name = `ririko-smoke-legacy-${process.pid}-${Date.now()}`;
  const script = `
    const Database = require('better-sqlite3');
    const fs = require('node:fs');
    fs.mkdirSync('/tmp/legacy');
    const db = new Database('/tmp/legacy/ririko.db');
    db.exec(fs.readFileSync(0, 'utf8'));
    db.exec(\`INSERT INTO guild (id, name, prefix) VALUES ('guild_smoke', 'Smoke Server', '!');
      INSERT INTO "user" (id, username, displayName, coins, karma) VALUES
        ('user_one', 'One', 'One', 1200, 40), ('user_two', 'Two', 'Two', 300, 0);\`);
    db.close();
    const hash = require('node:crypto').createHash('sha256');
    console.log(hash.update(fs.readFileSync('/tmp/legacy/ririko.db')).digest('hex'));`;
  try {
    const built = docker(
      // Built as root, like the 1.4.0 image wrote its data folder; better-sqlite3 resolves from
      // the database package's own node_modules.
      [
        'run',
        '-i',
        '--name',
        name,
        '--network',
        'none',
        '--user',
        '0:0',
        '-w',
        '/app/packages/database',
        image,
      ].concat(['node', '-e', script]),
      readFileSync(LEGACY_SCHEMA_PATH),
    );
    if (built.status !== 0) return `could not build a 1.4.0 database: ${output(built)}`;
    const tar = dockerBytes(['cp', `${name}:/tmp/legacy`, '-']);
    if (tar.status !== 0) return `could not copy the 1.4.0 database out: ${tar.stderr}`;
    return { tar: tar.stdout, sha256: built.stdout.trim() };
  } finally {
    docker(['rm', '--force', name]);
  }
}

/**
 * The 1.4.0 upgrade path (docs/migrations.md section 4): a 1.4.0 database at /app/legacy, owned
 * by root as on a read-only mount, is migrated on first start before the bot registers its
 * commands, and is left byte-for-byte unchanged.
 */
function botLegacyUpgradeCheck(image: string): Check {
  return {
    name: 'migrates a 1.4.0 database from /app/legacy on first start',
    run: () => {
      const legacy = buildLegacyDatabase(image);
      if (typeof legacy === 'string') return legacy;
      return withContainer(
        image,
        { DISCORD_TOKEN: 'smoke-test-token', DISCORD_CLIENT_ID: '100000000000000001' },
        '✓ Registered',
        (container) => {
          const problems: string[] = [];
          const logs = container.logs();
          if (
            !logs.includes(
              '✓ Migrated the 1.4.0 database at /app/legacy/ririko.db: 2 users, 1 guilds, 1500 coins',
            )
          ) {
            problems.push('no "✓ Migrated the 1.4.0 database" summary');
          }
          if (!createdDatabase(container)) problems.push('no /app/data/ririko.sqlite was created');
          // The bot exits after failing to reach Discord, so read the file back with docker cp
          // (exec needs a running container).
          const copy = dockerBytes(['cp', `${container.name}:/app/legacy/ririko.db`, '-']);
          const file = copy.status === 0 ? firstTarFile(copy.stdout) : null;
          if (!file) problems.push(`could not read /app/legacy/ririko.db back: ${copy.stderr}`);
          else {
            if (createHash('sha256').update(file.content).digest('hex') !== legacy.sha256) {
              problems.push('the legacy database changed');
            }
            if (file.uid !== 0) problems.push(`/app/legacy/ririko.db is owned by uid ${file.uid}`);
          }
          // Nothing besides the copied file may appear under /app/legacy (no journal, no WAL).
          const extra = docker(['diff', container.name])
            .stdout.split('\n')
            .filter((line) => / \/app\/legacy\//.test(line) && !line.endsWith('/ririko.db'));
          if (extra.length) problems.push(`files changed under /app/legacy: ${extra.join(', ')}`);
          return problems;
        },
        // The tar keeps the builder's owner (root), so the app user cannot write the copy.
        (name) => {
          const copied = docker(['cp', '-', `${name}:/app`], legacy.tar);
          return copied.status === 0 ? null : `docker cp failed: ${output(copied)}`;
        },
      );
    },
  };
}

/**
 * The 1.4.0 compose layout: a root-owned volume at /app/data holding ririko.db, and
 * DATABASE_NAME set. The bot must print the upgrade steps and exit non-zero without creating
 * anything in the volume.
 */
function botOldLayoutCheck(image: string): Check {
  return {
    name: 'refuses the 1.4.0 compose layout with upgrade steps',
    run: () => {
      const volume = `ririko-smoke-old-layout-${process.pid}-${Date.now()}`;
      const mount = ['--volume', `${volume}:/app/data`];
      try {
        const seeded = docker([
          'run',
          '--rm',
          '--network',
          'none',
          '--user',
          '0:0',
          ...mount,
          image,
          'sh',
          '-c',
          'touch /app/data/ririko.db && chown -R 0:0 /app/data && chmod 755 /app/data',
        ]);
        if (seeded.status !== 0) return `could not seed the 1.4.0 volume: ${output(seeded)}`;
        return withContainer(
          image,
          {
            DISCORD_BOT_TOKEN: 'smoke-test-token',
            DISCORD_APPLICATION_ID: '100000000000000001',
            DATABASE_TYPE: 'better-sqlite3',
            DATABASE_NAME: '/app/data/ririko.db',
          },
          '4. Remove DATABASE_NAME',
          (container) => {
            const problems: string[] = [];
            const logs = container.logs();
            for (const reason of [
              'DATABASE_NAME is set',
              'a 1.4.0 database is at /app/data/ririko.db',
              'the data directory /app/data is not writable',
            ]) {
              if (!logs.includes(reason)) problems.push(`no "${reason}" in the message`);
            }
            let state = '';
            for (let i = 0; i < 10; i++) {
              state = docker([
                'inspect',
                '--format',
                '{{.State.Status}} {{.State.ExitCode}}',
                container.name,
              ]).stdout.trim();
              if (state.startsWith('exited')) break;
              sleep(500);
            }
            if (!/^exited [1-9]/.test(state))
              problems.push(`expected a non-zero exit, got "${state}"`);
            if (logs.includes('Initializing bot repositories')) problems.push('startup went on');
            const files = docker([
              'run',
              '--rm',
              '--network',
              'none',
              ...mount,
              image,
              'ls',
              '-A',
              '/app/data',
            ]);
            if (files.stdout.trim() !== 'ririko.db') {
              problems.push(`/app/data changed: ${output(files).replace(/\s+/g, ', ')}`);
            }
            return problems;
          },
          undefined,
          mount,
        );
      } finally {
        docker(['volume', 'rm', '--force', volume]);
      }
    },
  };
}

/** Requests `path` from inside the container; prints `<status> <location>`. */
function request(container: RunningContainer, path: string, port = 3000): string {
  const script = `fetch('http://127.0.0.1:${port}${path}', { redirect: 'manual' })
    .then((r) => console.log(r.status, r.headers.get('location') ?? ''))
    .catch((e) => console.log('error', e.message));`;
  return container.exec(['node', '-e', script]).stdout.trim();
}

/** Like `request`, but prints `<status> <body>` (for the JSON probe bodies). */
function requestBody(container: RunningContainer, path: string, port = 3000): string {
  const script = `fetch('http://127.0.0.1:${port}${path}')
    .then(async (r) => console.log(r.status, await r.text()))
    .catch((e) => console.log('error', e.message));`;
  return container.exec(['node', '-e', script]).stdout.trim();
}

/** Dummy credentials the dashboard needs to start; it never reaches Discord (no network). */
const WEB_ENV = {
  DISCORD_TOKEN: 'smoke-test-token',
  DISCORD_CLIENT_ID: '100000000000000001',
  DISCORD_CLIENT_SECRET: 'smoke-test-client-secret',
  DASHBOARD_URL: 'http://localhost:3000',
  SECRET_VAULT_KEY: `${'0'.repeat(63)}1`,
};

/** Runs the image's HEALTHCHECK inside the container; a problem text, or null when it passes. */
function healthcheckProblem(image: string, container: RunningContainer): string | null {
  const command = healthcheckCommand(image);
  const check = command ? container.exec(command) : null;
  return check?.status === 0
    ? null
    : `HEALTHCHECK failed: ${check ? output(check) : 'the image has none'}`;
}

/**
 * The dashboard alone on an empty SQLite database, which nothing migrates (the bot does, ADR-015).
 * It must stay live, so the HEALTHCHECK passes and the host watchdog does not restart it while
 * the bot migrates, and report not ready, naming the pending migration in its log.
 */
function webPendingMigrationsCheck(image: string): Check {
  return {
    name: 'stays live but not ready while the database has pending migrations',
    run: () =>
      withContainer(image, WEB_ENV, 'Ready in', (container) => {
        const problems: string[] = [];
        for (const path of ['/health', '/api/health']) {
          const probe = requestBody(container, path);
          if (!probe.startsWith('200 ')) problems.push(`GET ${path} answered "${probe}"`);
          else if (!probe.includes('MIGRATION_PENDING') || !probe.includes('0000_baseline')) {
            problems.push(`GET ${path} does not report the pending migration: "${probe}"`);
          }
        }
        for (const path of ['/ready', '/api/ready']) {
          const probe = requestBody(container, path);
          if (probe !== '503 {"ready":false}') problems.push(`GET ${path} answered "${probe}"`);
        }
        if (!createdDatabase(container)) problems.push('no /app/data/ririko.sqlite was created');
        // The readiness probes above logged why the dashboard is not ready.
        if (!/pending migration\(s\) \(0000_baseline/.test(container.logs())) {
          problems.push('the log does not name the pending migration');
        }
        const unhealthy = healthcheckProblem(image, container);
        if (unhealthy) problems.push(unhealthy);
        return problems;
      }),
  };
}

/**
 * Migrates a new SQLite database with the bot image's own CLI (`ririko db:migrate`), the way the
 * deploy does it, and returns the file as a tar (as `docker cp <container>:<file> -` writes it).
 * The builder runs as the image's own user, so the file belongs to the user that runs the dashboard.
 */
function buildMigratedDatabase(botImage: string): Buffer | string {
  if (docker(['image', 'inspect', botImage]).status !== 0) {
    return `the migrated-database check needs the bot image ${botImage}; build it first (docker build --target bot-runner -t ${botImage} .)`;
  }
  const name = `ririko-smoke-migrated-${process.pid}-${Date.now()}`;
  // `chmod 666` keeps the file writable even if the engine ignores the owner (see the copy below).
  const script =
    'mkdir -p /tmp/m && ririko db:migrate && ririko db:migrate --status && chmod 666 /tmp/m/ririko.sqlite && ls -A /tmp/m';
  try {
    const built = docker([
      'run',
      '--name',
      name,
      '--network',
      'none',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--env',
      'DATABASE_DIALECT=sqlite',
      '--env',
      'DATABASE_URL=/tmp/m/ririko.sqlite',
      botImage,
      'sh',
      '-c',
      script,
    ]);
    if (built.status !== 0) return `ririko db:migrate failed: ${output(built)}`;
    if (!/Pending:\s+\(none\)/.test(built.stdout)) {
      return `the database is still behind after ririko db:migrate: ${output(built)}`;
    }
    // A leftover WAL would hold changes that the copied file does not have.
    if (built.stdout.split('\n').some((line) => line.trim() === 'ririko.sqlite-wal')) {
      return `the migrated database left a WAL file behind: ${output(built)}`;
    }
    // Copying the file (not the folder) gives a tar whose only entry is `ririko.sqlite`.
    const tar = dockerBytes(['cp', `${name}:/tmp/m/ririko.sqlite`, '-']);
    if (tar.status !== 0) return `could not copy the migrated database out: ${tar.stderr}`;
    const file = firstTarFile(tar.stdout);
    if (!file || file.content.length === 0) return 'the migrated database copy is empty';
    return tar.stdout;
  } finally {
    docker(['rm', '--force', name]);
  }
}

/**
 * The dashboard on a database that the bot image migrated beforehand, as in a normal deploy:
 * everything answers, the sign-in redirects to Discord and the HEALTHCHECK passes.
 */
function webMigratedDatabaseCheck(image: string): Check {
  return {
    name: 'serves the dashboard on a database migrated by the bot image',
    run: () => {
      const database = buildMigratedDatabase(BOT_IMAGE);
      if (typeof database === 'string') return database;
      return withContainer(
        image,
        WEB_ENV,
        'Ready in',
        (container) => {
          const problems: string[] = [];
          const home = request(container, '/');
          if (!home.startsWith('200')) problems.push(`GET / answered "${home}"`);
          const login = request(container, '/api/auth/login');
          if (!/^30[27] https:\/\/discord\.com\/api\/v10\/oauth2\/authorize/.test(login)) {
            problems.push(`GET /api/auth/login answered "${login}"`);
          }
          for (const path of ['/health', '/ready', '/api/health', '/api/ready']) {
            const probe = request(container, path);
            if (!probe.startsWith('200')) problems.push(`GET ${path} answered "${probe}"`);
          }
          const unhealthy = healthcheckProblem(image, container);
          if (unhealthy) problems.push(unhealthy);
          return problems;
        },
        // `-a` keeps the owner from the tar (the app user); without it the engine writes the file
        // as root, which `chmod 666` above still lets the app user open for writing.
        (name) => {
          const copied = docker(['cp', '-a', '-', `${name}:/app/data`], database);
          return copied.status === 0 ? null : `docker cp failed: ${output(copied)}`;
        },
      );
    },
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
    image: BOT_IMAGE,
    writableDirs: ['data', 'public/cards', 'public/bosses', 'storage/welcomer-backgrounds'],
    readOnlyPaths: [
      'apps/bot/dist/main.js',
      'apps/cli/dist/index.js',
      '/usr/local/bin/ririko',
      'packages/core/dist/index.js',
      'assets',
    ],
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
      botHealthcheckCheck(image),
      botLegacyUpgradeCheck(image),
      botOldLayoutCheck(image),
    ],
  },
  web: {
    image: 'ririko-web:smoke',
    writableDirs: ['data', 'public/cards', 'storage/welcomer-backgrounds', 'apps/web/.next/cache'],
    readOnlyPaths: ['apps/web/.next/BUILD_ID', 'apps/web/next.config.ts', 'assets'],
    extraChecks: (image) => [
      webExternalsCheck(image),
      webPendingMigrationsCheck(image),
      webMigratedDatabaseCheck(image),
    ],
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
