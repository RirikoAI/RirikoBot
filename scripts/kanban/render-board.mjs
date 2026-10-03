#!/usr/bin/env node
// Validates docs/kanban/board.json and regenerates docs/kanban/BOARD.md from it.
//
//   node scripts/kanban/render-board.mjs          validate, then write BOARD.md
//   node scripts/kanban/render-board.mjs --check  validate only, and fail if BOARD.md is out of date
//
// board.json is the only source of truth. BOARD.md is generated; never edit it by hand.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const boardPath = path.join(root, 'docs', 'kanban', 'board.json');
const mdPath = path.join(root, 'docs', 'kanban', 'BOARD.md');
const handoverDir = path.join(root, 'docs', 'kanban', 'handovers');
const checkOnly = process.argv.includes('--check');
// codegraph_queries are required only when the repository has a CodeGraph index.
const hasIndex = fs.existsSync(path.join(root, '.codegraph', 'codegraph.db'));

const FIB = [1, 2, 3, 5, 8, 13, 21];
const STATUSES = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'PAUSED', 'BLOCKED', 'REVIEW', 'DONE', 'ABANDONED'];
// Provider-neutral model tiers. protocol.md section 1.2 maps them to each provider's models.
const MODELS = ['small', 'medium', 'large'];
const LEGACY_MODELS = { haiku: 'small', sonnet: 'medium', opus: 'large' };
const GROUPS = { epics: 'epic', stories: 'story', tasks: 'task', chores: 'chore', bugs: 'bug' };

const board = JSON.parse(fs.readFileSync(boardPath, 'utf8'));
const errors = [];
const warnings = [];

const all = [];
for (const [group, type] of Object.entries(GROUPS)) {
  for (const t of board[group] ?? []) all.push({ ...t, type: t.type ?? type });
}
const byId = new Map();
for (const t of all) {
  if (byId.has(t.id)) errors.push(`${t.id}: ID appears more than once`);
  byId.set(t.id, t);
}

const workable = (t) => t.type !== 'epic';
const needsGrooming = (t) => workable(t) && ['TODO', 'IN_PROGRESS', 'PAUSED', 'BLOCKED', 'REVIEW'].includes(t.status);
const noteText = (id) => {
  const f = path.join(handoverDir, `${id}.md`);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
};
// Handover entry headers: "## <TYPE> · <ISO date> · <agent> · <STATUS>" (see _TEMPLATE.md).
const hasEntry = (id, type, status) => new RegExp(`^## ${type} · \\d{4}-.*· ${status}\\b`, 'm').test(noteText(id));
const STALE_CLAIM_HOURS = 24;

for (const t of all) {
  const at = `${t.id}`;
  if (!STATUSES.includes(t.status)) errors.push(`${at}: unknown status "${t.status}"`);
  if (t.status !== 'BACKLOG' && !FIB.includes(t.points)) errors.push(`${at}: points must be one of ${FIB.join(', ')} before leaving BACKLOG`);
  // A story already split into child tasks is tracked through them, so its size is fine.
  if (workable(t) && t.points >= 13 && t.status !== 'BACKLOG' && !t.children?.length) errors.push(`${at}: ${t.points} pts is too large; split it before TODO`);
  if (t.parent && !byId.has(t.parent)) errors.push(`${at}: parent ${t.parent} does not exist`);
  if (t.type === 'task' && !t.parent) errors.push(`${at}: task has no parent story`);
  for (const r of [...(t.requires ?? []), ...(t.blocks ?? []), ...(t.children ?? [])]) {
    if (!byId.has(r)) errors.push(`${at}: references unknown ticket ${r}`);
  }
  if (t.model && LEGACY_MODELS[t.model]) errors.push(`${at}: model "${t.model}" is a provider model name; use the tier "${LEGACY_MODELS[t.model]}" (or run the installer's upgrade)`);
  else if (t.model && !MODELS.includes(t.model)) errors.push(`${at}: model must be one of ${MODELS.join(', ')}`);

  if (needsGrooming(t)) {
    if (!t.model) errors.push(`${at}: no "model" set; grooming must pick the worker model`);
    if (!t.context?.files?.length && !t.context?.symbols?.length) errors.push(`${at}: context.files or context.symbols is empty; grooming must record where the work is`);
    if (hasIndex && !t.context?.codegraph_queries?.length) errors.push(`${at}: context.codegraph_queries is empty; grooming must record the queries that found the code`);
    if (!t.acceptance?.length) errors.push(`${at}: acceptance criteria are empty`);
    if (!t.verify_cmd) errors.push(`${at}: no verify_cmd; the worker cannot self-check`);
    if (!(t.handovers ?? []).includes(t.id)) errors.push(`${at}: handovers must include its own note "${t.id}"`);
    const note = path.join(handoverDir, `${t.id}.md`);
    if (!fs.existsSync(note)) errors.push(`${at}: handovers/${t.id}.md is missing; grooming must write it`);
    else if (!/^## GROOMING · \d{4}-/m.test(fs.readFileSync(note, 'utf8'))) errors.push(`${at}: handovers/${t.id}.md has no dated "## GROOMING ·" entry`);
  }
  for (const h of t.handovers ?? []) {
    if (!fs.existsSync(path.join(handoverDir, `${h}.md`))) errors.push(`${at}: handovers lists ${h}, but handovers/${h}.md does not exist`);
  }
  // Escalation (protocol 5): a BLOCKED ticket says why and what would unblock it.
  if (t.status === 'BLOCKED') {
    if (!t.blocked_reason) errors.push(`${at}: BLOCKED without a blocked_reason`);
    if (!hasEntry(t.id, 'PROGRESS', 'BLOCKED')) errors.push(`${at}: BLOCKED but handovers/${t.id}.md has no "## PROGRESS · … · BLOCKED" entry`);
  } else if (t.blocked_reason) warnings.push(`${at}: is ${t.status} but still has a blocked_reason; clear it`);
  // Ready for Review (protocol 3.2) and Definition of Done (protocol 3.3).
  if (t.status === 'REVIEW' && !hasEntry(t.id, 'PROGRESS', 'REVIEW')) errors.push(`${at}: REVIEW but handovers/${t.id}.md has no "## PROGRESS · … · REVIEW" entry`);
  if (t.status === 'DONE' && workable(t) && !hasEntry(t.id, 'REVIEW', 'DONE')) warnings.push(`${at}: DONE without a "## REVIEW · … · DONE" entry from the coordinator`);
  if (t.status !== 'IN_PROGRESS' && t.claimed_at) warnings.push(`${at}: is ${t.status} but still has claimed_at; clear it`);
  if (t.status === 'IN_PROGRESS' || t.status === 'REVIEW' || t.status === 'DONE') {
    for (const r of t.requires ?? []) {
      if (byId.get(r) && byId.get(r).status !== 'DONE') errors.push(`${at}: is ${t.status} but prerequisite ${r} is ${byId.get(r).status}`);
    }
  }
}

// Story estimate must equal the sum of its task estimates.
for (const s of all.filter((t) => t.type === 'story')) {
  const tasks = all.filter((t) => t.type === 'task' && t.parent === s.id && t.status !== 'ABANDONED');
  if (!tasks.length) continue;
  const sum = tasks.reduce((n, t) => n + (t.points ?? 0), 0);
  if (sum !== s.points) warnings.push(`${s.id}: story is ${s.points} pts but its tasks add up to ${sum}`);
}

// WIP: at most wip_limit tickets IN_PROGRESS on the whole board. Serial work in one checkout
// is what lets any AI provider run the workflow; see protocol.md section 5.1.
const wip = board.wip_limit ?? 1;
for (const k of ['wip_limit_per_worker', 'max_parallel_workers']) {
  if (k in board) warnings.push(`board.json: "${k}" is no longer used; replace it with "wip_limit": 1`);
}
const active = all.filter((t) => t.status === 'IN_PROGRESS');
for (const t of active) {
  if (!t.assignee) errors.push(`${t.id}: IN_PROGRESS without an assignee`);
  // Recovery (protocol 5.3): every claim is timestamped so an orphaned one can be spotted.
  const since = Date.parse(t.claimed_at ?? '');
  if (Number.isNaN(since)) errors.push(`${t.id}: IN_PROGRESS without a valid claimed_at (ISO 8601 UTC)`);
  else if (Date.now() - since > STALE_CLAIM_HOURS * 3600_000) warnings.push(`${t.id}: claimed by ${t.assignee ?? '(none)'} at ${t.claimed_at}, over ${STALE_CLAIM_HOURS}h ago; possible orphaned claim (protocol 5.3)`);
}
if (active.length > wip) errors.push(`WIP: ${active.length} tickets in progress (${active.map((t) => t.id).join(', ')}); wip_limit is ${wip}`);

// Open flags whose target is closed should have been removed (protocol 6.4).
const flagIndex = path.join(handoverDir, 'HANDOVERS.md');
if (fs.existsSync(flagIndex)) {
  for (const line of fs.readFileSync(flagIndex, 'utf8').split(/\r?\n/)) {
    const id = line.match(/^\|\s*`?([A-Z]+-\d+)/)?.[1];
    const st = id && byId.get(id)?.status;
    if (st === 'DONE' || st === 'ABANDONED') warnings.push(`HANDOVERS.md: open flag targets ${id}, which is ${st}; remove the line`);
  }
}
const blocked = all.filter((t) => t.status === 'BLOCKED');

// ---------- render ----------
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
const link = (id) => (fs.existsSync(path.join(handoverDir, `${id}.md`)) ? `[${id}.md](./handovers/${id}.md)` : '—');
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const table = (rows, cols) => {
  if (!rows.length) return '*None.*\n';
  const head = `| ${cols.map((c) => c[0]).join(' | ')} |\n|${cols.map(() => '---').join('|')}|\n`;
  return head + rows.map((t) => `| ${cols.map((c) => esc(c[1](t))).join(' | ')} |`).join('\n') + '\n';
};
const cols = {
  id: ['ID', (t) => `\`${t.id}\``],
  type: ['Type', (t) => cap(t.type)],
  title: ['Title', (t) => t.title],
  pts: ['Pts', (t) => t.points ?? '?'],
  parent: ['Parent', (t) => t.parent ?? '—'],
  requires: ['Requires', (t) => (t.requires ?? []).join(', ') || '—'],
  model: ['Model', (t) => t.model ?? '—'],
  assignee: ['Worker', (t) => t.assignee ?? '—'],
  since: ['Claimed', (t) => t.claimed_at ?? '—'],
  reason: ['Reason', (t) => t.blocked_reason ?? '—'],
  note: ['Handover', (t) => link(t.id)],
  ready: ['Ready', (t) => ((t.requires ?? []).every((r) => byId.get(r)?.status === 'DONE') ? 'yes' : 'blocked')],
};
const inStatus = (s, pred = workable) => all.filter((t) => t.status === s && pred(t));

let md = `# Live Scrum Kanban Board

<!-- GENERATED from board.json by scripts/kanban/render-board.mjs. Do not edit by hand. -->

> **WIP rule**: at most ${wip} ticket in \`IN_PROGRESS\` on the whole board. Any agent (Claude, Gemini, Codex, or another) may hold it.

## ⚡ In Progress
${table(active, [cols.id, cols.type, cols.title, cols.pts, cols.parent, cols.assignee, cols.since, cols.model, cols.note])}
## 🚧 Blocked
${table(blocked, [cols.id, cols.type, cols.title, cols.pts, cols.parent, cols.reason, cols.note])}
## ⏸️ Paused
${table(inStatus('PAUSED'), [cols.id, cols.type, cols.title, cols.pts, cols.parent, cols.note])}
## 🎯 To Do
${table(inStatus('TODO'), [cols.id, cols.type, cols.title, cols.pts, cols.parent, cols.requires, cols.ready, cols.model])}
## 🔍 Review
${table(inStatus('REVIEW'), [cols.id, cols.type, cols.title, cols.pts, cols.parent, cols.note])}
## ✅ Done
${table(inStatus('DONE'), [cols.id, cols.type, cols.title, cols.pts, cols.parent, cols.note])}
## ❌ Abandoned
${table(inStatus('ABANDONED'), [cols.id, cols.type, cols.title, cols.pts, cols.note])}
## 📋 Backlog
${table(inStatus('BACKLOG'), [cols.id, cols.type, cols.title, cols.pts, cols.parent])}
## 🗺️ Epics
${table(all.filter((t) => t.type === 'epic'), [cols.id, cols.title, ['Status', (t) => t.status], cols.pts, ['Children', (t) => (t.children ?? []).join(', ') || '—'], cols.note])}`;

for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
if (errors.length) {
  console.error(`\n${errors.length} error(s). BOARD.md not written.`);
  process.exit(1);
}

const current = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : '';
const summary = `${all.length} tickets, ${active.length} in progress${active.map((t) => ` (${t.id} by ${t.assignee ?? '(none)'} since ${t.claimed_at ?? '?'})`).join('')}, ${blocked.length} blocked`;
if (checkOnly) {
  if (current.replace(/\r\n/g, '\n') !== md) {
    console.error('BOARD.md is out of date. Run: node scripts/kanban/render-board.mjs');
    process.exit(1);
  }
  console.log(`board OK: ${summary}`);
} else {
  fs.writeFileSync(mdPath, md);
  console.log(`BOARD.md written: ${summary}`);
}
