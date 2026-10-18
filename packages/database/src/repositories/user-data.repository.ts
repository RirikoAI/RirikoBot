import { and, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { ValidationError } from '@ririko/core';

import type { DatabaseClient } from '../client/types.js';
import { withTransaction } from '../transactions/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import {
  USER_CHILD_DATA,
  USER_DATA_INVENTORY,
  USER_TEXT_DATA,
  erasedMarker,
  type UserDataEntry,
  type UserDataOptIn,
} from './user-data-inventory.js';

/** What the command did, or would do, to the rows of one column. */
export type UserDataOperationAction = 'delete' | 'tombstone' | 'scrub' | 'cancel' | 'keep';

export interface UserDataOperation {
  readonly table: string;
  readonly column: string;
  readonly action: UserDataOperationAction;
  /** Rows the action changes (or, for `keep`, rows that stay). */
  readonly rows: number;
  /** For `keep`: the option that would apply the action the inventory names for these rows. */
  readonly optIn?: UserDataOptIn;
}

export interface UserEraseOptions {
  /** Also remove the user from moderation records (cases, notes, warnings). Off by default. */
  readonly includeModeration?: boolean;
}

/** A Discord user ID: the only shape that is safe to put in a LIKE pattern. */
const SNOWFLAKE = /^\d{17,20}$/;

/** One statement of the erasure: how to count its rows and how to change them. */
interface Step {
  readonly table: string;
  readonly column: string;
  readonly action: Exclude<UserDataOperationAction, 'cancel'>;
  readonly where: SQL;
  /** The UPDATE assignments, for `tombstone` and `scrub`. */
  readonly set?: SQL;
  readonly optIn?: UserDataOptIn;
}

const id = (name: string) => sql.identifier(name);

/**
 * Removes or anonymises everything the database holds about one Discord user (TASK-1941,
 * STORY-194). `USER_DATA_INVENTORY` says what happens to each column; this class only runs it.
 * `plan` reads and changes nothing. `apply` runs inside a transaction the caller owns, so the
 * caller can write its audit entry in the same commit.
 */
export class UserDataRepository {
  constructor(private readonly client: DatabaseClient) {}

  /** The rows each step would change, without changing anything. */
  async plan(userId: string, options: UserEraseOptions = {}): Promise<UserDataOperation[]> {
    assertUserId(userId);
    const operations: UserDataOperation[] = [];
    const pending = await this.pendingTrades(this.client, userId);
    if (pending.length > 0) {
      operations.push({
        table: 'card_trades',
        column: 'status',
        action: 'cancel',
        rows: pending.length,
      });
    }
    for (const step of this.steps(userId, options)) {
      operations.push(toOperation(step, await this.count(this.client, step)));
    }
    return sortOperations(operations);
  }

  /**
   * Applies the erasure on `tx`: cancels the user's pending trades (unlocking the other side's
   * cards), then deletes, tombstones and scrubs in an order that leaves no row pointing at a
   * deleted parent. Returns the rows each step changed. Running it again finds nothing to change.
   */
  async apply(
    tx: DatabaseClient,
    userId: string,
    options: UserEraseOptions = {},
    now: Date = new Date(),
  ): Promise<UserDataOperation[]> {
    assertUserId(userId);
    const operations: UserDataOperation[] = [];
    const cancelled = await this.cancelPendingTrades(tx, userId, now);
    if (cancelled > 0) {
      operations.push({
        table: 'card_trades',
        column: 'status',
        action: 'cancel',
        rows: cancelled,
      });
    }
    for (const step of this.steps(userId, options)) {
      const rows = step.action === 'keep' ? await this.count(tx, step) : await this.run(tx, step);
      operations.push(toOperation(step, rows));
    }
    return sortOperations(operations);
  }

  /** `apply` in a transaction of its own. */
  erase(
    userId: string,
    options: UserEraseOptions = {},
    now: Date = new Date(),
  ): Promise<UserDataOperation[]> {
    return withTransaction(this.client, (tx) => this.apply(tx, userId, options, now));
  }

  /**
   * Every statement, in the order that is safe to run: children of deleted rows first, then the
   * deletes (the `users` row last), the tombstones, the text scrubs, and the kept rows to report.
   */
  private steps(userId: string, options: UserEraseOptions): Step[] {
    const marker = erasedMarker(userId);
    const includes = (entry: { optIn?: UserDataOptIn }): boolean =>
      entry.optIn === undefined ||
      (entry.optIn === 'moderation' && options.includeModeration === true);

    const children: Step[] = [];
    for (const child of USER_CHILD_DATA) {
      const parent = USER_DATA_INVENTORY.find(
        (entry) => entry.table === child.parentTable && entry.column === child.parentUserColumn,
      );
      if (parent === undefined || !includes(parent)) continue;
      children.push({
        table: child.table,
        column: child.column,
        action: 'delete',
        where: sql`${id(child.column)} IN (SELECT ${id(child.parentColumn)} FROM ${id(child.parentTable)} WHERE ${id(child.parentUserColumn)} = ${userId})`,
      });
    }

    const deletes: Step[] = [];
    const tombstones: Step[] = [];
    const kept: Step[] = [];
    let usersRow: Step | undefined;
    for (const entry of USER_DATA_INVENTORY) {
      const matches = sql`${id(entry.column)} = ${userId}`;
      if (entry.action === 'keep') {
        // The column holds no Discord user ID (see its note): nothing to count or report.
        continue;
      }
      if (!includes(entry)) {
        const step: Step = {
          table: entry.table,
          column: entry.column,
          action: 'keep',
          where: matches,
          ...(entry.optIn === undefined ? {} : { optIn: entry.optIn }),
        };
        // Rows an option would change are reported as kept, with the option's name.
        kept.push(step);
      } else if (entry.action === 'delete') {
        const step: Step = {
          table: entry.table,
          column: entry.column,
          action: 'delete',
          where: matches,
        };
        if (entry.table === 'users') usersRow = step;
        else deletes.push(step);
      } else {
        const { alone, shared } = this.leaderConditions(entry, userId);
        if (alone !== undefined) {
          deletes.push({
            table: entry.table,
            column: entry.column,
            action: 'delete',
            where: sql`${matches} AND ${alone}`,
          });
        }
        tombstones.push({
          table: entry.table,
          column: entry.column,
          action: 'tombstone',
          where: shared === undefined ? matches : sql`${matches} AND ${shared}`,
          set: this.tombstoneAssignments(entry, marker),
        });
      }
    }

    const scrubs: Step[] = [];
    for (const entry of USER_TEXT_DATA) {
      if (!includes(entry)) continue;
      const quoted = JSON.stringify(userId);
      const replacement = JSON.stringify(marker);
      const column = id(entry.column);
      // JSON is text in SQLite and jsonb in PostgreSQL; both are compared and replaced as text.
      const text = this.client.dialect === 'sqlite' ? sql`${column}` : sql`${column}::text`;
      const cast = this.client.dialect === 'sqlite' ? sql`` : sql`::jsonb`;
      scrubs.push({
        table: entry.table,
        column: entry.column,
        action: 'scrub',
        where: sql`${text} LIKE ${`%${quoted}%`}`,
        set: sql`${column} = replace(${text}, ${quoted}, ${replacement})${cast}`,
      });
    }

    return [
      ...children,
      ...deletes,
      ...(usersRow ? [usersRow] : []),
      ...tombstones,
      ...scrubs,
      ...kept,
    ];
  }

  /** `SET` for a tombstone: the marker, and NULL for the columns that go with the user. */
  private tombstoneAssignments(entry: UserDataEntry, marker: string): SQL {
    const assignments = [sql`${id(entry.column)} = ${marker}`];
    for (const column of entry.clear ?? []) assignments.push(sql`${id(column)} = NULL`);
    return sql.join(assignments, sql`, `);
  }

  /**
   * For a tombstone with `deleteWhenAlone`: the condition that no other user has a row pointing
   * at the row (`alone`), and its complement (`shared`). The two split the rows exactly.
   */
  private leaderConditions(entry: UserDataEntry, userId: string): { alone?: SQL; shared?: SQL } {
    const rule = entry.deleteWhenAlone;
    if (rule === undefined) return {};
    const exists = sql`EXISTS (SELECT 1 FROM ${id(rule.table)} WHERE ${id(rule.table)}.${id(rule.column)} = ${id(entry.table)}.${id(rule.parentColumn)} AND ${id(rule.table)}.${id(rule.userColumn)} <> ${userId})`;
    return { alone: sql`NOT ${exists}`, shared: exists };
  }

  private async count(client: DatabaseClient, step: Step): Promise<number> {
    const statement = sql`SELECT count(*) AS n FROM ${id(step.table)} WHERE ${step.where}`;
    if (client.dialect === 'sqlite') {
      const rows = (await client.db.all(statement)) as { n: number | string }[];
      return Number(rows[0]?.n ?? 0);
    }
    const result = await client.db.execute(statement);
    return Number((result.rows[0] as { n: number | string } | undefined)?.n ?? 0);
  }

  private async run(tx: DatabaseClient, step: Step): Promise<number> {
    const table = id(step.table);
    const statement =
      step.action === 'delete'
        ? sql`DELETE FROM ${table} WHERE ${step.where}`
        : sql`UPDATE ${table} SET ${step.set!} WHERE ${step.where}`;
    if (tx.dialect === 'sqlite') return tx.db.run(statement).changes;
    return (await tx.db.execute(statement)).rowCount ?? 0;
  }

  /** The user's pending trades with every card ID they lock. */
  private async pendingTrades(
    client: DatabaseClient,
    userId: string,
  ): Promise<{ id: string; cardIds: string[] }[]> {
    const list = (value: unknown): string[] => (Array.isArray(value) ? (value as string[]) : []);
    const cards = (offered: unknown, requested: unknown): string[] => [
      ...list(offered),
      ...list(requested),
    ];
    if (client.dialect === 'sqlite') {
      const t = sqliteSchema.cardTrades;
      const rows = await client.db
        .select({ id: t.id, offered: t.offeredCardIds, requested: t.requestedCardIds })
        .from(t)
        .where(
          and(
            eq(t.status, 'PENDING'),
            or(eq(t.senderUserId, userId), eq(t.receiverUserId, userId)),
          ),
        );
      return rows.map((row) => ({ id: row.id, cardIds: cards(row.offered, row.requested) }));
    }
    const t = pgSchema.cardTrades;
    const rows = await client.db
      .select({ id: t.id, offered: t.offeredCardIds, requested: t.requestedCardIds })
      .from(t)
      .where(
        and(eq(t.status, 'PENDING'), or(eq(t.senderUserId, userId), eq(t.receiverUserId, userId))),
      );
    return rows.map((row) => ({ id: row.id, cardIds: cards(row.offered, row.requested) }));
  }

  /**
   * Cancels the user's pending trades and puts the cards they locked back to IDLE, so the other
   * party is not left with cards in a trade that can never finish.
   */
  private async cancelPendingTrades(
    tx: DatabaseClient,
    userId: string,
    now: Date,
  ): Promise<number> {
    const pending = await this.pendingTrades(tx, userId);
    for (const trade of pending) {
      if (tx.dialect === 'sqlite') {
        await tx.db
          .update(sqliteSchema.cardTrades)
          .set({ status: 'CANCELLED', resolvedAt: now })
          .where(eq(sqliteSchema.cardTrades.id, trade.id));
        if (trade.cardIds.length > 0) {
          const cards = sqliteSchema.userCards;
          await tx.db
            .update(cards)
            .set({ state: 'IDLE' })
            .where(and(inArray(cards.id, trade.cardIds), eq(cards.state, 'IN_TRADE')));
        }
      } else {
        await tx.db
          .update(pgSchema.cardTrades)
          .set({ status: 'CANCELLED', resolvedAt: now })
          .where(eq(pgSchema.cardTrades.id, trade.id));
        if (trade.cardIds.length > 0) {
          const cards = pgSchema.userCards;
          await tx.db
            .update(cards)
            .set({ state: 'IDLE' })
            .where(and(inArray(cards.id, trade.cardIds), eq(cards.state, 'IN_TRADE')));
        }
      }
    }
    return pending.length;
  }
}

function assertUserId(userId: string): void {
  if (!SNOWFLAKE.test(userId)) {
    throw new ValidationError('That is not a Discord user ID (17 to 20 digits).');
  }
}

function toOperation(step: Step, rows: number): UserDataOperation {
  return {
    table: step.table,
    column: step.column,
    action: step.action,
    rows,
    ...(step.optIn === undefined ? {} : { optIn: step.optIn }),
  };
}

const ACTION_ORDER: Record<UserDataOperationAction, number> = {
  cancel: 0,
  delete: 1,
  tombstone: 2,
  scrub: 3,
  keep: 4,
};

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Tables alphabetically, then columns, then the order cancel, delete, tombstone, scrub, keep. */
function sortOperations(operations: UserDataOperation[]): UserDataOperation[] {
  return [...operations].sort(
    (a, b) =>
      compareText(a.table, b.table) ||
      compareText(a.column, b.column) ||
      ACTION_ORDER[a.action] - ACTION_ORDER[b.action],
  );
}
