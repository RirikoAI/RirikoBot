/**
 * The one way the release scripts start another program. Tests give the scripts their own
 * `Runner`, so no test runs git, gh, pnpm or touches the network.
 */
import { spawnSync } from 'node:child_process';

export interface RunOptions {
  /** Text written to the program's standard input. */
  input?: string;
  /** Show the program's output as it runs (build, tests) instead of capturing it. */
  stream?: boolean;
}

/** Runs `command` and returns its standard output. Throws when it exits with a non-zero code. */
export type Runner = (command: string, args: readonly string[], options?: RunOptions) => string;

/**
 * A runner that starts programs in `cwd` without a shell. The one exception is `pnpm` on Windows,
 * which is a .cmd file that Node refuses to start without one; its arguments here are plain words.
 */
export function createRunner(cwd: string): Runner {
  return (command, args, options = {}) => {
    const result = spawnSync(command, [...args], {
      cwd,
      encoding: 'utf8',
      shell: process.platform === 'win32' && command === 'pnpm',
      stdio: options.stream ? 'inherit' : ['pipe', 'pipe', 'pipe'],
      ...(options.input === undefined ? {} : { input: options.input }),
    });
    if (result.error) {
      throw new Error(`${command} could not start: ${result.error.message}`);
    }
    if (result.status !== 0) {
      const detail = String(result.stderr ?? '').trim();
      throw new Error(
        `${[command, ...args].join(' ')} failed with exit code ${result.status}${detail ? `: ${detail}` : ''}`,
      );
    }
    return String(result.stdout ?? '');
  };
}
