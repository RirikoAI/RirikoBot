import { accessSync, constants, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { databaseConfigFromEnv, resolveDatabasePath } from '@ririko/database';

/** The file name 1.4.0 used for its SQLite database (`DATABASE_NAME`). */
const LEGACY_DATABASE_FILE = 'ririko.db';

export interface LayoutFs {
  exists: (path: string) => boolean;
  isWritable: (path: string) => boolean;
}

const nodeFs: LayoutFs = {
  exists: existsSync,
  isWritable: (path) => {
    try {
      accessSync(path, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  },
};

/** The directory the SQLite database lives in; null for Postgres and in-memory databases. */
function sqliteDataDir(env: NodeJS.ProcessEnv): string | null {
  const config = databaseConfigFromEnv(env);
  if (config.dialect !== 'sqlite') return null;
  const path = resolveDatabasePath(config.url);
  if (path === ':memory:' || path.startsWith('file::memory:') || path.startsWith('sqlite:')) {
    return null;
  }
  return dirname(path);
}

/** The directory itself, or the closest parent that exists (the bot creates the rest). */
function closestExisting(dir: string, fs: LayoutFs): string {
  let current = dir;
  while (!fs.exists(current) && dirname(current) !== current) current = dirname(current);
  return current;
}

/**
 * Why this looks like a 1.4.0 setup that 2.0 must not start on, or an empty list. The checks
 * touch no file: `DATABASE_NAME` is set, a 1.4.0 `ririko.db` sits in the 2.0 data directory, or
 * that directory is not writable (the 1.4.0 compose mounted a root-owned `./data` there, and the
 * 2.0 image runs as uid 10001).
 */
export function findLegacyLayout(env: NodeJS.ProcessEnv = process.env, fs = nodeFs): string[] {
  const reasons: string[] = [];
  if (env.DATABASE_NAME) {
    reasons.push(`DATABASE_NAME is set (${env.DATABASE_NAME}); 2.0 uses DATABASE_URL instead`);
  }
  const dataDir = sqliteDataDir(env);
  if (dataDir !== null) {
    const legacyFile = join(dataDir, LEGACY_DATABASE_FILE);
    if (fs.exists(legacyFile)) reasons.push(`a 1.4.0 database is at ${legacyFile}`);
    const existing = closestExisting(dataDir, fs);
    if (!fs.isWritable(existing)) reasons.push(`the data directory ${existing} is not writable`);
  }
  return reasons;
}

/** The message printed before the bot exits on a 1.4.0 setup. */
export function describeLegacyLayout(reasons: string[]): string[] {
  return [
    '✖ This looks like a Ririko 1.4.0 setup. 2.0 stops here and leaves your 1.4.0 files untouched.',
    ...reasons.map((reason) => `  • ${reason}`),
    '  To upgrade (docs/upgrading-from-1.4.md):',
    '  1. Stop the bot and back up your ./data folder.',
    '  2. Mount the 1.4.0 folder read-only for the one-time migration: ./data:/app/legacy:ro',
    '  3. Give 2.0 its own data at /app/data: a new named volume, or a new folder owned by the',
    '     image user (chown 10001:10001 <folder>).',
    '  4. Remove DATABASE_NAME and DATABASE_TYPE from your environment.',
  ];
}
