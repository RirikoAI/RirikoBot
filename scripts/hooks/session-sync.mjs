#!/usr/bin/env node
// Claude Code SessionStart hook. Brings the CodeGraph index up to date before the session starts,
// because the index only updates live while a CodeGraph daemon is running. Edits made while no
// session was open (git pull, branch switch, editor changes) would otherwise stay unindexed.
// Also prints the active ticket, blocked tickets, and one line per open handover flag so the
// coordinator sees them at startup.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const out = [];

if (fs.existsSync(path.join(root, '.codegraph', 'codegraph.db'))) {
  // shell: true so Windows resolves codegraph.cmd; one quoted string avoids Node's DEP0190 warning.
  const r = spawnSync(`codegraph sync -q "${root}"`, { shell: true, encoding: 'utf8', timeout: 90_000 });
  out.push(r.status === 0 ? 'CodeGraph index synced.' : `CodeGraph sync failed (exit ${r.status}). Run "codegraph sync" manually.`);
}

// Active and blocked tickets, so the coordinator can reconcile an orphaned claim (protocol 5.3).
const boardFile = path.join(root, 'docs', 'kanban', 'board.json');
if (fs.existsSync(boardFile)) {
  try {
    const board = JSON.parse(fs.readFileSync(boardFile, 'utf8'));
    const tickets = ['epics', 'stories', 'tasks', 'chores', 'bugs'].flatMap((g) => board[g] ?? []);
    for (const t of tickets.filter((t) => t.status === 'IN_PROGRESS')) {
      out.push(`In progress: ${t.id} by ${t.assignee ?? '(none)'} since ${t.claimed_at ?? '(unknown)'}. If this session did not claim it, ask the user whether that agent is still running (protocol 5.3).`);
    }
    const blocked = tickets.filter((t) => t.status === 'BLOCKED');
    if (blocked.length) out.push(`Blocked tickets (${blocked.length}):`, ...blocked.map((t) => `  ${t.id}: ${t.blocked_reason ?? '(no reason)'}`));
  } catch {
    out.push('docs/kanban/board.json is not valid JSON. Run: node scripts/kanban/render-board.mjs');
  }
}

const flags = path.join(root, 'docs', 'kanban', 'handovers', 'HANDOVERS.md');
if (fs.existsSync(flags)) {
  const rows = fs
    .readFileSync(flags, 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^\|\s*`?[A-Z]+-\d+/.test(l));
  if (rows.length) out.push(`Open handover flags (${rows.length}):`, ...rows);
}

if (out.length) process.stdout.write(out.join('\n') + '\n');
