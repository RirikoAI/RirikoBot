import { and, eq, lt } from 'drizzle-orm';

import type { DatabaseClient } from '../client/types.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';

/** Dual-dialect store for the browsers each dashboard user has signed in from. */
export class WebKnownDeviceRepository {
  constructor(protected readonly client: DatabaseClient) {}

  protected getClient(tx?: DatabaseClient): DatabaseClient {
    return tx ?? this.client;
  }

  /**
   * Records a sign-in from the device and returns true when the user had not used it before.
   * Of two concurrent first sign-ins, only one sees true.
   */
  async recordSighting(
    userId: string,
    deviceHash: string,
    now: Date,
    tx?: DatabaseClient,
  ): Promise<boolean> {
    const client = this.getClient(tx);
    const values = { userId, deviceHash, firstSeenAt: now, lastSeenAt: now };
    const inserted =
      client.dialect === 'sqlite'
        ? await client.db
            .insert(sqliteSchema.webKnownDevices)
            .values(values)
            .onConflictDoNothing()
            .returning({ userId: sqliteSchema.webKnownDevices.userId })
        : await client.db
            .insert(pgSchema.webKnownDevices)
            .values(values)
            .onConflictDoNothing()
            .returning({ userId: pgSchema.webKnownDevices.userId });
    if (inserted.length > 0) return true;

    if (client.dialect === 'sqlite') {
      await client.db
        .update(sqliteSchema.webKnownDevices)
        .set({ lastSeenAt: now })
        .where(
          and(
            eq(sqliteSchema.webKnownDevices.userId, userId),
            eq(sqliteSchema.webKnownDevices.deviceHash, deviceHash),
          ),
        );
    } else {
      await client.db
        .update(pgSchema.webKnownDevices)
        .set({ lastSeenAt: now })
        .where(
          and(
            eq(pgSchema.webKnownDevices.userId, userId),
            eq(pgSchema.webKnownDevices.deviceHash, deviceHash),
          ),
        );
    }
    return false;
  }

  /** Forgets devices not seen since `before` (their cookie has expired); returns how many. */
  async deleteUnseenSince(before: Date, tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    const deleted =
      client.dialect === 'sqlite'
        ? await client.db
            .delete(sqliteSchema.webKnownDevices)
            .where(lt(sqliteSchema.webKnownDevices.lastSeenAt, before))
            .returning({ userId: sqliteSchema.webKnownDevices.userId })
        : await client.db
            .delete(pgSchema.webKnownDevices)
            .where(lt(pgSchema.webKnownDevices.lastSeenAt, before))
            .returning({ userId: pgSchema.webKnownDevices.userId });
    return deleted.length;
  }
}
