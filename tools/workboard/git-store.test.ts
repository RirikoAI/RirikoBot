import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { relative, resolve } from 'node:path';
import { deliveryBase, git, guardCommit, guardMessage, guardPullRequest, guardPush, publicationBase, publicationPlan, requirePublishedBase, verifyGit } from './git.ts';
import { checkHandoffs, commonDirectory, initializeShared, mutate, readBoard, serialize, synchronize, withLock } from './store.ts';
import { parseBoard } from './model.ts';
import { renderBoard, ticketView } from './render.ts';
import type { Batch, Board, Command } from './types.ts';

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

function stackedFixture(publishParent = true): string {
  publicationFixture();
  // A real parent-only code change must not be attributed to the dependent story.
  writeFileSync(resolve(root, 'README.md'), 'Completed parent delivery\n');
  board.batches[0]!.status = 'closed';
  board.decisions.push({ id: 'D-001', kind: 'defer-pr', reference: 'User: defer this PR and allow one stacked improvement story', at, fromTicket: null, toTicket: null, disposition: null, batchId: 'BATCH-001' });
  project(board);
  git(root, ['add', 'README.md', '.workboard']);
  git(root, ['commit', '-m', '[RIR-001] Preserve deferred parent']);
  const parentHead = git(root, ['rev-parse', 'HEAD']);
  if (publishParent) git(root, ['update-ref', `refs/remotes/origin/${board.batches[0]!.branch}`, parentHead]);
  git(root, ['switch', '-c', 'feat/RIR-110-evidence']);
  board.tickets.push({ ...board.tickets[1]!, id: 'RIR-110', type: 'story', title: 'Independent delivery evidence', requires: ['RIR-001'], status: 'done', deliveryScope: 'RIR-110', paths: ['src/'], handoff: '.workboard/handoffs/RIR-110/001.md' });
  board.grooming[0]!.tickets.push('RIR-110');
  board.batches.push({ id: 'BATCH-002', scope: 'RIR-110', branch: 'feat/RIR-110-evidence', baseBranch: board.policy.baseBranch, baseSha: board.batches[0]!.baseSha, status: 'checkpoint', tickets: ['RIR-110'], prUrl: null, stack: { parentBatch: 'BATCH-001', parentHead, decision: 'D-001' } });
  mkdirSync(resolve(root, '.workboard/handoffs/RIR-110'), { recursive: true });
  writeFileSync(resolve(root, '.workboard/handoffs/RIR-110/001.md'), '# Story handoff\nReviewed independently.\n');
  mkdirSync(resolve(root, 'src'));
  writeFileSync(resolve(root, 'src/evidence.ts'), 'export const evidence = true;\n');
  project(board);
  git(root, ['add', 'src/', '.workboard']);
  git(root, ['commit', '-m', '[RIR-110] Verify story evidence']);
  return parentHead;
}

function prEvent(target: string, sha: string): unknown {
  return { pull_request: { base: { ref: target, sha, repo: { full_name: board.policy.repository } }, head: { ref: board.batches.at(-1)!.branch, sha: git(root, ['rev-parse', 'HEAD']), repo: { full_name: board.policy.repository } } } };
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
    expect(() => guardPush(root, board, { ...approval, target: 'develop/2.0.0' }, 'origin', board.policy.remoteUrl, line)).toThrow(/No matching/);
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
  it('uses the actual integration fork point when upstream changes are incorporated', () => {
    publicationFixture();
    git(root, ['switch', board.policy.baseBranch]);
    writeFileSync(resolve(root, 'upstream-only.txt'), 'An unrelated delivery already accepted upstream\n');
    git(root, ['add', 'upstream-only.txt']);
    git(root, ['commit', '-m', 'Separate upstream delivery']);
    const upstream = git(root, ['rev-parse', 'HEAD']);
    git(root, ['update-ref', `refs/remotes/origin/${board.policy.baseBranch}`, upstream]);
    git(root, ['switch', board.batches[0]!.branch]);
    git(root, ['merge', '--no-edit', upstream]);
    expect(deliveryBase(root, board)).toMatchObject({ branch: board.policy.baseBranch, sha: upstream, anchor: upstream, stacked: false });
    expect(() => guardCommit(root, board)).not.toThrow();
    expect(() => publicationPlan(root, board)).not.toThrow();
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

describe('explicitly approved stacked deliveries', () => {
  it('opens an approved stack atomically through real board commands before starting the story', () => {
    publicationFixture();
    const apply = (command: Command): Board => mutate(root, command, readBoard(root).revision, { actor: 'coordinator', now: at });
    apply({ action: 'decision', decision: { id: 'D-001', kind: 'defer-pr', reference: 'User: defer this PR and allow one stacked improvement story', at, fromTicket: null, toTicket: null, disposition: null, batchId: 'BATCH-001' } });
    apply({ action: 'close-batch', batch: 'BATCH-001', decision: 'D-001' });
    git(root, ['add', '.workboard']);
    git(root, ['commit', '-m', '[RIR-001] Preserve deferred parent']);
    const parentHead = git(root, ['rev-parse', 'HEAD']);
    apply({ action: 'create', ticket: { ...board.tickets[1]!, id: 'RIR-110', type: 'story', status: 'backlog', deliveryScope: 'RIR-110', requires: ['RIR-001'], estimate: null, groomedIn: null, owner: null, handoff: null, validation: [] } });
    apply({ action: 'groom', grooming: { id: 'GR-002', scope: 'RIR-100', at, participants: ['coordinator'], tickets: ['RIR-110'], rationale: 'Refine the one approved dependent story' }, estimates: [{ id: 'RIR-110', points: 3, rationale: 'Bounded fixture story' }] });
    mkdirSync(resolve(root, '.workboard/handoffs/RIR-110'), { recursive: true });
    writeFileSync(resolve(root, '.workboard/handoffs/RIR-110/001.md'), '# Approved story\nEstimate and acceptance reviewed.\n');
    apply({ action: 'move', ticket: 'RIR-110', status: 'ready', reason: 'Groomed scope ready for its approved stack', handoff: '.workboard/handoffs/RIR-110/001.md' });
    git(root, ['switch', '-c', 'feat/RIR-110-evidence']);
    const batch: Batch = { id: 'BATCH-002', scope: 'RIR-110', branch: 'feat/RIR-110-evidence', baseBranch: board.policy.baseBranch, baseSha: board.batches[0]!.baseSha, status: 'open', tickets: ['RIR-110'], prUrl: null };
    const revision = readBoard(root).revision;
    expect(() => apply({ action: 'batch', batch })).toThrow(/Unapproved inherited delivery/);
    expect(() => apply({ action: 'batch', batch: { ...batch, stack: { parentBatch: 'BATCH-001', parentHead, decision: 'missing' } } })).toThrow(/matching parent deferral/);
    expect(readBoard(root).revision).toBe(revision);
    apply({ action: 'batch', batch: { ...batch, stack: { parentBatch: 'BATCH-001', parentHead, decision: 'D-001' } } });
    const next = apply({ action: 'start', ticket: 'RIR-110', owner: 'coordinator' });
    expect(next.tickets.filter((entry) => entry.status === 'in-progress').map((entry) => entry.id)).toEqual(['RIR-110']);
    expect(deliveryBase(root, next)).toMatchObject({ branch: board.batches[0]!.branch, anchor: parentHead, published: false });
  });
  it('isolates only the child story and requires the preserved parent as its immediate PR target', () => {
    const parentHead = stackedFixture();
    const target = deliveryBase(root, board);
    expect(target).toEqual({ branch: 'chore/RIR-001-governance', sha: parentHead, anchor: parentHead, stacked: true, published: true });
    expect(() => guardCommit(root, board)).not.toThrow();
    const approval = { ...publicationPlan(root, board), reference: 'User approves this story and exact parent target', at };
    expect(approval.target).toBe('chore/RIR-001-governance');
    const line = `refs/heads/${approval.branch} ${approval.head} refs/heads/${approval.branch} ${'0'.repeat(40)}\n`;
    expect(() => guardPush(root, board, approval, 'origin', board.policy.remoteUrl, line)).not.toThrow();
    expect(guardPullRequest(board, prEvent(target.branch, parentHead), target)).toBe(approval.head);
    expect(guardPullRequest(board, prEvent(target.branch, parentHead))).toBe(approval.head);
    expect(() => guardPullRequest(board, prEvent(board.policy.baseBranch, board.batches[0]!.baseSha), target)).toThrow(/repository\/head\/base/);
    expect(() => guardPullRequest(board, prEvent(board.policy.baseBranch, board.batches[0]!.baseSha))).toThrow(/repository\/head\/base/);
    expect(() => guardPullRequest(board, prEvent(target.branch, 'f'.repeat(40)), target)).toThrow(/base SHA/);
    expect(() => guardPullRequest(board, prEvent(target.branch, 'f'.repeat(40)))).toThrow(/base SHA/);
  });
  it('keeps an unpublished parent reviewable but refuses dependent publication', () => {
    stackedFixture(false);
    expect(deliveryBase(root, board).published).toBe(false);
    const approval = { ...publicationPlan(root, board), reference: 'User approves the child only', at };
    expect(approval.target).toBe('chore/RIR-001-governance');
    expect(() => requirePublishedBase(root, board)).toThrow(/Parent target.*unpublished/);
    const line = `refs/heads/${approval.branch} ${approval.head} refs/heads/${approval.branch} ${'0'.repeat(40)}\n`;
    expect(() => guardPush(root, board, approval, 'origin', board.policy.remoteUrl, line)).toThrow(/Parent target.*unpublished/);
  });
  it.each(['refs/heads/', 'refs/remotes/origin/'])('rejects movement of the frozen parent at %s', (prefix) => {
    const parentHead = stackedFixture();
    const moved = git(root, ['commit-tree', `${parentHead}^{tree}`, '-p', parentHead, '-m', 'Additional parent work']);
    git(root, ['update-ref', `${prefix}${board.batches[0]!.branch}`, moved]);
    expect(() => deliveryBase(root, board)).toThrow(/Parent branch moved/);
    expect(() => publicationPlan(root, board)).toThrow(/Parent branch moved/);
  });
  it('resolves an integrated parent to the integration target and actual fork point', () => {
    const parentHead = stackedFixture();
    const oldBase = board.batches[0]!.baseSha;
    // A merge of the parent can advance integration independently of the child.
    const integrated = git(root, ['commit-tree', `${parentHead}^{tree}`, '-p', oldBase, '-p', parentHead, '-m', 'Merge reviewed parent']);
    git(root, ['update-ref', `refs/remotes/origin/${board.policy.baseBranch}`, integrated]);
    const target = deliveryBase(root, board);
    expect(target).toEqual({ branch: board.policy.baseBranch, sha: integrated, anchor: parentHead, stacked: true, published: true });
    expect(() => guardCommit(root, board)).not.toThrow();
    expect(() => guardPullRequest(board, prEvent(target.branch, integrated), target)).not.toThrow();
    expect(() => publicationPlan(root, board)).toThrow(/Target advanced/);
    git(root, ['merge', '--no-edit', integrated]);
    expect(publicationPlan(root, board).target).toBe(board.policy.baseBranch);
    expect(deliveryBase(root, board).anchor).toBe(integrated);
  });
  it('rejects unapproved inheritance even when both scopes happen to allow the same paths', () => {
    stackedFixture();
    delete board.batches[1]!.stack;
    board.tickets.at(-1)!.paths.push('README.md');
    expect(() => verifyGit(root, board)).toThrow(/Unapproved inherited delivery BATCH-001/);
  });
  it('rejects local commits substituted for the verified integration anchor', () => {
    const parentHead = stackedFixture();
    board.batches[1]!.baseSha = parentHead;
    expect(() => verifyGit(root, board)).toThrow(/not an ancestor of the fetched integration/);
  });
  it('requires the parent delivery, decision and exact ancestor to remain valid', () => {
    const parentHead = stackedFixture();
    board.decisions[0]!.batchId = 'BATCH-002';
    expect(() => deliveryBase(root, board)).toThrow(/closed parent delivery.*decision/);
    board.decisions[0]!.batchId = 'BATCH-001';
    board.batches[0]!.status = 'checkpoint';
    expect(() => deliveryBase(root, board, board.batches[1])).toThrow(/closed parent delivery/);
    board.batches[0]!.status = 'closed';
    board.batches[1]!.stack!.parentHead = git(root, ['commit-tree', `${parentHead}^{tree}`, '-p', parentHead, '-m', 'Not an ancestor of child']);
    expect(() => deliveryBase(root, board)).toThrow(/exact preserved parent commit/);
  });
});

describe('publishing the explicitly deferred parent from its child checkpoint', () => {
  it('plans only the preserved parent source and its own scope without changing checkout or ownership', () => {
    const parentHead = stackedFixture(false);
    const childHead = git(root, ['rev-parse', 'HEAD']);
    board.tickets[1]!.paths = ['README.md'];
    const snapshot = structuredClone(board);
    const target = publicationBase(root, board, 'BATCH-001');
    expect(target).toEqual({ branch: board.policy.baseBranch, sha: board.batches[0]!.baseSha, anchor: board.batches[0]!.baseSha, stacked: false, published: true });
    expect(publicationPlan(root, board, 'BATCH-001')).toMatchObject({ batch: 'BATCH-001', branch: board.batches[0]!.branch, head: parentHead, target: board.policy.baseBranch, base: target.sha });
    expect(requirePublishedBase(root, board, 'BATCH-001')).toEqual(target);
    expect(git(root, ['branch', '--show-current'])).toBe(board.batches[1]!.branch);
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(childHead);
    expect(board).toEqual(snapshot);
    board.tickets[1]!.paths = [];
    expect(() => publicationPlan(root, board, 'BATCH-001')).toThrow(/outside delivery scope RIR-001.*README/);
  });
  it('accepts a separately approved parent ref while the parent is still unpublished', () => {
    stackedFixture(false);
    const approval = { ...publicationPlan(root, board, 'BATCH-001'), reference: 'User approves only the exact deferred parent into integration', at };
    const parentLine = `refs/heads/${approval.branch} ${approval.head} refs/heads/${approval.branch} ${'0'.repeat(40)}\n`;
    expect(() => guardPush(root, board, approval, 'origin', board.policy.remoteUrl, parentLine)).not.toThrow();
    expect(() => requirePublishedBase(root, board)).toThrow(/Parent target.*unpublished/);
  });
  it.each(['parent-for-child', 'child-for-parent', 'wrong-batch'] as const)('keeps approval separate for %s', (scenario) => {
    stackedFixture();
    const parentApproval = { ...publicationPlan(root, board, 'BATCH-001'), reference: 'User approves the deferred parent only', at };
    const childApproval = { ...publicationPlan(root, board), reference: 'User separately approves the child story only', at };
    const parentLine = `refs/heads/${parentApproval.branch} ${parentApproval.head} refs/heads/${parentApproval.branch} ${'0'.repeat(40)}\n`;
    const childLine = `refs/heads/${childApproval.branch} ${childApproval.head} refs/heads/${childApproval.branch} ${'0'.repeat(40)}\n`;
    if (scenario === 'parent-for-child') expect(() => guardPush(root, board, parentApproval, 'origin', board.policy.remoteUrl, childLine)).toThrow(/approved, non-deletion topic HEAD/);
    if (scenario === 'child-for-parent') expect(() => guardPush(root, board, childApproval, 'origin', board.policy.remoteUrl, parentLine)).toThrow(/approved, non-deletion topic HEAD/);
    if (scenario === 'wrong-batch') expect(() => guardPush(root, board, { ...parentApproval, batch: 'BATCH-002' }, 'origin', board.policy.remoteUrl, parentLine)).toThrow(/No matching user approval/);
  });
  it('refuses unrelated closed deliveries and a parent already recorded as published', () => {
    stackedFixture();
    board.batches.push({ ...board.batches[0]!, id: 'BATCH-003', branch: 'chore/RIR-003-unrelated' });
    expect(() => publicationPlan(root, board, 'BATCH-003')).toThrow(/deferred immediate parent/);
    expect(() => requirePublishedBase(root, board, 'BATCH-003')).toThrow(/deferred immediate parent/);
    board.batches[0]!.prUrl = 'https://github.com/example/ririko/pull/1';
    expect(() => publicationPlan(root, board, 'BATCH-001')).toThrow(/deferred immediate parent/);
  });
  it('requires the child checkpoint, accepted workers and clean checkout before selecting the parent', () => {
    stackedFixture();
    board.batches[1]!.status = 'open';
    expect(() => publicationPlan(root, board, 'BATCH-001')).toThrow(/current PR checkpoint/);
    board.batches[1]!.status = 'checkpoint';
    board.assignments.push({ id: 'A-001', ticket: 'RIR-110', agent: 'worker', scope: 'Pending review', paths: ['src/'], status: 'returned', handoff: '.workboard/handoffs/RIR-110/001.md' });
    expect(() => publicationPlan(root, board, 'BATCH-001')).toThrow(/Accept all worker returns/);
    board.assignments[0]!.status = 'accepted';
    writeFileSync(resolve(root, 'src/evidence.ts'), 'export const evidence = false;\n');
    expect(() => publicationPlan(root, board, 'BATCH-001')).toThrow(/clean worktree/);
  });
  it('refuses selecting a parent after its preserved branch moves', () => {
    const parentHead = stackedFixture(false);
    const moved = git(root, ['commit-tree', `${parentHead}^{tree}`, '-p', parentHead, '-m', 'Unexpected parent advancement']);
    git(root, ['update-ref', `refs/heads/${board.batches[0]!.branch}`, moved]);
    expect(() => publicationPlan(root, board, 'BATCH-001')).toThrow(/Parent branch moved/);
    expect(() => publicationBase(root, board, 'BATCH-001')).toThrow(/Parent branch moved/);
  });
});

describe('fresh stacking consent after a published parent closes', () => {
  const parentPr = 'https://github.com/example/ririko/pull/557';
  let parentHead: string;

  beforeEach(() => {
    publicationFixture();
    const apply = (command: Command): Board => {
      board = mutate(root, command, board.revision, { actor: 'coordinator', now: at });
      return board;
    };
    parentHead = git(root, ['rev-parse', 'HEAD']);
    // Model an already published ref without making a network push or creating a PR.
    git(root, ['update-ref', `refs/remotes/origin/${board.batches[0]!.branch}`, parentHead]);
    apply({ action: 'decision', decision: { id: 'D-001', kind: 'pr-created', reference: 'Fixture user approved the parent PR; its exact head and target were verified', at, fromTicket: null, toTicket: null, disposition: null, batchId: 'BATCH-001' } });
    apply({ action: 'close-batch', batch: 'BATCH-001', decision: 'D-001', prUrl: parentPr });
    apply({ action: 'decision', decision: { id: 'D-002', kind: 'stack', reference: 'Fixture user separately approves one new stacked story above the existing parent PR', at, fromTicket: null, toTicket: null, disposition: null, batchId: 'BATCH-001' } });
    apply({ action: 'create', ticket: { ...board.tickets[1]!, id: 'RIR-110', type: 'story', status: 'backlog', deliveryScope: 'RIR-110', requires: ['RIR-001'], paths: ['src/'], estimate: null, groomedIn: null, owner: null, handoff: null, validation: [] } });
    apply({ action: 'groom', grooming: { id: 'GR-002', scope: 'RIR-100', at, participants: ['coordinator'], tickets: ['RIR-110'], rationale: 'Refine the separately approved follow-up scope' }, estimates: [{ id: 'RIR-110', points: 3, rationale: 'Bounded regression fixture' }] });
    const childHandoff = '.workboard/handoffs/RIR-110/001.md';
    mkdirSync(resolve(root, '.workboard/handoffs/RIR-110'), { recursive: true });
    writeFileSync(resolve(root, childHandoff), '# New story after publication\nFresh stack consent, estimate and outcome evidence.\n');
    apply({ action: 'move', ticket: 'RIR-110', status: 'ready', reason: 'Freshly approved and groomed', handoff: childHandoff });
    // Preserve the published parent ref; administrative receipt state travels with the child.
    git(root, ['switch', '-c', 'feat/RIR-110-evidence']);
    apply({ action: 'batch', batch: { id: 'BATCH-002', scope: 'RIR-110', branch: 'feat/RIR-110-evidence', baseBranch: board.policy.baseBranch, baseSha: board.batches[0]!.baseSha, status: 'open', tickets: ['RIR-110'], prUrl: null, stack: { parentBatch: 'BATCH-001', parentHead, decision: 'D-002' } } });
    apply({ action: 'start', ticket: 'RIR-110', owner: 'coordinator' });
    mkdirSync(resolve(root, 'src'));
    writeFileSync(resolve(root, 'src/evidence.ts'), 'export const freshStack = true;\n');
    apply({ action: 'move', ticket: 'RIR-110', status: 'review', reason: 'Review fixture evidence', handoff: childHandoff, validation: ['Fixture source and exact parent target reviewed'] });
    apply({ action: 'move', ticket: 'RIR-110', status: 'done', reason: 'Fixture acceptance satisfied', handoff: childHandoff, validation: ['Fixture source and exact parent target accepted'] });
    apply({ action: 'checkpoint', batch: 'BATCH-002' });
    git(root, ['add', '.workboard', 'src/']);
    git(root, ['commit', '-m', '[RIR-110] Preserve fresh stack fixture']);
  });

  it('persists fresh consent and resolves the exact child PR target while retaining the parent receipt', () => {
    const persisted = readBoard(root);
    expect(persisted.batches[0]).toMatchObject({ status: 'closed', prUrl: parentPr });
    expect(persisted.decisions.map((entry) => entry.kind)).toEqual(['pr-created', 'stack']);
    expect(persisted.history.filter((entry) => entry.action === 'close-batch')).toHaveLength(1);
    const target = deliveryBase(root, persisted);
    expect(target).toEqual({ branch: board.batches[0]!.branch, sha: parentHead, anchor: parentHead, stacked: true, published: true });
    expect(guardPullRequest(persisted, prEvent(target.branch, parentHead), target)).toBe(git(root, ['rev-parse', 'HEAD']));
    expect(() => guardPullRequest(persisted, prEvent(board.policy.baseBranch, board.batches[0]!.baseSha), target)).toThrow(/repository\/head\/base/);
    expect(git(root, ['rev-parse', `refs/heads/${board.batches[0]!.branch}`])).toBe(parentHead);
    expect(git(root, ['rev-parse', `refs/remotes/origin/${board.batches[0]!.branch}`])).toBe(parentHead);
    const invalid = structuredClone(persisted);
    invalid.batches[1]!.stack!.decision = 'D-001';
    expect(() => deliveryBase(root, invalid)).toThrow(/recorded user defer\/stack decision/);
  });

  it('cannot republish the recorded parent or treat new stack consent as child publication approval', () => {
    const plan = publicationPlan(root, board);
    expect(plan).toMatchObject({ batch: 'BATCH-002', target: board.batches[0]!.branch, base: parentHead, reference: '' });
    expect(() => publicationPlan(root, board, 'BATCH-001')).toThrow(/deferred immediate parent/);
    expect(() => requirePublishedBase(root, board, 'BATCH-001')).toThrow(/deferred immediate parent/);
    const childLine = `refs/heads/${plan.branch} ${plan.head} refs/heads/${plan.branch} ${'0'.repeat(40)}\n`;
    expect(() => guardPush(root, board, null, 'origin', board.policy.remoteUrl, childLine)).toThrow(/No matching user approval/);
    expect(readBoard(root).batches[0]).toMatchObject({ status: 'closed', prUrl: parentPr });
  });
});
