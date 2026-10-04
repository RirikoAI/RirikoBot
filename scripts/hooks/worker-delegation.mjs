#!/usr/bin/env node
// Claude Code PreToolUse hook: the coordinator delegates every ticket to a worker on the ticket's tier
// (protocol.md section 6.3.1).
// - Agent (or legacy Task) dispatch of "ticket-worker": the prompt must name a ticket on the board that is
//   groomed and startable, `model` must be the ticket's tier mapped to Claude (small→haiku,
//   medium→sonnet, large→opus), and worktree isolation is refused.
// - Edit/Write/NotebookEdit while a ticket is IN_PROGRESS: only the ticket-worker subagent may change
//   project files. The main session (the coordinator) may still edit docs/kanban/ (board and handovers),
//   paths matched by board.json "coordinator_paths", and files outside the repository. This stops a
//   large-tier coordinator from doing the worker's job.
//
// KANBAN_DELEGATE=off disables the hook, for example when the user explicitly approves inline work.

import fs from 'node:fs';
import path from 'node:path';

if (process.env.KANBAN_DELEGATE === 'off') process.exit(0);

let input = '';
for await (const chunk of process.stdin) input += chunk;
let event;
try {
  event = JSON.parse(input);
} catch {
  process.exit(0);
}

const root = path.resolve(process.env.CLAUDE_PROJECT_DIR ?? event.cwd ?? process.cwd());
let board, tickets;
try {
  board = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'kanban', 'board.json'), 'utf8'));
  tickets = ['epics', 'stories', 'tasks', 'chores', 'bugs'].flatMap((g) => board[g] ?? []);
} catch {
  process.exit(0); // No board, or a broken one: render-board.mjs reports that.
}

const CLAUDE_MODEL = { small: 'haiku', medium: 'sonnet', large: 'opus' };
const deny = (reason) => {
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }),
  );
  process.exit(0);
};

const tool = event.tool_name;
const ti = event.tool_input ?? {};
const active = tickets.filter((t) => t.status === 'IN_PROGRESS');

if (tool === 'Agent' || tool === 'Task') {
  if (ti.subagent_type !== 'ticket-worker') process.exit(0);
  const ids = new Set(tickets.map((t) => t.id));
  const id = (String(ti.prompt ?? '').match(/\b[A-Z]+-\d+\b/g) ?? []).find((m) => ids.has(m));
  if (!id) deny('Name the ticket in the ticket-worker prompt, for example "Ticket: TASK-001. Worker name: claude-small." (protocol 6.3.1).');
  const t = tickets.find((x) => x.id === id);
  const want = CLAUDE_MODEL[t.model];
  if (!want) deny(`${id} has no valid model tier, so it is not groomed. Groom it before dispatch (protocol 3.1).`);
  if (!['TODO', 'PAUSED', 'IN_PROGRESS'].includes(t.status)) deny(`${id} is ${t.status}. Only TODO or PAUSED tickets can be dispatched (protocol 1.3).`);
  const other = active.find((x) => x.id !== id);
  if (other) deny(`${other.id} is already IN_PROGRESS. Ask the user whether to PAUSE or ABANDON it first (protocol 5.2).`);
  if (ti.isolation === 'worktree') deny('Workers run in the main checkout. Dispatch ticket-worker without isolation: "worktree" (protocol 5.1).');
  if (!String(ti.model ?? '').toLowerCase().includes(want)) {
    deny(`${id} is tier "${t.model}". Dispatch ticket-worker with model: "${want}" (got ${ti.model ? `"${ti.model}"` : 'none'}; protocol 1.2, 6.3.1).`);
  }
  process.exit(0);
}

if (!['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool) || !active.length) process.exit(0);
// Subagent events carry agent_id. Older Claude Code versions send no agent_type; trust them as workers.
if (event.agent_id && (event.agent_type ?? 'ticket-worker') === 'ticket-worker') process.exit(0);
const file = ti.file_path ?? ti.notebook_path;
if (!file) process.exit(0);
const rel = path.relative(root, path.resolve(root, file)).replace(/\\/g, '/');
if (rel.startsWith('../') || path.isAbsolute(rel)) process.exit(0);

// Coordinator paths: docs/kanban/ plus the project's "coordinator_paths" globs. "**" spans directories,
// "*" and "?" stay inside one, and a pattern ending in "/" covers everything below that directory.
const SEGMENT = { '**/': '(?:.*/)?', '**': '.*', '*': '[^/]*', '?': '[^/]' };
const globRe = (g) =>
  new RegExp(
    '^' +
      g
        .replace(/\\/g, '/')
        .replace(/^\.?\//, '')
        .replace(/[.+^${}()|[\]]/g, '\\$&')
        .replace(/\*\*\/|\*\*|\*|\?/g, (m) => SEGMENT[m]) +
      (g.endsWith('/') ? '' : '$'),
    process.platform === 'win32' ? 'i' : '',
  );
const extra = Array.isArray(board.coordinator_paths) ? board.coordinator_paths : [];
const allowed = ['docs/kanban/', ...extra].filter((g) => typeof g === 'string' && g.trim());
if (allowed.some((g) => globRe(g).test(rel))) process.exit(0);

const t = active[0];
deny(
  `${t.id} is IN_PROGRESS (assignee ${t.assignee ?? 'none'}). Ticket work belongs to the ticket-worker subagent on the ticket's tier, ` +
    `not to ${event.agent_id ? `the ${event.agent_type} subagent` : 'the coordinator'}. ` +
    `Dispatch ticket-worker with model: "${CLAUDE_MODEL[t.model] ?? 'sonnet'}" and let it finish, or, if its worker died, recover the claim (protocol 5.3, 6.3.1). ` +
    'While a ticket is active the coordinator edits only docs/kanban/ and the "coordinator_paths" globs in board.json; ' +
    'add a path there only with the user\'s agreement. Inline work needs the user to set KANBAN_DELEGATE=off.',
);
