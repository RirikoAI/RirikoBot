import { resolveWorkspacePath } from '@ririko/core';
import {
  createDatabaseClient,
  databaseConfigFromEnv,
  migration,
  type DatabaseClient,
} from '@ririko/database';

/** How to run the manual upgrade inside the bot image (or from a checkout after `pnpm build`). */
export const MANUAL_UPGRADE_COMMAND = 'node apps/bot/dist/legacy-upgrade.js';

type Log = Pick<Console, 'log' | 'warn'>;

/**
 * Startup step: migrates the 1.4.0 database at `LEGACY_DATABASE_PATH` into `db` once. Silent
 * when the variable is unset or no file is there; throws (and the bot exits) when the coin
 * totals would not match.
 */
export async function runLegacyUpgrade(
  db: DatabaseClient,
  env: NodeJS.ProcessEnv = process.env,
  log: Log = console,
): Promise<migration.LegacyUpgradeResult | null> {
  if (!env.LEGACY_DATABASE_PATH) return null;
  const sourcePath = resolveWorkspacePath(env.LEGACY_DATABASE_PATH);
  const result = await migration.upgradeLegacyDatabase(db, { sourcePath });
  for (const line of describeUpgrade(result, sourcePath)) {
    if (result.status === 'target-not-empty') log.warn(line);
    else log.log(line);
  }
  return result;
}

/** Human-readable lines for a result; none when there was nothing to migrate. */
export function describeUpgrade(
  result: migration.LegacyUpgradeResult,
  sourcePath: string,
): string[] {
  switch (result.status) {
    case 'no-source':
      return [];
    case 'already-migrated':
      return [
        `• The 1.4.0 database at ${sourcePath} was already migrated on ${result.migratedAt.toISOString()} (batch ${result.batchId}).`,
      ];
    case 'target-not-empty':
      return [
        `⚠ Found a 1.4.0 database at ${sourcePath} but did not migrate it: ${result.reason}.`,
        `  To merge it anyway, stop the bot and run: ${MANUAL_UPGRADE_COMMAND} --force`,
      ];
    case 'dry-run':
    case 'migrated': {
      const { migration: run } = result;
      const counts = Object.entries(run.migratedCounts)
        .filter(([, n]) => n > 0)
        .map(([entity, n]) => `${entity} ${n}`)
        .join(', ');
      const verb = result.status === 'dry-run' ? 'Would migrate' : '✓ Migrated';
      return [
        `${verb} the 1.4.0 database at ${sourcePath}: ${run.inspected.totalUsers} users, ${run.inspected.totalGuilds} guilds, ${run.totalCoinsMigrated} coins (batch ${run.batchId}).`,
        `  ${counts || 'no rows'}`,
        ...run.inspected.anomalies.map((anomaly) => `  ⚠ ${anomaly}`),
        ...run.notices.map((notice) => `  ⚠ ${notice}`),
      ];
    }
  }
}

interface CliOptions {
  dryRun: boolean;
  force: boolean;
  source: string | undefined;
}

export function parseArgs(argv: string[]): CliOptions | string {
  const options: CliOptions = { dryRun: false, force: false, source: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--source' && argv[i + 1]) options.source = argv[++i];
    else return `Unknown argument: ${arg}`;
  }
  return options;
}

/**
 * `node apps/bot/dist/legacy-upgrade.js [--dry-run] [--force] [--source <path>]`: migrates (or
 * previews) the 1.4.0 database into the database named by DATABASE_URL. The source defaults to
 * LEGACY_DATABASE_PATH. Returns the exit code.
 */
export async function main(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  log: Pick<Console, 'log' | 'error'> = console,
): Promise<number> {
  const options = parseArgs(argv);
  if (typeof options === 'string') {
    log.error(`✖ ${options}`);
    log.error(`  Usage: ${MANUAL_UPGRADE_COMMAND} [--dry-run] [--force] [--source <path>]`);
    return 2;
  }
  const configured = options.source ?? env.LEGACY_DATABASE_PATH;
  if (!configured) {
    log.error('✖ No 1.4.0 database given: pass --source <path> or set LEGACY_DATABASE_PATH.');
    return 2;
  }
  const sourcePath = resolveWorkspacePath(configured);

  const db = await createDatabaseClient(databaseConfigFromEnv(env));
  try {
    const result = await migration.upgradeLegacyDatabase(db, {
      sourcePath,
      dryRun: options.dryRun,
      force: options.force,
    });
    if (result.status === 'no-source') {
      log.error(`✖ No 1.4.0 database at ${sourcePath}.`);
      return 1;
    }
    for (const line of describeUpgrade(result, sourcePath)) log.log(line);
    return result.status === 'target-not-empty' ? 1 : 0;
  } catch (error) {
    log.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    await db.close();
  }
}

const isDirectRun =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('legacy-upgrade.ts') || process.argv[1].endsWith('legacy-upgrade.js'));

if (isDirectRun) {
  void main().then((code) => {
    process.exitCode = code;
  });
}
