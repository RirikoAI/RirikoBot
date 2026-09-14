import { afterEach, expect, it } from 'vitest';
import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { generateCommand } from './generate.js';

const temporaryParent = resolve(tmpdir());
const fixtures: string[] = [];

async function fixture(): Promise<{ workspace: string; outside: string }> {
  const directory = await mkdtemp(join(temporaryParent, 'ririko-generator-test-'));
  fixtures.push(directory);
  const workspace = join(directory, 'workspace');
  const outside = join(directory, 'outside');
  await mkdir(workspace);
  await mkdir(outside);
  await writeFile(join(workspace, 'package.json'), JSON.stringify({ name: 'ririko' }));
  return { workspace, outside };
}

afterEach(async () => {
  for (const directory of fixtures.splice(0)) {
    // Cleanup is restricted to exact temporary roots created by this test.
    if (dirname(resolve(directory)) !== temporaryParent || !basename(directory).startsWith('ririko-generator-test-')) {
      throw new Error('Refusing cleanup outside the test fixture roots.');
    }
    await rm(directory, { recursive: true, force: true });
  }
});

it('creates an unregistered command, regression test and both invocation examples inside the workspace', async () => {
  const { workspace, outside } = await fixture();
  const files = await generateCommand('server-status', workspace);
  expect(files).toHaveLength(3);
  for (const file of files) {
    expect(dirname(file)).toBe(join(workspace, 'packages', 'discord', 'src', 'commands', 'server-status'));
    await access(file);
  }
  const command = await readFile(join(dirname(files[0] ?? ''), 'command.ts'), 'utf8');
  const documentation = await readFile(join(dirname(files[0] ?? ''), 'README.md'), 'utf8');
  expect(command).toContain("name: 'server-status'");
  expect(documentation).toContain('/server-status');
  expect(documentation).toContain('!server-status');
  expect(await readdir(outside)).toEqual([]);
});

it('refuses an existing command directory without replacing its contents', async () => {
  const { workspace } = await fixture();
  const folder = join(workspace, 'packages', 'discord', 'src', 'commands', 'existing');
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, 'command.ts'), 'preserve this implementation');
  await expect(generateCommand('existing', workspace)).rejects.toMatchObject({ code: 'EXISTS' });
  expect(await readFile(join(folder, 'command.ts'), 'utf8')).toBe('preserve this implementation');
  expect(await readdir(folder)).toEqual(['command.ts']);
});

it.each(['../outside', 'a/b', 'UpperCase', ''])('rejects invalid or traversing name %j before creating directories', async (name) => {
  const { workspace, outside } = await fixture();
  await expect(generateCommand(name, workspace)).rejects.toMatchObject({ code: 'VALIDATION' });
  expect(await readdir(workspace)).toEqual(['package.json']);
  expect(await readdir(outside)).toEqual([]);
});

it.each(['packages', 'packages/discord', 'packages/discord/src', 'packages/discord/src/commands'])('rejects a junction/symlink at ancestor %s', async (ancestor) => {
  const { workspace, outside } = await fixture();
  const link = resolve(workspace, ancestor);
  await mkdir(dirname(link), { recursive: true });
  await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  await expect(generateCommand('escape', workspace)).rejects.toMatchObject({ code: 'WORKSPACE' });
  expect(await readdir(outside)).toEqual([]);
});

it('refuses a final command-directory junction without writing through it', async () => {
  const { workspace, outside } = await fixture();
  const link = join(workspace, 'packages', 'discord', 'src', 'commands', 'escape');
  await mkdir(dirname(link), { recursive: true });
  await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  await expect(generateCommand('escape', workspace)).rejects.toMatchObject({ code: 'EXISTS' });
  expect(await readdir(outside)).toEqual([]);
});
