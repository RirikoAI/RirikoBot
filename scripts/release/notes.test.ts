import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  doneTickets,
  gatherNotes,
  lastStableTag,
  main,
  mergedPullRequests,
  newMigrations,
  notesPath,
  renderNotes,
  writeNotes,
} from './notes';
import type { Runner } from './run';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ririko-notes-'));
  mkdirSync(join(root, 'docs', 'kanban', 'handovers'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const MERGES = [
  'Merge pull request #745 from RirikoAI/chore/CHORE-2011-version-2.1.0\x1fchore(release): version 2.1.0 (CHORE-2011)\n\x1e',
  'Merge pull request #744 from RirikoAI/feat/STORY-202-setup-commands\x1ffeat(commands): set up tickets (STORY-202)\n\x1e',
  'Merge branch develop into topic\x1e',
].join('');

interface Reply {
  [command: string]: string | Error;
}

/** A runner that answers by command line and records every call. */
function fakeRunner(replies: Reply = {}): { run: Runner; calls: string[] } {
  const calls: string[] = [];
  const defaults: Reply = {
    'git tag --list v*': 'v2.0.1\nv2.1.0\nv2.0.2\nv2.2.0-rc.1\nnot-a-tag\n',
    'git log -1 --format=%cI v2.1.0': '2026-10-20T10:00:00+00:00\n',
    'git log v2.1.0..HEAD --merges --format=%s%x1f%b%x1e': MERGES,
    'git diff --name-only --diff-filter=A v2.1.0..HEAD -- packages/database/migrations/pg packages/database/migrations/sqlite':
      'packages/database/migrations/sqlite/0010_b.sql\npackages/database/migrations/pg/0010_a.sql\npackages/database/migrations/pg/meta/0010_snapshot.json\n',
    'git check-ignore -q .local/release-notes-v2.2.0.md': '',
  };
  const run: Runner = (command, args) => {
    const line = [command, ...args].join(' ');
    calls.push(line);
    const reply = { ...defaults, ...replies }[line];
    if (reply === undefined) throw new Error(`unexpected command: ${line}`);
    if (reply instanceof Error) throw reply;
    return reply;
  };
  return { run, calls };
}

function writeBoard(): void {
  const ticket = (id: string, title: string, status = 'DONE') => ({ id, title, status });
  writeFileSync(
    join(root, 'docs', 'kanban', 'board.json'),
    JSON.stringify({
      epics: [ticket('EPIC-020', 'Old epic')],
      stories: [ticket('STORY-202', 'Setup commands'), ticket('STORY-300', 'Open story', 'TODO')],
      tasks: [ticket('TASK-2021', 'A task'), ticket('TASK-0001', 'Before the tag')],
      chores: [ticket('CHORE-2011', 'Version 2.1.0'), ticket('CHORE-9999', 'No review entry')],
      bugs: [ticket('BUG-0050', 'A bug'), ticket('BUG-0051', 'Reworked bug')],
    }),
  );
  const review = (time: string, result: string) =>
    `## REVIEW · ${time} · claude-opus-5-5 (coordinator) · ${result}\n\n- done\n`;
  const note = (id: string, body: string) =>
    writeFileSync(join(root, 'docs', 'kanban', 'handovers', `${id}.md`), `# ${id}\n\n${body}`);
  note('STORY-202', review('2026-10-22T09:00:00Z', 'DONE'));
  note('TASK-2021', review('2026-10-21T09:00:00Z', 'DONE'));
  note('TASK-0001', review('2026-10-01T09:00:00Z', 'DONE'));
  note('CHORE-2011', review('2026-10-22T12:00:00Z', 'DONE'));
  note('BUG-0050', review('2026-10-22T10:00:00Z', 'DONE'));
  note(
    'BUG-0051',
    `${review('2026-10-21T10:00:00Z', 'DONE')}\n${review('2026-10-23T10:00:00Z', 'DONE')}`,
  );
  note('EPIC-020', 'No review entry here.\n');
}

describe('lastStableTag', () => {
  it('takes the highest stable tag, ignoring prereleases and other names', () => {
    expect(lastStableTag(fakeRunner().run)).toBe('v2.1.0');
  });

  it('compares numbers, not text', () => {
    const { run } = fakeRunner({ 'git tag --list v*': 'v2.9.0\nv2.10.0\n' });
    expect(lastStableTag(run)).toBe('v2.10.0');
  });

  it('returns null when there is no stable tag', () => {
    expect(lastStableTag(fakeRunner({ 'git tag --list v*': 'v1.0.0-rc.1\n' }).run)).toBeNull();
  });
});

describe('mergedPullRequests', () => {
  it('reads the number from the subject and the title from the body', () => {
    expect(mergedPullRequests(fakeRunner().run, 'v2.1.0')).toEqual([
      { number: 745, title: 'chore(release): version 2.1.0 (CHORE-2011)' },
      { number: 744, title: 'feat(commands): set up tickets (STORY-202)' },
    ]);
  });

  it('falls back to the subject when a merge has no body', () => {
    const { run } = fakeRunner({
      'git log v2.1.0..HEAD --merges --format=%s%x1f%b%x1e':
        'Merge pull request #9 from RirikoAI/x\x1f\x1e',
    });
    expect(mergedPullRequests(run, 'v2.1.0')).toEqual([
      { number: 9, title: 'Merge pull request #9 from RirikoAI/x' },
    ]);
  });
});

describe('newMigrations', () => {
  it('lists only added .sql files, sorted', () => {
    expect(newMigrations(fakeRunner().run, 'v2.1.0')).toEqual([
      'packages/database/migrations/pg/0010_a.sql',
      'packages/database/migrations/sqlite/0010_b.sql',
    ]);
  });
});

describe('doneTickets', () => {
  it('keeps tickets whose last DONE review is after the date, grouped by type', () => {
    writeBoard();
    const tickets = doneTickets(root, '2026-10-20T10:00:00+00:00');
    expect(tickets.map((t) => [t.id, t.group])).toEqual([
      ['TASK-2021', 'chores'],
      ['STORY-202', 'features'],
      ['BUG-0050', 'fixes'],
      ['CHORE-2011', 'chores'],
      ['BUG-0051', 'fixes'],
    ]);
  });

  it('leaves out tickets that are not DONE, finished before the tag or without a review entry', () => {
    writeBoard();
    const ids = doneTickets(root, '2026-10-20T10:00:00+00:00').map((t) => t.id);
    expect(ids).not.toContain('STORY-300');
    expect(ids).not.toContain('TASK-0001');
    expect(ids).not.toContain('CHORE-9999');
    expect(ids).not.toContain('EPIC-020');
  });

  it('uses the last DONE entry of a ticket that was reworked', () => {
    writeBoard();
    expect(doneTickets(root, '2026-10-22T23:00:00Z').map((t) => t.id)).toEqual(['BUG-0051']);
  });
});

describe('gatherNotes and renderNotes', () => {
  it('collects the range and names the image tags', () => {
    writeBoard();
    const data = gatherNotes('2.2.0', root, fakeRunner().run);
    expect(data.since).toBe('v2.1.0');
    expect(data.images).toEqual([
      'ririkoai/ririkobot:2.2.0',
      'ririkoai/ririkobot:2.2',
      'ririkoai/ririkobot:2',
      'ririkoai/ririkobot-dashboard:2.2.0',
      'ririkoai/ririkobot-dashboard:2.2',
      'ririkoai/ririkobot-dashboard:2',
    ]);
  });

  it('groups tickets under Features, Fixes and Chores', () => {
    writeBoard();
    const text = renderNotes(gatherNotes('2.2.0', root, fakeRunner().run));
    const features = text.slice(text.indexOf('## Features'), text.indexOf('## Fixes'));
    const fixes = text.slice(text.indexOf('## Fixes'), text.indexOf('## Chores'));
    const chores = text.slice(text.indexOf('## Chores'), text.indexOf('## Merged pull requests'));
    expect(features).toContain('- Setup commands (STORY-202)');
    expect(features).not.toContain('BUG-0050');
    expect(fixes).toContain('- A bug (BUG-0050)');
    expect(fixes).toContain('- Reworked bug (BUG-0051)');
    expect(chores).toContain('- Version 2.1.0 (CHORE-2011)');
    expect(chores).toContain('- A task (TASK-2021)');
    expect(text).toContain('- #745 chore(release): version 2.1.0 (CHORE-2011)');
    expect(text).toContain('- `packages/database/migrations/pg/0010_a.sql`');
    expect(text).toContain('- `ririkoai/ririkobot-dashboard:2`');
  });

  it('prints None. for an empty section', () => {
    const text = renderNotes({
      version: '2.2.0',
      since: 'v2.1.0',
      pullRequests: [],
      tickets: [],
      migrations: [],
      images: [],
    });
    expect(text.match(/None\./g)).toHaveLength(6);
  });

  it('refuses a value that is not x.y.z and a repository without a stable tag', () => {
    expect(() => gatherNotes('v2.2.0', root, fakeRunner().run)).toThrow(/not a version/);
    const { run } = fakeRunner({ 'git tag --list v*': '' });
    expect(() => gatherNotes('2.2.0', root, run)).toThrow(/no stable v tag/);
  });
});

describe('writeNotes and main', () => {
  it('writes the draft to .local/release-notes-vX.Y.Z.md', () => {
    writeBoard();
    const file = writeNotes('2.2.0', root, fakeRunner().run);
    expect(file).toBe(notesPath('2.2.0', root));
    expect(file).toContain(join('.local', 'release-notes-v2.2.0.md'));
    expect(readFileSync(file, 'utf8')).toContain('# Ririko 2.2.0');
  });

  it('refuses to write where git does not ignore the file', () => {
    writeBoard();
    const { run } = fakeRunner({
      'git check-ignore -q .local/release-notes-v2.2.0.md': new Error('exit 1'),
    });
    expect(() => writeNotes('2.2.0', root, run)).toThrow(/not ignored by git/);
  });

  it('exits 0 and names the file; exits 1 with a message otherwise', () => {
    writeBoard();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(main(['2.2.0'], { root, run: fakeRunner().run })).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('release-notes-v2.2.0.md'));
    expect(main([], { root, run: fakeRunner().run })).toBe(1);
    expect(main(['2.2'], { root, run: fakeRunner().run })).toBe(1);
    expect(error).toHaveBeenCalledTimes(2);
  });
});
