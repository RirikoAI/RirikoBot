import { DatabaseError } from '@ririko/core';
import { migrateDatabase, migrationStatus, type DatabaseClient } from '@ririko/database';

/** How to run the migrations by hand: inside the bot image, or from a checkout after `pnpm build`. */
export const MANUAL_MIGRATE_COMMAND = 'ririko db:migrate';

type Log = Pick<Console, 'log' | 'warn'>;

export interface DatabaseStartupOptions {
  /** `DB_AUTO_MIGRATE`: apply pending migrations (true), or only check and refuse (false). */
  autoMigrate: boolean;
  log?: Log | undefined;
}

/**
 * The database step of bot startup (ADR-015): brings the schema to this release, or, with
 * `DB_AUTO_MIGRATE=false`, checks that it already is.
 *
 * It runs before the 1.4.0 upgrade and before any service starts, and it throws (so the bot
 * exits) rather than let the bot run on an old schema or on a database that a newer release made
 * a contract change to. An old database without migration records is adopted once.
 */
export async function prepareDatabase(
  db: DatabaseClient,
  options: DatabaseStartupOptions,
): Promise<void> {
  const log = options.log ?? console;
  if (options.autoMigrate) {
    const result = await migrateDatabase(db, {
      log: {
        info: (message) => log.log(`• ${message}`),
        warn: (message) => log.warn(`⚠ ${message}`),
      },
    });
    if (result.applied.length === 0 && !result.adoption) {
      log.log('• The database schema is up to date.');
    }
    return;
  }

  const status = await migrationStatus(db);
  if (status.unknownContract.length > 0) {
    throw new DatabaseError(
      `The database has contract migration(s) this release does not know (${status.unknownContract.join(', ')}). ` +
        'Deploy the newer release, or restore the pre-deploy dump, before starting this release.',
      { details: { migrations: status.unknownContract } },
    );
  }
  if (status.pending.length > 0) {
    throw new DatabaseError(
      `DB_AUTO_MIGRATE is false and the database has ${status.pending.length} pending migration(s): ${status.pending.join(', ')}. ` +
        `Run \`${MANUAL_MIGRATE_COMMAND}\` (dry run: \`${MANUAL_MIGRATE_COMMAND} --dry-run\`), then start the bot again.`,
      { details: { migrations: status.pending } },
    );
  }
  if (status.unknown.length > 0) {
    log.warn(
      `⚠ The database has ${status.unknown.length} migration(s) this release does not know (${status.unknown.join(', ')}); they are all additive, so this release continues.`,
    );
  }
  log.log('• The database schema is up to date (DB_AUTO_MIGRATE is false).');
}
