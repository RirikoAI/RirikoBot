#!/usr/bin/env node
// Builds a static, read-only copy of the Kanban board web view, for hosting on a static site (Vercel).
//
//   node scripts/kanban/build-board-site.mjs                  write board-dist/ from this repository
//   node scripts/kanban/build-board-site.mjs --root=<dir>     read docs/kanban/ from another project
//   node scripts/kanban/build-board-site.mjs --out=<dir>      write somewhere else
//
// The site has the same page as board-server.mjs (board-web/index.html) and static copies of what the
// server's routes return, under data/ (not api/: Vercel runs a top-level api/ folder as functions):
//
//   data/board.json        was /api/board
//   data/handovers.json    was /api/handovers (the list of note IDs)
//   data/notes/<ID>.md     was /api/handovers/<ID>
//   data/flags.md          was /api/flags (HANDOVERS.md)
//   data/meta.json         was /api/meta
//
// It only reads docs/kanban/ and writes the output folder. board.json stays the only source of truth.
// No dependencies; plain Node.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const root = path.resolve(opt('root') ?? path.join(here, '..', '..'));
const out = path.resolve(opt('out') ?? path.join(root, 'board-dist'));
const kanbanDir = path.join(root, 'docs', 'kanban');
const boardPath = path.join(kanbanDir, 'board.json');
const handoverDir = path.join(kanbanDir, 'handovers');
const pagePath = path.join(here, 'board-web', 'index.html');
// Same rules as board-server.mjs: these files in handovers/ are not notes, and a note ID has this shape.
const NOT_NOTES = new Set(['_TEMPLATE.md', 'HANDOVERS.md']);
const NOTE_FILE = /^([A-Za-z]+-\d+)\.md$/;

function fail(message) {
  console.error(`build-board-site: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(boardPath)) fail(`No board found at ${boardPath}`);
const boardText = fs.readFileSync(boardPath, 'utf8');
try {
  JSON.parse(boardText);
} catch (e) {
  fail(`board.json is not valid JSON: ${e.message}`);
}

const noteFiles = fs.existsSync(handoverDir)
  ? fs.readdirSync(handoverDir).filter((f) => !NOT_NOTES.has(f) && NOTE_FILE.test(f)).sort()
  : [];
const flagsPath = path.join(handoverDir, 'HANDOVERS.md');

// Build into a fresh folder so a removed note never lingers in the published site.
const rootInOut = path.relative(out, root);
if (!rootInOut.startsWith('..') && !path.isAbsolute(rootInOut)) fail('--out must not be the project folder or one of its parents');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'data', 'notes'), { recursive: true });

const write = (rel, text) => fs.writeFileSync(path.join(out, rel), text);
write(path.join('data', 'board.json'), boardText);
write(path.join('data', 'handovers.json'), JSON.stringify(noteFiles.map((f) => f.slice(0, -3))));
for (const f of noteFiles) write(path.join('data', 'notes', f), fs.readFileSync(path.join(handoverDir, f), 'utf8'));
write(path.join('data', 'flags.md'), fs.existsSync(flagsPath) ? fs.readFileSync(flagsPath, 'utf8') : '');

// The repository folder name on a build host is not the project name, so Vercel's repository slug wins.
const project = process.env.VERCEL_GIT_REPO_SLUG || path.basename(root);
write(path.join('data', 'meta.json'), JSON.stringify({ project }));

// The page reads window.BOARD_STATIC when it is set (see get() and connect() in board-web/index.html).
const snapshot = {
  base: 'data/',
  ref: process.env.VERCEL_GIT_COMMIT_REF || '',
  sha: process.env.VERCEL_GIT_COMMIT_SHA || '',
};
// "<" is escaped so a branch name can never close the script element.
const inject = `<script>window.BOARD_STATIC = ${JSON.stringify(snapshot).replace(/</g, '\\u003c')};</script>\n`;
const page = fs.readFileSync(pagePath, 'utf8');
const marker = page.indexOf('<script>');
if (marker === -1) fail(`${pagePath} has no <script> element to put the snapshot settings before`);
write('index.html', page.slice(0, marker) + inject + page.slice(marker));

const rel = path.relative(process.cwd(), out);
console.log(`Kanban board site: ${rel.startsWith('..') ? out : rel} (${noteFiles.length} notes, project ${project})`);
