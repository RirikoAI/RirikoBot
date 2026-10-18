import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findWorkspaceRoot, resolveWorkspacePath } from './paths.js';

describe('workspace paths', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('walks up to the folder with pnpm-workspace.yaml', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-root-'));
    dirs.push(root);
    fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), '');
    const nested = path.join(root, 'apps', 'bot');
    fs.mkdirSync(nested, { recursive: true });

    expect(findWorkspaceRoot(nested)).toBe(root);
  });

  it('resolves relative paths from the real workspace root and passes absolute paths through', () => {
    const root = findWorkspaceRoot();
    expect(fs.existsSync(path.join(root, 'pnpm-workspace.yaml'))).toBe(true);
    expect(resolveWorkspacePath('public/cards')).toBe(path.join(root, 'public/cards'));
    const absolute = path.resolve(os.tmpdir(), 'x.png');
    expect(resolveWorkspacePath(absolute)).toBe(absolute);
  });
});
