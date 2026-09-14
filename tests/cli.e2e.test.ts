import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';

const run = promisify(execFile);
const paths: string[] = [];
afterEach(async () => { await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

it('migrates a fresh database, persists CLI config across processes, and reports health', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'ririko-e2e-'));
  paths.push(directory);
  const database = resolve(directory, 'ririko.db');
  const env = { ...process.env, DATABASE_DIALECT: 'sqlite', DATABASE_URL: database, BOT_OWNER_IDS: '42', DISCORD_TOKEN: 'offline-test-token', DISCORD_APPLICATION_ID: '123', LOG_LEVEL: 'silent' };
  const cli = (args: string[]) => run(process.execPath, ['--conditions=development', '--import', 'tsx', 'apps/cli/src/index.ts', ...args], { cwd: resolve(import.meta.dirname, '..'), env, windowsHide: true });
  expect((await cli(['migrate:status'])).stdout).toContain('"current":0');
  await expect(readFile(database)).rejects.toThrow();
  expect((await cli(['migrate'])).stdout).toContain('applied');
  expect((await cli(['guild:config', '123', '--prefix', '?'])).stdout).toContain('"revision": 1');
  expect(JSON.parse((await cli(['guild:config', '123'])).stdout)).toMatchObject({ guildId: '123', prefix: '?', revision: 1 });
  expect((await cli(['health'])).stdout).toContain('Database ready');
  const doctor: unknown = JSON.parse((await cli(['doctor', '--json'])).stdout);
  expect(doctor).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Migrations', status: 'ok' })]));
  expect(JSON.parse((await cli(['command:list', '--json'])).stdout)).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'prefix', aliases: ['setprefix'] })]));
  await cli(['migrate']);
  expect(JSON.parse((await cli(['guild:config', '123'])).stdout)).toMatchObject({ prefix: '?', revision: 1 });
  await expect(cli(['module:disable', '123', 'core'])).rejects.toMatchObject({ code: 1 });
});
