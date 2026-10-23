import { describe, expect, it } from 'vitest';
import { createRunner } from './run';

// These tests start Node itself, which is always there; no git, gh, pnpm or network is touched.
const run = createRunner(process.cwd());

describe('createRunner', () => {
  it('returns the standard output', () => {
    expect(run(process.execPath, ['-e', 'process.stdout.write("hi")'])).toBe('hi');
  });

  it('passes the input to standard input', () => {
    const script =
      'process.stdin.on("data", (chunk) => process.stdout.write(String(chunk).toUpperCase()))';
    expect(run(process.execPath, ['-e', script], { input: 'abc' })).toBe('ABC');
  });

  it('throws with the exit code and the error output when the program fails', () => {
    const script = 'console.error("boom"); process.exit(3)';
    expect(() => run(process.execPath, ['-e', script])).toThrow(/exit code 3: boom/);
  });

  it('throws when the program cannot start', () => {
    expect(() => run('ririko-no-such-program', [])).toThrow(/could not start/);
  });
});
