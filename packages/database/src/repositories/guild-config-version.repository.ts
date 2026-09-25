import { asc, gt, sql } from 'drizzle-orm';

import type { DatabaseClient } from '../client/types.js';
import type { GuildConfigVersion } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';

/** Dual-dialect store for the guild config change feed (`guild_config_versions`). */
export class GuildConfigVersionRepository {
  constructor(protected readonly client: DatabaseClient) {}

  protected getClient(tx?: DatabaseClient): DatabaseClient {
    return tx ?? this.client;
  }

  /**
   * Records that a module's settings changed for a guild and returns the new version. Call it
   * inside the transaction that writes the settings so readers never see one without the other.
   */
  async bump(guildId: string, module: string, now: Date, tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    const [row] =
      client.dialect === 'sqlite'
        ? await client.db
            .insert(sqliteSchema.guildConfigVersions)
            .values({ guildId, module, version: 1, updatedAt: now })
            .onConflictDoUpdate({
              target: [
                sqliteSchema.guildConfigVersions.guildId,
                sqliteSchema.guildConfigVersions.module,
              ],
              set: {
                version: sql`${sqliteSchema.guildConfigVersions.version} + 1`,
                updatedAt: now,
              },
            })
            .returning({ version: sqliteSchema.guildConfigVersions.version })
        : await client.db
            .insert(pgSchema.guildConfigVersions)
            .values({ guildId, module, version: 1, updatedAt: now })
            .onConflictDoUpdate({
              target: [pgSchema.guildConfigVersions.guildId, pgSchema.guildConfigVersions.module],
              set: { version: sql`${pgSchema.guildConfigVersions.version} + 1`, updatedAt: now },
            })
            .returning({ version: pgSchema.guildConfigVersions.version });
    if (!row) throw new DatabaseError(`Failed to bump config version for guild ${guildId}`);
    return row.version;
  }

  /** Rows changed strictly after `since`, oldest first. */
  async listChangedSince(since: Date, tx?: DatabaseClient): Promise<GuildConfigVersion[]> {
    const client = this.getClient(tx);
    return client.dialect === 'sqlite'
      ? client.db
          .select()
          .from(sqliteSchema.guildConfigVersions)
          .where(gt(sqliteSchema.guildConfigVersions.updatedAt, since))
          .orderBy(asc(sqliteSchema.guildConfigVersions.updatedAt))
      : client.db
          .select()
          .from(pgSchema.guildConfigVersions)
          .where(gt(pgSchema.guildConfigVersions.updatedAt, since))
          .orderBy(asc(pgSchema.guildConfigVersions.updatedAt));
  }
}
