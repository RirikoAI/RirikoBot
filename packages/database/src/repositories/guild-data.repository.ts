import { and, eq, lt, asc, sql, type SQL } from 'drizzle-orm';

import type { DatabaseClient } from '../client/types.js';
import { withTransaction } from '../transactions/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import {
  GUILD_CHILD_DATA,
  GUILD_DATA_INVENTORY,
  GUILD_ID_COLUMN,
  type GuildChildEntry,
  type GuildDataEntry,
} from './guild-data-inventory.js';
import { PURGE_BATCH_SIZE, deleteInBatches } from './retention.js';

/** What `purgeGuild` did to one server. Tables with nothing to do are left out. */
export interface GuildPurgeResult {
  readonly guildId: string;
  /** Rows deleted per table, including the `guilds` row itself. */
  readonly deleted: Readonly<Record<string, number>>;
  /** Rows per table whose `guild_id` was set to null (user-owned rows that are kept). */
  readonly detached: Readonly<Record<string, number>>;
}

/**
 * Deletes a server's data once the bot has been out of it for the retention period (TASK-1935,
 * STORY-193). `GUILD_DATA_INVENTORY` says what happens to each table; this class only runs it.
 */
export class GuildDataRepository {
  constructor(private readonly client: DatabaseClient) {}

  /**
   * IDs of the servers the bot left before `cutoff`: inactive with a `left_at` earlier than
   * `cutoff`. A server that left at exactly `cutoff` is not included. Oldest departure first.
   */
  async listDepartedBefore(cutoff: Date): Promise<string[]> {
    const client = this.client;
    if (client.dialect === 'sqlite') {
      const t = sqliteSchema.guilds;
      const rows = await client.db
        .select({ id: t.id })
        .from(t)
        .where(and(eq(t.isActive, false), lt(t.leftAt, cutoff)))
        .orderBy(asc(t.leftAt), asc(t.id));
      return rows.map((row) => row.id);
    }
    const t = pgSchema.guilds;
    const rows = await client.db
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.isActive, false), lt(t.leftAt, cutoff)))
      .orderBy(asc(t.leftAt), asc(t.id));
    return rows.map((row) => row.id);
  }

  /**
   * Deletes everything the inventory lists for one server, then its `guilds` row, in one
   * transaction, `batchSize` rows per statement. Inside the transaction it checks again that the
   * server is still inactive and left before `cutoff` (locking the row on PostgreSQL), so a server
   * the bot was added back to in the meantime is left alone and the method returns null. A failure
   * rolls the whole server back.
   */
  async purgeGuild(
    guildId: string,
    cutoff: Date,
    batchSize: number = PURGE_BATCH_SIZE,
  ): Promise<GuildPurgeResult | null> {
    return withTransaction(this.client, async (tx) => {
      if (!(await this.lockDeparted(tx, guildId, cutoff))) return null;

      const deleted: Record<string, number> = {};
      const detached: Record<string, number> = {};
      const record = (into: Record<string, number>, table: string, rows: number) => {
        if (rows > 0) into[table] = rows;
      };

      for (const child of GUILD_CHILD_DATA) {
        record(deleted, child.table, await this.deleteChild(tx, child, guildId, batchSize));
      }
      for (const entry of GUILD_DATA_INVENTORY) {
        if (entry.action === 'delete') {
          record(deleted, entry.table, await this.deleteRows(tx, entry, guildId, batchSize));
        } else if (entry.action === 'detach') {
          record(detached, entry.table, await this.detachRows(tx, entry, guildId, batchSize));
        }
      }
      record(deleted, 'guilds', await this.deleteGuildRow(tx, guildId));

      return { guildId, deleted, detached };
    });
  }

  /** Whether the server is still inactive and left before `cutoff`; locks its row on PostgreSQL. */
  private async lockDeparted(tx: DatabaseClient, guildId: string, cutoff: Date): Promise<boolean> {
    if (tx.dialect === 'sqlite') {
      const t = sqliteSchema.guilds;
      const rows = await tx.db
        .select({ id: t.id })
        .from(t)
        .where(and(eq(t.id, guildId), eq(t.isActive, false), lt(t.leftAt, cutoff)));
      return rows.length > 0;
    }
    const t = pgSchema.guilds;
    const rows = await tx.db
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.id, guildId), eq(t.isActive, false), lt(t.leftAt, cutoff)))
      .for('update');
    return rows.length > 0;
  }

  /** The hidden row identifier each dialect offers, used to find the rows of one batch. */
  private rowId(tx: DatabaseClient): SQL {
    return sql.raw(tx.dialect === 'sqlite' ? 'rowid' : 'ctid');
  }

  private async run(tx: DatabaseClient, statement: SQL): Promise<number> {
    if (tx.dialect === 'sqlite') return tx.db.run(statement).changes;
    return (await tx.db.execute(statement)).rowCount ?? 0;
  }

  private deleteRows(
    tx: DatabaseClient,
    entry: GuildDataEntry,
    guildId: string,
    batchSize: number,
  ): Promise<number> {
    const table = sql.identifier(entry.table);
    const column = sql.identifier(GUILD_ID_COLUMN);
    const row = this.rowId(tx);
    return deleteInBatches(batchSize, () =>
      this.run(
        tx,
        sql`DELETE FROM ${table} WHERE ${row} IN (SELECT ${row} FROM ${table} WHERE ${column} = ${guildId} LIMIT ${batchSize})`,
      ),
    );
  }

  private detachRows(
    tx: DatabaseClient,
    entry: GuildDataEntry,
    guildId: string,
    batchSize: number,
  ): Promise<number> {
    const table = sql.identifier(entry.table);
    const column = sql.identifier(GUILD_ID_COLUMN);
    const row = this.rowId(tx);
    return deleteInBatches(batchSize, () =>
      this.run(
        tx,
        sql`UPDATE ${table} SET ${column} = NULL WHERE ${row} IN (SELECT ${row} FROM ${table} WHERE ${column} = ${guildId} LIMIT ${batchSize})`,
      ),
    );
  }

  private deleteChild(
    tx: DatabaseClient,
    child: GuildChildEntry,
    guildId: string,
    batchSize: number,
  ): Promise<number> {
    const table = sql.identifier(child.table);
    const column = sql.identifier(child.column);
    const parent = sql.identifier(child.parentTable);
    const parentColumn = sql.identifier(child.parentColumn);
    const guildColumn = sql.identifier(GUILD_ID_COLUMN);
    const row = this.rowId(tx);
    return deleteInBatches(batchSize, () =>
      this.run(
        tx,
        sql`DELETE FROM ${table} WHERE ${row} IN (SELECT ${row} FROM ${table} WHERE ${column} IN (SELECT ${parentColumn} FROM ${parent} WHERE ${guildColumn} = ${guildId}) LIMIT ${batchSize})`,
      ),
    );
  }

  private async deleteGuildRow(tx: DatabaseClient, guildId: string): Promise<number> {
    if (tx.dialect === 'sqlite') {
      return tx.db.delete(sqliteSchema.guilds).where(eq(sqliteSchema.guilds.id, guildId)).run()
        .changes;
    }
    const result = await tx.db.delete(pgSchema.guilds).where(eq(pgSchema.guilds.id, guildId));
    return result.rowCount ?? 0;
  }
}
