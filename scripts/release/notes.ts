/**
 * Drafts the release notes for a version.
 *
 *   pnpm release:notes 2.2.0     writes .local/release-notes-v2.2.0.md
 *
 * The draft lists, since the last stable v tag: the merged pull requests, the board tickets that
 * became DONE (features, fixes, chores), the new database migrations and the image tags. The
 * coordinator edits it in plan mode, then gives it to `pnpm release:prepare --notes <file>`.
 * The file lives in `.local/`, which git ignores; it is never written into the repository.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RELEASE_TAG_PATTERN, releaseTags } from '../release-tags';
import { createRunner, type Runner } from './run';
import { compareVersions, isVersion, REPO_ROOT } from './version';

/** The Docker Hub repositories a release pushes (scripts/release-tags.ts, docs/release.md). */
export const IMAGE_REPOSITORIES = ['ririkoai/ririkobot', 'ririkoai/ririkobot-dashboard'] as const;

/** Where new migrations show up: one folder per database dialect. */
export const MIGRATION_DIRECTORIES = [
  'packages/database/migrations/pg',
  'packages/database/migrations/sqlite',
] as const;

export interface MergedPullRequest {
  number: number;
  title: string;
}

export interface DoneTicket {
  id: string;
  title: string;
  /** features for a story, fixes for a bug, chores for everything else. */
  group: 'features' | 'fixes' | 'chores';
  /** When the coordinator's REVIEW entry set it DONE (ISO 8601, UTC). */
  doneAt: string;
}

export interface ReleaseNotesData {
  version: string;
  /** The git tag the range starts at, e.g. v2.1.0. */
  since: string;
  pullRequests: MergedPullRequest[];
  tickets: DoneTicket[];
  migrations: string[];
  images: string[];
}

/** The newest stable v tag (no prerelease), or null in a repository without one. */
export function lastStableTag(run: Runner): string | null {
  const tags = run('git', ['tag', '--list', 'v*'])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((tag) => {
      const match = RELEASE_TAG_PATTERN.exec(tag);
      return match !== null && match[4] === undefined;
    })
    .map((tag) => tag.slice(1))
    .sort(compareVersions);
  const newest = tags[tags.length - 1];
  return newest === undefined ? null : `v${newest}`;
}

/** The pull requests merged since `since`, from the merge commits (the title is the body). */
export function mergedPullRequests(run: Runner, since: string): MergedPullRequest[] {
  const log = run('git', ['log', `${since}..HEAD`, '--merges', '--format=%s%x1f%b%x1e']);
  const found: MergedPullRequest[] = [];
  for (const record of log.split('\x1e')) {
    const [subject = '', body = ''] = record.split('\x1f');
    const match = /^Merge pull request #(\d+) from /.exec(subject.trim());
    if (!match) continue;
    const title = body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line !== '');
    found.push({ number: Number(match[1]), title: title ?? subject.trim() });
  }
  return found;
}

/** The migration files added since `since`, with forward slashes. */
export function newMigrations(run: Runner, since: string): string[] {
  const names = run('git', [
    'diff',
    '--name-only',
    '--diff-filter=A',
    `${since}..HEAD`,
    '--',
    ...MIGRATION_DIRECTORIES,
  ]);
  return names
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.endsWith('.sql'))
    .sort();
}

interface BoardTicket {
  id: string;
  title: string;
  status: string;
}

const BOARD_SECTIONS = ['epics', 'stories', 'tasks', 'chores', 'bugs'] as const;

function groupOf(id: string): DoneTicket['group'] {
  if (id.startsWith('STORY-')) return 'features';
  if (id.startsWith('BUG-')) return 'fixes';
  return 'chores';
}

/**
 * The tickets whose REVIEW entry set them DONE after `since` (an ISO date). The date comes from
 * the last `## REVIEW · <time> · … · DONE` entry in the ticket's handover note; a DONE ticket
 * without one (the oldest ones) is left out.
 */
export function doneTickets(root: string, since: string): DoneTicket[] {
  const boardFile = join(root, 'docs', 'kanban', 'board.json');
  const board = JSON.parse(readFileSync(boardFile, 'utf8')) as Record<string, unknown>;
  const after = Date.parse(since);
  const found: DoneTicket[] = [];
  for (const section of BOARD_SECTIONS) {
    const tickets = board[section];
    if (!Array.isArray(tickets)) continue;
    for (const ticket of tickets as BoardTicket[]) {
      if (ticket.status !== 'DONE') continue;
      const note = join(root, 'docs', 'kanban', 'handovers', `${ticket.id}.md`);
      if (!existsSync(note)) continue;
      const entries = [
        ...readFileSync(note, 'utf8').matchAll(/^## REVIEW · (\S+) · .*· DONE\s*$/gm),
      ];
      const doneAt = entries[entries.length - 1]?.[1];
      if (doneAt === undefined || !(Date.parse(doneAt) > after)) continue;
      found.push({ id: ticket.id, title: ticket.title, group: groupOf(ticket.id), doneAt });
    }
  }
  return found.sort((a, b) => a.doneAt.localeCompare(b.doneAt) || a.id.localeCompare(b.id));
}

/** Collects everything the draft needs. Reads git and the board; writes nothing. */
export function gatherNotes(version: string, root: string, run: Runner): ReleaseNotesData {
  if (!isVersion(version)) {
    throw new Error(`"${version}" is not a version like 2.1.3 (x.y.z, no "v", no prerelease)`);
  }
  const since = lastStableTag(run);
  if (since === null) throw new Error('There is no stable v tag to start the release notes from');
  const sinceDate = run('git', ['log', '-1', '--format=%cI', since]).trim();
  const tags = releaseTags(`v${version}`);
  return {
    version,
    since,
    pullRequests: mergedPullRequests(run, since),
    tickets: doneTickets(root, sinceDate),
    migrations: newMigrations(run, since),
    images: IMAGE_REPOSITORIES.flatMap((repository) => tags.map((tag) => `${repository}:${tag}`)),
  };
}

function section(heading: string, lines: string[]): string[] {
  return [`## ${heading}`, '', ...(lines.length > 0 ? lines : ['None.']), ''];
}

/** The draft as Markdown. The coordinator rewrites the intro and each list in plan mode. */
export function renderNotes(data: ReleaseNotesData): string {
  const tickets = (group: DoneTicket['group']) =>
    data.tickets.filter((ticket) => ticket.group === group).map((t) => `- ${t.title} (${t.id})`);
  return [
    `# Ririko ${data.version}`,
    '',
    `<!-- Draft from ${data.since}. Edit it in plan mode, then run: pnpm release:prepare ${data.version} --notes <this file> -->`,
    '',
    ...section('Features', tickets('features')),
    ...section('Fixes', tickets('fixes')),
    ...section('Chores', tickets('chores')),
    ...section(
      'Merged pull requests',
      data.pullRequests.map((pr) => `- #${pr.number} ${pr.title}`),
    ),
    ...section(
      'Database migrations',
      data.migrations.map((file) => `- \`${file}\``),
    ),
    ...section(
      'Docker images',
      data.images.map((image) => `- \`${image}\``),
    ),
  ].join('\n');
}

/** Where the draft goes: `.local/release-notes-v<version>.md` under the repository root. */
export function notesPath(version: string, root: string = REPO_ROOT): string {
  return join(root, '.local', `release-notes-v${version}.md`);
}

/** Throws unless git ignores `file`, so a draft can never end up in a commit. */
function requireIgnored(root: string, file: string, run: Runner): void {
  try {
    run('git', ['check-ignore', '-q', relative(root, file).replace(/\\/g, '/')]);
  } catch {
    throw new Error(`${file} is not ignored by git; refusing to write release notes there`);
  }
}

/** Writes the draft and returns its path. */
export function writeNotes(version: string, root: string, run: Runner): string {
  const file = notesPath(version, root);
  requireIgnored(root, file, run);
  const text = renderNotes(gatherNotes(version, root, run));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
}

export interface NotesDeps {
  root: string;
  run: Runner;
}

export function main(argv: string[], deps?: NotesDeps): number {
  const { root, run } = deps ?? { root: REPO_ROOT, run: createRunner(REPO_ROOT) };
  try {
    const version = argv[0];
    if (argv.length !== 1 || version === undefined) {
      console.error('Usage: pnpm release:notes <x.y.z>');
      return 1;
    }
    console.log(`Wrote ${writeNotes(version, root, run)}`);
    return 0;
  } catch (error) {
    console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
