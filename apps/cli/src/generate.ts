import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { AppError } from '@ririko/core';

/** Generate a working command and its unit test without replacing existing files. */
export async function generateCommand(name: string, cwd: string): Promise<string[]> {
  if (!/^[a-z][a-z0-9-]{0,31}$/u.test(name)) throw new AppError('VALIDATION', 'Command names must be lowercase letters, digits, or hyphens.');
  const rootManifest: unknown = JSON.parse(await readFile(resolve(cwd, 'package.json'), 'utf8'));
  if (typeof rootManifest !== 'object' || rootManifest === null || !('name' in rootManifest) || rootManifest.name !== 'ririko') {
    throw new AppError('WORKSPACE', 'Run generate from the Ririko workspace root.');
  }
  const root = await realpath(cwd);
  let parent = root;
  for (const segment of ['packages', 'discord', 'src', 'commands']) {
    parent = resolve(parent, segment);
    try {
      const stats = await lstat(parent);
      if (stats.isSymbolicLink() || !stats.isDirectory()) throw new AppError('WORKSPACE', 'Generator ancestors must be real directories inside the workspace.');
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') await mkdir(parent);
      else throw error;
    }
    if (!(await realpath(parent)).startsWith(root + sep)) throw new AppError('WORKSPACE', 'Generator path escapes the workspace.');
  }
  const folder = resolve(parent, name);
  // Atomic directory creation refuses existing files, directories and symlinks.
  try { await mkdir(folder); } catch { throw new AppError('EXISTS', 'The command directory already exists or cannot be created.'); }
  const code = `import type { CommandDefinition } from '@ririko/discord';\n\n/** Generated command: register this definition in the bot registry. */\nexport const command: CommandDefinition = {\n  name: '${name}',\n  description: 'Show ${name} command status.',\n  category: 'general',\n  module: 'core',\n  examples: { slash: ['/${name}'], prefix: ['!${name}'] },\n  execute() { return Promise.resolve({ kind: 'text', content: '${name} is available.' }); },\n};\n`;
  const test = `import { expect, it } from 'vitest';\nimport { command } from './command.js';\n\nit('provides ${name} status through the shared command contract', async () => {\n  const result = await command.execute({ name: '${name}', args: {}, transport: 'slash', actor: { userId: '1', roles: [], permissions: [], botPermissions: [], isOwner: false }, settings: null, command });\n  expect(result).toEqual({ kind: 'text', content: '${name} is available.' });\n});\n`;
  const files = [resolve(folder, 'command.ts'), resolve(folder, 'command.test.ts'), resolve(folder, 'README.md')];
  await writeFile(files[0] ?? '', code, { flag: 'wx' });
  await writeFile(files[1] ?? '', test, { flag: 'wx' });
  await writeFile(files[2] ?? '', `# ${name}\n\nSlash: /${name}\nPrefix: !${name}\n\nRegister command in packages/discord/src/builtins.ts so the bot, CLI sync and help share it. Add any stateful behavior to a tested service. Sync commands explicitly after registration.\n`, { flag: 'wx' });
  return files;
}
