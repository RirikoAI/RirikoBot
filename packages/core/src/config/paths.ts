import { existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

/**
 * Finds the monorepo root by walking up from `from` (default: cwd) to the first directory with
 * pnpm-workspace.yaml or .git. Falls back to `from` when none is found.
 * Packages run from their own folder (e.g. `pnpm --filter @ririko/bot start` runs in apps/bot),
 * so repo-relative paths such as `data/` or `assets/` must be resolved against this root.
 */
export function findWorkspaceRoot(from: string = process.cwd()): string {
  let curr = resolve(from);
  while (curr !== dirname(curr)) {
    if (existsSync(resolve(curr, 'pnpm-workspace.yaml')) || existsSync(resolve(curr, '.git'))) {
      return curr;
    }
    curr = dirname(curr);
  }
  return resolve(from);
}

/** Resolves a repo-relative path against the workspace root. Absolute paths pass through. */
export function resolveWorkspacePath(relativePath: string): string {
  return isAbsolute(relativePath) ? relativePath : resolve(findWorkspaceRoot(), relativePath);
}
