import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeLegacyLayout, findLegacyLayout, type LayoutFs } from './legacy-layout.js';

describe('findLegacyLayout', () => {
  let dir: string;
  let dataDir: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ririko-layout-'));
    dataDir = join(dir, 'data');
    env = { DATABASE_URL: join(dataDir, 'ririko.sqlite') };
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('passes a fresh 2.0 setup, even before the data directory exists', () => {
    expect(findLegacyLayout(env)).toEqual([]);
    mkdirSync(dataDir);
    writeFileSync(join(dataDir, 'ririko.sqlite'), '');
    expect(findLegacyLayout(env)).toEqual([]);
  });

  it('refuses when DATABASE_NAME is set', () => {
    expect(findLegacyLayout({ ...env, DATABASE_NAME: '/app/data/ririko.db' })).toEqual([
      'DATABASE_NAME is set (/app/data/ririko.db); 2.0 uses DATABASE_URL instead',
    ]);
  });

  it('refuses when a 1.4.0 ririko.db is in the data directory', () => {
    mkdirSync(dataDir);
    writeFileSync(join(dataDir, 'ririko.db'), '');
    expect(findLegacyLayout(env)).toEqual([`a 1.4.0 database is at ${join(dataDir, 'ririko.db')}`]);
  });

  it('refuses when the data directory, or its closest existing parent, is not writable', () => {
    const readOnly = (path: string): LayoutFs => ({
      exists: (p) => p === path || p === dir,
      isWritable: (p) => p !== path,
    });
    expect(findLegacyLayout(env, readOnly(dataDir))).toEqual([
      `the data directory ${dataDir} is not writable`,
    ]);
    // dataDir is missing, so the bot would create it inside dir.
    expect(findLegacyLayout(env, readOnly(dir))).toEqual([
      `the data directory ${dir} is not writable`,
    ]);
  });

  it('skips the file checks for Postgres and in-memory databases', () => {
    const noAccess: LayoutFs = { exists: () => true, isWritable: () => false };
    expect(
      findLegacyLayout(
        { DATABASE_DIALECT: 'postgres', DATABASE_URL: 'postgres://db/ririko' },
        noAccess,
      ),
    ).toEqual([]);
    expect(findLegacyLayout({ DATABASE_URL: ':memory:' }, noAccess)).toEqual([]);
    expect(
      findLegacyLayout({ DATABASE_DIALECT: 'postgres', DATABASE_NAME: 'ririko.db' }, noAccess),
    ).toHaveLength(1);
  });

  it('describes the reasons and the upgrade steps', () => {
    const lines = describeLegacyLayout(['DATABASE_NAME is set (x)']);
    expect(lines[0]).toContain('1.4.0 setup');
    expect(lines).toContain('  • DATABASE_NAME is set (x)');
    expect(lines.join('\n')).toContain('./data:/app/legacy:ro');
    expect(lines.join('\n')).toContain('chown 10001:10001');
  });
});
