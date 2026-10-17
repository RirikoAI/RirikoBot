import { ValidationError } from '@ririko/core';
import {
  AuditLogRepository,
  UserDataRepository,
  createDatabaseClient,
  databaseConfigFromEnv,
  userHash,
  withTransaction,
  type DatabaseClient,
  type UserDataOperation,
} from '@ririko/database';
import type { Command } from 'commander';
import pc from 'picocolors';
import { cliActor } from './passkeys-reset.js';

const SNOWFLAKE = /^\d{17,20}$/;

export interface UserEraseOptions {
  /** Apply the plan. Without it nothing changes and only the counts are reported. */
  confirm: boolean;
  /** Also remove the user from moderation records (cases, notes, warnings). */
  includeModeration: boolean;
  actor: string;
  now?: Date;
}

export interface UserEraseReport {
  /** Whether the plan was applied. */
  applied: boolean;
  /** First 16 hex digits of the SHA-256 of the user ID: the name of the user in tombstones and the audit entry. */
  hash: string;
  operations: UserDataOperation[];
}

/** The rows per `table.column` of the operations with the given action, zero counts left out. */
function counts(
  operations: readonly UserDataOperation[],
  action: UserDataOperation['action'],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const op of operations) {
    if (op.action === action && op.rows > 0) out[`${op.table}.${op.column}`] = op.rows;
  }
  return out;
}

/**
 * Removes or anonymises everything the database holds about one Discord user (TASK-1941). Without
 * `confirm` nothing changes and the report is the plan. With it, the plan is applied in one
 * transaction together with an audit entry that holds the counts and a hash of the user ID, never
 * the ID itself. Running it again finds nothing to change.
 */
export async function eraseUser(
  db: DatabaseClient,
  userId: string,
  options: UserEraseOptions,
): Promise<UserEraseReport> {
  if (!SNOWFLAKE.test(userId)) {
    throw new ValidationError(`"${userId}" is not a Discord user ID.`);
  }
  const hash = userHash(userId);
  const repo = new UserDataRepository(db);
  const flags = { includeModeration: options.includeModeration };
  if (!options.confirm) {
    return { applied: false, hash, operations: await repo.plan(userId, flags) };
  }
  const operations = await withTransaction(db, async (tx) => {
    const done = await repo.apply(tx, userId, flags, options.now);
    await new AuditLogRepository(db).create(
      {
        guildId: null,
        actorUserId: options.actor,
        action: 'user.erase',
        details: {
          source: 'cli',
          subject: hash,
          includeModeration: options.includeModeration,
          deleted: counts(done, 'delete'),
          tombstoned: counts(done, 'tombstone'),
          scrubbed: counts(done, 'scrub'),
          cancelledTrades: done.find((op) => op.action === 'cancel')?.rows ?? 0,
          kept: counts(done, 'keep'),
        },
        ipAddress: null,
        userAgent: null,
      },
      options.now ?? new Date(),
      tx,
    );
    return done;
  });
  return { applied: true, hash, operations };
}

const VERB: Record<UserDataOperation['action'], string> = {
  delete: 'delete',
  tombstone: 'anonymise',
  scrub: 'scrub',
  cancel: 'cancel',
  keep: 'keep',
};

const VERB_DONE: Record<UserDataOperation['action'], string> = {
  delete: 'deleted',
  tombstone: 'anonymised',
  scrub: 'scrubbed',
  cancel: 'cancelled',
  keep: 'kept',
};

const total = (operations: readonly UserDataOperation[], action: UserDataOperation['action']) =>
  operations.filter((op) => op.action === action).reduce((sum, op) => sum + op.rows, 0);

/** The lines the command prints for a report. */
export function formatReport(report: UserEraseReport, userId: string): string[] {
  const verb = report.applied ? VERB_DONE : VERB;
  const lines: string[] = [];
  const shown = report.operations.filter((op) => op.rows > 0);
  lines.push(
    report.applied
      ? `${pc.green('✔')} Erased the data of user ${userId} (hash ${report.hash}).`
      : `User ${userId} (hash ${report.hash}). Nothing has changed yet. This is what ${pc.bold('--yes')} would do:`,
  );
  for (const op of shown) {
    const hint = op.action === 'keep' && op.optIn ? pc.gray(`  (--include-moderation)`) : '';
    lines.push(`  ${op.table}.${op.column}`.padEnd(48) + `${verb[op.action]} ${op.rows}${hint}`);
  }
  const summary = (['delete', 'tombstone', 'scrub', 'cancel', 'keep'] as const)
    .map((action) => `${verb[action]}: ${total(report.operations, action)}`)
    .join(', ');
  lines.push(`Rows ${summary}.`);
  if (!report.applied) {
    lines.push(
      `Run again with ${pc.bold('--yes')} to apply it${
        report.operations.some((op) => op.action === 'keep' && op.optIn)
          ? `, and ${pc.bold('--include-moderation')} to remove the user from moderation records too`
          : ''
      }.`,
    );
  }
  return lines;
}

export function registerUserEraseCommand(program: Command): void {
  const user = program.command('user').description('Commands about one Discord user');
  user
    .command('erase')
    .description(
      'Delete or anonymise every row the database holds about a Discord user (answers an erasure request)',
    )
    .argument('<discord_user_id>', 'Discord user ID')
    .option('--yes', 'Apply the erasure; without it the command only reports what would change')
    .option(
      '--include-moderation',
      'Also remove the user from moderation cases, notes and warnings (kept by default)',
    )
    .action(async (userId: string, flags: { yes?: boolean; includeModeration?: boolean }) => {
      const db = await createDatabaseClient(databaseConfigFromEnv());
      try {
        const report = await eraseUser(db, userId, {
          confirm: flags.yes === true,
          includeModeration: flags.includeModeration === true,
          actor: cliActor(),
        });
        for (const line of formatReport(report, userId)) console.log(line);
      } finally {
        await db.close();
      }
    });
}
