/**
 * Builds the project status page that Vercel deploys (see vercel.json).
 *
 *   pnpm site:build        # writes site-dist/index.html
 *
 * The page is generated from docs/kanban/board.json and the docs/ tree, so every Vercel preview
 * shows the board as it stands on that branch. No dependencies: Vercel runs this file directly
 * with Node's TypeScript type stripping (keep to erasable syntax: no enums, no parameter
 * properties, type-only imports).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = 'RirikoAI/RirikoBot';
const DEFAULT_BRANCH = 'develop/2.0.0';

type Status = 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'PAUSED' | 'DONE' | 'ABANDONED';

interface Ticket {
  id: string;
  title: string;
  points: number;
  status: Status;
  epic?: string;
  parent?: string;
  description?: string;
}

export interface Board {
  epics: Ticket[];
  stories: Ticket[];
  tasks: Ticket[];
  chores: Ticket[];
  bugs: Ticket[];
}

export interface EpicProgress {
  id: string;
  title: string;
  status: Status;
  donePoints: number;
  totalPoints: number;
  backlogPoints: number;
}

export interface OpenTicket {
  id: string;
  title: string;
  points: number;
  status: Status;
  parent: string;
}

export interface StatusModel {
  donePoints: number;
  totalPoints: number;
  epics: EpicProgress[];
  active: OpenTicket[];
  todo: OpenTicket[];
  counts: { type: string; done: number; total: number }[];
}

export interface DocLink {
  path: string;
  title: string;
}

export interface BuildMeta {
  branch: string;
  sha: string;
  builtAt: string;
}

const ACTIVE: readonly Status[] = ['IN_PROGRESS', 'REVIEW', 'PAUSED'];

/** Epic progress counts story points; tasks only break stories down, so they would double count. */
export function buildStatusModel(board: Board): StatusModel {
  const epics = board.epics.map((epic): EpicProgress => {
    const stories = board.stories.filter((s) => s.epic === epic.id && s.status !== 'ABANDONED');
    const sum = (list: Ticket[]) => list.reduce((acc, s) => acc + s.points, 0);
    return {
      id: epic.id,
      title: epic.title,
      status: epic.status,
      donePoints: sum(stories.filter((s) => s.status === 'DONE')),
      totalPoints: sum(stories.filter((s) => s.status !== 'BACKLOG')),
      backlogPoints: sum(stories.filter((s) => s.status === 'BACKLOG')),
    };
  });

  const all = [...board.epics, ...board.stories, ...board.tasks, ...board.chores, ...board.bugs];
  const toOpen = (t: Ticket): OpenTicket => ({
    id: t.id,
    title: t.title,
    points: t.points,
    status: t.status,
    parent: t.epic ?? t.parent ?? '',
  });

  const typed: [string, Ticket[]][] = [
    ['Epics', board.epics],
    ['Stories', board.stories],
    ['Tasks', board.tasks],
    ['Chores', board.chores],
    ['Bugs', board.bugs],
  ];

  return {
    donePoints: epics.reduce((acc, e) => acc + e.donePoints, 0),
    totalPoints: epics.reduce((acc, e) => acc + e.totalPoints, 0),
    epics,
    active: all.filter((t) => ACTIVE.includes(t.status)).map(toOpen),
    todo: [...board.stories, ...board.chores, ...board.bugs]
      .filter((t) => t.status === 'TODO')
      .map(toOpen),
    counts: typed.map(([type, list]) => {
      const live = list.filter((t) => t.status !== 'ABANDONED');
      return { type, done: live.filter((t) => t.status === 'DONE').length, total: live.length };
    }),
  };
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function percent(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

const STATUS_LABEL: Record<Status, string> = {
  BACKLOG: 'Backlog',
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  REVIEW: 'In review',
  PAUSED: 'Paused',
  DONE: 'Done',
  ABANDONED: 'Abandoned',
};

function ticketTable(tickets: OpenTicket[], empty: string): string {
  if (tickets.length === 0) return `<p class="muted">${escapeHtml(empty)}</p>`;
  const rows = tickets
    .map(
      (t) => `<tr>
        <td class="mono">${escapeHtml(t.id)}</td>
        <td>${escapeHtml(t.title)}</td>
        <td class="num">${t.points}</td>
        <td class="mono">${escapeHtml(t.parent)}</td>
        <td><span class="pill pill-${t.status.toLowerCase()}">${STATUS_LABEL[t.status]}</span></td>
      </tr>`,
    )
    .join('');
  return `<div class="table-wrap"><table>
    <thead><tr><th>ID</th><th>Title</th><th class="num">Pts</th><th>Parent</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

export function renderStatusPage(model: StatusModel, docs: DocLink[], meta: BuildMeta): string {
  const branchUrl = encodeURIComponent(meta.branch);
  const blob = (path: string) => `https://github.com/${REPO}/blob/${meta.branch}/${path}`;
  const overall = percent(model.donePoints, model.totalPoints);

  const epicRows = model.epics
    .map((e) => {
      const pct = percent(e.donePoints, e.totalPoints);
      const backlog = e.backlogPoints > 0 ? ` · ${e.backlogPoints} pts backlog` : '';
      return `<li class="epic">
        <div class="epic-head">
          <span class="mono">${escapeHtml(e.id)}</span>
          <span class="epic-title">${escapeHtml(e.title)}</span>
          <span class="epic-pts">${e.donePoints}/${e.totalPoints} pts${backlog}</span>
        </div>
        <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${escapeHtml(e.id)} progress">
          <span style="width:${pct}%"></span>
        </div>
      </li>`;
    })
    .join('');

  const counts = model.counts
    .map(
      (c) =>
        `<div class="stat"><span class="stat-value">${c.done}<small>/${c.total}</small></span><span class="stat-label">${c.type} done</span></div>`,
    )
    .join('');

  const docItems = docs
    .map(
      (d) =>
        `<li><a href="${escapeHtml(blob(d.path))}">${escapeHtml(d.title)}</a> <span class="mono muted">${escapeHtml(d.path)}</span></li>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ririko AI 2.0 Status</title>
<meta name="description" content="Development status of Ririko AI 2.0.0, generated from the project Kanban board.">
<style>
  :root {
    --bg: #f7f7fb; --surface: #ffffff; --text: #1d1d27; --muted: #62627a; --border: #e2e2ec;
    --accent: #d6336c; --accent-soft: #fbe3ec; --track: #ececf3;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #121218; --surface: #1b1b24; --text: #ececf3; --muted: #9a9ab0; --border: #2c2c3a;
      --accent: #f06595; --accent-soft: #3a1d29; --track: #2c2c3a;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text);
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 960px; margin: 0 auto; padding: 32px 16px 64px; }
  header h1 { margin: 0; font-size: 28px; }
  header p { margin: 4px 0 0; color: var(--muted); }
  a { color: var(--accent); }
  section { background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
    padding: 20px; margin-top: 20px; }
  h2 { margin: 0 0 12px; font-size: 18px; }
  .mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 13px; }
  .muted { color: var(--muted); }
  .links { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .links a { text-decoration: none; border: 1px solid var(--border); border-radius: 999px;
    padding: 4px 12px; background: var(--surface); }
  .overall { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  .overall strong { font-size: 40px; line-height: 1; }
  .bar { height: 8px; background: var(--track); border-radius: 999px; overflow: hidden; margin-top: 6px; }
  .bar span { display: block; height: 100%; background: var(--accent); border-radius: 999px; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-top: 16px; }
  .stat { display: flex; flex-direction: column; }
  .stat-value { font-size: 22px; font-weight: 600; }
  .stat-value small { font-size: 14px; color: var(--muted); font-weight: 400; }
  .stat-label { color: var(--muted); font-size: 13px; }
  ul { list-style: none; margin: 0; padding: 0; }
  .epic { padding: 10px 0; border-top: 1px solid var(--border); }
  .epic:first-child { border-top: 0; padding-top: 0; }
  .epic-head { display: flex; gap: 8px; flex-wrap: wrap; align-items: baseline; }
  .epic-title { flex: 1 1 240px; }
  .epic-pts { color: var(--muted); font-size: 13px; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 6px; border-top: 1px solid var(--border); vertical-align: top; }
  th { color: var(--muted); font-weight: 500; font-size: 13px; border-top: 0; }
  .num { text-align: right; }
  .pill { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: var(--track); white-space: nowrap; }
  .pill-in_progress, .pill-review { background: var(--accent-soft); color: var(--accent); }
  .docs li { padding: 4px 0; }
  footer { margin-top: 24px; color: var(--muted); font-size: 13px; }
</style>
</head>
<body>
<main>
  <header>
    <h1>Ririko AI 2.0.0</h1>
    <p>Development status, generated from the Kanban board on
      <span class="mono">${escapeHtml(meta.branch)}</span> at
      <span class="mono">${escapeHtml(meta.sha)}</span>. The bot and dashboard are not hosted yet.</p>
    <nav class="links">
      <a href="https://github.com/${REPO}/tree/${escapeHtml(meta.branch)}">GitHub</a>
      <a href="https://app.circleci.com/pipelines/gh/${REPO}?branch=${branchUrl}">CircleCI</a>
      <a href="https://app.codecov.io/gh/${REPO}/tree/${branchUrl}">Codecov</a>
      <a href="${escapeHtml(blob('docs/kanban/BOARD.md'))}">Kanban board</a>
    </nav>
  </header>

  <section aria-labelledby="progress">
    <h2 id="progress">Progress</h2>
    <div class="overall"><strong>${overall}%</strong>
      <span class="muted">${model.donePoints} of ${model.totalPoints} story points done</span></div>
    <div class="bar"><span style="width:${overall}%"></span></div>
    <div class="stats">${counts}</div>
  </section>

  <section aria-labelledby="active">
    <h2 id="active">In progress and review</h2>
    ${ticketTable(model.active, 'Nothing in progress right now.')}
  </section>

  <section aria-labelledby="epics">
    <h2 id="epics">Epics</h2>
    <ul>${epicRows}</ul>
  </section>

  <section aria-labelledby="todo">
    <h2 id="todo">Groomed and ready</h2>
    ${ticketTable(model.todo, 'No groomed stories waiting.')}
  </section>

  <section aria-labelledby="docs">
    <h2 id="docs">Documentation</h2>
    <ul class="docs">${docItems}</ul>
  </section>

  <footer>Built ${escapeHtml(meta.builtAt)}.</footer>
</main>
</body>
</html>
`;
}

function listDocs(root: string): DocLink[] {
  const docs: DocLink[] = [];
  for (const dir of ['docs', 'docs/adr']) {
    for (const file of readdirSync(join(root, dir)).sort()) {
      if (!file.endsWith('.md')) continue;
      const path = `${dir}/${file}`;
      const heading = readFileSync(join(root, path), 'utf8').match(/^#\s+(.+)$/m)?.[1];
      docs.push({ path, title: heading?.trim() ?? file });
    }
  }
  return docs;
}

function git(root: string, args: string[]): string | undefined {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim() || undefined;
  } catch {
    return undefined;
  }
}

function main(): void {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const board = JSON.parse(readFileSync(join(root, 'docs/kanban/board.json'), 'utf8')) as Board;
  const meta: BuildMeta = {
    branch:
      process.env.VERCEL_GIT_COMMIT_REF ??
      git(root, ['rev-parse', '--abbrev-ref', 'HEAD']) ??
      DEFAULT_BRANCH,
    sha: (process.env.VERCEL_GIT_COMMIT_SHA ?? git(root, ['rev-parse', 'HEAD']) ?? 'local').slice(
      0,
      7,
    ),
    builtAt: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
  };

  const outDir = join(root, 'site-dist');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, 'index.html'),
    renderStatusPage(buildStatusModel(board), listDocs(root), meta),
  );
  console.log(`Wrote ${join(outDir, 'index.html')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
