import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildVitestArgs, main, readThresholds, resolveTargets } from './file-coverage';
import type { Runner } from './release/run';

const THRESHOLDS = { statements: 79, branches: 68, functions: 81, lines: 80 };
const CONFIG = { test: { coverage: { thresholds: THRESHOLDS } } };

let root: string;

function touch(path: string): void {
  const full = join(root, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, '');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'file-coverage-'));
  touch('packages/core/src/index.ts');
  touch('apps/web/src/app/page.tsx');
  touch('packages/core/src/index.test.ts');
  touch('packages/core/src/types.d.ts');
  touch('scripts/other.ts');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('readThresholds', () => {
  it('reads the four thresholds', () => {
    expect(readThresholds(CONFIG)).toEqual(THRESHOLDS);
  });

  it('throws, naming the metric, when one is missing', () => {
    const config = { test: { coverage: { thresholds: { statements: 1, branches: 1, lines: 1 } } } };
    expect(() => readThresholds(config)).toThrow(/thresholds\.functions/);
  });

  it('throws when the config has no coverage block', () => {
    expect(() => readThresholds({})).toThrow(/thresholds\.statements/);
  });
});

describe('resolveTargets', () => {
  it('turns relative and absolute paths into root-relative paths with forward slashes', () => {
    expect(
      resolveTargets(root, ['packages/core/src/index.ts', join(root, 'apps/web/src/app/page.tsx')]),
    ).toEqual(['packages/core/src/index.ts', 'apps/web/src/app/page.tsx']);
  });

  it('needs at least one file', () => {
    expect(() => resolveTargets(root, [])).toThrow(/at least one/);
  });

  it('refuses a file that does not exist', () => {
    expect(() => resolveTargets(root, ['packages/core/src/missing.ts'])).toThrow(/does not exist/);
  });

  it.each(['packages/core/src/index.test.ts', 'packages/core/src/types.d.ts', 'scripts/other.ts'])(
    'refuses %s, which coverage does not count',
    (path) => {
      expect(() => resolveTargets(root, [path])).toThrow(/not a source file/);
    },
  );
});

describe('buildVitestArgs', () => {
  it('limits coverage and the related tests to the named files, with the project thresholds', () => {
    const args = buildVitestArgs(['a/src/x.ts', 'b/src/y.ts'], THRESHOLDS);
    expect(args.slice(0, 4)).toEqual(['exec', 'vitest', 'related', '--run']);
    expect(args).toContain('--coverage');
    expect(args).toContain('--coverage.thresholds.statements=79');
    expect(args).toContain('--coverage.thresholds.branches=68');
    expect(args).toContain('--coverage.thresholds.functions=81');
    expect(args).toContain('--coverage.thresholds.lines=80');
    expect(args).toContain('--coverage.include=a/src/x.ts');
    expect(args).toContain('--coverage.include=b/src/y.ts');
    expect(args.slice(-2)).toEqual(['a/src/x.ts', 'b/src/y.ts']);
  });
});

describe('main', () => {
  it('runs vitest through pnpm and returns 0 when it passes', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const run = vi.fn<Runner>(() => '');
    expect(main(['packages/core/src/index.ts'], root, run, CONFIG)).toBe(0);
    expect(run).toHaveBeenCalledTimes(1);
    const call = run.mock.calls[0];
    expect(call?.[0]).toBe('pnpm');
    expect(call?.[1]).toContain('--coverage.include=packages/core/src/index.ts');
    expect(call?.[2]).toEqual({ stream: true });
  });

  it('returns 1 when vitest fails, for example below a threshold', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const run: Runner = () => {
      throw new Error('pnpm exec vitest failed with exit code 1');
    };
    expect(main(['packages/core/src/index.ts'], root, run, CONFIG)).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('exit code 1'));
  });

  it('returns 1 with the usage when no file is named', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const run = vi.fn<Runner>(() => '');
    expect(main([], root, run, CONFIG)).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Usage'));
    expect(run).not.toHaveBeenCalled();
  });

  it('returns 1 without running vitest for a file coverage does not count', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const run = vi.fn<Runner>(() => '');
    expect(main(['scripts/other.ts'], root, run, CONFIG)).toBe(1);
    expect(run).not.toHaveBeenCalled();
  });
});
