import { eq } from 'drizzle-orm';

import type { DatabaseClient } from '../client/types.js';
import type { WelcomeConfig, FarewellConfig } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';

export class WelcomerRepository {
  constructor(protected readonly client: DatabaseClient) {}

  protected getClient(tx?: DatabaseClient): DatabaseClient {
    return tx ?? this.client;
  }

  protected isSqlite(client: DatabaseClient) {
    return client.dialect === 'sqlite';
  }

  async getWelcomeConfig(guildId: string, tx?: DatabaseClient): Promise<WelcomeConfig | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.guildWelcomer)
        .where(eq(sqliteSchema.guildWelcomer.guildId, guildId));
      return (row as WelcomeConfig) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.guildWelcomer)
        .where(eq(pgSchema.guildWelcomer.guildId, guildId));
      return (row as unknown as WelcomeConfig) ?? null;
    }
  }

  async setWelcomeConfig(
    data: Omit<WelcomeConfig, 'guildId'> & { guildId: string },
    tx?: DatabaseClient,
  ): Promise<WelcomeConfig> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [upserted] = await client.db
        .insert(sqliteSchema.guildWelcomer)
        .values(data)
        .onConflictDoUpdate({
          target: sqliteSchema.guildWelcomer.guildId,
          set: data,
        })
        .returning();
      return upserted as WelcomeConfig;
    } else {
      const [upserted] = await client.db
        .insert(pgSchema.guildWelcomer)
        .values(data as unknown as typeof pgSchema.guildWelcomer.$inferInsert)
        .onConflictDoUpdate({
          target: pgSchema.guildWelcomer.guildId,
          set: data as unknown as typeof pgSchema.guildWelcomer.$inferInsert,
        })
        .returning();
      return upserted as unknown as WelcomeConfig;
    }
  }

  async getFarewellConfig(guildId: string, tx?: DatabaseClient): Promise<FarewellConfig | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.guildFarewell)
        .where(eq(sqliteSchema.guildFarewell.guildId, guildId));
      return (row as FarewellConfig) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.guildFarewell)
        .where(eq(pgSchema.guildFarewell.guildId, guildId));
      return (row as unknown as FarewellConfig) ?? null;
    }
  }

  async setFarewellConfig(
    data: Omit<FarewellConfig, 'guildId'> & { guildId: string },
    tx?: DatabaseClient,
  ): Promise<FarewellConfig> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [upserted] = await client.db
        .insert(sqliteSchema.guildFarewell)
        .values(data)
        .onConflictDoUpdate({
          target: sqliteSchema.guildFarewell.guildId,
          set: data,
        })
        .returning();
      return upserted as FarewellConfig;
    } else {
      const [upserted] = await client.db
        .insert(pgSchema.guildFarewell)
        .values(data as unknown as typeof pgSchema.guildFarewell.$inferInsert)
        .onConflictDoUpdate({
          target: pgSchema.guildFarewell.guildId,
          set: data as unknown as typeof pgSchema.guildFarewell.$inferInsert,
        })
        .returning();
      return upserted as unknown as FarewellConfig;
    }
  }
}
