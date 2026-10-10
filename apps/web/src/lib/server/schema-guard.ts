import 'server-only';
import { migrationStatus, type DatabaseClient } from '@ririko/database';

/** The command that brings a database to the bot's release by hand. */
const MIGRATE_COMMAND = 'ririko db:migrate';

/**
 * Raised while the dashboard's database cannot be used with this release: migrations are pending,
 * or a newer release changed the schema in a way this one cannot work with. `/ready` answers 503
 * and logs this message until it is fixed.
 */
export class SchemaNotReadyError extends Error {
  constructor(
    message: string,
    readonly pending: readonly string[] = [],
  ) {
    super(message);
    this.name = 'SchemaNotReadyError';
  }
}

/**
 * The dashboard never changes the schema (ADR-015): the bot, or `ririko db:migrate`, does. This
 * checks the migration records and throws a `SchemaNotReadyError` naming what is missing while the
 * database is behind this release. A database that was never migrated, or that has tables but no
 * records yet, counts as behind. The downgrade guard is the bot's: recorded contract migrations
 * this release does not know refuse, additive ones only warn.
 */
export async function assertSchemaCurrent(
  db: DatabaseClient,
  log: Pick<Console, 'warn'> = console,
): Promise<void> {
  const status = await migrationStatus(db);
  if (status.unknownContract.length > 0) {
    throw new SchemaNotReadyError(
      `The database has contract migration(s) this dashboard release does not know (${status.unknownContract.join(', ')}). ` +
        'Deploy the matching dashboard release, or restore the pre-deploy dump.',
    );
  }
  if (status.pending.length > 0) {
    throw new SchemaNotReadyError(
      `The database schema is behind this dashboard: ${status.pending.length} pending migration(s) (${status.pending.join(', ')}). ` +
        `The bot applies them when it starts; or run \`${MIGRATE_COMMAND}\` against this database.`,
      status.pending,
    );
  }
  if (status.unknown.length > 0) {
    log.warn(
      `[web] The database has ${status.unknown.length} migration(s) this dashboard release does not know (${status.unknown.join(', ')}); they are all additive, so it continues.`,
    );
  }
}
