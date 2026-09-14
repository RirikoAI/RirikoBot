import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { relative, resolve } from 'node:path';
import { git, guardCommit, guardMessage, guardPullRequest, guardPush, publicationPlan, verifyGit } from './git.ts';
import { checkHandoffs, commonDirectory, initializeShared, mutate, readBoard, serialize, synchronize, withLock } from './store.ts';
import { parseBoard } from './model.ts';
import { renderBoard, ticketView } from './render.ts';
import type { Board } from './types.ts';

const at = '2026-09-14T12:00:00Z';
const handoff = '.workboard/handoffs/RIR-001/001.md';
let directory: string;
let root: string;
let board: Board;

function project(value: Board): void {
  writeFileSync(resolve(root, '.workboard/state.json'), serialize(value));
  writeFileSync(resolve(root, '.workboard/BOARD.md'), renderBoard(value));
}

function publicationFixture(): ReturnType<typeof publicationPlan> {
  board.tickets[1]!.status = 'done';
  board.tickets[1]!.validation = ['Acceptance verified'];
  board.batches[0]!.status = 'checkpoint';
  project(board);
  // Fixtures deliberately bypass the production command flow to isolate Git guards.
  writeFileSync(resolve(commonDirectory(root), 'state.json'), serialize(board));
  git(root, ['add', '.workboard']);
  git(root, ['commit', '-m', '[RIR-001] Complete fixture']);
  return { ...publicationPlan(root, board), reference: 'User reply in test: approve this exact scope', at };
}

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), 'ririko-workboard-test-'));
  root = resolve(directory, 'repo');
  mkdirSync(root);
  git(root, ['init', '-b', 'develop/2.0.0-astra']);
  git(root, ['config', 'user.email', 'test@example.invalid']);
  git(root, ['config', 'user.name', 'Workboard test']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  git(root, ['config', 'core.hooksPath', '.disabled-test-hooks']);
  git(root, ['remote', 'add', 'origin', 'https://github.com/example/ririko.git']);
  writeFileSync(resolve(root, 'README.md'), 'Fixture\n');
  git(root, ['add', 'README.md']);
  git(root, ['commit', '-m', 'Fixture base']);
  const baseSha = git(root, ['rev-parse', 'HEAD']);
  git(root, ['update-ref', 'refs/remotes/origin/develop/2.0.0-astra', baseSha]);
  git(root, ['switch', '-c', 'chore/RIR-001-governance']);
  const common = { title: 'Fixture', requires: [], estimate: 3, estimateRationale: 'Bounded test fixture', groomedIn: 'GR-001', priority: 'P1', acceptance: ['Prove the workflow'], paths: ['src/', 'README.md'], owner: null, handoff: null, validation: [] };
  board = parseBoard({
    version: 1, revision: 1,
    policy: { pointScale: [1, 2, 3, 5, 8, 13, 21, 34, 55, 89], wipLimit: 1, repository: 'example/ririko', remote: 'origin', remoteUrl: 'https://github.com/example/ririko.git', baseBranch: 'develop/2.0.0-astra' },
    tickets: [{ ...common, id: 'RIR-100', type: 'epic', status: 'ready', parent: null, deliveryScope: 'RIR-100' }, { ...common, id: 'RIR-001', type: 'chore', status: 'in-progress', parent: 'RIR-100', deliveryScope: 'RIR-001', owner: 'coordinator', handoff }],
    grooming: [{ id: 'GR-001', scope: 'RIR-100', at, participants: ['coordinator'], tickets: ['RIR-100', 'RIR-001'], rationale: 'Estimate the epic together' }],
    decisions: [], assignments: [],
    batches: [{ id: 'BATCH-001', scope: 'RIR-001', branch: 'chore/RIR-001-governance', baseBranch: 'develop/2.0.0-astra', baseSha, status: 'open', tickets: ['RIR-001'], prUrl: null }],
    history: [{ id: 1, at, actor: 'coordinator', action: 'bootstrap', detail: 'Fixture initialized before work' }],
  });
  mkdirSync(resolve(root, '.workboard/handoffs/RIR-001'), { recursive: true });
  writeFileSync(resolve(root, handoff), '# Fixture handoff\nEvidence and next actions.\n');
  project(board);
  initializeShared(root);
});

afterEach(() => {
  // Never recursively clean a computed path outside the uniquely created test directory.
  if (!relative(tmpdir(), directory).startsWith('ririko-workboard-test-')) throw new Error('Unsafe test cleanup target');
  rmSync(directory, { recursive: true, force: true });
});

describe('durable state and session coordination', () => {
  it('rejects stale revisions without changing either copy', () => {
    expect(() => mutate(root, { action: 'handoff', ticket: 'RIR-001', handoff, reason: 'Session checkpoint' }, 9, { actor: 'coordinator', now: at })).toThrow(/Stale revision/);
    expect(readBoard(root)).toEqual(board);
  });
  it('serializes writes and retains the active slot while recording knowledge', () => {
    const next = mutate(root, { action: 'handoff', ticket: 'RIR-001', handoff, reason: 'Session checkpoint' }, 1, { actor: 'coordinator', now: at });
    expect(next.revision).toBe(2);
    expect(next.tickets[1]?.status).toBe('in-progress');
    expect(readBoard(root)).toEqual(next);
    expect(readFileSync(resolve(root, '.workboard/BOARD.md'), 'utf8')).toBe(renderBoard(next));
    expect(() => withLock(root, () => withLock(root, () => undefined))).toThrow(/Another session holds/);
    expect(() => withLock(root, () => undefined)).not.toThrow();
  });
  it('rejects missing handoffs before writing and detects manual/stale changes', () => {
    expect(() => mutate(root, { action: 'handoff', ticket: 'RIR-001', handoff: '.workboard/handoffs/RIR-001/missing.md', reason: 'Checkpoint' }, 1, { actor: 'coordinator', now: at })).toThrow();
    expect(readBoard(root).revision).toBe(1);
    const edited = structuredClone(board); edited.tickets[1]!.title = 'Changed outside the tool'; project(edited);
    expect(() => readBoard(root)).toThrow(/stale or manually changed/);
    synchronize(root);
    expect(readBoard(root)).toEqual(board);
    expect(() => checkHandoffs(root, board)).not.toThrow();
  });
  it('shares the execution lock and canonical revision with a separate worktree', () => {
    git(root, ['add', '.workboard']); git(root, ['commit', '-m', '[RIR-001] Persist fixture']);
    const other = resolve(directory, 'second-worktree');
    git(root, ['worktree', 'add', '--detach', other, 'HEAD']);
    expect(commonDirectory(other)).toBe(commonDirectory(root));
    expect(() => withLock(root, () => withLock(other, () => undefined))).toThrow(/Another session holds/);
    mutate(root, { action: 'handoff', ticket: 'RIR-001', handoff, reason: 'Worker knowledge transfer' }, 1, { actor: 'coordinator', now: at });
    expect(() => readBoard(other)).toThrow(/stale/);
    expect(() => synchronize(other)).toThrow(/Shared work belongs/);
  });
  it('renders child and inverse blocking relationships without redundant storage', () => {
    expect(ticketView(board, board.tickets[0]!)).toMatchObject({ children: ['RIR-001'], blocks: [] });
    expect(renderBoard(board)).toContain('RIR-001');
    const other = structuredClone(board.tickets[1]!); other.id = 'RIR-002'; other.requires = ['RIR-001']; board.tickets.push(other);
    expect(ticketView(board, board.tickets[1]!)).toMatchObject({ blocks: ['RIR-002'] });
  });
  it('preserves completed scope code before closure and allows only a closing metadata commit', () => {
    publicationFixture();
    let next = mutate(root, { action: 'decision', decision: { id: 'D-001', kind: 'defer-pr', reference: 'Fixture user explicitly defers publication', at, fromTicket: null, toTicket: null, disposition: null, batchId: 'BATCH-001' } }, 1, { actor: 'coordinator', now: at });
    writeFileSync(resolve(root, 'README.md'), 'Uncommitted delivery work\n');
    expect(() => mutate(root, { action: 'close-batch', batch: 'BATCH-001', decision: 'D-001' }, 2, { actor: 'coordinator', now: at })).toThrow(/Commit the delivery code/);
    git(root, ['add', 'README.md']); git(root, ['commit', '-m', '[RIR-001] Preserve code']);
    next = mutate(root, { action: 'close-batch', batch: 'BATCH-001', decision: 'D-001' }, next.revision, { actor: 'coordinator', now: at });
    git(root, ['add', '.workboard']);
    expect(() => guardCommit(root, next)).not.toThrow();
    expect(() => guardMessage(next, '[RIR-001] Persist delivery closure')).not.toThrow();
    writeFileSync(resolve(root, 'README.md'), 'New work after closure\n'); git(root, ['add', 'README.md']);
    expect(() => guardCommit(root, next)).toThrow(/closed batch permits only/);
  });
});

describe('local Git and publication guards', () => {
  it('rejects protected branches, unexpected remotes and mismatched commit scope', () => {
    expect(() => verifyGit(root, board)).not.toThrow();
    expect(() => guardMessage(board, '[RIR-001] Add workflow\n')).not.toThrow();
    expect(() => guardMessage(board, '[RIR-200] Unrelated work')).toThrow(/subject/);
    git(root, ['switch', 'develop/2.0.0-astra']);
    expect(() => verifyGit(root, board)).toThrow(/Expected topic/);
    git(root, ['switch', 'chore/RIR-001-governance']);
    git(root, ['remote', 'set-url', '--push', 'origin', 'https://github.com/other/repo.git']);
    expect(() => verifyGit(root, board)).toThrow(/Push URL/);
  });
  it('rejects out-of-scope files and stale staged board data', () => {
    git(root, ['add', '.workboard']);
    expect(() => guardCommit(root, board)).not.toThrow();
    writeFileSync(resolve(root, 'unrelated.txt'), 'Do not include\n'); git(root, ['add', 'unrelated.txt']);
    expect(() => guardCommit(root, board)).toThrow(/outside delivery scope/);
    git(root, ['restore', '--staged', 'unrelated.txt']);
    writeFileSync(resolve(root, '.workboard/BOARD.md'), 'Stale projection');
    expect(() => guardCommit(root, board)).toThrow(/Stage the current/);
  });
  it('requires a clean checkpoint and exact user approval before any push', () => {
    expect(() => publicationPlan(root, board)).toThrow(/checkpoint/);
    const approval = publicationFixture();
    const line = `refs/heads/${approval.branch} ${approval.head} refs/heads/${approval.branch} ${'0'.repeat(40)}\n`;
    expect(() => guardPush(root, board, null, 'origin', board.policy.remoteUrl, line)).toThrow(/No matching user approval/);
    expect(() => guardPush(root, board, { ...approval, head: 'a'.repeat(40) }, 'origin', board.policy.remoteUrl, line)).toThrow(/No matching/);
    expect(() => guardPush(root, board, approval, 'origin', board.policy.remoteUrl, line)).not.toThrow();
    expect(() => guardPush(root, board, approval, 'origin', board.policy.remoteUrl, `${line}${line}`)).toThrow(/exactly one/);
    expect(() => guardPush(root, board, approval, 'origin', board.policy.remoteUrl, line.replace(`refs/heads/${approval.branch}`, '(delete)'))).toThrow(/non-deletion/);
    expect(() => guardPush(root, board, approval, 'origin', 'https://github.com/other/repo.git', line)).toThrow(/destination/);
    writeFileSync(resolve(root, 'README.md'), 'New edits invalidate approval\n');
    expect(() => guardPush(root, board, approval, 'origin', board.policy.remoteUrl, line)).toThrow(/clean worktree/);
  });
  it('rejects non-fast-forward topic updates and an advanced target', () => {
    const approval = publicationFixture();
    const batch = board.batches[0]!;
    const divergent = git(root, ['commit-tree', `${batch.baseSha}^{tree}`, '-p', batch.baseSha, '-m', 'Divergent remote work']);
    const line = `refs/heads/${approval.branch} ${approval.head} refs/heads/${approval.branch} ${divergent}\n`;
    expect(() => guardPush(root, board, approval, 'origin', board.policy.remoteUrl, line)).toThrow(/Non-fast-forward/);
    git(root, ['update-ref', `refs/remotes/origin/${batch.baseBranch}`, divergent]);
    expect(() => publicationPlan(root, board)).toThrow(/Target advanced/);
  });
  it('validates the PR target and repository instead of inferring from branch names', () => {
    publicationFixture();
    const event = { pull_request: { base: { ref: 'develop/2.0.0-astra', repo: { full_name: 'example/ririko' } }, head: { ref: 'chore/RIR-001-governance', sha: git(root, ['rev-parse', 'HEAD']), repo: { full_name: 'example/ririko' } } } };
    expect(() => guardPullRequest(board, event)).not.toThrow();
    event.pull_request.base.ref = 'develop/2.0.0';
    expect(() => guardPullRequest(board, event)).toThrow(/repository\/head\/base/);
    expect(() => guardPullRequest(board, {})).toThrow(/Invalid/);
  });
});
