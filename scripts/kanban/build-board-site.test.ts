import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('./build-board-site.mjs', import.meta.url));
const serverScript = fileURLToPath(new URL('./board-server.mjs', import.meta.url));

let work: string;
let root: string;
let out: string;

const board = { epics: [{ id: 'EPIC-001', title: 'Fixture epic', status: 'TODO' }], tasks: [] };

function build(extraEnv: Record<string, string> = {}) {
  return spawnSync(process.execPath, [script, `--root=${root}`, `--out=${out}`], {
    encoding: 'utf8',
    env: { ...process.env, VERCEL_GIT_REPO_SLUG: '', VERCEL_GIT_COMMIT_REF: '', VERCEL_GIT_COMMIT_SHA: '', ...extraEnv },
  });
}

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), 'board-site-'));
  root = join(work, 'project');
  out = join(work, 'dist');
  const handovers = join(root, 'docs', 'kanban', 'handovers');
  mkdirSync(handovers, { recursive: true });
  writeFileSync(join(root, 'docs', 'kanban', 'board.json'), JSON.stringify(board));
  writeFileSync(join(handovers, 'EPIC-001.md'), '# EPIC-001\n');
  writeFileSync(join(handovers, 'TASK-0101.md'), '# TASK-0101\n');
  writeFileSync(join(handovers, '_TEMPLATE.md'), '# template\n');
  writeFileSync(join(handovers, 'HANDOVERS.md'), '| TASK-0101 | TASK-0100 | open flag |\n');
  writeFileSync(join(handovers, 'notes.md'), 'not a note id\n');
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

describe('build-board-site.mjs', () => {
  it('writes the page and static copies of the server routes', () => {
    const result = build({ VERCEL_GIT_REPO_SLUG: 'fixture-repo', VERCEL_GIT_COMMIT_REF: 'feat/x', VERCEL_GIT_COMMIT_SHA: 'abcdef1234567' });
    expect(result.status).toBe(0);

    expect(JSON.parse(readFileSync(join(out, 'data', 'board.json'), 'utf8'))).toEqual(board);
    expect(JSON.parse(readFileSync(join(out, 'data', 'handovers.json'), 'utf8'))).toEqual(['EPIC-001', 'TASK-0101']);
    expect(readFileSync(join(out, 'data', 'notes', 'TASK-0101.md'), 'utf8')).toBe('# TASK-0101\n');
    expect(readFileSync(join(out, 'data', 'flags.md'), 'utf8')).toContain('| TASK-0101 | TASK-0100 | open flag |');
    expect(JSON.parse(readFileSync(join(out, 'data', 'meta.json'), 'utf8'))).toEqual({ project: 'fixture-repo' });

    const page = readFileSync(join(out, 'index.html'), 'utf8');
    expect(page).toContain('window.BOARD_STATIC = {"base":"data/","ref":"feat/x","sha":"abcdef1234567"};');
    // The settings must come before the page script that reads them.
    expect(page.indexOf('window.BOARD_STATIC =')).toBeLessThan(page.indexOf("'use strict'"));
  });

  it('does not serve the template, the flag index or non-note files as notes', () => {
    expect(build().status).toBe(0);
    const notes = readdirSync(join(out, 'data', 'notes')).sort();
    expect(notes).toEqual(['EPIC-001.md', 'TASK-0101.md']);
    const ids = JSON.parse(readFileSync(join(out, 'data', 'handovers.json'), 'utf8')) as string[];
    expect(ids).not.toContain('_TEMPLATE');
    expect(ids).not.toContain('HANDOVERS');
    expect(ids).not.toContain('notes');
  });

  it('starts from an empty folder so a removed note does not linger', () => {
    expect(build().status).toBe(0);
    writeFileSync(join(out, 'data', 'notes', 'STALE-1.md'), 'old');
    expect(build().status).toBe(0);
    expect(existsSync(join(out, 'data', 'notes', 'STALE-1.md'))).toBe(false);
  });

  it('escapes a branch name so it cannot close the script element', () => {
    expect(build({ VERCEL_GIT_COMMIT_REF: '</script><b>' }).status).toBe(0);
    const page = readFileSync(join(out, 'index.html'), 'utf8');
    expect(page).not.toContain('</script><b>');
    expect(page).toContain('\\u003c/script>');
  });

  it('fails when board.json is not valid JSON', () => {
    writeFileSync(join(root, 'docs', 'kanban', 'board.json'), '{ nope');
    try {
      const result = build();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('board.json is not valid JSON');
    } finally {
      writeFileSync(join(root, 'docs', 'kanban', 'board.json'), JSON.stringify(board));
    }
  });

  it('refuses to clear a folder that contains the project', () => {
    const result = spawnSync(process.execPath, [script, `--root=${root}`, `--out=${work}`], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--out must not be the project folder');
    expect(existsSync(join(root, 'docs', 'kanban', 'board.json'))).toBe(true);
  });
});

describe('board-server.mjs listen address', () => {
  it('has no address other than 127.0.0.1 in its source and defaults to it', () => {
    const source = readFileSync(serverScript, 'utf8');
    const addresses = source.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) ?? [];
    expect(addresses.every((a) => a === '127.0.0.1')).toBe(true);
    expect(source).toContain("opt('host') ?? process.env.HOST ?? '127.0.0.1'");
  });
});
