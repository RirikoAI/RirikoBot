import { userInfo } from 'node:os';
import { ValidationError } from '@ririko/core';
import {
  AuditLogRepository,
  createDatabaseClient,
  withTransaction,
  WebPasskeyRepository,
  WebSessionRepository,
  type DatabaseClient,
} from '@ririko/database';
import type { Command } from 'commander';
import pc from 'picocolors';

const SNOWFLAKE = /^\d{17,20}$/;

export interface PasskeyResetResult {
  passkeysRemoved: number;
  sessionsEnded: number;
}

/**
 * Operator recovery for a user who lost every passkey (ADR-013 revision 2026-09-25): deletes
 * their passkeys and ends all their dashboard sessions, so the next sign-in needs Discord only.
 * Without `confirm` nothing changes and only the counts are reported.
 */
export async function resetPasskeys(
  db: DatabaseClient,
  userId: string,
  options: { confirm: boolean; actor: string; now?: Date },
): Promise<PasskeyResetResult> {
  if (!SNOWFLAKE.test(userId)) {
    throw new ValidationError(`"${userId}" is not a Discord user ID.`);
  }
  const passkeys = new WebPasskeyRepository(db);
  if (!options.confirm) {
    return { passkeysRemoved: await passkeys.countByUser(userId), sessionsEnded: 0 };
  }
  return withTransaction(db, async (tx) => {
    const passkeysRemoved = await passkeys.deleteByUser(userId, tx);
    const sessionsEnded = await new WebSessionRepository(db).deleteByUser(userId, tx);
    await new AuditLogRepository(db).create(
      {
        guildId: null,
        actorUserId: options.actor,
        action: 'web.passkey.reset',
        details: { source: 'cli', userId, passkeysRemoved, sessionsEnded },
        ipAddress: null,
        userAgent: null,
      },
      options.now ?? new Date(),
      tx,
    );
    return { passkeysRemoved, sessionsEnded };
  });
}

function cliActor(): string {
  try {
    return `cli:${userInfo().username}`;
  } catch {
    return 'cli';
  }
}

export function registerPasskeysResetCommand(program: Command): void {
  program
    .command('passkeys:reset')
    .description(
      "Remove a dashboard user's passkeys and end their sessions (recovery for lost passkeys)",
    )
    .argument('<user_id>', 'Discord user ID')
    .option('--yes', 'Apply the reset; without it the command only reports what would change')
    .action(async (userId: string, flags: { yes?: boolean }) => {
      const db = await createDatabaseClient({
        dialect: (process.env.DATABASE_DIALECT || 'sqlite') as 'sqlite' | 'postgres',
        url: process.env.DATABASE_URL || './data/ririko.sqlite',
      });
      try {
        const confirm = flags.yes === true;
        const result = await resetPasskeys(db, userId, { confirm, actor: cliActor() });
        if (!confirm) {
          console.log(
            `User ${userId} has ${result.passkeysRemoved} passkey(s). Run again with ${pc.bold('--yes')} to remove them and end the user's dashboard sessions.`,
          );
          return;
        }
        console.log(
          `${pc.green('✔')} Removed ${result.passkeysRemoved} passkey(s) and ended ${result.sessionsEnded} session(s) for ${userId}. Tell the user to sign in again and add a new passkey.`,
        );
      } finally {
        await db.close();
      }
    });
}
