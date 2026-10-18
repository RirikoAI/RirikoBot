import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createNodeDeps,
  hostUserOption,
  inspectFolder,
  readOwnVersion,
  runProcess,
  writeFiles,
  type SpawnFn,
} from '../src/node-deps.js';

interface Spawned {
  command: string;
  args: string[];
  options: SpawnOptions;
}

/** A spawn that records the call and ends the fake child the way the test says. */
function fakeSpawn(end: (child: EventEmitter) => void): { spawn: SpawnFn; calls: Spawned[] } {
  const calls: Spawned[] = [];
  const spawn: SpawnFn = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    queueMicrotask(() => end(child));
    return child as unknown as ChildProcess;
  };
  return { spawn, calls };
}

describe('runProcess', () => {
  it('runs a real process and reports its exit code', async () => {
    const ok = await runProcess(
      { name: 'ok', command: process.execPath, args: ['-e', 'process.exit(0)'] },
      'quiet',
    );
    expect(ok.code).toBe(0);
    const failed = await runProcess(
      { name: 'fail', command: process.execPath, args: ['-e', 'process.exit(3)'] },
      'quiet',
    );
    expect(failed.code).toBe(3);
  });

  it('reports null for a tool that is not installed', async () => {
    const result = await runProcess(
      { name: 'x', command: 'ririko-no-such-tool-3f9a', args: [] },
      'quiet',
    );
    expect(result.code).toBeNull();
  });

  it('passes the folder and the extra environment to the child', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'ririko-starter-run-'));
    try {
      const script =
        "require('node:fs').writeFileSync('out.txt', process.cwd() + '|' + process.env.RIRIKO_VERSION)";
      const result = await runProcess(
        {
          name: 'env',
          command: process.execPath,
          args: ['-e', script],
          cwd: folder,
          env: { RIRIKO_VERSION: '2.0.0' },
        },
        'quiet',
      );
      expect(result.code).toBe(0);
      const [cwd, version] = readFileSync(join(folder, 'out.txt'), 'utf-8').split('|');
      expect(version).toBe('2.0.0');
      expect(statSync(cwd as string).isDirectory()).toBe(true);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('starts pnpm and corepack through the shell on Windows only', async () => {
    const windows = fakeSpawn((child) => child.emit('close', 0));
    const result = await runProcess(
      { name: 'install', command: 'pnpm', args: ['install'], cwd: 'C:/x' },
      'inherit',
      { platform: 'win32', spawnFn: windows.spawn, env: {} },
    );
    expect(result.code).toBe(0);
    expect(windows.calls).toHaveLength(1);
    expect(windows.calls[0]?.command).toBe('pnpm install');
    expect(windows.calls[0]?.args).toEqual([]);
    expect(windows.calls[0]?.options.shell).toBe(true);
    expect(windows.calls[0]?.options.stdio).toBe('inherit');
    expect(windows.calls[0]?.options.cwd).toBe('C:/x');
    expect(windows.calls[0]?.options.env?.['COREPACK_ENABLE_DOWNLOAD_PROMPT']).toBe('0');

    const linux = fakeSpawn((child) => child.emit('close', 0));
    await runProcess({ name: 'install', command: 'pnpm', args: ['install'] }, 'quiet', {
      platform: 'linux',
      spawnFn: linux.spawn,
      env: {},
    });
    expect(linux.calls[0]?.command).toBe('pnpm');
    expect(linux.calls[0]?.args).toEqual(['install']);
    expect(linux.calls[0]?.options.shell).toBeUndefined();
    expect(linux.calls[0]?.options.stdio).toBe('ignore');
    expect(linux.calls[0]?.options.cwd).toBeUndefined();

    const docker = fakeSpawn((child) => child.emit('close', 0));
    await runProcess({ name: 'docker', command: 'docker', args: ['--version'] }, 'quiet', {
      platform: 'win32',
      spawnFn: docker.spawn,
      env: {},
    });
    expect(docker.calls[0]?.command).toBe('docker');
    expect(docker.calls[0]?.options.shell).toBeUndefined();
    expect(docker.calls[0]?.options.env?.['COREPACK_ENABLE_DOWNLOAD_PROMPT']).toBeUndefined();
  });

  it('does not put an unsafe word on a shell line', async () => {
    const windows = fakeSpawn((child) => child.emit('close', 0));
    const result = await runProcess(
      { name: 'bad', command: 'pnpm', args: ['install & calc'] },
      'quiet',
      { platform: 'win32', spawnFn: windows.spawn, env: {} },
    );
    expect(result.code).toBeNull();
    expect(windows.calls).toEqual([]);
  });

  it('reports null when spawn throws or the child errors, and 1 for a signal', async () => {
    const throwing: SpawnFn = () => {
      throw new Error('EINVAL');
    };
    await expect(
      runProcess({ name: 'x', command: 'git', args: [] }, 'quiet', { spawnFn: throwing }),
    ).resolves.toEqual({ code: null });

    const erroring = fakeSpawn((child) => child.emit('error', new Error('ENOENT')));
    await expect(
      runProcess({ name: 'x', command: 'git', args: [] }, 'quiet', { spawnFn: erroring.spawn }),
    ).resolves.toEqual({ code: null });

    const signalled = fakeSpawn((child) => child.emit('close', null));
    await expect(
      runProcess({ name: 'x', command: 'git', args: [] }, 'quiet', { spawnFn: signalled.spawn }),
    ).resolves.toEqual({ code: 1 });
  });
});

describe('folder helpers', () => {
  let base: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'ririko-starter-fs-'));
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it('tells a missing, an empty, a full folder and a file apart', () => {
    expect(inspectFolder(join(base, 'nope'))).toBe('missing');
    expect(inspectFolder(base)).toBe('empty');
    writeFileSync(join(base, 'a.txt'), 'a');
    expect(inspectFolder(base)).toBe('not-empty');
    expect(inspectFolder(join(base, 'a.txt'))).toBe('not-a-folder');
  });

  it('writes files below the folder and creates the sub folders', () => {
    const folder = join(base, 'ririko');
    writeFiles(folder, [
      { path: 'docker-compose.production.yml', content: 'compose\n' },
      { path: 'docker/lavalink/application.yml', content: 'lavalink\n' },
    ]);
    expect(readFileSync(join(folder, 'docker-compose.production.yml'), 'utf-8')).toBe('compose\n');
    expect(readFileSync(join(folder, 'docker/lavalink/application.yml'), 'utf-8')).toBe(
      'lavalink\n',
    );
    mkdirSync(join(folder, 'more'));
    expect(inspectFolder(join(folder, 'more'))).toBe('empty');
  });
});

describe('readOwnVersion', () => {
  it('reads the version of the package next to the built files', () => {
    expect(readOwnVersion()).toBe('2.0.0');
  });

  it('falls back when the file has no version', () => {
    expect(readOwnVersion(() => '{}')).toBe('0.0.0');
  });
});

describe('hostUserOption', () => {
  it('gives uid:gid where Node has user ids', () => {
    expect(hostUserOption({ getuid: () => 1000, getgid: () => 1001 })).toBe('1000:1001');
  });

  it('gives null where it does not (Windows)', () => {
    expect(hostUserOption({})).toBeNull();
    expect(hostUserOption({ getuid: () => 1000 })).toBeNull();
  });
});

describe('createNodeDeps', () => {
  it('wires the real helpers', () => {
    const deps = createNodeDeps();
    expect(deps.version).toBe('2.0.0');
    expect(deps.nodeVersion).toBe(process.versions.node);
    expect(deps.cwd()).toBe(process.cwd());
    expect(deps.inspectFolder).toBe(inspectFolder);
    expect(deps.writeFiles).toBe(writeFiles);
    expect(deps.interactive).toBe(deps.tty);
    expect(deps.hostUser).toBe(hostUserOption());
    expect(typeof deps.run).toBe('function');
    expect(typeof deps.fetch).toBe('function');
  });
});
