import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCommand } from './model.ts';
import { renderBoard, ticketView } from './render.ts';
import { checkHandoffs, commonDirectory, initializeShared, mutate, readBoard, synchronize, withLock } from './store.ts';
import { git, guardCommit, guardMessage, guardPush, verifyPullRequest, publicationBase, publicationPlan, requirePublishedBase } from './git.ts';
import { readRequirements, renderRequirements } from './requirements.ts';
import type { PublishApproval } from './git.ts';

const help = `Ririko work board (Node 24; repository root)
  check                         Validate schema, workflow, handoffs, shared state and rendered board
  show [ID]                     Print full board or ticket with derived child/block relationships
  render                        Regenerate BOARD.md from the validated state
  apply COMMAND.json --expected REV [--actor coordinator]
                                Apply ONE transition, atomically; explicit optimistic revision
  install-hooks                 Install local Git guards and shared worktree state (refuses custom hooks)
  sync                          Recover shared state projection; preserves current JSON in Git-dir backup
  pr-plan [--batch ID]           Plan current story or its deferred parent's separate branch push
  requirements-check | requirements-render | requirements-show BP-ID
                                Check blueprint coverage/evidence, render ledger, or inspect a requirement
  approve-publish [--batch ID] --reference TEXT --head SHA --base SHA --target BRANCH
                                Only AFTER actual user consent; fetches target and binds the approval
  guard-commit | guard-message FILE | guard-push REMOTE URL | guard-pr [EVENT.json]
See docs/work-management.md and .workboard/PROTOCOL.md. CLI commands are local developer operations;
they have no Discord slash/prefix equivalents and cannot authenticate a user's conversational consent.`;

function readApproval(path: string): PublishApproval | null {
  if (!existsSync(path)) return null;
  const input: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid publication approval.');
  const record = input as Record<string, unknown>;
  for (const key of ['batch', 'head', 'base', 'branch', 'target', 'reference', 'at']) if (typeof record[key] !== 'string') throw new Error('Invalid publication approval.');
  return record as unknown as PublishApproval;
}

function main(): void {
  const [command = 'help', ...args] = process.argv.slice(2);
  if (command === 'help' || command === '--help') { process.stdout.write(`${help}\n`); return; }
  const root = git(process.cwd(), ['rev-parse', '--show-toplevel']);
  const flag = (name: string): string => {
    const index = args.indexOf(`--${name}`);
    const value = args[index + 1];
    if (index < 0 || !value || value.startsWith('--')) throw new Error(`Missing --${name}.`);
    return value;
  };
  const required = (index: number): string => { const value = args[index]; if (!value) throw new Error('Missing argument. Run board help.'); return value; };
  if (command === 'sync') { synchronize(root); process.stdout.write('Shared board restored; prior JSON preserved in Git common-dir recovery file.\n'); return; }
  const board = readBoard(root);
  switch (command) {
    case 'requirements-check': {
      const data = readRequirements(root, board);
      if (readFileSync(resolve(root, 'docs/requirements.md'), 'utf8').replaceAll('\r\n', '\n') !== renderRequirements(data)) throw new Error('Requirement ledger is stale; run board requirements-render.');
      process.stdout.write(`Requirements valid: ${data.requirements.length} blueprint sections; ${data.acceptance.length} exact final acceptance criteria. Evidence references checked; no live behavior inferred.\n`);
      break;
    }
    case 'requirements-render': writeFileSync(resolve(root, 'docs/requirements.md'), renderRequirements(readRequirements(root, board))); break;
    case 'requirements-show': {
      const data = readRequirements(root, board);
      const item = [...data.requirements, ...data.acceptance].find((entry) => entry.id === required(0));
      if (!item) throw new Error('Unknown requirement ID. Use BP-00..BP-90 or AC-01..AC-35.');
      process.stdout.write(`${JSON.stringify(item, null, 2)}\n`);
      break;
    }
    case 'check':
      checkHandoffs(root, board);
      if (readFileSync(resolve(root, '.workboard/BOARD.md'), 'utf8').replaceAll('\r\n', '\n') !== renderBoard(board)) throw new Error('Generated BOARD.md is stale; run board render.');
      process.stdout.write(`Board valid: revision ${board.revision}; ${board.tickets.length} tickets; WIP ${board.tickets.filter((entry) => ['in-progress', 'blocked', 'review'].includes(entry.status)).length}/1.\n`);
      break;
    case 'show': {
      const ticket = args[0] ? board.tickets.find((entry) => entry.id === args[0]) : undefined;
      if (args[0] && !ticket) throw new Error(`Unknown ticket ${args[0]}.`);
      process.stdout.write(`${JSON.stringify(ticket ? ticketView(board, ticket) : board, null, 2)}\n`);
      break;
    }
    case 'render': writeFileSync(resolve(root, '.workboard/BOARD.md'), renderBoard(board)); break;
    case 'apply': {
      const expected = Number(flag('expected'));
      if (!Number.isSafeInteger(expected) || expected < 1) throw new Error('Expected revision must be a positive integer.');
      const input = parseCommand(JSON.parse(readFileSync(resolve(required(0)), 'utf8')) as unknown);
      const actor = args.includes('--actor') ? flag('actor') : 'coordinator';
      const result = mutate(root, input, expected, { actor, now: new Date().toISOString() });
      process.stdout.write(`Applied ${input.action}; board revision ${result.revision}.\n`);
      break;
    }
    case 'install-hooks': {
      const existing = git(root, ['config', '--get', 'core.hooksPath'], true);
      if (existing && existing !== '.githooks') throw new Error(`Existing core.hooksPath=${existing}; integrate guards with its owner instead of overwriting it.`);
      for (const hook of ['pre-commit', 'commit-msg', 'pre-push']) if (!existsSync(resolve(root, '.githooks', hook))) throw new Error(`Missing repository hook ${hook}.`);
      initializeShared(root);
      git(root, ['config', '--local', 'core.hooksPath', '.githooks']);
      process.stdout.write('Repository hooks installed; all worktrees share one canonical board and exclusive mutation lock.\n');
      break;
    }
    case 'guard-commit': checkHandoffs(root, board); guardCommit(root, board); break;
    case 'guard-message': guardMessage(board, readFileSync(required(0), 'utf8')); break;
    case 'guard-push': guardPush(root, board, readApproval(resolve(commonDirectory(root), 'approval.json')), required(0), required(1), readFileSync(0, 'utf8')); break;
    case 'guard-pr': {
      const path = args[0] ?? process.env['GITHUB_EVENT_PATH'];
      if (!path) throw new Error('Missing pull request event path.');
      verifyPullRequest(root, board, JSON.parse(readFileSync(path, 'utf8')) as unknown);
      process.stdout.write('PR head, target, repository and delivery checkpoint match.\n');
      break;
    }
    case 'pr-plan': {
      const batchId = args.includes('--batch') ? flag('batch') : undefined;
      const plan = publicationPlan(root, board, batchId);
      const parentOnly = board.batches.find((entry) => entry.status !== 'closed')?.id !== plan.batch;
      process.stdout.write(`${JSON.stringify({ ...plan, repository: board.policy.repository, integrationTarget: board.policy.baseBranch, targetPublished: publicationBase(root, board, batchId).published, mode: parentOnly ? 'parent-branch-push-only' : 'story-pr', note: parentOnly ? 'Separate parent branch push only. Its frozen closed-batch PR checker is unresolved (RIR-005); keep its PR deferred. Approval for this ref does not authorize the child.' : 'Cached target only. An unpublished parent needs its own approved branch publication first. Fetch exact refs, rerun checks and ask the user before approval/push/PR.', pushArguments: ['push', board.policy.remote, `refs/heads/${plan.branch}:refs/heads/${plan.branch}`], ...(parentOnly ? {} : { prArguments: ['pr', 'create', '--repo', board.policy.repository, '--base', plan.target, '--head', plan.branch, '--body-file', `.workboard/reviews/${plan.batch}.md`] }) }, null, 2)}\n`);
      break;
    }
    case 'approve-publish': {
      const reference = flag('reference').trim();
      if (reference.length < 12) throw new Error('Record the actual user reply and conversation reference.');
      const head = flag('head'); const base = flag('base'); const target = flag('target');
      const batchId = args.includes('--batch') ? flag('batch') : undefined;
      publicationPlan(root, board, batchId);
      const integration = board.policy.baseBranch;
      git(root, ['fetch', '--no-tags', board.policy.remote, `refs/heads/${integration}:refs/remotes/${board.policy.remote}/${integration}`]);
      const resolved = publicationBase(root, board, batchId);
      if (resolved.branch !== integration) git(root, ['fetch', '--no-tags', board.policy.remote, `refs/heads/${resolved.branch}:refs/remotes/${board.policy.remote}/${resolved.branch}`]);
      withLock(root, () => {
        const fresh = readBoard(root);
        const plan = publicationPlan(root, fresh, batchId);
        requirePublishedBase(root, fresh, batchId);
        if (head !== plan.head || base !== plan.base || target !== plan.target) throw new Error('Approval references stale HEAD/base/target. Prepare an updated review and ask the user again.');
        writeFileSync(resolve(commonDirectory(root), 'approval.json'), `${JSON.stringify({ ...plan, reference, at: new Date().toISOString() }, null, 2)}\n`);
      });
      process.stdout.write('Recorded user approval for the exact HEAD/base/batch. No push or PR was performed.\n');
      break;
    }
    default: throw new Error(`Unknown board command: ${command}. Run board help.`);
  }
}

try { main(); } catch (error) { process.stderr.write(`Work board: ${error instanceof Error ? error.message : 'Unknown failure'}\n`); process.exitCode = 1; }
