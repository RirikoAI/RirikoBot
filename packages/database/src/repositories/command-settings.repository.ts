import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';

import type { DatabaseClient } from '../client/types.js';
import type { CommandSettings } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';

/** A `command_settings` row without its generated id. */
export type CommandSettingsInput = Omit<CommandSettings, 'id' | 'guildId'>;

/**
 * Dual-dialect store for per-guild and per-channel command overrides (`command_settings`).
 * A guild's rows are always replaced together, so the table needs no unique key.
 */
export class CommandSettingsRepository {
  constructor(protected readonly client: DatabaseClient) {}

  protected getClient(tx?: DatabaseClient): DatabaseClient {
    return tx ?? this.client;
  }

  async listForGuild(guildId: string, tx?: DatabaseClient): Promise<CommandSettings[]> {
    const client = this.getClient(tx);
    if (client.dialect === 'sqlite') {
      const table = sqliteSchema.commandSettings;
      return client.db
        .select()
        .from(table)
        .where(eq(table.guildId, guildId))
        .orderBy(asc(table.commandName), asc(table.channelId));
    }
    const table = pgSchema.commandSettings;
    return client.db
      .select()
      .from(table)
      .where(eq(table.guildId, guildId))
      .orderBy(asc(table.commandName), asc(table.channelId));
  }

  /** Replaces every override of a guild. Call it inside a transaction. */
  async replaceForGuild(
    guildId: string,
    rows: readonly CommandSettingsInput[],
    tx?: DatabaseClient,
  ): Promise<void> {
    const client = this.getClient(tx);
    const values = rows.map((row) => ({ ...row, id: randomUUID(), guildId }));
    if (client.dialect === 'sqlite') {
      const table = sqliteSchema.commandSettings;
      await client.db.delete(table).where(eq(table.guildId, guildId));
      if (values.length > 0) await client.db.insert(table).values(values);
      return;
    }
    const table = pgSchema.commandSettings;
    await client.db.delete(table).where(eq(table.guildId, guildId));
    if (values.length > 0) await client.db.insert(table).values(values);
  }
}
