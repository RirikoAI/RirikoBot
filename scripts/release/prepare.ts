/**
 * Prepares a release: one command from a clean develop to the develop-to-master pull request.
 *
 *   pnpm release:prepare 2.2.0 --notes .local/release-notes-v2.2.0.md
 *   pnpm release:prepare 2.2.0 --notes <file> --dry-run     prints every step, changes nothing
 *   pnpm release:prepare 2.2.0 --notes <file> --trailer "Co-Authored-By: Name <mail>"
 *
 * It refuses unless the tree is clean, the branch is develop, develop equals origin/develop and no
 * release pull request is open. Then it sets the version (release:version), runs build, typecheck,
 * the five version tests and format:check, commits "chore(release): version x.y.z", pushes develop
 * and opens the pull request from develop to master. The body says to merge with a merge commit
 * and holds the notes. The maintainer merges once; `pnpm release:publish` does the rest.
 */
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRunner, type Runner } from './run';
import { compareVersions, isVersion, readVersions, REPO_ROOT } from './version';
import { CURRENT_VERSION_FILE, VERSION_FILES } from './version-files';

export const RELEASE_BRANCH = 'develop';
export const RELEASE_BASE = 'master';

/** The commit trailer used when `--trailer` is not given. */
export const DEFAULT_TRAILER = 'Co-Authored-By: Claude <noreply@anthropic.com>';

/** The five tests that assert the version: the test files among the version places. */
export const VERSION_TESTS: readonly string[] = VERSION_FILES.map((file) => file.path).filter(
  (path) => path.endsWith('.test.ts'),
);

export interface PrepareOptions {
  version: string;
  /** The reviewed release notes; their text goes into the pull request body. */
  notesFile: string;
  dryRun: boolean;
  trailer: string;
}

export interface PrepareDeps {
  root: string;
  run: Runner;
  readFile?: (path: string) => string;
  fileExists?: (path: string) => boolean;
  log?: (line: string) => void;
}

interface Step {
  label: string;
  command: string;
  args: string[];
  /** Show the program's output while it runs. */
  stream?: boolean;
  input?: string;
}

export function commitMessage(version: string, trailer: string): { title: string; body: string } {
  return { title: `chore(release): version ${version}`, body: trailer };
}

/** The pull request body: the merge instruction first, then the notes as written. */
export function pullRequestBody(version: string, notes: string): string {
  return [
    `Release ${version}: merge this pull request with a **merge commit**. Do not squash and do not rebase.`,
    '',
    'A merge commit keeps `master` and `develop` sharing history, so the next release does not start',
    'with an empty-looking diff. After the merge, run `pnpm release:publish ' + version + '`.',
    '',
    '---',
    '',
    notes.trim(),
    '',
  ].join('\n');
}

/** The version places that the bump changes, as git paths. */
export const VERSION_PATHS: readonly string[] = VERSION_FILES.map((file) => file.path);

/** Every command the release runs after the checks pass, in order. */
export function planSteps(options: PrepareOptions, notes: string): Step[] {
  const { version, trailer } = options;
  const message = commitMessage(version, trailer);
  return [
    {
      label: `Set the version ${version} in every place`,
      command: 'pnpm',
      args: ['release:version', version],
      stream: true,
    },
    { label: 'Build', command: 'pnpm', args: ['build'], stream: true },
    { label: 'Typecheck', command: 'pnpm', args: ['typecheck'], stream: true },
    {
      label: 'Run the five version tests',
      command: 'pnpm',
      args: ['vitest', 'run', ...VERSION_TESTS],
      stream: true,
    },
    { label: 'Check the formatting', command: 'pnpm', args: ['format:check'], stream: true },
    { label: 'Stage the version files', command: 'git', args: ['add', '--', ...VERSION_PATHS] },
    {
      label: `Commit "${message.title}"`,
      command: 'git',
      args: ['commit', '-m', message.title, '-m', message.body],
    },
    { label: `Push ${RELEASE_BRANCH}`, command: 'git', args: ['push', 'origin', RELEASE_BRANCH] },
    {
      label: `Open the pull request ${RELEASE_BRANCH} to ${RELEASE_BASE}`,
      command: 'gh',
      args: [
        'pr',
        'create',
        '--base',
        RELEASE_BASE,
        '--head',
        RELEASE_BRANCH,
        '--title',
        message.title,
        '--body-file',
        '-',
      ],
      input: pullRequestBody(version, notes),
    },
  ];
}

/**
 * Throws a message for the first thing that makes the release unsafe. Reads only: git status,
 * the branch, the tip of origin/develop, the open pull requests and the version places.
 */
export function checkReady(options: PrepareOptions, deps: Required<PrepareDeps>): void {
  const { version, notesFile } = options;
  const { run, root } = deps;
  if (!isVersion(version)) {
    throw new Error(`"${version}" is not a version like 2.1.3 (x.y.z, no "v", no prerelease)`);
  }
  if (!deps.fileExists(notesFile) || deps.readFile(notesFile).trim() === '') {
    throw new Error(
      `The notes file ${notesFile} is missing or empty; run pnpm release:notes first`,
    );
  }
  const current = readVersions(root).find((place) => place.path === CURRENT_VERSION_FILE);
  if (current && compareVersions(version, current.from) <= 0) {
    throw new Error(`${version} is not greater than the current version ${current.from}`);
  }
  if (run('git', ['status', '--porcelain']).trim() !== '') {
    throw new Error('The working tree is not clean; commit or remove every change first');
  }
  const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  if (branch !== RELEASE_BRANCH) {
    throw new Error(`The branch is ${branch}, not ${RELEASE_BRANCH}`);
  }
  run('git', ['fetch', 'origin', RELEASE_BRANCH]);
  const head = run('git', ['rev-parse', 'HEAD']).trim();
  const remote = run('git', ['rev-parse', `origin/${RELEASE_BRANCH}`]).trim();
  if (head !== remote) {
    throw new Error(
      `${RELEASE_BRANCH} (${head.slice(0, 9)}) does not equal origin/${RELEASE_BRANCH} (${remote.slice(0, 9)}); pull or push first`,
    );
  }
  const open = JSON.parse(
    run('gh', [
      'pr',
      'list',
      '--base',
      RELEASE_BASE,
      '--head',
      RELEASE_BRANCH,
      '--state',
      'open',
      '--json',
      'number',
    ]) || '[]',
  ) as { number: number }[];
  if (open.length > 0) {
    throw new Error(
      `Pull request #${open[0]?.number} from ${RELEASE_BRANCH} to ${RELEASE_BASE} is already open`,
    );
  }
}

/** Runs the whole preparation. Returns the pull request address `gh` printed (empty in a dry run). */
export function prepare(options: PrepareOptions, deps: PrepareDeps): string {
  const resolved: Required<PrepareDeps> = {
    readFile: (path) => readFileSync(path, 'utf8'),
    fileExists: existsSync,
    log: console.log,
    ...deps,
  };
  const { log, run } = resolved;
  checkReady(options, resolved);
  const steps = planSteps(options, resolved.readFile(options.notesFile));
  log(
    `${options.dryRun ? '[dry run] ' : ''}Releasing ${options.version}: ${RELEASE_BRANCH} is clean and equals origin/${RELEASE_BRANCH}.`,
  );
  let address = '';
  steps.forEach((step, index) => {
    const line = `${index + 1}. ${step.label}: ${[step.command, ...step.args].join(' ')}`;
    if (options.dryRun) {
      log(`[dry run] ${line}`);
      if (step.input !== undefined) {
        log('[dry run]    pull request body:');
        for (const bodyLine of step.input.split('\n')) log(`[dry run]    | ${bodyLine}`);
      }
      return;
    }
    log(line);
    try {
      const output = run(step.command, step.args, {
        ...(step.stream ? { stream: true } : {}),
        ...(step.input === undefined ? {} : { input: step.input }),
      });
      if (step.command === 'gh') address = output.trim();
    } catch (error) {
      const hint =
        index < 6
          ? ' Nothing was committed or pushed. The version bump is still in the working tree: fix the problem and revert the bump yourself before running this again.'
          : ' Check git and gh before running this again.';
      throw new Error(
        `Step ${index + 1} (${step.label}) failed: ${error instanceof Error ? error.message : String(error)}.${hint}`,
        { cause: error },
      );
    }
  });
  if (address) log(`Release pull request: ${address}`);
  return address;
}

const USAGE =
  'Usage: pnpm release:prepare <x.y.z> --notes <file> [--dry-run] [--trailer "Co-Authored-By: Name <mail>"]';

/** Reads the command line. Returns null with a message on stderr when it is wrong. */
export function parseArguments(argv: string[], root: string = REPO_ROOT): PrepareOptions | null {
  let version: string | undefined;
  let notes: string | undefined;
  let trailer = DEFAULT_TRAILER;
  let dryRun = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index] as string;
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--notes') notes = argv[++index];
    else if (arg === '--trailer') trailer = argv[++index] ?? '';
    else if (!arg.startsWith('--') && version === undefined) version = arg;
    else {
      console.error(`Unknown argument "${arg}"\n${USAGE}`);
      return null;
    }
  }
  if (version === undefined || notes === undefined || notes === '' || trailer.trim() === '') {
    console.error(USAGE);
    return null;
  }
  return {
    version,
    notesFile: isAbsolute(notes) ? notes : resolve(root, notes),
    dryRun,
    trailer,
  };
}

export function main(argv: string[], deps?: PrepareDeps): number {
  const resolved = deps ?? { root: REPO_ROOT, run: createRunner(REPO_ROOT) };
  try {
    const options = parseArguments(argv, resolved.root);
    if (!options) return 1;
    prepare(options, resolved);
    return 0;
  } catch (error) {
    console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
