#!/usr/bin/env node
// Serves a read-only web view of docs/kanban/board.json and its handover notes on localhost.
//
//   node scripts/kanban/board-server.mjs                 serve on http://127.0.0.1:4477
//   node scripts/kanban/board-server.mjs --open          also open the page in the default browser
//   node scripts/kanban/board-server.mjs --port=5000     use another port (or set PORT)
//   node scripts/kanban/board-server.mjs --root=<dir>    read docs/kanban/ from another project
//
// The page reloads by itself when board.json or a handover note changes.
// It never writes anything: board.json stays the only source of truth.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const root = path.resolve(opt('root') ?? path.join(here, '..', '..'));
const kanbanDir = path.join(root, 'docs', 'kanban');
const boardPath = path.join(kanbanDir, 'board.json');
const handoverDir = path.join(kanbanDir, 'handovers');
const pagePath = path.join(here, 'board-web', 'index.html');
const basePort = Number(opt('port') ?? process.env.PORT ?? 4477);
const NOT_NOTES = new Set(['_TEMPLATE.md', 'HANDOVERS.md']);

if (!fs.existsSync(boardPath)) {
  console.error(`No board found at ${boardPath}`);
  process.exit(1);
}

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

// Live reload: one Server-Sent Events stream per open page, pinged when docs/kanban/ changes.
const clients = new Set();
let timer;
function changed() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    for (const c of clients) c.write('event: change\ndata: {}\n\n');
  }, 200);
}
try {
  fs.watch(kanbanDir, { recursive: true }, changed);
} catch {
  // Recursive watch is missing on some platforms (older Linux Node). Poll the files that matter.
  fs.watchFile(boardPath, { interval: 1000 }, changed);
  fs.watch(handoverDir, changed);
}

const routes = {
  '/': (req, res) => send(res, 200, read(pagePath), 'text/html; charset=utf-8'),
  '/api/board': (req, res) => {
    const text = read(boardPath);
    try {
      JSON.parse(text);
    } catch (e) {
      return send(res, 500, JSON.stringify({ error: `board.json is not valid JSON: ${e.message}` }), 'application/json');
    }
    send(res, 200, text, 'application/json');
  },
  '/api/handovers': (req, res) => {
    const ids = fs.existsSync(handoverDir)
      ? fs.readdirSync(handoverDir).filter((f) => f.endsWith('.md') && !NOT_NOTES.has(f)).map((f) => f.slice(0, -3))
      : [];
    send(res, 200, JSON.stringify(ids), 'application/json');
  },
  '/api/meta': (req, res) => send(res, 200, JSON.stringify({ project: path.basename(root) }), 'application/json'),
  '/api/flags':(req, res) => send(res, 200, read(path.join(handoverDir, 'HANDOVERS.md')) ?? ''),
  '/api/events': (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
  },
};

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Read-only viewer: only GET is allowed.');
  const url = new URL(req.url, 'http://localhost');
  if (routes[url.pathname]) return routes[url.pathname](req, res);
  // Handover note by ticket ID. The strict ID pattern keeps requests inside handovers/.
  const id = url.pathname.match(/^\/api\/handovers\/([A-Za-z]+-\d+)$/)?.[1];
  const note = id && read(path.join(handoverDir, `${id}.md`));
  if (note !== null && note !== undefined) return send(res, 200, note, 'text/markdown; charset=utf-8');
  send(res, 404, 'Not found');
});

// One 'error' and one 'listening' handler for every attempt. Passing a callback to each listen() call
// would register one 'listening' listener per busy port, and all of them would fire on success.
let port = basePort;
let triesLeft = 10;
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && triesLeft-- > 0) return server.listen(++port, '127.0.0.1');
  console.error(e.message);
  process.exit(1);
});
server.on('listening', () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  const rel = path.relative(process.cwd(), boardPath);
  if (port !== basePort) console.log(`Ports ${basePort}-${port - 1} are in use (another board server may still be running).`);
  console.log(`Kanban board: ${url}  (reading ${rel.startsWith('..') ? boardPath : rel}; Ctrl+C to stop)`);
  if (args.includes('--open')) {
    const [cmd, cmdArgs] =
      process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  }
});
server.listen(port, '127.0.0.1');
