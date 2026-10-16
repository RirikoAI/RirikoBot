import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exportInstallFiles, findSecretValues } from './export-install-files';

const dirs: string[] = [];
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'install-files-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('findSecretValues', () => {
  it('flags a secret setting that has a value', () => {
    expect(findSecretValues('DISCORD_TOKEN=abc\nPOSTGRES_PASSWORD=\n# GEMINI_API_KEY=x')).toEqual([
      'DISCORD_TOKEN',
    ]);
  });

  it('accepts empty secrets and plain settings', () => {
    expect(
      findSecretValues('DISCORD_TOKEN=\nNODE_ENV=production\nDASHBOARD_URL=https://x.y'),
    ).toEqual([]);
  });
});

describe('exportInstallFiles', () => {
  it('copies the repository files under their served names', () => {
    const out = temp();
    const written = exportInstallFiles(out);
    expect(written).toHaveLength(2);
    expect(readFileSync(join(out, 'docker-compose.yml'), 'utf8')).toBe(
      readFileSync('docker-compose.production.yml', 'utf8'),
    );
    expect(readFileSync(join(out, '.env.example'), 'utf8')).toBe(
      readFileSync('.env.production.example', 'utf8'),
    );
  });

  it('refuses an example that holds a secret value', () => {
    const root = temp();
    writeFileSync(join(root, '.env.production.example'), 'DISCORD_TOKEN=real\n');
    writeFileSync(join(root, 'docker-compose.production.yml'), 'name: x\n');
    expect(() => exportInstallFiles(temp(), root)).toThrow(/DISCORD_TOKEN/);
  });
});
