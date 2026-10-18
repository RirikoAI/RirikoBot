import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { describeCommand, type Command } from '../src/plan.js';
import {
  runStarter,
  type DownloadedFile,
  type FolderState,
  type RunResult,
  type StarterDeps,
} from '../src/run.js';

const CWD = resolve('/work');
const FOLDER = resolve(CWD, 'ririko');
const LATEST_URL = 'https://api.github.com/repos/RirikoAI/RirikoBot/releases/latest';
const RAW = 'https://raw.githubusercontent.com/RirikoAI/RirikoBot/v2.0.0';

interface Harness {
  deps: StarterDeps;
  out: string[];
  err: string[];
  runs: {
    line: string;
    cwd: string | undefined;
    output: string;
    env: Record<string, string> | undefined;
  }[];
  urls: string[];
  written: { folder: string; files: DownloadedFile[] }[];
  asked: string[];
}

interface Options {
  folderState?: FolderState;
  answers?: string[];
  interactive?: boolean;
  nodeVersion?: string;
  exitCodes?: Record<string, number | null>;
  routes?: Record<string, { status: number; body?: unknown } | Error>;
  fileExists?: boolean;
  writeThrows?: boolean;
  hostUser?: string | null;
}

function harness(options: Options = {}): Harness {
  const out: string[] = [];
  const err: string[] = [];
  const runs: Harness['runs'] = [];
  const urls: string[] = [];
  const written: Harness['written'] = [];
  const asked: string[] = [];
  const answers = [...(options.answers ?? [])];
  const routes: NonNullable<Options['routes']> = {
    [LATEST_URL]: { status: 200, body: { tag_name: 'v2.0.0' } },
    [`${RAW}/docker-compose.production.yml`]: { status: 200, body: 'compose' },
    [`${RAW}/docker-compose.remote-lavalink.yml`]: { status: 200, body: 'remote' },
    [`${RAW}/.env.production.example`]: { status: 200, body: 'example' },
    [`${RAW}/docker/lavalink/application.yml`]: { status: 200, body: 'lavalink' },
    ...options.routes,
  };
  const deps: StarterDeps = {
    fetch: async (url) => {
      urls.push(url);
      const route = routes[url];
      if (route === undefined) throw new Error(`unexpected request ${url}`);
      if (route instanceof Error) throw route;
      return {
        ok: route.status >= 200 && route.status < 300,
        status: route.status,
        json: async () => route.body,
        text: async () => String(route.body),
      };
    },
    run: async (command: Command, output): Promise<RunResult> => {
      const line = describeCommand(command);
      runs.push({ line, cwd: command.cwd, output, env: command.env });
      const code = options.exitCodes && line in options.exitCodes ? options.exitCodes[line] : 0;
      return { code: code ?? null };
    },
    ask: async (question) => {
      asked.push(question);
      return answers.shift() ?? '';
    },
    interactive: options.interactive ?? true,
    tty: true,
    hostUser: options.hostUser === undefined ? null : options.hostUser,
    nodeVersion: options.nodeVersion ?? '22.14.0',
    version: '2.0.0',
    cwd: () => CWD,
    inspectFolder: () => options.folderState ?? 'missing',
    writeFiles: (folder, files) => {
      if (options.writeThrows) throw new Error('disk full');
      written.push({ folder, files: [...files] });
    },
    fileExists: () => options.fileExists ?? true,
    log: (line) => out.push(line),
    error: (line) => err.push(line),
  };
  return { deps, out, err, runs, urls, written, asked };
}

const WIZARD_LINE = `docker run --rm -it -p 127.0.0.1:3999:3999 -v ${FOLDER}:/setup ririkoai/ririkobot:2.0.0 ririko setup --docker --env-file /setup/.env.production --listen 0.0.0.0 --no-open`;
const UP_LINE = 'docker compose -f docker-compose.production.yml --env-file .env.production up -d';

describe('runStarter: arguments', () => {
  it('prints the help and the version', async () => {
    const help = harness();
    await expect(runStarter(['--help'], help.deps)).resolves.toBe(0);
    expect(help.out.join('\n')).toContain('Usage: npx ririko');
    const version = harness();
    await expect(runStarter(['--version'], version.deps)).resolves.toBe(0);
    expect(version.out).toEqual(['2.0.0']);
    expect(version.runs).toEqual([]);
  });

  it('prints the help and exits 1 for an unknown option', async () => {
    const h = harness();
    await expect(runStarter(['--bogus'], h.deps)).resolves.toBe(1);
    expect(h.err.join('\n')).toContain('Unknown option --bogus');
    expect(h.err.join('\n')).toContain('Usage: npx ririko');
    expect(h.runs).toEqual([]);
    expect(h.urls).toEqual([]);
  });
});

describe('runStarter: the folder', () => {
  it('refuses a folder that is not empty before anything else', async () => {
    for (const folderState of ['not-empty', 'not-a-folder'] as const) {
      const h = harness({ folderState });
      await expect(runStarter(['--docker'], h.deps)).resolves.toBe(1);
      expect(h.err.join('\n')).toContain('already exists and is not empty');
      expect(h.runs).toEqual([]);
      expect(h.urls).toEqual([]);
      expect(h.written).toEqual([]);
    }
  });

  it('accepts an empty folder', async () => {
    const h = harness({ folderState: 'empty', answers: ['n'] });
    await expect(runStarter(['--docker'], h.deps)).resolves.toBe(0);
  });
});

describe('runStarter: the choice', () => {
  it('asks and takes Docker as the default', async () => {
    const h = harness({ answers: ['', 'n'] });
    await expect(runStarter([], h.deps)).resolves.toBe(0);
    expect(h.asked[0]).toBe('Choose 1 or 2 [1]: ');
    expect(h.runs[0]?.line).toBe('docker --version');
  });

  it('takes source for 2, s and source', async () => {
    for (const answer of ['2', 's', 'Source']) {
      const h = harness({ answers: [answer] });
      await expect(runStarter([], h.deps)).resolves.toBe(0);
      expect(h.runs[0]?.line).toBe('git --version');
    }
  });

  it('asks again after a bad answer and gives up after three', async () => {
    const again = harness({ answers: ['maybe', '1', 'n'] });
    await expect(runStarter([], again.deps)).resolves.toBe(0);
    expect(again.out).toContain('Please answer 1 or 2.');

    const giveUp = harness({ answers: ['x', 'y', 'z'] });
    await expect(runStarter([], giveUp.deps)).resolves.toBe(1);
    expect(giveUp.err.join('\n')).toContain('No valid choice');
    expect(giveUp.urls).toEqual([]);
  });

  it('does not ask when --docker or --source is given', async () => {
    const h = harness({ answers: ['n'] });
    await runStarter(['--docker'], h.deps);
    expect(h.asked.some((question) => question.startsWith('Choose'))).toBe(false);
  });

  it('needs a flag without a terminal', async () => {
    const h = harness({ interactive: false });
    await expect(runStarter([], h.deps)).resolves.toBe(1);
    expect(h.err.join('\n')).toContain('--docker or --source');
  });
});

describe('runStarter: the Docker path', () => {
  it('runs the wizard as the host user when there is one', async () => {
    const h = harness({ answers: ['n'], hostUser: '1000:1000' });
    await expect(runStarter(['--docker'], h.deps)).resolves.toBe(0);
    expect(h.runs[2]?.line).toBe(WIZARD_LINE.replace('--rm -it', '--rm --user 1000:1000 -it'));
  });

  it('runs the exact command list and asks before starting', async () => {
    const h = harness({ answers: ['y'] });
    await expect(runStarter(['--docker'], h.deps)).resolves.toBe(0);

    expect(h.runs.map((run) => run.line)).toEqual([
      'docker --version',
      'docker compose version',
      WIZARD_LINE,
      UP_LINE,
    ]);
    expect(h.runs.map((run) => run.output)).toEqual(['quiet', 'quiet', 'inherit', 'inherit']);
    expect(h.runs[3]?.cwd).toBe(FOLDER);
    expect(h.runs[3]?.env).toEqual({ RIRIKO_VERSION: '2.0.0' });
    expect(h.asked).toHaveLength(1);
    expect(h.asked[0]).toContain('docker compose -f docker-compose.production.yml');
    expect(h.asked[0]).toContain('[Y/n]');

    expect(h.urls).toEqual([
      LATEST_URL,
      `${RAW}/docker-compose.production.yml`,
      `${RAW}/docker-compose.remote-lavalink.yml`,
      `${RAW}/.env.production.example`,
      `${RAW}/docker/lavalink/application.yml`,
    ]);
    expect(h.written).toEqual([
      {
        folder: FOLDER,
        files: [
          { path: 'docker-compose.production.yml', content: 'compose' },
          { path: 'docker-compose.remote-lavalink.yml', content: 'remote' },
          { path: '.env.production.example', content: 'example' },
          { path: 'docker/lavalink/application.yml', content: 'lavalink' },
        ],
      },
    ]);
  });

  it('prints the next steps, with the start command when the reader says no', async () => {
    const h = harness({ answers: ['n'] });
    await runStarter(['--docker'], h.deps);
    expect(h.runs.map((run) => run.line)).toEqual([
      'docker --version',
      'docker compose version',
      WIZARD_LINE,
    ]);
    const text = h.out.join('\n');
    expect(text).toContain('1. Start Ririko:');
    expect(text).toContain(
      'docker compose -f docker-compose.production.yml --env-file .env.production ps',
    );
    expect(text).toContain('commands:sync --global --all-guilds');
    expect(text).toContain('invite link');
    expect(text).toContain('https://ririko.ai/docs/deployment');
  });

  it('skips the start step after a yes and numbers the rest', async () => {
    const h = harness({ answers: ['yes'] });
    await runStarter(['--docker'], h.deps);
    expect(h.out.join('\n')).not.toContain('Start Ririko:');
    expect(h.out.join('\n')).toContain('1. Check the containers');
  });

  it('does not start the stack without a terminal to ask', async () => {
    const h = harness({ interactive: false });
    await expect(runStarter(['--docker'], h.deps)).resolves.toBe(0);
    expect(h.runs.map((run) => run.line)).not.toContain(UP_LINE);
    expect(h.asked).toEqual([]);
  });

  it('uses --ref and skips the release lookup', async () => {
    const rc = 'https://raw.githubusercontent.com/RirikoAI/RirikoBot/v2.0.1';
    const h = harness({
      answers: ['n'],
      routes: {
        [`${rc}/docker-compose.production.yml`]: { status: 200, body: 'c' },
        [`${rc}/docker-compose.remote-lavalink.yml`]: { status: 200, body: 'r' },
        [`${rc}/.env.production.example`]: { status: 200, body: 'e' },
        [`${rc}/docker/lavalink/application.yml`]: { status: 200, body: 'l' },
      },
    });
    await runStarter(['--docker', '--ref', 'v2.0.1'], h.deps);
    expect(h.urls).not.toContain(LATEST_URL);
    expect(h.runs[2]?.line).toContain('ririkoai/ririkobot:2.0.1');
  });

  it('stops when docker is missing, before any network call', async () => {
    const h = harness({ exitCodes: { 'docker --version': null } });
    await expect(runStarter(['--docker'], h.deps)).resolves.toBe(1);
    expect(h.err.join('\n')).toContain('Docker is not available');
    expect(h.urls).toEqual([]);
    expect(h.written).toEqual([]);
  });

  it('stops when docker compose is missing', async () => {
    const h = harness({ exitCodes: { 'docker compose version': 1 } });
    await expect(runStarter(['--docker'], h.deps)).resolves.toBe(1);
    expect(h.err.join('\n')).toContain('Docker Compose is not available');
  });

  it('writes nothing when one download fails', async () => {
    const h = harness({
      routes: { [`${RAW}/docker/lavalink/application.yml`]: { status: 404 } },
    });
    await expect(runStarter(['--docker'], h.deps)).resolves.toBe(1);
    expect(h.err.join('\n')).toContain('docker/lavalink/application.yml');
    expect(h.err.join('\n')).toContain('HTTP 404');
    expect(h.written).toEqual([]);
    expect(h.runs.map((run) => run.line)).toEqual(['docker --version', 'docker compose version']);
  });

  it('explains a network error while downloading', async () => {
    const h = harness({
      routes: { [`${RAW}/docker-compose.production.yml`]: new Error('socket hang up') },
    });
    await expect(runStarter(['--docker'], h.deps)).resolves.toBe(1);
    expect(h.err.join('\n')).toContain('Could not download docker-compose.production.yml');
    expect(h.err.join('\n')).toContain('socket hang up');
  });

  it('explains a non-Error rejection while downloading', async () => {
    const h = harness();
    const original = h.deps.fetch;
    h.deps.fetch = (url, init) =>
      url.endsWith('.env.production.example') ? Promise.reject('offline') : original(url, init);
    await expect(runStarter(['--docker'], h.deps)).resolves.toBe(1);
    expect(h.err.join('\n')).toContain('offline');
  });

  it('stops with a message when the files cannot be written', async () => {
    const h = harness({ writeThrows: true });
    await expect(runStarter(['--docker'], h.deps)).resolves.toBe(1);
    expect(h.err.join('\n')).toContain('disk full');
    expect(h.runs.map((run) => run.line)).toEqual(['docker --version', 'docker compose version']);
  });

  it('stops with the step name and the exit code when the wizard fails', async () => {
    const h = harness({ exitCodes: { [WIZARD_LINE]: 125 } });
    await expect(runStarter(['--docker'], h.deps)).resolves.toBe(125);
    expect(h.err.join('\n')).toContain('Step "Setup wizard" failed with exit code 125.');
  });

  it('stops when a step cannot start', async () => {
    const h = harness({ exitCodes: { [WIZARD_LINE]: null } });
    await expect(runStarter(['--docker'], h.deps)).resolves.toBe(1);
    expect(h.err.join('\n')).toContain('Step "Setup wizard" could not start');
  });

  it('stops when the wizard wrote no settings file', async () => {
    const h = harness({ fileExists: false, answers: ['y'] });
    await expect(runStarter(['--docker'], h.deps)).resolves.toBe(1);
    expect(h.err.join('\n')).toContain('did not write .env.production');
    expect(h.err.join('\n')).toContain('Download the file');
    expect(h.runs.map((run) => run.line)).not.toContain(UP_LINE);
  });

  it('stops with the exit code when the stack does not start', async () => {
    const h = harness({ answers: ['y'], exitCodes: { [UP_LINE]: 18 } });
    await expect(runStarter(['--docker'], h.deps)).resolves.toBe(18);
    expect(h.err.join('\n')).toContain('Step "Start the stack" failed with exit code 18.');
  });

  it('quotes a folder with spaces in the next steps', async () => {
    const h = harness({ answers: ['n'] });
    await runStarter(['--docker', 'my bot'], h.deps);
    expect(h.out.join('\n')).toContain(`cd "${resolve(CWD, 'my bot')}"`);
  });
});

describe('runStarter: the source path', () => {
  it('runs the exact command list', async () => {
    const h = harness();
    await expect(runStarter(['--source'], h.deps)).resolves.toBe(0);
    expect(h.runs.map((run) => run.line)).toEqual([
      'git --version',
      `git clone --branch v2.0.0 --depth 1 https://github.com/RirikoAI/RirikoBot.git ${FOLDER}`,
      'corepack enable pnpm',
      'pnpm install',
      'pnpm installer',
    ]);
    expect(h.runs.map((run) => run.output)).toEqual([
      'quiet',
      'inherit',
      'inherit',
      'inherit',
      'inherit',
    ]);
    expect(h.runs.slice(2).map((run) => run.cwd)).toEqual([FOLDER, FOLDER, FOLDER]);
    expect(h.urls).toEqual([LATEST_URL]);
    expect(h.out.join('\n')).toContain('SETUP.md');
    expect(h.out.join('\n')).toContain('Found Node.js 22.14.0.');
  });

  it('refuses Node.js older than 22 before any network call', async () => {
    const h = harness({ nodeVersion: '20.18.0' });
    await expect(runStarter(['--source'], h.deps)).resolves.toBe(1);
    expect(h.err.join('\n')).toContain('Node.js 22 or newer');
    expect(h.err.join('\n')).toContain('20.18.0');
    expect(h.runs).toEqual([]);
    expect(h.urls).toEqual([]);
  });

  it('stops when git is missing', async () => {
    const h = harness({ exitCodes: { 'git --version': null } });
    await expect(runStarter(['--source'], h.deps)).resolves.toBe(1);
    expect(h.err.join('\n')).toContain('Git is not available');
    expect(h.urls).toEqual([]);
  });

  it('stops at the first failing step with its name and code', async () => {
    const h = harness({ exitCodes: { 'pnpm install': 7 } });
    await expect(runStarter(['--source'], h.deps)).resolves.toBe(7);
    expect(h.err.join('\n')).toContain('Step "Install the dependencies" failed with exit code 7.');
    expect(h.runs.map((run) => run.line)).not.toContain('pnpm installer');
  });

  it('gives advice when corepack cannot be enabled', async () => {
    const h = harness({ exitCodes: { 'corepack enable pnpm': 1 } });
    await expect(runStarter(['--source'], h.deps)).resolves.toBe(1);
    expect(h.err.join('\n')).toContain('Step "Enable pnpm" failed');
    expect(h.err.join('\n')).toContain('permission');
  });

  it('uses --ref for the clone', async () => {
    const h = harness();
    await runStarter(['--source', '--ref', 'v2.3.4'], h.deps);
    expect(h.runs[1]?.line).toContain('--branch v2.3.4');
    expect(h.urls).toEqual([]);
  });
});

describe('runStarter: the release lookup', () => {
  it('stops with a clear message and writes nothing when GitHub is not reachable', async () => {
    const h = harness({ routes: { [LATEST_URL]: new Error('ENOTFOUND') } });
    await expect(runStarter(['--docker'], h.deps)).resolves.toBe(1);
    expect(h.err.join('\n')).toContain('Could not reach GitHub');
    expect(h.written).toEqual([]);
    expect(h.runs.map((run) => run.line)).toEqual(['docker --version', 'docker compose version']);
  });

  it('reports an unexpected error and exits 1', async () => {
    const h = harness();
    h.deps.inspectFolder = () => {
      throw new Error('stat failed');
    };
    await expect(runStarter(['--docker'], h.deps)).resolves.toBe(1);
    expect(h.err.join('\n')).toContain('unexpected error: stat failed');
  });

  it('reports a thrown value that is not an Error', async () => {
    const h = harness();
    h.deps.inspectFolder = () => {
      throw 'odd';
    };
    await expect(runStarter(['--docker'], h.deps)).resolves.toBe(1);
    expect(h.err.join('\n')).toContain('unexpected error: odd');
  });
});
