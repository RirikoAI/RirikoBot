import { RirikoError, ValidationError } from '@ririko/core';
import {
  createDatabaseClient,
  databaseConfigFromEnv,
  migrateDatabase,
  migrationStatus,
  type DatabaseClient,
  type MigrateResult,
  type MigrationStatus,
} from '@ririko/database';
import type { Command } from 'commander';
import pc from 'picocolors';
import { scrub, summariseTarget } from './db-copy.js';

export interface DbMigrateOptions {
  /** Print the migration state and change nothing. */
  status?: boolean | undefined;
  /** Print the plan (including what adopting an old database would change) and change nothing. */
  dryRun?: boolean | undefined;
}

/** What the command needs from the outside, so tests can stub the connection and the runner. */
export interface DbMigrateDeps {
  open(env: Record<string, string | undefined>): Promise<DatabaseClient>;
  migrate(
    db: DatabaseClient,
    options: {
      dryRun: boolean;
      log: { info(message: string): void; warn(message: string): void };
    },
  ): Promise<MigrateResult>;
  status(db: DatabaseClient): Promise<MigrationStatus>;
}

export interface DbMigrateResult {
  lines: string[];
  /** 0: done or nothing to do. 1: failure. 2: refused by the downgrade guard. */
  exitCode: 0 | 1 | 2;
}

const defaultDeps: DbMigrateDeps = {
  open: (env) => createDatabaseClient(databaseConfigFromEnv(env)),
  migrate: (db, options) => migrateDatabase(db, options),
  status: (db) => migrationStatus(db),
};

/** Where the command points, without credentials. */
function describeTarget(env: Record<string, string | undefined>): string {
  const config = databaseConfigFromEnv(env);
  if (config.dialect === 'postgres') {
    const { host, port, database } = summariseTarget(config.url);
    return `PostgreSQL, host ${host}, port ${port}, database ${database}`;
  }
  return `SQLite, ${config.url}`;
}

const list = (ids: readonly string[]): string => (ids.length > 0 ? ids.join(', ') : '(none)');

function statusLines(status: MigrationStatus): string[] {
  return [
    `  ${pc.bold('Latest')}:  ${status.latest ?? '(this release has no migrations)'}`,
    `  ${pc.bold('Pending')}: ${list(status.pending)}`,
    `  ${pc.bold('Unknown')}: ${list(status.unknown)}${
      status.unknown.length > 0 ? ' (recorded by a newer release)' : ''
    }`,
    `  ${pc.bold('Adopted')}: ${
      status.adopted ? 'yes (the database existed before migration records)' : 'no'
    }`,
  ];
}

function adoptionLines(result: MigrateResult, verb: string): string[] {
  const adoption = result.adoption;
  if (!adoption) return [];
  const count = (what: string, names: readonly string[]): string =>
    `    ${names.length} ${what}${names.length > 0 ? `: ${names.join(', ')}` : ''}`;
  return [
    `  ${pc.bold('Adoption')}: the database has tables but no migration records; ${verb} 0000_baseline as applied.`,
    count('table(s) created', adoption.createdTables),
    count('column(s) added', adoption.addedColumns),
    count('index(es) created', adoption.createdIndexes),
    ...adoption.notes.map((note) => `    ${pc.yellow('⚠')} ${note}`),
  ];
}

/**
 * Executes `ririko db:migrate` (ADR-015): applies the migrations this release ships to the
 * database named by `DATABASE_URL`, one transaction each. `--status` prints the state and
 * `--dry-run` the plan; neither changes anything. A refusal by the downgrade guard (the database
 * holds contract migrations this release does not know) gives exit code 2, any other failure
 * exit code 1.
 */
export async function runDbMigrate(
  options: DbMigrateOptions,
  env: Record<string, string | undefined> = process.env,
  deps: DbMigrateDeps = defaultDeps,
): Promise<DbMigrateResult> {
  if (options.status && options.dryRun) {
    throw new ValidationError('Use either --status or --dry-run, not both.');
  }
  const url = env.DATABASE_URL ?? '';
  const lines = [`  ${pc.bold('Target')}: ${pc.gray(describeTarget(env))}`];

  let db: DatabaseClient;
  try {
    db = await deps.open(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      lines: [...lines, pc.red(`✖ Cannot open the database: ${scrub(message, url)}`)],
      exitCode: 1,
    };
  }

  try {
    const status = await deps.status(db);
    if (options.status) {
      return { lines: [...lines, ...statusLines(status)], exitCode: 0 };
    }
    if (status.unknownContract.length > 0) {
      return {
        lines: [
          ...lines,
          pc.red(
            `✖ Refused: the database has contract migration(s) this release does not know (${status.unknownContract.join(', ')}).`,
          ),
          '  Run the newer release, or restore the pre-deploy dump. Nothing was changed.',
        ],
        exitCode: 2,
      };
    }

    const dryRun = options.dryRun === true;
    const logged: string[] = [];
    const result = await deps.migrate(db, {
      dryRun,
      log: {
        info: (message) => logged.push(`  ${message}`),
        warn: (message) => logged.push(`  ${pc.yellow('⚠')} ${message}`),
      },
    });

    const out = [...lines, ...logged];
    if (dryRun) {
      out.push(pc.yellow(pc.bold('DRY RUN: nothing was changed.')));
      out.push(...adoptionLines(result, 'would record'));
      out.push(
        result.applied.length > 0
          ? `  Would apply ${result.applied.length} migration(s): ${result.applied.join(', ')}`
          : '  No migrations to apply.',
      );
      return { lines: out, exitCode: 0 };
    }
    if (result.backupPath) out.push(`  ${pc.bold('Backup')}: ${result.backupPath}`);
    out.push(...adoptionLines(result, 'recorded'));
    out.push(
      result.applied.length > 0
        ? `${pc.green('✔')} Applied ${result.applied.length} migration(s): ${result.applied.join(', ')}`
        : `${pc.green('✔')} Nothing to do: the database is up to date (${status.latest ?? 'no migrations'}).`,
    );
    return { lines: out, exitCode: 0 };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    const details = error instanceof RirikoError ? (error.details as { problems?: unknown }) : null;
    const problems = Array.isArray(details?.problems) ? details.problems : [];
    return {
      lines: [
        ...lines,
        pc.red(`✖ Migration failed: ${scrub(error.message, url)}`),
        ...problems.map((problem) => `  - ${scrub(String(problem), url)}`),
      ],
      exitCode: 1,
    };
  } finally {
    await db.close().catch(() => undefined);
  }
}

/** Registers `ririko db:migrate` into the Commander program. */
export function registerDbMigrateCommand(program: Command): void {
  program
    .command('db:migrate')
    .description(
      'Apply the schema migrations this release ships to the database in DATABASE_URL (the bot does the same at startup)',
    )
    .option('--status', 'Print the latest, pending and unknown migrations and change nothing')
    .option('--dry-run', 'Print the plan and change nothing', false)
    .action(async (flags: DbMigrateOptions) => {
      const result = await runDbMigrate(flags);
      for (const line of result.lines) console.log(line);
      if (result.exitCode !== 0) process.exitCode = result.exitCode;
    });
}
