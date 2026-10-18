import { asc, notInArray, sql } from 'drizzle-orm';

import type { DatabaseClient } from '../client/types.js';
import type { Command } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { withTransaction } from '../transactions/index.js';

/**
 * Dual-dialect store for the command catalog (`commands`). The bot writes its registered
 * commands at startup, and the dashboard and CLI read them, since they cannot see the registry.
 */
export class CommandCatalogRepository {
  constructor(protected readonly client: DatabaseClient) {}

  protected getClient(tx?: DatabaseClient): DatabaseClient {
    return tx ?? this.client;
  }

  /** Every catalogued command, by category then name. */
  async list(tx?: DatabaseClient): Promise<Command[]> {
    const client = this.getClient(tx);
    if (client.dialect === 'sqlite') {
      const table = sqliteSchema.commands;
      return client.db.select().from(table).orderBy(asc(table.category), asc(table.name));
    }
    const table = pgSchema.commands;
    return client.db.select().from(table).orderBy(asc(table.category), asc(table.name));
  }

  /** Makes the catalog exactly `entries`: upserts each one and deletes commands no longer registered. */
  async replaceAll(entries: readonly Command[]): Promise<void> {
    const names = entries.map((entry) => entry.name);
    await withTransaction(this.client, async (client) => {
      if (client.dialect === 'sqlite') {
        const table = sqliteSchema.commands;
        await client.db
          .delete(table)
          .where(names.length > 0 ? notInArray(table.name, names) : sql`1 = 1`);
        for (const entry of entries) {
          await client.db
            .insert(table)
            .values(entry)
            .onConflictDoUpdate({ target: table.name, set: entry });
        }
        return;
      }
      const table = pgSchema.commands;
      await client.db
        .delete(table)
        .where(names.length > 0 ? notInArray(table.name, names) : sql`true`);
      for (const entry of entries) {
        await client.db
          .insert(table)
          .values(entry)
          .onConflictDoUpdate({ target: table.name, set: entry });
      }
    });
  }
}
