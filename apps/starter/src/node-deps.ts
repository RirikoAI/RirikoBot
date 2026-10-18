import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import type { Command } from './plan.js';
import type { DownloadedFile, FolderState, RunResult, StarterDeps } from './run.js';

/** pnpm and corepack are .cmd files on Windows; Node starts those only through a shell. */
const SHELL_COMMANDS_ON_WINDOWS: readonly string[] = ['corepack', 'pnpm'];
/** The starter builds these command lines itself; anything else would be a bug, not input. */
const SHELL_SAFE_WORD = /^[A-Za-z0-9_.:=@/-]+$/;

export type SpawnFn = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

export interface RunOptions {
  platform?: NodeJS.Platform;
  spawnFn?: SpawnFn;
  env?: NodeJS.ProcessEnv;
}

/** Runs one child process and resolves with its exit code (null when it could not start). */
export function runProcess(
  command: Command,
  output: 'inherit' | 'quiet',
  options: RunOptions = {},
): Promise<RunResult> {
  const platform = options.platform ?? process.platform;
  const spawnFn = options.spawnFn ?? (spawn as SpawnFn);
  const env: NodeJS.ProcessEnv = { ...(options.env ?? process.env), ...command.env };
  const needsShell = platform === 'win32' && SHELL_COMMANDS_ON_WINDOWS.includes(command.command);
  if (SHELL_COMMANDS_ON_WINDOWS.includes(command.command)) {
    // corepack downloads the pnpm version the project names; do not stop to ask.
    env['COREPACK_ENABLE_DOWNLOAD_PROMPT'] = '0';
  }

  const spawnOptions: SpawnOptions = {
    stdio: output === 'inherit' ? 'inherit' : 'ignore',
    env,
    windowsHide: true,
    ...(command.cwd === undefined ? {} : { cwd: command.cwd }),
  };

  return new Promise<RunResult>((resolveResult) => {
    let child: ChildProcess;
    try {
      if (needsShell) {
        const words = [command.command, ...command.args];
        if (!words.every((word) => SHELL_SAFE_WORD.test(word))) {
          resolveResult({ code: null });
          return;
        }
        child = spawnFn(words.join(' '), [], { ...spawnOptions, shell: true });
      } else {
        child = spawnFn(command.command, command.args, spawnOptions);
      }
    } catch {
      resolveResult({ code: null });
      return;
    }
    child.once('error', () => resolveResult({ code: null }));
    child.once('close', (code) => resolveResult({ code: code ?? 1 }));
  });
}

/** Asks one question on the terminal. Resolves with an empty string when the input ends. */
export function askQuestion(question: string): Promise<string> {
  return new Promise<string>((resolveAnswer) => {
    const lines = createInterface({ input: process.stdin, output: process.stdout });
    lines.once('close', () => resolveAnswer(''));
    lines.question(question, (answer) => {
      resolveAnswer(answer);
      lines.close();
    });
  });
}

export function inspectFolder(path: string): FolderState {
  if (!existsSync(path)) return 'missing';
  if (!statSync(path).isDirectory()) return 'not-a-folder';
  return readdirSync(path).length === 0 ? 'empty' : 'not-empty';
}

export function writeFiles(folder: string, files: readonly DownloadedFile[]): void {
  for (const file of files) {
    const target = join(folder, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content, 'utf-8');
  }
}

/** The version in this package's package.json (one folder above the built files). */
export function readOwnVersion(
  read: (url: URL) => string = (url) => readFileSync(url, 'utf-8'),
): string {
  const parsed: unknown = JSON.parse(read(new URL('../package.json', import.meta.url)));
  const version = (parsed as { version?: unknown }).version;
  return typeof version === 'string' ? version : '0.0.0';
}

/** `uid:gid` of the current user, or null on Windows where Node has no `getuid`. */
export function hostUserOption(
  ids: { getuid?: () => number; getgid?: () => number } = process,
): string | null {
  if (typeof ids.getuid !== 'function' || typeof ids.getgid !== 'function') return null;
  return `${ids.getuid()}:${ids.getgid()}`;
}

export function createNodeDeps(): StarterDeps {
  const terminal = process.stdin.isTTY === true && process.stdout.isTTY === true;
  return {
    fetch: (url, init) => fetch(url, init),
    run: (command, output) => runProcess(command, output),
    ask: askQuestion,
    interactive: terminal,
    tty: terminal,
    hostUser: hostUserOption(),
    nodeVersion: process.versions.node,
    version: readOwnVersion(),
    cwd: () => process.cwd(),
    inspectFolder,
    writeFiles,
    fileExists: existsSync,
    log: (line) => console.log(line),
    error: (line) => console.error(line),
  };
}
