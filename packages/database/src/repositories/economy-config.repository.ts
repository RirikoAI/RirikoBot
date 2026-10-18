import { eq } from 'drizzle-orm';

import type { EconomyConfig } from '@ririko/core';
import type { DatabaseClient } from '../client/types.js';
import type { EconomyConfigRow } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';

/** The only row of `economy_config`. */
export const ECONOMY_CONFIG_ROW_ID = 'global';

/** Dual-dialect store for the global economy values (`economy_config`, one row). */
export class EconomyConfigRepository {
  constructor(protected readonly client: DatabaseClient) {}

  protected getClient(tx?: DatabaseClient): DatabaseClient {
    return tx ?? this.client;
  }

  /** The saved row, or `null` before an owner first saves the values. */
  async get(tx?: DatabaseClient): Promise<EconomyConfigRow | null> {
    const client = this.getClient(tx);
    const [row] =
      client.dialect === 'sqlite'
        ? await client.db
            .select()
            .from(sqliteSchema.economyConfig)
            .where(eq(sqliteSchema.economyConfig.id, ECONOMY_CONFIG_ROW_ID))
        : await client.db
            .select()
            .from(pgSchema.economyConfig)
            .where(eq(pgSchema.economyConfig.id, ECONOMY_CONFIG_ROW_ID));
    return row ?? null;
  }

  /** Writes every value, creating the row on the first save. */
  async save(
    values: EconomyConfig,
    updatedBy: string,
    now: Date,
    tx?: DatabaseClient,
  ): Promise<void> {
    const client = this.getClient(tx);
    const set = { ...values, updatedBy, updatedAt: now };
    if (client.dialect === 'sqlite') {
      await client.db
        .insert(sqliteSchema.economyConfig)
        .values({ id: ECONOMY_CONFIG_ROW_ID, ...set })
        .onConflictDoUpdate({ target: sqliteSchema.economyConfig.id, set });
    } else {
      await client.db
        .insert(pgSchema.economyConfig)
        .values({ id: ECONOMY_CONFIG_ROW_ID, ...set })
        .onConflictDoUpdate({ target: pgSchema.economyConfig.id, set });
    }
  }
}
