/**
 * Runs the tests that import the given source files and checks the coverage of those files alone,
 * against the thresholds in vitest.config.ts (docs/testing.md section 4.1).
 *
 *   pnpm test:file-coverage apps/bot/src/commands/ticket.command.ts packages/core/src/index.ts
 *
 * `pnpm test:coverage` measures the whole project, so a new file with no tests can hide behind the
 * rest. This measures only the files you name, so a ticket can prove its own files are covered.
 * It exits 1 when a file is missing, is not source code that coverage counts, or the coverage of
 * the named files is below a threshold.
 */
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vitestConfig from '../vitest.config';
import { createRunner, type Runner } from './release/run';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export interface Thresholds {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

const METRICS = ['statements', 'branches', 'functions', 'lines'] as const;

/** The source files that coverage counts (the `coverage.include` globs of vitest.config.ts). */
const SOURCE_FILE = /^(packages|apps)\/[^/]+\/src\/.+\.(ts|tsx)$/;
const NOT_SOURCE = /(\.test\.(ts|tsx)|\.d\.ts)$/;

/** The coverage thresholds of a Vitest config. Throws when one is missing, so none is skipped. */
export function readThresholds(config: unknown): Thresholds {
  const coverage = (config as { test?: { coverage?: { thresholds?: Record<string, unknown> } } })
    .test?.coverage;
  const thresholds = coverage?.thresholds;
  const result: Partial<Thresholds> = {};
  for (const metric of METRICS) {
    const value = thresholds?.[metric];
    if (typeof value !== 'number') {
      throw new Error(`vitest.config.ts has no numeric test.coverage.thresholds.${metric}`);
    }
    result[metric] = value;
  }
  return result as Thresholds;
}

/**
 * The files as paths relative to the repository root with forward slashes. Throws, naming the
 * file, for one that does not exist or that coverage does not count (a test, a .d.ts file, or a
 * file outside `packages/*` and `apps/*` `src`).
 */
export function resolveTargets(root: string, args: readonly string[]): string[] {
  if (args.length === 0) {
    throw new Error('Name at least one source file, for example packages/core/src/index.ts');
  }
  return args.map((arg) => {
    const absolute = isAbsolute(arg) ? arg : resolve(root, arg);
    const path = relative(root, absolute).replaceAll('\\', '/');
    if (!existsSync(absolute)) throw new Error(`${arg} does not exist`);
    if (NOT_SOURCE.test(path) || !SOURCE_FILE.test(path)) {
      throw new Error(
        `${arg} is not a source file that coverage counts (packages/*/src or apps/*/src, not a test or .d.ts)`,
      );
    }
    return path;
  });
}

/** The vitest arguments: the tests that import the files, and the coverage of those files only. */
export function buildVitestArgs(files: readonly string[], thresholds: Thresholds): string[] {
  return [
    'exec',
    'vitest',
    'related',
    '--run',
    '--coverage',
    '--coverage.reporter=text',
    '--coverage.reportsDirectory=coverage/file-coverage',
    '--coverage.thresholds.autoUpdate=false',
    ...METRICS.map((metric) => `--coverage.thresholds.${metric}=${thresholds[metric]}`),
    ...files.map((file) => `--coverage.include=${file}`),
    ...files,
  ];
}

const USAGE = 'Usage: pnpm test:file-coverage <source file> [<source file> ...]';

export function main(
  argv: readonly string[],
  root: string = REPO_ROOT,
  run: Runner = createRunner(root),
  config: unknown = vitestConfig,
): number {
  try {
    if (argv.length === 0) {
      console.error(USAGE);
      return 1;
    }
    const files = resolveTargets(root, argv);
    const thresholds = readThresholds(config);
    console.log(
      `Coverage of ${files.length} file(s) against statements ${thresholds.statements}%, branches ${thresholds.branches}%, functions ${thresholds.functions}%, lines ${thresholds.lines}%:`,
    );
    run('pnpm', buildVitestArgs(files, thresholds), { stream: true });
    return 0;
  } catch (error) {
    console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
