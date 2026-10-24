import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkReady,
  commitMessage,
  DEFAULT_TRAILER,
  main,
  parseArguments,
  planSteps,
  prepare,
  pullRequestBody,
  VERSION_PATHS,
  VERSION_TESTS,
  type PrepareOptions,
} from './prepare';
import type { Runner } from './run';
import { readVersions, REPO_ROOT } from './version';
import { VERSION_FILES } from './version-files';

const CURRENT = readVersions()[0]?.from ?? '';
const NEXT = '99.0.0';
const SHA = 'a'.repeat(40);

let root: string;
let notesFile: string;

beforeEach(() => {
  // A copy of the version files and a notes file, so nothing in the repository is read or changed.
  root = mkdtempSync(join(tmpdir(), 'ririko-prepare-'));
  for (const file of VERSION_FILES) {
    mkdirSync(join(root, dirname(file.path)), { recursive: true });
    copyFileSync(join(REPO_ROOT, file.path), join(root, file.path));
  }
  notesFile = join(root, 'notes.md');
  writeFileSync(notesFile, '# Ririko 99.0.0\n\n## Features\n\n- A feature (STORY-1)\n');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const options = (overrides: Partial<PrepareOptions> = {}): PrepareOptions => ({
  version: NEXT,
  notesFile,
  dryRun: false,
  trailer: DEFAULT_TRAILER,
  ...overrides,
});

/** Read-only commands the safety checks use. */
const CHECKS = [
  'git status --porcelain',
  'git rev-parse --abbrev-ref HEAD',
  'git fetch origin develop',
  'git rev-parse HEAD',
  'git rev-parse origin/develop',
  'gh pr list --base master --head develop --state open --json number',
];

interface Replies {
  [command: string]: string | Error;
}

function fakeRunner(replies: Replies = {}): {
  run: Runner;
  calls: string[];
  inputs: Map<string, string | undefined>;
} {
  const calls: string[] = [];
  const inputs = new Map<string, string | undefined>();
  const defaults: Replies = {
    'git status --porcelain': '',
    'git rev-parse --abbrev-ref HEAD': 'develop\n',
    'git rev-parse HEAD': `${SHA}\n`,
    'git rev-parse origin/develop': `${SHA}\n`,
    'gh pr list --base master --head develop --state open --json number': '[]\n',
  };
  const run: Runner = (command, args, runOptions) => {
    const line = [command, ...args].join(' ');
    calls.push(line);
    inputs.set(line, runOptions?.input);
    const reply = { ...defaults, ...replies }[line];
    if (reply instanceof Error) throw reply;
    if (command === 'gh' && args[0] === 'pr' && args[1] === 'create') {
      return 'https://github.com/RirikoAI/ririko/pull/999\n';
    }
    return reply ?? '';
  };
  return { run, calls, inputs };
}

describe('refusals', () => {
  const refuses = (replies: Replies, pattern: RegExp, overrides?: Partial<PrepareOptions>) => {
    const { run, calls } = fakeRunner(replies);
    const log = vi.fn();
    expect(() => prepare(options(overrides), { root, run, log })).toThrow(pattern);
    // Nothing that changes anything ran.
    expect(calls.filter((call) => !CHECKS.includes(call))).toEqual([]);
  };

  it('refuses a dirty working tree', () => {
    refuses({ 'git status --porcelain': ' M package.json\n' }, /not clean/);
  });

  it('refuses any branch but develop', () => {
    refuses({ 'git rev-parse --abbrev-ref HEAD': 'feat/x\n' }, /branch is feat\/x, not develop/);
  });

  it('refuses a develop that differs from origin/develop', () => {
    refuses(
      { 'git rev-parse origin/develop': `${'b'.repeat(40)}\n` },
      /does not equal origin\/develop/,
    );
  });

  it('refuses when a release pull request is already open', () => {
    refuses(
      { 'gh pr list --base master --head develop --state open --json number': '[{"number":7}]' },
      /Pull request #7 .* already open/,
    );
  });

  it('refuses a version that is not x.y.z or not greater than the current one', () => {
    refuses({}, /not a version/, { version: 'v99.0.0' });
    refuses({}, /not greater than the current version/, { version: CURRENT });
  });

  it('refuses a missing or empty notes file', () => {
    refuses({}, /missing or empty/, { notesFile: join(root, 'missing.md') });
    writeFileSync(notesFile, '  \n');
    refuses({}, /missing or empty/);
  });

  it('refuses before anything else when the version places do not match', () => {
    writeFileSync(join(root, 'package.json'), '{ "name": "x" }\n');
    refuses({}, /matches 0 times/);
  });
});

describe('dry run', () => {
  it('prints every step and runs no command that changes anything', () => {
    const { run, calls } = fakeRunner();
    const log = vi.fn();
    expect(prepare(options({ dryRun: true }), { root, run, log })).toBe('');
    expect(calls).toEqual(CHECKS);
    const output = log.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain(`pnpm release:version ${NEXT}`);
    expect(output).toContain('pnpm build');
    expect(output).toContain('pnpm typecheck');
    expect(output).toContain('pnpm vitest run');
    expect(output).toContain('pnpm format:check');
    expect(output).toContain(`chore(release): version ${NEXT}`);
    expect(output).toContain('git push origin develop');
    expect(output).toContain('gh pr create --base master --head develop');
    expect(output).toContain('merge commit');
    expect(output).toContain('A feature (STORY-1)');
  });

  it('still refuses in a dry run', () => {
    const { run } = fakeRunner({ 'git status --porcelain': '?? x\n' });
    expect(() => prepare(options({ dryRun: true }), { root, run, log: vi.fn() })).toThrow(
      /not clean/,
    );
  });
});

describe('prepare', () => {
  it('runs the steps in order and returns the pull request address', () => {
    const { run, calls, inputs } = fakeRunner();
    const log = vi.fn();
    const address = prepare(options(), { root, run, log });
    expect(address).toBe('https://github.com/RirikoAI/ririko/pull/999');
    expect(calls.slice(CHECKS.length)).toEqual([
      `pnpm release:version ${NEXT}`,
      'pnpm build',
      'pnpm typecheck',
      `pnpm vitest run ${VERSION_TESTS.join(' ')}`,
      'pnpm format:check',
      `git add -- ${VERSION_PATHS.join(' ')}`,
      `git commit -m chore(release): version ${NEXT} -m ${DEFAULT_TRAILER}`,
      'git push origin develop',
      `gh pr create --base master --head develop --title chore(release): version ${NEXT} --body-file -`,
    ]);
    const body = inputs.get(calls[calls.length - 1] as string) ?? '';
    expect(body).toContain('merge commit');
    expect(body).toContain('Do not squash');
    expect(body).toContain('# Ririko 99.0.0');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('/pull/999'));
  });

  it('commits with the given trailer', () => {
    const { run, calls } = fakeRunner();
    prepare(options({ trailer: 'Co-Authored-By: A <a@b.c>' }), { root, run, log: vi.fn() });
    expect(calls).toContain(
      `git commit -m chore(release): version ${NEXT} -m Co-Authored-By: A <a@b.c>`,
    );
  });

  it('stops at the first failing step and never commits or pushes', () => {
    const { run, calls } = fakeRunner({ 'pnpm typecheck': new Error('type errors') });
    expect(() => prepare(options(), { root, run, log: vi.fn() })).toThrow(
      /Step 3 \(Typecheck\) failed: type errors.*Nothing was committed or pushed/,
    );
    expect(calls.some((call) => call.startsWith('git commit') || call.startsWith('git push'))).toBe(
      false,
    );
  });

  it('says to check git and gh when a late step fails', () => {
    const { run } = fakeRunner({ 'git push origin develop': new Error('rejected') });
    expect(() => prepare(options(), { root, run, log: vi.fn() })).toThrow(
      /Step 8 .* rejected.*Check git and gh/,
    );
  });
});

describe('planSteps and helpers', () => {
  it('uses the five version tests and the 17 version places', () => {
    expect(VERSION_TESTS).toHaveLength(5);
    expect(VERSION_TESTS.every((path) => path.endsWith('.test.ts'))).toBe(true);
    expect(VERSION_PATHS).toHaveLength(17);
  });

  it('builds the commit message and the pull request body', () => {
    expect(commitMessage('2.2.0', 'T')).toEqual({
      title: 'chore(release): version 2.2.0',
      body: 'T',
    });
    const body = pullRequestBody('2.2.0', '\n# Notes\n');
    expect(body).toContain('pnpm release:publish 2.2.0');
    expect(body.endsWith('# Notes\n')).toBe(true);
  });

  it('stages the version files by name, never everything', () => {
    const steps = planSteps(options(), 'notes');
    const stage = steps.find((step) => step.args[0] === 'add');
    expect(stage?.args).toEqual(['add', '--', ...VERSION_PATHS]);
    expect(stage?.args).not.toContain('-A');
    expect(stage?.args).not.toContain('.');
  });

  it('checkReady passes on a clean develop that equals origin', () => {
    const { run } = fakeRunner();
    expect(() =>
      checkReady(options(), {
        root,
        run,
        log: vi.fn(),
        readFile: () => 'notes',
        fileExists: () => true,
      }),
    ).not.toThrow();
  });
});

describe('parseArguments and main', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('reads the version, notes file and flags', () => {
    expect(parseArguments(['2.2.0', '--notes', 'n.md', '--dry-run'], root)).toEqual({
      version: '2.2.0',
      notesFile: join(root, 'n.md'),
      dryRun: true,
      trailer: DEFAULT_TRAILER,
    });
    expect(
      parseArguments(['--trailer', 'X: y', '2.2.0', '--notes', notesFile], root),
    ).toMatchObject({
      notesFile,
      trailer: 'X: y',
      dryRun: false,
    });
  });

  it('rejects a missing version, a missing notes file and an unknown flag', () => {
    expect(parseArguments(['--notes', 'n.md'], root)).toBeNull();
    expect(parseArguments(['2.2.0'], root)).toBeNull();
    expect(parseArguments(['2.2.0', '--notes', 'n.md', '--force'], root)).toBeNull();
    expect(parseArguments(['2.2.0', '3.0.0', '--notes', 'n.md'], root)).toBeNull();
    expect(parseArguments(['2.2.0', '--notes', 'n.md', '--trailer', ' '], root)).toBeNull();
  });

  it('main exits 0 for a dry run and 1 for a usage error or a refusal', () => {
    const { run } = fakeRunner();
    expect(main([NEXT, '--notes', notesFile, '--dry-run'], { root, run })).toBe(0);
    expect(main([NEXT], { root, run })).toBe(1);
    const dirty = fakeRunner({ 'git status --porcelain': ' M x\n' });
    expect(main([NEXT, '--notes', notesFile, '--dry-run'], { root, run: dirty.run })).toBe(1);
  });
});
