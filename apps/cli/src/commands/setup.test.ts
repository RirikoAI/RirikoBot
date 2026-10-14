import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createProgram } from '../program.js';
import type { InstallerServer, InstallerServerOptions } from '../installer/server.js';
import {
  browserCommand,
  isLoopbackListen,
  openInBrowser,
  parseSetupPort,
  resolveSetupTarget,
  runSetup,
} from './setup.js';

const CWD = resolve('/work/folder');

function fakeServer(reason: 'finished' | 'idle' | 'closed' = 'finished'): InstallerServer {
  return {
    url: 'http://127.0.0.1:3999/start?token=abc',
    host: '127.0.0.1',
    port: 3999,
    envFile: join(CWD, '.env'),
    stopped: Promise.resolve(reason),
    close: async () => undefined,
  };
}

function harness(reason: 'finished' | 'idle' | 'closed' = 'finished') {
  const start = vi.fn(async (_options: InstallerServerOptions) => fakeServer(reason));
  const openBrowser = vi.fn();
  const log = vi.fn();
  const warn = vi.fn();
  return { start, openBrowser, log, warn, deps: { start, openBrowser, log, warn, cwd: () => CWD } };
}

describe('ririko setup registration', () => {
  it('registers the command with its options', () => {
    const cmd = createProgram().commands.find((c) => c.name() === 'setup');
    expect(cmd).toBeDefined();
    const flags = cmd?.options.map((o) => o.flags) ?? [];
    expect(flags).toEqual(
      expect.arrayContaining([
        '--docker',
        '--env-file <path>',
        '--port <n>',
        '--listen <host>',
        '--no-open',
      ]),
    );
  });

  it('parses the options', () => {
    const cmd = createProgram().commands.find((c) => c.name() === 'setup');
    cmd?.parseOptions([
      '--docker',
      '--env-file',
      'x/.env.production',
      '--port',
      '4000',
      '--no-open',
    ]);
    expect(cmd?.opts()).toMatchObject({
      docker: true,
      envFile: 'x/.env.production',
      port: '4000',
      open: false,
    });
  });
});

describe('resolveSetupTarget', () => {
  it('uses .env for source and .env.production for docker in the current folder', () => {
    expect(resolveSetupTarget({}, CWD)).toEqual({ profile: 'source', envFile: join(CWD, '.env') });
    expect(resolveSetupTarget({ docker: true }, CWD)).toEqual({
      profile: 'docker',
      envFile: join(CWD, '.env.production'),
    });
  });

  it('lets --env-file win, resolved against the current folder', () => {
    expect(resolveSetupTarget({ docker: true, envFile: '/setup/.env.production' }, CWD)).toEqual({
      profile: 'docker',
      envFile: resolve('/setup/.env.production'),
    });
    expect(resolveSetupTarget({ envFile: 'sub/.env' }, CWD).envFile).toBe(join(CWD, 'sub', '.env'));
  });
});

describe('parseSetupPort', () => {
  it('defaults to 3999 and validates the range', () => {
    expect(parseSetupPort(undefined)).toBe(3999);
    expect(parseSetupPort('4001')).toBe(4001);
    for (const bad of ['0', '65536', 'abc', '12.5', '-1', '']) {
      expect(() => parseSetupPort(bad)).toThrow(/Invalid --port/);
    }
  });
});

describe('browser opening', () => {
  it('builds an argument list per platform, never a shell string', () => {
    const url = 'http://127.0.0.1:3999/start?token=abc';
    expect(browserCommand('win32', url)).toEqual({
      command: 'cmd',
      args: ['/c', 'start', '', url],
    });
    expect(browserCommand('darwin', url)).toEqual({ command: 'open', args: [url] });
    expect(browserCommand('linux', url)).toEqual({ command: 'xdg-open', args: [url] });
  });

  it('does not throw when the opener cannot start', () => {
    expect(() => openInBrowser('http://127.0.0.1:1/', 'linux')).not.toThrow();
  });
});

describe('isLoopbackListen', () => {
  it('knows the loopback addresses', () => {
    for (const host of ['127.0.0.1', 'localhost', '::1', '[::1]', 'LOCALHOST']) {
      expect(isLoopbackListen(host)).toBe(true);
    }
    for (const host of ['0.0.0.0', '192.168.1.5', '::']) expect(isLoopbackListen(host)).toBe(false);
  });
});

describe('runSetup', () => {
  it('starts the server with the profile file, prints the URL and opens the browser', async () => {
    const h = harness();
    await runSetup({}, h.deps);
    expect(h.start).toHaveBeenCalledWith({
      profile: 'source',
      envFile: join(CWD, '.env'),
      host: '127.0.0.1',
      port: 3999,
    });
    expect(h.log.mock.calls.flat().join('\n')).toContain('http://127.0.0.1:3999/start?token=abc');
    expect(h.log.mock.calls.flat().join('\n')).toContain('Setup finished');
    expect(h.openBrowser).toHaveBeenCalledWith('http://127.0.0.1:3999/start?token=abc');
    expect(h.warn).not.toHaveBeenCalled();
  });

  it('passes docker, --env-file, --port and --listen through, and warns for 0.0.0.0', async () => {
    const h = harness();
    await runSetup(
      {
        docker: true,
        envFile: '/setup/.env.production',
        port: '4100',
        listen: '0.0.0.0',
        open: false,
      },
      h.deps,
    );
    expect(h.start).toHaveBeenCalledWith({
      profile: 'docker',
      envFile: resolve('/setup/.env.production'),
      host: '0.0.0.0',
      port: 4100,
    });
    expect(h.warn.mock.calls.flat().join('\n')).toContain('127.0.0.1 only');
    expect(h.openBrowser).not.toHaveBeenCalled();
  });

  it('prints only the address with --no-open and says when the wizard stopped early', async () => {
    const h = harness('idle');
    await runSetup({ open: false }, h.deps);
    expect(h.openBrowser).not.toHaveBeenCalled();
    expect(h.log.mock.calls.flat().join('\n')).toContain('Setup stopped (idle)');
  });

  it('does not start the server for a bad port', async () => {
    const h = harness();
    await expect(runSetup({ port: 'x' }, h.deps)).rejects.toThrow(/Invalid --port/);
    expect(h.start).not.toHaveBeenCalled();
  });
});
