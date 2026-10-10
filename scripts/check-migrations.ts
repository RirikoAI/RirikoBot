/**
 * CI gate for the versioned schema migrations (docs/adr/ADR-015, decisions 7 and 10).
 *
 *   pnpm db:check
 *
 * It fails (exit 1) and prints the file and the statement when:
 *
 * 1. schema: `drizzle-kit generate` for either dialect would write a new migration, which means
 *    a schema change has no migration. It runs on a temporary copy of the migrations folder, so
 *    the real folder is never written. Fix: `pnpm db:generate`, review the SQL, commit it.
 * 2. embedded: the TypeScript modules in `src/migrations/generated/` differ from the SQL files
 *    (they are rebuilt in memory and compared). Fix: `pnpm db:generate`.
 * 3. safety: a migration contains DROP TABLE, DROP COLUMN, RENAME, ALTER COLUMN ... TYPE or SET
 *    NOT NULL and does not start with `-- ririko:contract` on its first line. Those statements
 *    belong to the contract step of an expand/contract change (docs/database.md).
 *
 * Everything is offline: no database and no network.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// The embedder's own reader and renderer, so the check rebuilds exactly what it writes.
import {
  CONTRACT_MARKER,
  DIALECTS,
  isContract,
  readMigrations,
  renderMigrationsModule,
} from '../packages/database/scripts/migration-files.mjs';

export type CheckName = 'schema' | 'embedded' | 'safety';

export interface Problem {
  check: CheckName;
  /** Path of the file the problem is about, relative to the package directory. */
  file: string;
  message: string;
  /** The offending statement, when there is one. */
  statement?: string;
}

type DialectDir = 'sqlite' | 'pg';

/** Where each dialect's Drizzle schema lives, relative to the package directory. */
const SCHEMAS: Record<DialectDir, { dialect: string; schema: string }> = {
  sqlite: { dialect: 'sqlite', schema: 'src/schema/sqlite/index.ts' },
  pg: { dialect: 'postgresql', schema: 'src/schema/pg/index.ts' },
};

const REGENERATE = 'Run `pnpm db:generate`, review the SQL and commit the result.';

// --- Safety lint ------------------------------------------------------------------------------

/** What `maskSql` returns, both as long as the input. */
interface MaskedSql {
  /** Comments blanked; string literals and identifiers intact. */
  code: string;
  /** Comments blanked and the inside of literals and quoted identifiers replaced by `_`. */
  masked: string;
}

/**
 * Blanks SQL comments (`-- ...`, nested `/* ... *\/`) and the inside of string literals, quoted
 * identifiers (`"x"`, `` `x` ``) and PostgreSQL dollar-quoted strings, so keywords are only found
 * in code. Offsets are preserved.
 */
export function maskSql(sql: string): MaskedSql {
  let code = '';
  let masked = '';
  const keep = (text: string, mask = text) => {
    code += text;
    masked += mask;
  };
  const blank = (text: string) => text.replaceAll(/[^\n]/g, ' ');
  const hide = (text: string) => text.replaceAll(/[^\n]/g, '_');
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i]!;
    if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i);
      const text = end === -1 ? sql.slice(i) : sql.slice(i, end);
      keep(blank(text), blank(text));
      i += text.length;
    } else if (sql.startsWith('/*', i)) {
      let depth = 0;
      let j = i;
      while (j < sql.length) {
        if (sql.startsWith('/*', j)) {
          depth += 1;
          j += 2;
        } else if (sql.startsWith('*/', j)) {
          depth -= 1;
          j += 2;
          if (depth === 0) break;
        } else {
          j += 1;
        }
      }
      const text = sql.slice(i, j);
      keep(blank(text), blank(text));
      i = j;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === quote && sql[j + 1] === quote) j += 2;
        else if (sql[j] === quote) break;
        else j += 1;
      }
      const closed = j < sql.length;
      const text = sql.slice(i, closed ? j + 1 : j);
      keep(text, quote + hide(text.slice(1, closed ? -1 : undefined)) + (closed ? quote : ''));
      i += text.length;
    } else {
      const dollar = ch === '$' ? /^\$[A-Za-z_]*\$/.exec(sql.slice(i, i + 64)) : null;
      if (dollar) {
        const tag = dollar[0];
        const close = sql.indexOf(tag, i + tag.length);
        const end = close === -1 ? sql.length : close + tag.length;
        const text = sql.slice(i, end);
        const inner = text.slice(tag.length, close === -1 ? undefined : -tag.length);
        keep(text, tag + hide(inner) + (close === -1 ? '' : tag));
        i = end;
      } else {
        keep(ch);
        i += 1;
      }
    }
  }
  return { code, masked };
}

interface SafetyRule {
  name: string;
  pattern: RegExp;
}

/** The statements that may lose data or break the previous release (ADR-015 decision 7). */
const SAFETY_RULES: readonly SafetyRule[] = [
  { name: 'DROP TABLE', pattern: /\bDROP\s+TABLE\b/i },
  { name: 'DROP COLUMN', pattern: /\bDROP\s+COLUMN\b/i },
  { name: 'RENAME', pattern: /\bRENAME\b/i },
  { name: 'ALTER COLUMN ... TYPE', pattern: /\bALTER\s+COLUMN\s+\S+\s+(?:SET\s+DATA\s+)?TYPE\b/i },
  { name: 'SET NOT NULL', pattern: /\bSET\s+NOT\s+NULL\b/i },
];

/** Whitespace collapsed and cut to a line that fits a log. */
function oneLine(statement: string, max = 160): string {
  const text = statement.replaceAll(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * The unmarked destructive statements of one migration file. A file whose first line is
 * `-- ririko:contract` is a contract migration and is skipped.
 */
export function lintMigrationSafety(file: string, text: string): Problem[] {
  const normalized = text.replaceAll('\r\n', '\n');
  if (isContract(normalized)) return [];
  const { code, masked } = maskSql(normalized);
  const problems: Problem[] = [];
  let start = 0;
  // Statements end at ';'; the masked text has none inside comments, literals or identifiers.
  for (const piece of masked.split(';')) {
    const statement = code.slice(start, start + piece.length);
    start += piece.length + 1;
    for (const rule of SAFETY_RULES) {
      if (!rule.pattern.test(piece)) continue;
      problems.push({
        check: 'safety',
        file,
        message: `${rule.name} needs "${CONTRACT_MARKER}" on the first line of the file (contract migration)`,
        statement: oneLine(statement),
      });
    }
  }
  return problems;
}

function sqlFiles(directory: string): string[] {
  return existsSync(directory)
    ? readdirSync(directory)
        .filter((name) => name.endsWith('.sql'))
        .sort()
    : [];
}

/** Lints every migration of both dialects under `migrationsRoot`. */
export function checkSafety(migrationsRoot: string): Problem[] {
  return DIALECTS.flatMap(({ dir }) =>
    sqlFiles(join(migrationsRoot, dir)).flatMap((name) =>
      lintMigrationSafety(
        `migrations/${dir}/${name}`,
        readFileSync(join(migrationsRoot, dir, name), 'utf8'),
      ),
    ),
  );
}

// --- Embedded modules -------------------------------------------------------------------------

/**
 * Rebuilds the generated modules in memory and compares them with the files on disk.
 * `generatedRoot` is `src/migrations/generated`.
 */
export function checkEmbedded(migrationsRoot: string, generatedRoot: string): Problem[] {
  const problems: Problem[] = [];
  for (const { dir, exportName, label } of DIALECTS) {
    const file = `src/migrations/generated/${dir}.ts`;
    let expected: string;
    try {
      expected = renderMigrationsModule(label, exportName, readMigrations(dir, migrationsRoot));
    } catch (error) {
      problems.push({
        check: 'embedded',
        file: `migrations/${dir}`,
        message: `${error instanceof Error ? error.message : String(error)}. ${REGENERATE}`,
      });
      continue;
    }
    const path = join(generatedRoot, `${dir}.ts`);
    if (!existsSync(path)) {
      problems.push({ check: 'embedded', file, message: `${file} is missing. ${REGENERATE}` });
      continue;
    }
    if (readFileSync(path, 'utf8').replaceAll('\r\n', '\n') !== expected) {
      problems.push({
        check: 'embedded',
        file,
        message: `${file} differs from the SQL files in migrations/${dir}. ${REGENERATE}`,
      });
    }
  }
  return problems;
}

// --- Schema in sync ---------------------------------------------------------------------------

export interface GenerateRequest {
  /** drizzle-kit dialect name. */
  dialect: string;
  /** Absolute path of the Drizzle schema entry file. */
  schema: string;
  /** Working directory; `out` is relative to it. */
  cwd: string;
  /** Migrations folder, relative to `cwd`. */
  out: string;
}

export interface GenerateResult {
  /** Exit status; null when the process was killed (timeout). */
  status: number | null;
  /** stdout and stderr together. */
  output: string;
}

/** Runs `drizzle-kit generate` without a prompt, a database or the network. */
export type GenerateRunner = (request: GenerateRequest, packageDir: string) => GenerateResult;

const GENERATE_TIMEOUT_MS = 180_000;

/** drizzle-kit's own binary, with JSON-safe bigint defaults (as scripts/generate-migrations-sql.mjs). */
export const runDrizzleGenerate: GenerateRunner = (request, packageDir) => {
  const argv = [
    'node',
    'drizzle-kit',
    'generate',
    '--dialect',
    request.dialect,
    '--schema',
    request.schema,
    '--out',
    request.out,
  ];
  const script = `
    BigInt.prototype.toJSON = function () { return this.toString(); };
    process.argv = ${JSON.stringify(argv)};
    require(${JSON.stringify(join(packageDir, 'node_modules', 'drizzle-kit', 'bin.cjs'))});
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: request.cwd,
    encoding: 'utf8',
    // No stdin: a prompt (for example "is this a rename?") cannot be answered and ends the run.
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: GENERATE_TIMEOUT_MS,
    env: { ...process.env, CI: '1' },
  });
  const failure = result.error ? `\n${result.error.message}` : '';
  return { status: result.status, output: `${result.stdout}${result.stderr}${failure}` };
};

export interface SchemaCheckOptions {
  /** `packages/database`. */
  packageDir: string;
  /** Its `migrations` folder. */
  migrationsRoot: string;
  generate?: GenerateRunner;
}

/**
 * Runs drizzle-kit generate for each dialect against a temporary copy of the migrations folder
 * and reports every new `.sql` file it writes. The real folder is never touched.
 */
export function checkSchemaInSync(options: SchemaCheckOptions): Problem[] {
  const generate = options.generate ?? runDrizzleGenerate;
  const problems: Problem[] = [];
  for (const { dir } of DIALECTS) {
    const { dialect, schema } = SCHEMAS[dir as DialectDir];
    const scratch = mkdtempSync(join(tmpdir(), 'ririko-schema-check-'));
    try {
      const copy = join(scratch, dir);
      cpSync(join(options.migrationsRoot, dir), copy, { recursive: true });
      const before = new Set(sqlFiles(copy));
      const result = generate(
        {
          dialect,
          schema: join(options.packageDir, schema).replaceAll('\\', '/'),
          cwd: scratch,
          out: `./${dir}`,
        },
        options.packageDir,
      );
      const created = sqlFiles(copy).filter((name) => !before.has(name));
      if (result.status !== 0 && created.length === 0) {
        problems.push({
          check: 'schema',
          file: schema,
          message: `drizzle-kit generate (${dir}) ${
            result.status === null ? 'did not finish' : `failed with status ${result.status}`
          }; it may have asked a question (such as a rename) that only a person can answer. ${REGENERATE}`,
          statement: oneLine(result.output.trim().split('\n').slice(-6).join(' ')),
        });
        continue;
      }
      for (const name of created) {
        problems.push({
          check: 'schema',
          file: `migrations/${dir}/${name}`,
          message: `The ${dir} schema changed without a migration: drizzle-kit would write ${name}. ${REGENERATE}`,
          statement: oneLine(readFileSync(join(copy, name), 'utf8'), 240),
        });
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
  return problems;
}

// --- Entry point ------------------------------------------------------------------------------

const DEFAULT_PACKAGE_DIR = fileURLToPath(new URL('../packages/database/', import.meta.url));

export interface RunOptions {
  packageDir?: string;
  generate?: GenerateRunner;
  /** Skips the schema check (the slow one), for a quick local run. */
  skipSchema?: boolean;
}

/** All checks; the safety and embedded checks run even when the schema check fails. */
export function runChecks(options: RunOptions = {}): Problem[] {
  const packageDir = options.packageDir ?? DEFAULT_PACKAGE_DIR;
  const migrationsRoot = join(packageDir, 'migrations');
  return [
    ...(options.skipSchema
      ? []
      : checkSchemaInSync({
          packageDir,
          migrationsRoot,
          ...(options.generate ? { generate: options.generate } : {}),
        })),
    ...checkEmbedded(migrationsRoot, join(packageDir, 'src', 'migrations', 'generated')),
    ...checkSafety(migrationsRoot),
  ];
}

/** The lines `main` prints for one problem. */
export function formatProblem(problem: Problem, packageDir: string, cwd = process.cwd()): string {
  const file = relative(cwd, resolve(packageDir, problem.file)).replaceAll('\\', '/');
  return [
    `✖ [${problem.check}] ${file}: ${problem.message}`,
    ...(problem.statement ? [`    ${problem.statement}`] : []),
  ].join('\n');
}

export function main(argv: string[], options: RunOptions = {}): number {
  const packageDir = options.packageDir ?? DEFAULT_PACKAGE_DIR;
  let problems: Problem[];
  try {
    problems = runChecks({
      ...options,
      skipSchema: options.skipSchema ?? argv.includes('--no-schema'),
    });
  } catch (error) {
    console.error(
      `✖ db:check could not run: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
  if (problems.length === 0) {
    console.log('✔ db:check: schema, embedded modules and migration safety are in order.');
    return 0;
  }
  for (const problem of problems) console.error(formatProblem(problem, packageDir));
  console.error(`\n${problems.length} problem(s). See docs/database.md and docs/contributing.md.`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
