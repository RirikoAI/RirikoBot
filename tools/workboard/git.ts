import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Batch, Board } from './types.ts';
import { parseBoard } from './model.ts';

export function git(root: string, args: string[], optional = false): string {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0 && !optional) throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
  return result.status === 0 ? result.stdout.trimEnd() : '';
}

export function currentBatch(board: Board): Batch {
  const batch = board.batches.find((entry) => entry.status !== 'closed');
  if (!batch) throw new Error('No open delivery batch. Declare a reviewed scope and verified base first.');
  return batch;
}

function commitBatch(board: Board): Batch {
  const batch = board.batches.find((entry) => entry.status !== 'closed') ?? board.batches.at(-1);
  if (!batch) throw new Error('Declare a delivery batch before committing.');
  return batch;
}

export function protectedBranch(branch: string): boolean {
  return /^(main|master|develop|release)(?:$|[/-])/.test(branch);
}

export function allowedPath(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => pattern.endsWith('/') ? path.startsWith(pattern) : path === pattern);
}

export function checkPaths(board: Board, paths: string[], batch = currentBatch(board)): void {
  const allowed = ['.workboard/', ...board.tickets.filter((ticket) => batch.tickets.includes(ticket.id)).flatMap((ticket) => ticket.paths)];
  const outside = paths.filter((path) => !allowedPath(path, allowed) || /^(\.local|\.audit)\//.test(path));
  if (outside.length) throw new Error(`Files outside delivery scope ${batch.scope}: ${outside.join(', ')}`);
}

export interface DeliveryBase {
  /** Immediate PR target, which can be the preserved parent topic of an approved stack. */
  branch: string; sha: string; anchor: string; stacked: boolean; published: boolean;
}

function commitRef(root: string, ref: string, optional = false): string {
  return git(root, ['rev-parse', '--verify', `${ref}^{commit}`], optional);
}

function ancestor(root: string, older: string, newer: string): boolean {
  return git(root, ['merge-base', older, newer], true) === older;
}

/** Audit each introduced commit, including transient changes hidden by a net diff. */
function historyPaths(root: string, base: string, head: string, retained: string[] = []): string[] {
  // One NUL-delimited Git traversal avoids a subprocess per commit on Windows.
  return git(root, ['log', '--format=', '--name-only', '--no-renames', '-z', '--diff-merges=first-parent', `${base}..${head}`, ...retained.map((sha) => `^${sha}`), '--']).split('\0').filter(Boolean);
}

function integrationSources(root: string, board: Board, batch: Batch, headRef: string): void {
  const resolution = batch.integration;
  if (!resolution) return;
  const declared = new Map(resolution.sources.map((source) => [source.batch, source.head]));
  const consent = board.decisions.find((entry) => entry.id === resolution.decision);
  if (!consent || consent.kind !== 'integrate' || consent.batchId !== batch.id) throw new Error('Missing explicit integration resolution consent.');
  if (!ancestor(root, resolution.baseline, headRef)) throw new Error('Repair must retain its exact integration baseline.');
  for (const source of resolution.sources) {
    const previous = board.batches.find((entry) => entry.id === source.batch);
    const snapshot = parseBoard(JSON.parse(git(root, ['show', `${source.head}:.workboard/state.json`])) as unknown);
    const frozen = snapshot.batches.find((entry) => entry.id === source.batch);
    if (snapshot.policy.repository !== board.policy.repository || snapshot.policy.remote !== board.policy.remote || snapshot.policy.remoteUrl !== board.policy.remoteUrl) throw new Error('Integration source repository identity differs from the reviewed repository.');
    if (!previous || previous.status !== 'closed' || !frozen || !['checkpoint', 'closed'].includes(frozen.status) || frozen.integration ||
      frozen.branch !== previous.branch || frozen.scope !== previous.scope || frozen.baseSha !== previous.baseSha || frozen.baseBranch !== board.policy.baseBranch ||
      JSON.stringify(frozen.tickets) !== JSON.stringify(previous.tickets) || frozen.tickets.some((id) => snapshot.tickets.find((ticket) => ticket.id === id)?.status !== 'done') ||
      snapshot.assignments.some((entry) => frozen.tickets.includes(entry.ticket) && entry.status !== 'accepted')) throw new Error('Integration source does not match a completed preserved delivery snapshot.');
    const sourceBase = frozen.stack?.parentHead ?? frozen.baseSha;
    if (frozen.stack && declared.get(frozen.stack.parentBatch) !== sourceBase && !ancestor(root, sourceBase, batch.baseSha)) throw new Error('Declare every unintegrated transitive source delivery explicitly.');
    if (!ancestor(root, sourceBase, source.head) || !ancestor(root, source.head, resolution.baseline)) throw new Error('Integration baseline must retain the exact ordered original sources.');
    checkPaths(snapshot, historyPaths(root, sourceBase, source.head), frozen);
    if (source.merged) {
      const parents = git(root, ['rev-list', '--parents', '-n', '1', source.merged]).split(' ');
      if (parents.length !== 2 || parents[1] !== sourceBase || git(root, ['rev-parse', `${source.head}^{tree}`]) !== git(root, ['rev-parse', `${source.merged}^{tree}`])) throw new Error('Squash receipt must have the exact source target parent and identical full tree.');
      if (batch.status !== 'open' && !ancestor(root, source.merged, headRef)) throw new Error('Retain every reviewed squash receipt before the integration checkpoint.');
    }
  }
  const latest = resolution.sources.at(-1);
  if (!latest || !ancestor(root, latest.head, resolution.baseline) || historyPaths(root, latest.head, resolution.baseline).some((path) => !path.startsWith('.workboard/'))) throw new Error('Baseline may add only administrative receipts after the latest approved source.');
}

/** Resolve both the review target and the exact boundary of this delivery's changes. */
export function deliveryBase(root: string, board: Board, batch = currentBatch(board), headRef = 'HEAD'): DeliveryBase {
  if (batch.baseBranch !== board.policy.baseBranch) throw new Error('Batch target differs from the standing verified base.');
  const integration = commitRef(root, `refs/remotes/${board.policy.remote}/${batch.baseBranch}`);
  if (!ancestor(root, batch.baseSha, integration)) throw new Error('Recorded base SHA is not an ancestor of the fetched integration target. A local scope commit cannot replace the integration anchor.');
  if (!ancestor(root, batch.baseSha, headRef)) throw new Error('Topic does not descend from its recorded base SHA.');
  const approvedParents = new Set<string>();
  let result: DeliveryBase = { branch: batch.baseBranch, sha: integration, anchor: git(root, ['merge-base', integration, headRef]), stacked: false, published: true };
  if (batch.integration) {
    integrationSources(root, board, batch, headRef);
    for (const source of batch.integration.sources) approvedParents.add(source.batch);
  }
  if (batch.stack) {
    const stack = batch.stack;
    const parent = board.batches.find((entry) => entry.id === stack.parentBatch);
    const decision = board.decisions.find((entry) => entry.id === stack.decision);
    if (!parent || parent.id === batch.id || parent.status !== 'closed' || parent.baseBranch !== batch.baseBranch || !decision || !['defer-pr', 'stack'].includes(decision.kind) || decision.batchId !== parent.id || !decision.reference.trim()) throw new Error('Stack needs a closed parent delivery and its recorded user defer/stack decision.');
    const preserved = commitRef(root, stack.parentHead);
    if (preserved !== stack.parentHead || !ancestor(root, preserved, headRef) || !ancestor(root, parent.baseSha, preserved)) throw new Error('Topic must descend from the exact preserved parent commit.');
    const localParent = commitRef(root, `refs/heads/${parent.branch}`, true);
    const remoteParent = commitRef(root, `refs/remotes/${board.policy.remote}/${parent.branch}`, true);
    if ((localParent && localParent !== preserved) || (remoteParent && remoteParent !== preserved)) throw new Error('Parent branch moved from the reviewed stack anchor. Preserve the work and request an updated stack review.');
    const integrated = ancestor(root, preserved, integration);
    if (!integrated && !localParent && !remoteParent) throw new Error('The exact preserved parent branch is missing; restore its reviewed reference before continuing.');
    let previous: Batch | undefined = parent;
    while (previous) {
      if (approvedParents.has(previous.id)) throw new Error('Cyclic delivery stack.');
      approvedParents.add(previous.id);
      const parentId: string | undefined = previous.stack?.parentBatch;
      previous = parentId ? board.batches.find((entry) => entry.id === parentId) : undefined;
    }
    result = integrated
      ? { ...result, stacked: true }
      : { branch: parent.branch, sha: preserved, anchor: preserved, stacked: true, published: remoteParent === preserved };
  }
  // Path overlap is not consent to inherit another delivery's unpublished commits.
  for (const previous of board.batches) {
    if (previous.id === batch.id || approvedParents.has(previous.id)) continue;
    for (const ref of [`refs/heads/${previous.branch}`, `refs/remotes/${board.policy.remote}/${previous.branch}`]) {
      const head = commitRef(root, ref, true);
      if (head && ancestor(root, head, headRef) && !ancestor(root, head, integration)) throw new Error(`Unapproved inherited delivery ${previous.id}. Ask for an explicit stack decision; do not hide its commits in this scope.`);
    }
  }
  return result;
}

export function requirePublishedBase(root: string, board: Board, batchId?: string): DeliveryBase {
  const target = batchId && batchId !== currentBatch(board).id ? publicationBase(root, board, batchId) : deliveryBase(root, board);
  if (!target.published) throw new Error(`Parent target ${target.branch} is unpublished. Ask for its separate publication or integration before publishing this dependent story.`);
  return target;
}

function verifyIdentity(root: string, board: Board, batch: Batch): void {
  const branch = git(root, ['branch', '--show-current']);
  if (protectedBranch(branch) || branch !== batch.branch) throw new Error(`Expected topic ${batch.branch}; found ${branch || 'detached HEAD'}. Stop and reconcile the handoff.`);
  if (git(root, ['remote', 'get-url', board.policy.remote]) !== board.policy.remoteUrl) throw new Error('Remote identity differs from the recorded repository.');
  if (git(root, ['remote', 'get-url', '--push', board.policy.remote]) !== board.policy.remoteUrl) throw new Error('Push URL differs from the recorded repository.');
}

export function verifyGit(root: string, board: Board, batch = currentBatch(board)): Batch {
  verifyIdentity(root, board, batch);
  deliveryBase(root, board, batch);
  return batch;
}

function names(root: string, args: string[]): string[] { return git(root, [...args, '--name-only', '--no-renames', '-z', '--']).split('\0').filter(Boolean); }

/** Historical sources retain their own ownership; repair edits never inherit that ownership. */
export function checkDeliveryPaths(root: string, board: Board, batch: Batch, head = 'HEAD', workingTree = false): void {
  const target = deliveryBase(root, board, batch, head);
  const boundary = batch.integration?.baseline ?? target.anchor;
  // Validated source/squash commits retain source ownership; merge resolutions still belong to the repair.
  const retained = batch.integration?.sources.flatMap((source) => [source.head, ...(source.merged ? [source.merged] : [])]) ?? [];
  if (batch.integration) checkPaths(board, historyPaths(root, boundary, head, retained), batch);
  checkPaths(board, names(root, ['diff', boundary, ...(workingTree ? [] : [head])]), batch);
}

export function guardCommit(root: string, board: Board): void {
  const batch = commitBatch(board);
  verifyIdentity(root, board, batch);
  deliveryBase(root, board, batch);
  const stagedPaths = names(root, ['diff', '--cached']);
  if (batch.status === 'closed' && stagedPaths.some((path) => !path.startsWith('.workboard/'))) throw new Error('A closed batch permits only its administrative closing handoff/board commit. Declare new work separately.');
  checkPaths(board, stagedPaths, batch);
  // Validate the entire delivery, including earlier local commits, not just this index.
  checkDeliveryPaths(root, board, batch, 'HEAD', true);
  for (const path of ['.workboard/state.json', '.workboard/BOARD.md']) {
    const staged = git(root, ['show', `:${path}`]);
    if (staged.replaceAll('\r\n', '\n').trimEnd() !== readFileSync(resolve(root, path), 'utf8').replaceAll('\r\n', '\n').trimEnd()) throw new Error(`Stage the current ${path}; the index contains stale workflow state.`);
  }
}

export function guardMessage(board: Board, message: string): void {
  if (!message.split(/\r?\n/)[0]?.startsWith(`[${commitBatch(board).scope}] `)) throw new Error(`Commit subject must start with [${commitBatch(board).scope}] .`);
}

export interface PublishApproval { batch: string; head: string; base: string; branch: string; target: string; reference: string; at: string }

function publicationCandidate(root: string, board: Board, batchId?: string): { batch: Batch; head: string } {
  const current = currentBatch(board);
  verifyIdentity(root, board, current);
  if (current.status !== 'checkpoint') throw new Error('Prepare the current PR checkpoint before publication.');
  if (board.assignments.some((entry) => entry.status !== 'accepted')) throw new Error('Accept all worker returns before publication.');
  if (git(root, ['status', '--porcelain']).length) throw new Error('Preserve and commit the scope first; publication requires a clean worktree.');
  let batch = current;
  let head = commitRef(root, 'HEAD');
  if (batchId && batchId !== current.id) {
    const parent = board.batches.find((entry) => entry.id === batchId);
    if (!current.stack || current.stack.parentBatch !== batchId || !parent || parent.status !== 'closed' || parent.prUrl !== null || protectedBranch(parent.branch)) throw new Error('Only the current delivery or its explicitly deferred immediate parent may be selected for publication.');
    // Check the current approved stack before selecting its frozen parent source.
    deliveryBase(root, board, current);
    head = commitRef(root, `refs/heads/${parent.branch}`);
    if (head !== current.stack.parentHead) throw new Error('Parent branch moved from the reviewed stack anchor.');
    batch = parent;
  }
  if (board.tickets.some((entry) => (batch.tickets.includes(entry.id) || current.tickets.includes(entry.id)) && !['review', 'done', 'paused', 'abandoned'].includes(entry.status))) throw new Error('Every included ticket needs a reviewable result or an explicit user disposition.');
  return { batch, head };
}

/** Resolve a selected publication without changing checkout, board ownership or execution status. */
export function publicationBase(root: string, board: Board, batchId?: string): DeliveryBase {
  const { batch, head } = publicationCandidate(root, board, batchId);
  return deliveryBase(root, board, batch, head);
}

export function publicationPlan(root: string, board: Board, batchId?: string): PublishApproval {
  const { batch, head } = publicationCandidate(root, board, batchId);
  const target = deliveryBase(root, board, batch, head);
  checkDeliveryPaths(root, board, batch, head);
  const base = target.sha;
  if (git(root, ['merge-base', base, head]) !== base) throw new Error('Target advanced. Review and incorporate the fetched base before asking for publication approval.');
  if (base === head) throw new Error('There is no delivery diff to publish.');
  return { batch: batch.id, branch: batch.branch, target: target.branch, head, base, reference: '', at: '' };
}

export function guardPush(root: string, board: Board, approval: PublishApproval | null, remote: string, url: string, input: string): void {
  const plan = publicationPlan(root, board, approval?.batch);
  requirePublishedBase(root, board, approval?.batch);
  if (remote !== board.policy.remote || url !== board.policy.remoteUrl) throw new Error('Push destination does not match the verified remote.');
  if (!approval || !approval.reference.trim() || ['batch', 'branch', 'head', 'base', 'target'].some((key) => approval[key as keyof PublishApproval] !== plan[key as keyof PublishApproval])) throw new Error('No matching user approval for this exact HEAD/base/target/batch. Ask the user at the PR checkpoint.');
  const updates = input.trim().split(/\r?\n/).filter(Boolean);
  if (updates.length !== 1) throw new Error('Push exactly one explicit topic ref; tags and multiple branches are not permitted.');
  const parts = updates[0]?.split(/\s+/) ?? [];
  const [localRef, localSha, remoteRef, remoteSha] = parts;
  if (parts.length !== 4 || localRef !== `refs/heads/${plan.branch}` || remoteRef !== localRef || localSha !== plan.head || !remoteSha || !/^[a-f0-9]{40,64}$/.test(remoteSha)) throw new Error('Only the approved, non-deletion topic HEAD may be pushed to the same named branch.');
  if (!/^0+$/.test(remoteSha) && git(root, ['merge-base', remoteSha, localSha]) !== remoteSha) throw new Error('Non-fast-forward push refused; preserve remote work.');
}

export function guardPullRequest(board: Board, event: unknown, expectedTarget?: Pick<DeliveryBase, 'branch' | 'sha'>): string {
  const batch = currentBatch(board);
  if (batch.status !== 'checkpoint') throw new Error('A PR requires the recorded scope checkpoint.');
  const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid pull request event.');
    return value as Record<string, unknown>;
  };
  const pr = object(object(event)['pull_request']);
  const base = object(pr['base']);
  const head = object(pr['head']);
  const parent = batch.stack ? board.batches.find((entry) => entry.id === batch.stack?.parentBatch) : undefined;
  if (batch.stack && !parent) throw new Error('PR stack parent is missing.');
  const target = expectedTarget?.branch ?? parent?.branch ?? batch.baseBranch;
  if (base['ref'] !== target || head['ref'] !== batch.branch || object(base['repo'])['full_name'] !== board.policy.repository || object(head['repo'])['full_name'] !== board.policy.repository) throw new Error('PR repository/head/base does not match the declared delivery.');
  const expectedSha = expectedTarget?.sha ?? batch.stack?.parentHead;
  if (expectedSha && base['sha'] !== expectedSha) throw new Error('PR base SHA differs from the verified target. Fetch and review the current target before continuing.');
  const sha = head['sha'];
  if (typeof sha !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sha)) throw new Error('PR event needs an exact head SHA.');
  return sha;
}

/** CI validates the real PR head, never GitHub's synthetic merge checkout. */
export function verifyPullRequest(root: string, board: Board, event: unknown): void {
  // Shape/repository/branch validation precedes every use of the untrusted SHA.
  const raw = event as { pull_request?: { head?: { sha?: unknown } } } | null;
  const head = raw?.pull_request?.head?.sha;
  if (typeof head !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head)) throw new Error('PR event needs an exact head SHA.');
  if (commitRef(root, 'HEAD') !== head) throw new Error('Check out the actual PR head; synthetic merge checkout cannot validate delivery provenance.');
  const committed = parseBoard(JSON.parse(git(root, ['show', `${head}:.workboard/state.json`])) as unknown);
  if (JSON.stringify(committed) !== JSON.stringify(board)) throw new Error('PR board differs from its committed head.');
  const target = deliveryBase(root, board, currentBatch(board), head);
  guardPullRequest(board, event, target);
  if (!ancestor(root, target.sha, head)) throw new Error('PR head must incorporate the verified current target.');
  checkDeliveryPaths(root, board, currentBatch(board), head);
}
