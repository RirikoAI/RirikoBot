import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { RirikoError, ValidationError } from '@ririko/core';
import {
  copyDatabase,
  createDatabaseClient,
  type CopyReport,
  type PostgresDatabaseClient,
} from '@ririko/database';
import type { Command } from 'commander';
import pc from 'picocolors';

/** The environment variable that holds the target URL. It is never read from argv. */
export const TARGET_URL_ENV = 'TARGET_DATABASE_URL';

export interface DbCopyOptions {
  from?: string | undefined;
  dryRun?: boolean | undefined;
  yes?: boolean | undefined;
  batchSize?: number | undefined;
}

/** What the command needs from the outside, so tests can stub the engine and the connection. */
export interface DbCopyDeps {
  openTarget(url: string): Promise<PostgresDatabaseClient>;
  copy(
    sourcePath: string,
    target: PostgresDatabaseClient,
    options: { dryRun: boolean; batchSize?: number | undefined },
  ): Promise<CopyReport>;
}

export interface DbCopyResult {
  lines: string[];
  /** False on a refusal or a count mismatch; the command then exits non-zero. */
  ok: boolean;
}

/** The only parts of the target URL that are ever printed. */
export interface TargetSummary {
  host: string;
  port: string;
  database: string;
}

const NOT_A_URL = `${TARGET_URL_ENV} is not a valid PostgreSQL URL (expected postgres://user:password@host:port/database).`;

/** Host, port and database of a PostgreSQL URL. The user and the password are dropped. */
export function summariseTarget(url: string): TargetSummary {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError(NOT_A_URL);
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new ValidationError(NOT_A_URL);
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!parsed.hostname || !database) throw new ValidationError(NOT_A_URL);
  return { host: parsed.hostname, port: parsed.port || '5432', database };
}

/** Removes the URL and its password from a message, in case a driver error echoes them. */
function scrub(message: string, url: string): string {
  let result = message.split(url).join('<target>');
  try {
    const parsed = new URL(url);
    for (const secret of [parsed.password, decodeURIComponent(parsed.password)]) {
      if (secret) result = result.split(secret).join('***');
    }
  } catch {
    // Not parseable: summariseTarget has already refused it.
  }
  return result;
}

/** The per-table plan and result, the checks and the verdict, as lines to print. */
export function formatCopyReport(report: CopyReport, options: { dryRun: boolean }): DbCopyResult {
  const lines: string[] = [];
  const mismatched = report.tables.filter((table) => table.sourceRows !== table.targetRows);
  const width = Math.max(5, ...report.tables.map((table) => table.name.length));

  lines.push(pc.bold('─── Table plan and row counts ─────────────────────'));
  lines.push(`  ${'table'.padEnd(width)}  ${'source'.padStart(10)}  ${'target'.padStart(10)}`);
  for (const table of report.tables) {
    const same = table.sourceRows === table.targetRows;
    const mark = same ? pc.green('✔') : pc.red('✖');
    lines.push(
      `${mark} ${table.name.padEnd(width)}  ${String(table.sourceRows).padStart(10)}  ${String(
        table.targetRows,
      ).padStart(10)}`,
    );
  }
  const totalRows = report.tables.reduce((sum, table) => sum + table.sourceRows, 0);
  lines.push(`  ${report.tables.length} table(s), ${totalRows} row(s) in the source.`);

  if (report.coinTotals) {
    lines.push(
      `  ${pc.bold('Economy check')}: wallet ${report.coinTotals.wallet}, bank ${report.coinTotals.bank} (${
        report.coinsChecked ? pc.green('source and target match') : pc.yellow('not compared')
      })`,
    );
  }
  if (report.sequences.length > 0) {
    lines.push(
      `  ${pc.bold('Sequences')}: ${report.sequences
        .map((sequence) => `${sequence.table}.${sequence.column}=${sequence.value}`)
        .join(', ')}`,
    );
  }
  for (const warning of report.warnings) lines.push(`  ${pc.yellow('⚠')} ${warning}`);

  if (mismatched.length > 0) {
    lines.push(
      pc.red(
        `✖ Row counts differ in ${mismatched.length} table(s): ${mismatched
          .map((table) => table.name)
          .join(', ')}.`,
      ),
    );
    return { lines, ok: false };
  }
  lines.push(
    options.dryRun || !report.committed
      ? `${pc.yellow('●')} Dry run complete: every check passed and the copy was rolled back. Nothing was committed.`
      : `${pc.green('✔')} Copy committed: every table has the same number of rows on both sides.`,
  );
  return { lines, ok: true };
}

const defaultDeps: DbCopyDeps = {
  openTarget: async (url) => {
    const client = await createDatabaseClient({ dialect: 'postgres', url });
    return client as PostgresDatabaseClient;
  },
  copy: (sourcePath, target, options) => copyDatabase(sourcePath, target, options),
};

/**
 * Executes `ririko db:copy`: checks the arguments, opens the target named by
 * `TARGET_DATABASE_URL`, runs the engine and returns lines to print. Bad arguments throw a
 * `ValidationError` before any connection is made; a refusal or a count mismatch gives `ok: false`.
 */
export async function runDbCopy(
  options: DbCopyOptions,
  env: Record<string, string | undefined> = process.env,
  deps: DbCopyDeps = defaultDeps,
): Promise<DbCopyResult> {
  if (!options.from) {
    throw new ValidationError('--from <sqlite path> is required.');
  }
  const url = env[TARGET_URL_ENV];
  if (!url) {
    throw new ValidationError(
      `${TARGET_URL_ENV} is not set. Export the target PostgreSQL URL in the environment; it is never accepted as an argument.`,
    );
  }
  const dryRun = options.dryRun === true;
  if (!dryRun && options.yes !== true) {
    throw new ValidationError(
      'A real copy needs --yes. Run with --dry-run first to see the plan without committing.',
    );
  }
  if (options.batchSize !== undefined && !(options.batchSize > 0)) {
    throw new ValidationError('--batch-size must be a positive number.');
  }
  const target = summariseTarget(url);
  const sourcePath = resolve(process.cwd(), options.from);
  if (!existsSync(sourcePath)) {
    throw new ValidationError(`Source database file not found at: ${sourcePath}`);
  }

  const lines = [
    `  ${pc.bold('Source')}: ${pc.gray(sourcePath)} (SQLite, opened read-only)`,
    `  ${pc.bold('Target')}: ${pc.gray(`host ${target.host}, port ${target.port}, database ${target.database}`)}`,
    `  ${pc.bold('Mode')}:   ${dryRun ? pc.yellow(pc.bold('DRY RUN (rolled back)')) : pc.green(pc.bold('LIVE COPY'))}`,
    '',
  ];

  let client: PostgresDatabaseClient;
  try {
    client = await deps.openTarget(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    lines.push(pc.red(`✖ Cannot connect to the target: ${scrub(message, url)}`));
    return { lines, ok: false };
  }

  try {
    const report = await deps.copy(sourcePath, client, { dryRun, batchSize: options.batchSize });
    const formatted = formatCopyReport(report, { dryRun });
    return { lines: [...lines, ...formatted.lines], ok: formatted.ok };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    const reason = error instanceof RirikoError ? 'Refused' : 'Copy failed';
    lines.push(pc.red(`✖ ${reason}: ${scrub(error.message, url)}`));
    lines.push('  Nothing was committed to the target.');
    return { lines, ok: false };
  } finally {
    await client.close().catch(() => undefined);
  }
}

/** Registers `ririko db:copy` into the Commander program. */
export function registerDbCopyCommand(program: Command): void {
  program
    .command('db:copy')
    .description(
      `Copy a 2.0 SQLite database into an empty PostgreSQL database (target URL from ${TARGET_URL_ENV})`,
    )
    .option('--from <path>', 'Path to the 2.0 SQLite database file to copy')
    .option('--dry-run', 'Plan and check the whole copy, then roll back without committing', false)
    .option('--yes', 'Commit the copy; required for a real run')
    .option('-b, --batch-size <number>', 'Rows per INSERT statement', (value) =>
      Number.parseInt(value, 10),
    )
    .action(async (flags: DbCopyOptions) => {
      const result = await runDbCopy(flags);
      for (const line of result.lines) console.log(line);
      if (!result.ok) process.exitCode = 1;
    });
}
