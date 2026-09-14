import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Batch, Board } from './types.ts';

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

export function verifyGit(root: string, board: Board, batch = currentBatch(board)): Batch {
  const branch = git(root, ['branch', '--show-current']);
  if (protectedBranch(branch) || branch !== batch.branch) throw new Error(`Expected topic ${batch.branch}; found ${branch || 'detached HEAD'}. Stop and reconcile the handoff.`);
  if (git(root, ['remote', 'get-url', board.policy.remote]) !== board.policy.remoteUrl) throw new Error('Remote identity differs from the recorded repository.');
  if (git(root, ['remote', 'get-url', '--push', board.policy.remote]) !== board.policy.remoteUrl) throw new Error('Push URL differs from the recorded repository.');
  if (batch.baseBranch !== board.policy.baseBranch) throw new Error('Batch target differs from the standing verified base.');
  const result = git(root, ['merge-base', batch.baseSha, 'HEAD']);
  if (result !== batch.baseSha) throw new Error('Topic does not descend from its recorded base SHA.');
  git(root, ['rev-parse', '--verify', `refs/remotes/${board.policy.remote}/${batch.baseBranch}^{commit}`]);
  return batch;
}

function names(root: string, args: string[]): string[] { return git(root, [...args, '--name-only', '--no-renames', '-z', '--']).split('\0').filter(Boolean); }

export function guardCommit(root: string, board: Board): void {
  const batch = verifyGit(root, board, commitBatch(board));
  const stagedPaths = names(root, ['diff', '--cached']);
  if (batch.status === 'closed' && stagedPaths.some((path) => !path.startsWith('.workboard/'))) throw new Error('A closed batch permits only its administrative closing handoff/board commit. Declare new work separately.');
  checkPaths(board, stagedPaths, batch);
  // Validate the entire delivery, including earlier local commits, not just this index.
  checkPaths(board, names(root, ['diff', batch.baseSha]), batch);
  for (const path of ['.workboard/state.json', '.workboard/BOARD.md']) {
    const staged = git(root, ['show', `:${path}`]);
    if (staged.replaceAll('\r\n', '\n').trimEnd() !== readFileSync(resolve(root, path), 'utf8').replaceAll('\r\n', '\n').trimEnd()) throw new Error(`Stage the current ${path}; the index contains stale workflow state.`);
  }
}

export function guardMessage(board: Board, message: string): void {
  if (!message.split(/\r?\n/)[0]?.startsWith(`[${commitBatch(board).scope}] `)) throw new Error(`Commit subject must start with [${commitBatch(board).scope}] .`);
}

export interface PublishApproval { batch: string; head: string; base: string; branch: string; reference: string; at: string }

export function publicationPlan(root: string, board: Board): PublishApproval {
  const batch = verifyGit(root, board);
  if (batch.status !== 'checkpoint') throw new Error('Prepare the PR checkpoint before publication.');
  if (board.assignments.some((entry) => entry.status !== 'accepted')) throw new Error('Accept all worker returns before publication.');
  if (board.tickets.some((entry) => batch.tickets.includes(entry.id) && !['review', 'done', 'paused', 'abandoned'].includes(entry.status))) throw new Error('Every included ticket needs a reviewable result or an explicit user disposition.');
  if (git(root, ['status', '--porcelain']).length) throw new Error('Preserve and commit the scope first; publication requires a clean worktree.');
  checkPaths(board, names(root, ['diff', batch.baseSha, 'HEAD']));
  const base = git(root, ['rev-parse', `refs/remotes/${board.policy.remote}/${batch.baseBranch}`]);
  if (git(root, ['merge-base', base, 'HEAD']) !== base) throw new Error('Target advanced. Review and incorporate the fetched base before asking for publication approval.');
  if (base === git(root, ['rev-parse', 'HEAD'])) throw new Error('There is no delivery diff to publish.');
  return { batch: batch.id, branch: batch.branch, head: git(root, ['rev-parse', 'HEAD']), base, reference: '', at: '' };
}

export function guardPush(root: string, board: Board, approval: PublishApproval | null, remote: string, url: string, input: string): void {
  const plan = publicationPlan(root, board);
  if (remote !== board.policy.remote || url !== board.policy.remoteUrl) throw new Error('Push destination does not match the verified remote.');
  if (!approval || !approval.reference.trim() || ['batch', 'branch', 'head', 'base'].some((key) => approval[key as keyof PublishApproval] !== plan[key as keyof PublishApproval])) throw new Error('No matching user approval for this exact HEAD/base/batch. Ask the user at the PR checkpoint.');
  const updates = input.trim().split(/\r?\n/).filter(Boolean);
  if (updates.length !== 1) throw new Error('Push exactly one explicit topic ref; tags and multiple branches are not permitted.');
  const parts = updates[0]?.split(/\s+/) ?? [];
  const [localRef, localSha, remoteRef, remoteSha] = parts;
  if (parts.length !== 4 || localRef !== `refs/heads/${plan.branch}` || remoteRef !== localRef || localSha !== plan.head || !remoteSha || !/^[a-f0-9]{40,64}$/.test(remoteSha)) throw new Error('Only the approved, non-deletion topic HEAD may be pushed to the same named branch.');
  if (!/^0+$/.test(remoteSha) && git(root, ['merge-base', remoteSha, localSha]) !== remoteSha) throw new Error('Non-fast-forward push refused; preserve remote work.');
}

export function guardPullRequest(board: Board, event: unknown): string {
  const batch = currentBatch(board);
  if (batch.status !== 'checkpoint') throw new Error('A PR requires the recorded scope checkpoint.');
  const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid pull request event.');
    return value as Record<string, unknown>;
  };
  const pr = object(object(event)['pull_request']);
  const base = object(pr['base']);
  const head = object(pr['head']);
  if (base['ref'] !== batch.baseBranch || head['ref'] !== batch.branch || object(base['repo'])['full_name'] !== board.policy.repository || object(head['repo'])['full_name'] !== board.policy.repository) throw new Error('PR repository/head/base does not match the declared delivery.');
  const sha = head['sha'];
  if (typeof sha !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sha)) throw new Error('PR event needs an exact head SHA.');
  return sha;
}
