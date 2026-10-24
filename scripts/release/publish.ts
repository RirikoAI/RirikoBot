/**
 * Publishes a release after the maintainer has merged the release pull request.
 *
 *   pnpm release:publish 2.2.0                         the whole sequence
 *   pnpm release:publish 2.2.0 --dry-run               prints the steps and which are done, changes nothing
 *   pnpm release:publish 2.2.0 --notes <file>          notes other than .local/release-notes-v2.2.0.md
 *
 * It refuses unless origin/master holds the version in every place (release:version --check) and
 * the release pull request from develop to master is merged. Then, in this order:
 *
 *   1. tag vX.Y.Z on origin/master, annotated "Ririko X.Y.Z", and push the tag;
 *   2. wait until Docker Hub has X.Y.Z, X.Y and X for both images, one digest per image;
 *   3. publish the GitHub release from the notes file and mark it Latest;
 *   4. move `latest` of both images to that digest with `docker buildx imagetools create`;
 *   5. report the staging deploy. It never approves production: that stays the maintainer's.
 *
 * The images come before the GitHub release because the starter (`npx ririko --docker`) reads the
 * latest release and then pulls its images. Every step looks at the current state first and is
 * skipped when it is already done, so after a failure the same command continues where it stopped.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { releaseTags } from '../release-tags';
import { IMAGE_REPOSITORIES, notesPath } from './notes';
import { RELEASE_BASE, RELEASE_BRANCH } from './prepare';
import { createRunner, type Runner } from './run';
import { checkVersion, isVersion, REPO_ROOT, type VersionChange } from './version';
import { VERSION_FILES } from './version-files';

export const RELEASE_REMOTE = 'origin';

/** How long to wait for CircleCI to push the images, and how often to look. */
export const IMAGE_TIMEOUT_MS = 40 * 60 * 1000;
export const POLL_INTERVAL_MS = 30 * 1000;
/** How long Docker Hub may take to show a `latest` that was just moved. */
export const LATEST_TIMEOUT_MS = 5 * 60 * 1000;

/** The commit statuses CircleCI reports for a release tag's commit (docs/release.md section 8). */
export const STAGING_CONTEXTS = [
  'ci/circleci: deploy-lavalink-staging',
  'ci/circleci: deploy-staging',
] as const;

export interface PublishOptions {
  version: string;
  /** The reviewed release notes; they become the body of the GitHub release. */
  notesFile: string;
  dryRun: boolean;
}

/** Reads a JSON document over HTTP. Resolves to null for 404 and throws for any other failure. */
export type FetchJson = (url: string) => Promise<unknown>;

export interface PublishDeps {
  root: string;
  run: Runner;
  fetchJson?: FetchJson;
  sleep?: (milliseconds: number) => Promise<void>;
  /** The clock in milliseconds; tests give a fake one that `sleep` advances. */
  now?: () => number;
  log?: (line: string) => void;
  fileExists?: (path: string) => boolean;
  imageTimeoutMs?: number;
  pollIntervalMs?: number;
}

type Resolved = Required<PublishDeps>;

/** The default `fetchJson`: the global fetch with a time limit. */
export const httpJson: FetchJson = async (url) => {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
};

function resolveDeps(deps: PublishDeps): Resolved {
  return {
    fetchJson: httpJson,
    sleep: (milliseconds) => new Promise((done) => setTimeout(done, milliseconds)),
    now: () => Date.now(),
    log: console.log,
    fileExists: existsSync,
    imageTimeoutMs: IMAGE_TIMEOUT_MS,
    pollIntervalMs: POLL_INTERVAL_MS,
    ...deps,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ==========================================
// Docker Hub
// ==========================================

/** One tag as Docker Hub shows it: the digest of the index and the digests of its images. */
export interface TagInfo {
  digest: string;
  children: string[];
}

/** The tag `tag` of `repository`, or null when the tag does not exist (yet). */
export async function readTag(
  fetchJson: FetchJson,
  repository: string,
  tag: string,
): Promise<TagInfo | null> {
  const body = await fetchJson(`https://hub.docker.com/v2/repositories/${repository}/tags/${tag}`);
  if (body === null) return null;
  const record = (typeof body === 'object' ? body : {}) as { digest?: unknown; images?: unknown };
  if (typeof record.digest !== 'string' || record.digest === '') {
    throw new Error(`Docker Hub shows no digest for ${repository}:${tag}`);
  }
  const children = Array.isArray(record.images)
    ? (record.images as { digest?: unknown }[])
        .map((image) => image.digest)
        .filter((digest): digest is string => typeof digest === 'string' && digest !== '')
    : [];
  return { digest: record.digest, children: [...new Set(children)].sort() };
}

/**
 * True when two tags are the same image. `docker buildx imagetools create` can wrap the source in
 * a new index, so the index digests may differ; the images inside are then compared.
 */
export function sameImage(a: TagInfo, b: TagInfo): boolean {
  if (a.digest === b.digest) return true;
  return (
    a.children.length > 0 &&
    a.children.length === b.children.length &&
    a.children.every((digest, index) => digest === b.children[index])
  );
}

export interface ImageCheck {
  /** What is missing or wrong; empty when both images carry all their tags. */
  problems: string[];
}

/** Both images need X.Y.Z, X.Y and X, and the three tags of an image must share one digest. */
export async function checkImages(fetchJson: FetchJson, version: string): Promise<ImageCheck> {
  const tags = releaseTags(`v${version}`);
  const problems: string[] = [];
  for (const repository of IMAGE_REPOSITORIES) {
    const digests = new Map<string, string>();
    for (const tag of tags) {
      try {
        const info = await readTag(fetchJson, repository, tag);
        if (info === null) problems.push(`${repository}:${tag} is not on Docker Hub yet`);
        else digests.set(tag, info.digest);
      } catch (error) {
        problems.push(`${repository}:${tag} could not be read: ${messageOf(error)}`);
      }
    }
    if (new Set(digests.values()).size > 1) {
      const shown = [...digests].map(([tag, digest]) => `${tag}=${digest.slice(0, 19)}`);
      problems.push(`${repository} tags do not share one digest (${shown.join(', ')})`);
    }
  }
  return { problems };
}

/** Calls `check` until it reports no problems; throws with the last problems at the timeout. */
async function poll(
  deps: Resolved,
  timeoutMs: number,
  what: string,
  check: () => Promise<string[]>,
): Promise<void> {
  const started = deps.now();
  let shown = '';
  for (;;) {
    const problems = await check();
    if (problems.length === 0) return;
    const text = problems.join('; ');
    if (text !== shown) {
      deps.log(`   waiting for ${what}: ${text}`);
      shown = text;
    }
    if (deps.now() - started >= timeoutMs) {
      throw new Error(
        `Timed out after ${Math.round(timeoutMs / 60_000)} minutes waiting for ${what}: ${text}`,
      );
    }
    await deps.sleep(deps.pollIntervalMs);
  }
}

// ==========================================
// Git and GitHub
// ==========================================

/** The commit that `tag` points to on the remote, or null when the remote has no such tag. */
export function remoteTagCommit(run: Runner, tag: string): string | null {
  const lines = run('git', [
    'ls-remote',
    '--tags',
    RELEASE_REMOTE,
    `refs/tags/${tag}`,
    `refs/tags/${tag}^{}`,
  ]).split(/\r?\n/);
  let direct: string | null = null;
  let peeled: string | null = null;
  for (const line of lines) {
    const [sha, ref] = line.trim().split(/\s+/);
    if (!sha || !ref) continue;
    if (ref === `refs/tags/${tag}^{}`) peeled = sha;
    else if (ref === `refs/tags/${tag}`) direct = sha;
  }
  return peeled ?? direct;
}

/** The commit that the local tag points to, or null when there is no local tag. */
export function localTagCommit(run: Runner, tag: string): string | null {
  try {
    return (
      run('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`]).trim() || null
    );
  } catch {
    return null;
  }
}

/** The places on origin/master that do not hold `version`; empty when it is all there. */
export function masterVersionMismatches(version: string, run: Runner): VersionChange[] {
  const directory = mkdtempSync(join(tmpdir(), 'ririko-publish-'));
  try {
    for (const file of VERSION_FILES) {
      const target = join(directory, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, run('git', ['show', `${RELEASE_REMOTE}/${RELEASE_BASE}:${file.path}`]));
    }
    return checkVersion(version, directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

interface ReleaseState {
  exists: boolean;
  isLatest: boolean;
  isDraft: boolean;
}

/** The tag of the release GitHub shows as Latest, or null when there is none. */
export function latestReleaseTag(run: Runner): string | null {
  try {
    const found = JSON.parse(
      run('gh', ['api', 'repos/{owner}/{repo}/releases/latest']) || '{}',
    ) as {
      tag_name?: string;
    };
    return found.tag_name ?? null;
  } catch {
    return null;
  }
}

/** The GitHub release for `tag`. A release that does not exist is a state, any other error is not. */
export function releaseState(run: Runner, tag: string): ReleaseState {
  try {
    const found = JSON.parse(run('gh', ['release', 'view', tag, '--json', 'isDraft']) || '{}') as {
      isDraft?: boolean;
    };
    return {
      exists: true,
      isLatest: latestReleaseTag(run) === tag,
      isDraft: found.isDraft === true,
    };
  } catch (error) {
    if (/release not found/i.test(messageOf(error))) {
      return { exists: false, isLatest: false, isDraft: false };
    }
    throw error;
  }
}

export interface ReleaseContext {
  /** The tip of origin/master: the commit the tag goes on. */
  sha: string;
  /** The merged release pull request. */
  pullRequest: number;
  tag: string;
}

/**
 * Throws a message for the first thing that makes publishing unsafe. Reads only: it fetches
 * origin/master, reads files from it and asks git and gh about tags, pull requests and releases.
 */
export function checkReady(options: PublishOptions, deps: Resolved): ReleaseContext {
  const { version, notesFile } = options;
  const { run } = deps;
  if (!isVersion(version)) {
    throw new Error(`"${version}" is not a version like 2.1.3 (x.y.z, no "v", no prerelease)`);
  }
  const tag = `v${version}`;
  run('git', ['fetch', RELEASE_REMOTE, RELEASE_BASE]);
  const sha = run('git', ['rev-parse', `${RELEASE_REMOTE}/${RELEASE_BASE}`]).trim();
  const wrong = masterVersionMismatches(version, run);
  if (wrong.length > 0) {
    const shown = wrong.map((place) => `${place.path} holds ${place.from}`).join(', ');
    throw new Error(
      `${RELEASE_REMOTE}/${RELEASE_BASE} does not hold ${version} everywhere: ${shown}. Merge the release pull request first`,
    );
  }
  const query = ['pr', 'list', '--base', RELEASE_BASE, '--head', RELEASE_BRANCH];
  const open = JSON.parse(run('gh', [...query, '--state', 'open', '--json', 'number']) || '[]') as {
    number: number;
  }[];
  if (open.length > 0) {
    throw new Error(
      `Pull request #${open[0]?.number} from ${RELEASE_BRANCH} to ${RELEASE_BASE} is still open; the maintainer has to merge it`,
    );
  }
  const merged = (
    JSON.parse(
      run('gh', [...query, '--state', 'merged', '--limit', '1', '--json', 'number,mergeCommit']) ||
        '[]',
    ) as { number: number; mergeCommit?: { oid?: string } | null }[]
  )[0];
  const mergeCommit = merged?.mergeCommit?.oid;
  let onMaster = false;
  if (mergeCommit) {
    try {
      run('git', ['merge-base', '--is-ancestor', mergeCommit, sha]);
      onMaster = true;
    } catch {
      onMaster = false;
    }
  }
  if (!merged || !onMaster) {
    throw new Error(
      `No merged pull request from ${RELEASE_BRANCH} to ${RELEASE_BASE} is on ${RELEASE_REMOTE}/${RELEASE_BASE}; merge the release pull request first`,
    );
  }
  const remote = remoteTagCommit(run, tag);
  if (remote !== null && remote !== sha) {
    throw new Error(
      `${tag} already exists on ${RELEASE_REMOTE} at ${remote.slice(0, 9)}, not at ${RELEASE_BASE} (${sha.slice(0, 9)}). A version number is never reused for another commit`,
    );
  }
  const local = localTagCommit(run, tag);
  if (local !== null && local !== sha) {
    throw new Error(
      `The local tag ${tag} points to ${local.slice(0, 9)}, not to ${RELEASE_BASE} (${sha.slice(0, 9)}); delete it yourself if it is a mistake`,
    );
  }
  if (!releaseState(run, tag).exists && !deps.fileExists(notesFile)) {
    throw new Error(
      `The notes file ${notesFile} is missing; the GitHub release is built from it (pnpm release:notes ${version})`,
    );
  }
  return { sha, pullRequest: merged.number, tag };
}

// ==========================================
// The steps
// ==========================================

export interface Step {
  label: string;
  /** The commands the step runs, for the dry run. */
  commands: string[];
  /** True when the step has nothing left to do. Reads only. */
  done: () => Promise<boolean>;
  run: () => Promise<void>;
}

const display = (command: string, args: readonly string[]): string =>
  [command, ...args.map((arg) => (/[\s"]/.test(arg) ? JSON.stringify(arg) : arg))].join(' ');

/** What to say about the staging deploy, from the commit statuses of the tagged commit. */
export function stagingReport(run: Runner, sha: string): string[] {
  const lines: string[] = [];
  try {
    const status = JSON.parse(
      run('gh', ['api', `repos/{owner}/{repo}/commits/${sha}/status`]) || '{}',
    ) as { statuses?: { context: string; state: string }[] };
    for (const context of STAGING_CONTEXTS) {
      const found = status.statuses?.find((entry) => entry.context === context);
      lines.push(`${context}: ${found?.state ?? 'not reported yet'}`);
    }
  } catch (error) {
    lines.push(`Could not read the staging status: ${messageOf(error)}`);
  }
  lines.push(
    'Production is not approved. After you check staging, approve approve-production in CircleCI yourself.',
  );
  return lines;
}

/** Every step of the release, in order. Each one looks at the real state when asked. */
export function planSteps(
  options: PublishOptions,
  context: ReleaseContext,
  deps: Resolved,
): Step[] {
  const { version, notesFile } = options;
  const { sha, tag } = context;
  const { run, fetchJson } = deps;
  const message = `Ririko ${version}`;
  const tagArgs = ['tag', '-a', tag, '-m', message, sha];
  const pushArgs = ['push', RELEASE_REMOTE, `refs/tags/${tag}`];
  const releaseArgs = [
    'release',
    'create',
    tag,
    '--verify-tag',
    '--title',
    message,
    '--notes-file',
    notesFile,
    '--latest',
  ];
  const editArgs = ['release', 'edit', tag, '--draft=false', '--latest'];

  const steps: Step[] = [
    {
      label: `Tag ${tag} on ${RELEASE_REMOTE}/${RELEASE_BASE}`,
      commands: [display('git', tagArgs)],
      done: async () => remoteTagCommit(run, tag) === sha || localTagCommit(run, tag) === sha,
      run: async () => {
        run('git', tagArgs);
      },
    },
    {
      label: `Push the tag ${tag} (this starts the CircleCI release workflow)`,
      commands: [display('git', pushArgs)],
      done: async () => remoteTagCommit(run, tag) === sha,
      run: async () => {
        run('git', pushArgs);
      },
    },
    {
      label: 'Wait for the Docker Hub images',
      commands: IMAGE_REPOSITORIES.flatMap((repository) =>
        releaseTags(tag).map(
          (imageTag) => `GET https://hub.docker.com/v2/repositories/${repository}/tags/${imageTag}`,
        ),
      ),
      done: async () => (await checkImages(fetchJson, version)).problems.length === 0,
      run: () =>
        poll(
          deps,
          deps.imageTimeoutMs,
          'the Docker Hub images',
          async () => (await checkImages(fetchJson, version)).problems,
        ),
    },
    {
      label: 'Publish the GitHub release and mark it Latest',
      commands: [display('gh', releaseArgs)],
      done: async () => {
        const state = releaseState(run, tag);
        return state.exists && state.isLatest && !state.isDraft;
      },
      run: async () => {
        const state = releaseState(run, tag);
        if (state.exists) run('gh', editArgs);
        else run('gh', releaseArgs);
      },
    },
  ];

  for (const repository of IMAGE_REPOSITORIES) {
    steps.push({
      label: `Move ${repository}:latest to ${version}`,
      commands: [
        display('docker', [
          'buildx',
          'imagetools',
          'create',
          '--tag',
          `${repository}:latest`,
          `${repository}@<digest of ${repository}:${version}>`,
        ]),
      ],
      done: async () => {
        const [image, latest] = [
          await readTag(fetchJson, repository, version),
          await readTag(fetchJson, repository, 'latest'),
        ];
        return image !== null && latest !== null && sameImage(image, latest);
      },
      run: async () => {
        const image = await readTag(fetchJson, repository, version);
        if (image === null) throw new Error(`${repository}:${version} is not on Docker Hub`);
        run('docker', [
          'buildx',
          'imagetools',
          'create',
          '--tag',
          `${repository}:latest`,
          `${repository}@${image.digest}`,
        ]);
        await poll(deps, LATEST_TIMEOUT_MS, `${repository}:latest`, async () => {
          const latest = await readTag(fetchJson, repository, 'latest');
          return latest !== null && sameImage(image, latest)
            ? []
            : [`${repository}:latest does not show ${image.digest.slice(0, 19)} yet`];
        });
      },
    });
  }

  steps.push({
    label: 'Report the staging deploy',
    commands: [display('gh', ['api', `repos/{owner}/{repo}/commits/${sha}/status`])],
    done: async () => false,
    run: async () => {
      for (const line of stagingReport(run, sha)) deps.log(`   ${line}`);
    },
  });
  return steps;
}

/** Runs the whole publication. */
export async function publish(options: PublishOptions, deps: PublishDeps): Promise<void> {
  const resolved = resolveDeps(deps);
  const { log } = resolved;
  const context = checkReady(options, resolved);
  const prefix = options.dryRun ? '[dry run] ' : '';
  log(
    `${prefix}Publishing ${options.version}: release pull request #${context.pullRequest} is merged and ${RELEASE_REMOTE}/${RELEASE_BASE} (${context.sha.slice(0, 9)}) holds ${options.version}.`,
  );
  const steps = planSteps(options, context, resolved);
  for (const [index, step] of steps.entries()) {
    const number = index + 1;
    let done = false;
    let note = '';
    try {
      done = await step.done();
    } catch (error) {
      note = ` (could not check: ${messageOf(error)})`;
    }
    if (options.dryRun) {
      log(`${prefix}${number}. ${step.label}${done ? ': already done, would skip' : ''}${note}`);
      for (const command of step.commands) log(`${prefix}   ${command}`);
      continue;
    }
    if (done) {
      log(`${number}. ${step.label}: already done, skipped`);
      continue;
    }
    log(`${number}. ${step.label}`);
    try {
      await step.run();
    } catch (error) {
      throw new Error(
        `Step ${number} (${step.label}) failed: ${messageOf(error)}. Fix the cause and run the same command again; the steps that are done are skipped.`,
        { cause: error },
      );
    }
  }
  if (!options.dryRun) log(`Release ${options.version} is published.`);
}

const USAGE = 'Usage: pnpm release:publish <x.y.z> [--notes <file>] [--dry-run]';

/** Reads the command line. Returns null with a message on stderr when it is wrong. */
export function parseArguments(argv: string[], root: string = REPO_ROOT): PublishOptions | null {
  let version: string | undefined;
  let notes: string | undefined;
  let dryRun = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index] as string;
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--notes') notes = argv[++index];
    else if (!arg.startsWith('--') && version === undefined) version = arg;
    else {
      console.error(`Unknown argument "${arg}"\n${USAGE}`);
      return null;
    }
  }
  if (version === undefined || notes === '') {
    console.error(USAGE);
    return null;
  }
  const notesFile =
    notes === undefined
      ? notesPath(version, root)
      : isAbsolute(notes)
        ? notes
        : resolve(root, notes);
  return { version, notesFile, dryRun };
}

export async function main(argv: string[], deps?: PublishDeps): Promise<number> {
  const resolved = deps ?? { root: REPO_ROOT, run: createRunner(REPO_ROOT) };
  try {
    const options = parseArguments(argv, resolved.root);
    if (!options) return 1;
    await publish(options, resolved);
    return 0;
  } catch (error) {
    console.error(`✖ ${messageOf(error)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
