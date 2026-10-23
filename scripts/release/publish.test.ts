import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkImages,
  httpJson,
  latestReleaseTag,
  IMAGE_TIMEOUT_MS,
  localTagCommit,
  main,
  parseArguments,
  publish,
  readTag,
  remoteTagCommit,
  sameImage,
  STAGING_CONTEXTS,
  stagingReport,
  type FetchJson,
  type PublishDeps,
  type PublishOptions,
  type TagInfo,
} from './publish';
import type { Runner } from './run';
import { IMAGE_REPOSITORIES } from './notes';
import { readVersions, REPO_ROOT } from './version';

// The repository's own files hold the current version, so origin/master "holds" it in the fake.
const VERSION = readVersions()[0]?.from ?? '';
const TAG = `v${VERSION}`;
const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const NOTES = '/tmp/notes.md';
const [BOT, DASHBOARD] = IMAGE_REPOSITORIES;
const [MINOR, MAJOR] = [VERSION.split('.').slice(0, 2).join('.'), VERSION.split('.')[0]];
const IMAGE_TAGS = [VERSION, MINOR, MAJOR] as string[];

const image = (digest: string, children: string[] = [`${digest}-amd64`]): TagInfo => ({
  digest,
  children,
});

/** The state of the outside world: git, GitHub and Docker Hub. */
interface World {
  remoteTag: string | null;
  localTag: string | null;
  release: { isLatest: boolean; isDraft: boolean } | null;
  openPullRequests: number[];
  mergedPullRequests: { number: number; mergeCommit: { oid: string } }[];
  mergeIsOnMaster: boolean;
  /** `repository:tag` to what Docker Hub shows. */
  images: Map<string, TagInfo>;
  statuses: { context: string; state: string }[];
  notesExist: boolean;
  /** Commands that fail, matched on the start of the command line. */
  failing: Map<string, string>;
  calls: string[];
}

function world(overrides: Partial<World> = {}): World {
  return {
    remoteTag: null,
    localTag: null,
    release: null,
    openPullRequests: [],
    mergedPullRequests: [{ number: 42, mergeCommit: { oid: OTHER } }],
    mergeIsOnMaster: true,
    images: new Map(),
    statuses: [],
    notesExist: true,
    failing: new Map(),
    calls: [],
    ...overrides,
  };
}

const putImages = (state: World, digests: Record<string, string> = {}): void => {
  for (const repository of IMAGE_REPOSITORIES) {
    for (const tag of IMAGE_TAGS) {
      state.images.set(
        `${repository}:${tag}`,
        image(digests[repository] ?? `sha256:${repository}`),
      );
    }
  }
};

/** Commands that change something outside the process. */
const MUTATING = /^(git tag|git push|gh release (create|edit)|docker )/;

function fakeRunner(state: World): Runner {
  return (command, args) => {
    const line = [command, ...args].join(' ');
    state.calls.push(line);
    for (const [start, message] of state.failing) {
      if (line.startsWith(start)) throw new Error(message);
    }
    if (line === 'git fetch origin master') return '';
    if (line === 'git rev-parse origin/master') return `${SHA}\n`;
    if (line.startsWith('git show origin/master:')) {
      return readFileSync(join(REPO_ROOT, line.slice('git show origin/master:'.length)), 'utf8');
    }
    if (line.startsWith('gh pr list') && line.includes('--state open')) {
      return JSON.stringify(state.openPullRequests.map((number) => ({ number })));
    }
    if (line.startsWith('gh pr list') && line.includes('--state merged')) {
      return JSON.stringify(state.mergedPullRequests);
    }
    if (line.startsWith('git merge-base --is-ancestor')) {
      if (!state.mergeIsOnMaster) throw new Error('git merge-base failed with exit code 1');
      return '';
    }
    if (line.startsWith('git ls-remote')) {
      return state.remoteTag === null
        ? ''
        : `${state.remoteTag}\trefs/tags/${TAG}\n${state.remoteTag}\trefs/tags/${TAG}^{}\n`;
    }
    if (line.startsWith('git rev-parse --verify --quiet')) {
      if (state.localTag === null) throw new Error('git rev-parse failed with exit code 1');
      return `${state.localTag}\n`;
    }
    if (line.startsWith('git tag -a')) {
      state.localTag = args[args.length - 1] as string;
      return '';
    }
    if (line.startsWith('git push origin')) {
      state.remoteTag = state.localTag;
      return '';
    }
    if (line.startsWith('gh release view')) {
      if (state.release === null) {
        throw new Error('gh release view failed with exit code 1: release not found');
      }
      return JSON.stringify({ isDraft: state.release.isDraft });
    }
    if (line === 'gh api repos/{owner}/{repo}/releases/latest') {
      return JSON.stringify({ tag_name: state.release?.isLatest ? TAG : 'v0.0.1' });
    }
    if (line.startsWith('gh release create')) {
      // The images must be there before the release goes out.
      for (const repository of IMAGE_REPOSITORIES) {
        for (const tag of IMAGE_TAGS) {
          if (!state.images.has(`${repository}:${tag}`)) throw new Error('release before images');
        }
      }
      state.release = { isLatest: true, isDraft: false };
      return '';
    }
    if (line.startsWith('gh release edit')) {
      state.release = { isLatest: true, isDraft: false };
      return '';
    }
    if (line.startsWith('docker buildx imagetools create --tag')) {
      const [target, source] = [args[4] as string, args[5] as string];
      const [repository, digest] = source.split('@') as [string, string];
      expect(target).toBe(`${repository}:latest`);
      // `create` wraps the source in a new index: another digest, the same images inside.
      const original = [...state.images.values()].find((entry) => entry.digest === digest);
      state.images.set(target, image(`${digest}-wrapped`, original?.children ?? []));
      return '';
    }
    if (line.startsWith('gh api')) return JSON.stringify({ statuses: state.statuses });
    throw new Error(`unexpected command: ${line}`);
  };
}

interface Harness {
  state: World;
  deps: PublishDeps;
  log: string[];
  clock: { now: number; sleeps: number };
}

function harness(state: World, appearAfterSleeps = 0): Harness {
  const log: string[] = [];
  const clock = { now: 0, sleeps: 0 };
  const fetchJson: FetchJson = async (url) => {
    const match = /repositories\/(.+)\/tags\/([^/]+)$/.exec(url);
    const found = match ? state.images.get(`${match[1]}:${match[2]}`) : undefined;
    return found
      ? { digest: found.digest, images: found.children.map((digest) => ({ digest })) }
      : null;
  };
  const deps: PublishDeps = {
    root: REPO_ROOT,
    run: fakeRunner(state),
    fetchJson,
    sleep: async (milliseconds) => {
      clock.now += milliseconds;
      clock.sleeps += 1;
      if (clock.sleeps === appearAfterSleeps) putImages(state);
    },
    now: () => clock.now,
    log: (line) => log.push(line),
    fileExists: () => state.notesExist,
  };
  return { state, deps, log, clock };
}

const options = (overrides: Partial<PublishOptions> = {}): PublishOptions => ({
  version: VERSION,
  notesFile: NOTES,
  dryRun: false,
  ...overrides,
});

const mutations = (state: World): string[] => state.calls.filter((call) => MUTATING.test(call));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('publish', () => {
  it('tags, waits for the images, publishes, then moves latest, in that order', async () => {
    const { state, deps, log, clock } = harness(world(), 2);
    await publish(options(), deps);

    expect(mutations(state)).toEqual([
      `git tag -a ${TAG} -m Ririko ${VERSION} ${SHA}`,
      `git push origin refs/tags/${TAG}`,
      `gh release create ${TAG} --verify-tag --title Ririko ${VERSION} --notes-file ${NOTES} --latest`,
      `docker buildx imagetools create --tag ${BOT}:latest ${BOT}@sha256:${BOT}`,
      `docker buildx imagetools create --tag ${DASHBOARD}:latest ${DASHBOARD}@sha256:${DASHBOARD}`,
    ]);
    // It polled twice before the images were all there, every 30 seconds.
    expect(clock.sleeps).toBe(2);
    expect(clock.now).toBe(60_000);
    expect(state.localTag).toBe(SHA);
    expect(state.remoteTag).toBe(SHA);
    expect(log.some((line) => line.includes('is published'))).toBe(true);
  });

  it('spawns docker without a shell: the program and each argument are separate', async () => {
    const { state, deps } = harness(world(), 0);
    putImages(state);
    await publish(options(), deps);
    const docker = mutations(state).filter((call) => call.startsWith('docker '));
    expect(docker).toHaveLength(2);
    expect(docker.every((call) => call.startsWith('docker buildx imagetools create --tag '))).toBe(
      true,
    );
  });

  it('reports the staging deploy and never approves production', async () => {
    const state = world({
      statuses: [
        { context: STAGING_CONTEXTS[0], state: 'success' },
        { context: STAGING_CONTEXTS[1], state: 'pending' },
      ],
    });
    putImages(state);
    const { deps, log } = harness(state);
    await publish(options(), deps);
    const text = log.join('\n');
    expect(text).toContain('ci/circleci: deploy-lavalink-staging: success');
    expect(text).toContain('ci/circleci: deploy-staging: pending');
    expect(text).toContain('Production is not approved');
    expect(state.calls.join('\n')).not.toMatch(/approve|circleci\.com/i);
  });

  it('does nothing but read when everything is already done', async () => {
    const state = world({
      remoteTag: SHA,
      localTag: SHA,
      release: { isLatest: true, isDraft: false },
    });
    putImages(state);
    for (const repository of IMAGE_REPOSITORIES) {
      state.images.set(`${repository}:latest`, image(`sha256:${repository}`));
    }
    const { deps, log } = harness(state);
    await publish(options(), deps);
    expect(mutations(state)).toEqual([]);
    expect(log.filter((line) => line.includes('already done, skipped'))).toHaveLength(6);
  });

  it('continues after a failure: only the steps that are not done run again', async () => {
    const state = world();
    putImages(state);
    state.failing.set(`docker buildx imagetools create --tag ${DASHBOARD}:latest`, 'not logged in');
    const first = harness(state);
    await expect(publish(options(), first.deps)).rejects.toThrow(
      /Step 6 \(Move ririkoai\/ririkobot-dashboard:latest[^)]*\) failed: not logged in.*run the same command again/s,
    );
    expect(state.release).toEqual({ isLatest: true, isDraft: false });

    state.failing.clear();
    state.calls.length = 0;
    await publish(options(), harness(state).deps);
    // The tag, the push, the release and the bot's latest are done; only the dashboard moves.
    expect(mutations(state)).toEqual([
      `docker buildx imagetools create --tag ${DASHBOARD}:latest ${DASHBOARD}@sha256:${DASHBOARD}`,
    ]);
  });

  it('pushes a tag that exists only locally, and creates nothing twice', async () => {
    const state = world({ localTag: SHA });
    putImages(state);
    await publish(options(), harness(state).deps);
    expect(mutations(state).slice(0, 2)).toEqual([
      `git push origin refs/tags/${TAG}`,
      `gh release create ${TAG} --verify-tag --title Ririko ${VERSION} --notes-file ${NOTES} --latest`,
    ]);
  });

  it('marks an existing release Latest instead of creating it again', async () => {
    const state = world({
      remoteTag: SHA,
      release: { isLatest: false, isDraft: true },
    });
    putImages(state);
    await publish(options(), harness(state).deps);
    expect(mutations(state)[0]).toBe(`gh release edit ${TAG} --draft=false --latest`);
    expect(state.calls.some((call) => call.startsWith('gh release create'))).toBe(false);
  });

  it('needs no notes file when the release already exists', async () => {
    const state = world({
      remoteTag: SHA,
      release: { isLatest: true, isDraft: false },
      notesExist: false,
    });
    putImages(state);
    await expect(publish(options(), harness(state).deps)).resolves.toBeUndefined();
  });

  it('times out after 40 minutes without publishing anything', async () => {
    const state = world();
    const { deps, clock } = harness(state);
    await expect(publish(options(), deps)).rejects.toThrow(
      /Step 3 \(Wait for the Docker Hub images\) failed: Timed out after 40 minutes.*is not on Docker Hub yet/s,
    );
    expect(clock.now).toBeGreaterThanOrEqual(IMAGE_TIMEOUT_MS);
    // The tag went out, but neither the release nor latest did.
    expect(mutations(state)).toEqual([
      `git tag -a ${TAG} -m Ririko ${VERSION} ${SHA}`,
      `git push origin refs/tags/${TAG}`,
    ]);
  });

  it('waits while the three tags of an image disagree', async () => {
    const state = world();
    putImages(state);
    state.images.set(`${BOT}:${MAJOR}`, image('sha256:older'));
    const { deps } = harness(state);
    await expect(publish({ ...options() }, { ...deps, imageTimeoutMs: 60_000 })).rejects.toThrow(
      /do not share one digest/,
    );
    expect(state.calls.some((call) => call.startsWith('gh release create'))).toBe(false);
  });

  it('waits when Docker Hub still shows the old latest after the move', async () => {
    const state = world();
    putImages(state);
    const { deps, clock } = harness(state);
    const run = deps.run;
    // `create` succeeds but Docker Hub keeps showing another image.
    deps.run = (command, args, runOptions) => {
      if (command === 'docker') {
        state.calls.push([command, ...args].join(' '));
        state.images.set(`${BOT}:latest`, image('sha256:old', ['sha256:old-amd64']));
        return '';
      }
      return run(command, args, runOptions);
    };
    await expect(publish(options(), deps)).rejects.toThrow(/Timed out after 5 minutes/);
    expect(clock.now).toBeGreaterThanOrEqual(5 * 60_000);
  });

  it('names the failing step when git push fails', async () => {
    const state = world();
    putImages(state);
    state.failing.set('git push', 'permission denied');
    await expect(publish(options(), harness(state).deps)).rejects.toThrow(
      /Step 2 \(Push the tag .*\) failed: permission denied/,
    );
  });
});

describe('refusals', () => {
  const refuses = async (state: World, pattern: RegExp, overrides?: Partial<PublishOptions>) => {
    const { deps } = harness(state);
    await expect(publish(options(overrides), deps)).rejects.toThrow(pattern);
    expect(mutations(state)).toEqual([]);
  };

  it('refuses something that is not x.y.z', async () => {
    await refuses(world(), /not a version/, { version: 'v2.1.0' });
  });

  it('refuses when origin/master does not hold the version', async () => {
    await refuses(world(), /does not hold 99\.0\.0 everywhere: package\.json holds/, {
      version: '99.0.0',
    });
  });

  it('refuses while the release pull request is open', async () => {
    await refuses(world({ openPullRequests: [7] }), /Pull request #7 .* still open/);
  });

  it('refuses without a merged release pull request on master', async () => {
    await refuses(world({ mergedPullRequests: [] }), /No merged pull request/);
    await refuses(world({ mergeIsOnMaster: false }), /No merged pull request/);
    await refuses(
      world({ mergedPullRequests: [{ number: 1, mergeCommit: null as never }] }),
      /No merged pull request/,
    );
  });

  it('refuses a tag that exists on another commit, remote or local', async () => {
    await refuses(world({ remoteTag: OTHER }), /already exists on origin at bbbbbbbbb/);
    await refuses(world({ localTag: OTHER }), /local tag .* points to bbbbbbbbb/);
  });

  it('refuses when the GitHub release must be made and the notes file is missing', async () => {
    await refuses(world({ notesExist: false }), /notes file .* is missing/);
  });

  it('passes a gh error that is not "release not found" on', async () => {
    const state = world();
    state.failing.set('gh release view', 'gh: bad credentials');
    await refuses(state, /bad credentials/);
  });
});

describe('dry run', () => {
  it('prints every step, marks the done ones and changes nothing', async () => {
    const state = world({ remoteTag: SHA, localTag: SHA });
    putImages(state);
    const { deps, log } = harness(state);
    await publish(options({ dryRun: true }), deps);

    expect(mutations(state)).toEqual([]);
    const text = log.join('\n');
    expect(text).toContain(`[dry run] 1. Tag ${TAG} on origin/master: already done, would skip`);
    expect(text).toContain('[dry run] 3. Wait for the Docker Hub images: already done');
    expect(text).toContain(`[dry run] 4. Publish the GitHub release and mark it Latest`);
    expect(text).toContain(`gh release create ${TAG} --verify-tag`);
    expect(text).toContain(`${BOT}@<digest of ${BOT}:${VERSION}>`);
    expect(text).not.toContain('is published');
  });

  it('shows a step it could not check instead of stopping', async () => {
    const state = world();
    const { deps, log } = harness(state);
    deps.fetchJson = async () => {
      throw new Error('offline');
    };
    await publish(options({ dryRun: true }), deps);
    // checkImages reports each unreadable tag as a problem, so the wait step is simply "not done".
    expect(log.join('\n')).toContain('[dry run] 3. Wait for the Docker Hub images');
    expect(mutations(state)).toEqual([]);
  });
});

describe('Docker Hub helpers', () => {
  const body = (digest: unknown, images: unknown) => async () => ({ digest, images });

  it('reads the digest and the sorted, unique image digests', async () => {
    const info = await readTag(
      body('sha256:i', [
        { digest: 'sha256:b' },
        { digest: 'sha256:a' },
        { digest: 'sha256:b' },
        {},
      ]),
      BOT as string,
      '2',
    );
    expect(info).toEqual({ digest: 'sha256:i', children: ['sha256:a', 'sha256:b'] });
  });

  it('returns null for a tag that is not there and throws when there is no digest', async () => {
    expect(await readTag(async () => null, BOT as string, '2')).toBeNull();
    await expect(readTag(body(undefined, []), BOT as string, '2')).rejects.toThrow(/no digest/);
    expect((await readTag(body('sha256:i', undefined), BOT as string, '2'))?.children).toEqual([]);
  });

  it('compares images by index digest or by the images inside', () => {
    expect(sameImage(image('x'), image('x', []))).toBe(true);
    expect(sameImage(image('x', ['a', 'b']), image('y', ['a', 'b']))).toBe(true);
    expect(sameImage(image('x', ['a', 'b']), image('y', ['a', 'c']))).toBe(false);
    expect(sameImage(image('x', ['a']), image('y', ['a', 'b']))).toBe(false);
    expect(sameImage(image('x', []), image('y', []))).toBe(false);
  });

  it('lists what is missing and what could not be read', async () => {
    const state = world();
    putImages(state);
    state.images.delete(`${DASHBOARD}:${MINOR}`);
    const { deps } = harness(state);
    const inner = deps.fetchJson as FetchJson;
    const result = await checkImages(async (url) => {
      if (url.endsWith(`${BOT}/tags/${MAJOR}`)) throw new Error('503');
      return inner(url);
    }, VERSION);
    expect(result.problems).toEqual([
      `${BOT}:${MAJOR} could not be read: 503`,
      `${DASHBOARD}:${MINOR} is not on Docker Hub yet`,
    ]);
  });

  it('httpJson: null for 404, the body for 200, an error otherwise', async () => {
    const responses = [
      new Response('', { status: 404 }),
      new Response('{"digest":"sha256:x"}', { status: 200 }),
      new Response('', { status: 500 }),
    ];
    const fetchStub = vi.fn(async () => responses.shift() as Response);
    vi.stubGlobal('fetch', fetchStub);
    expect(await httpJson('https://hub.docker.com/a')).toBeNull();
    expect(await httpJson('https://hub.docker.com/b')).toEqual({ digest: 'sha256:x' });
    await expect(httpJson('https://hub.docker.com/c')).rejects.toThrow(/answered 500/);
    expect(fetchStub).toHaveBeenCalledTimes(3);
  });
});

describe('git helpers', () => {
  const lsRemote =
    (output: string): Runner =>
    () =>
      output;

  it('prefers the commit an annotated tag points to over the tag object', () => {
    const output = `${OTHER}\trefs/tags/${TAG}\n${SHA}\trefs/tags/${TAG}^{}\n`;
    expect(remoteTagCommit(lsRemote(output), TAG)).toBe(SHA);
    expect(remoteTagCommit(lsRemote(`${SHA}\trefs/tags/${TAG}\n`), TAG)).toBe(SHA);
    expect(remoteTagCommit(lsRemote(''), TAG)).toBeNull();
  });

  it('latestReleaseTag is null when GitHub has no latest release', () => {
    const missing: Runner = () => {
      throw new Error('gh: Not Found (HTTP 404)');
    };
    expect(latestReleaseTag(missing)).toBeNull();
    expect(latestReleaseTag(() => '{}')).toBeNull();
    expect(latestReleaseTag(() => '{"tag_name":"v1.0.0"}')).toBe('v1.0.0');
  });

  it('localTagCommit is null when git cannot find the tag', () => {
    const missing: Runner = () => {
      throw new Error('exit code 1');
    };
    expect(localTagCommit(missing, TAG)).toBeNull();
    expect(localTagCommit(() => `${SHA}\n`, TAG)).toBe(SHA);
    expect(localTagCommit(() => '\n', TAG)).toBeNull();
  });
});

describe('stagingReport', () => {
  it('says a status is not reported yet and that production stays with the maintainer', () => {
    const lines = stagingReport(() => JSON.stringify({ statuses: [] }), SHA);
    expect(lines[0]).toBe('ci/circleci: deploy-lavalink-staging: not reported yet');
    expect(lines[1]).toBe('ci/circleci: deploy-staging: not reported yet');
    expect(lines.at(-1)).toMatch(/Production is not approved/);
    expect(stagingReport(() => '', SHA)[0]).toMatch(/not reported yet/);
  });

  it('does not fail the release when the status cannot be read', () => {
    const lines = stagingReport(() => {
      throw new Error('rate limited');
    }, SHA);
    expect(lines[0]).toBe('Could not read the staging status: rate limited');
  });
});

describe('command line', () => {
  it('reads the version, the notes file and --dry-run', () => {
    expect(parseArguments(['2.2.0', '--dry-run', '--notes', 'n.md'], '/repo')).toEqual({
      version: '2.2.0',
      notesFile: resolve('/repo', 'n.md'),
      dryRun: true,
    });
    expect(parseArguments(['2.2.0'], '/repo')).toEqual({
      version: '2.2.0',
      notesFile: join('/repo', '.local', 'release-notes-v2.2.0.md'),
      dryRun: false,
    });
    expect(parseArguments(['2.2.0', '--notes', process.execPath])?.notesFile).toBe(
      process.execPath,
    );
  });

  it('rejects a missing version, an empty --notes and unknown arguments', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(parseArguments([])).toBeNull();
    expect(parseArguments(['2.2.0', '--notes', ''])).toBeNull();
    expect(parseArguments(['2.2.0', '--force'])).toBeNull();
    expect(parseArguments(['2.2.0', '2.3.0'])).toBeNull();
    expect(error).toHaveBeenCalledTimes(4);
  });

  it('main returns 1 with a message for a bad command line or a refusal', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const state = world({ openPullRequests: [9] });
    const { deps } = harness(state);
    expect(await main([], deps)).toBe(1);
    expect(await main([VERSION], deps)).toBe(1);
    expect(error).toHaveBeenLastCalledWith(expect.stringContaining('Pull request #9'));
  });

  it('main returns 0 after a dry run', async () => {
    const state = world();
    putImages(state);
    const { deps } = harness(state);
    expect(await main([VERSION, '--dry-run'], deps)).toBe(0);
    expect(mutations(state)).toEqual([]);
  });
});
