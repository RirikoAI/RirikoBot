import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import type { DatabaseClient } from '../client/types.js';
import type { Guild } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';

/** A server as the bot sees it; the server is stored as active. */
export interface GuildRegistration {
  id: string;
  name: string;
  iconUrl: string | null;
  ownerId: string;
  /** When the bot joined the server. */
  joinedAt: Date;
}

/** How the inviter of a server was learned. */
export const INVITE_SOURCES = ['oauth', 'audit_log', 'integration'] as const;
export type InviteSource = (typeof INVITE_SOURCES)[number];

/** Rows per `UPDATE ... WHERE id IN (...)`, well below every dialect's bind parameter limit. */
const ID_CHUNK = 500;

/**
 * The servers the bot is in, or was in (`guilds`, TASK-1831): name, icon, owner, who invited the
 * bot and whether it is still there. The bot is the only writer; rows are never deleted, so the
 * owner console can still list servers the bot has left.
 */
export class GuildRepository {
  constructor(protected readonly client: DatabaseClient) {}

  /**
   * Records a server as active and refreshes its name, icon and owner. Running it again for an
   * active server (a `GuildCreate` after an outage, a ready after a reconnect) keeps the join time
   * and the inviter; a server the bot had left and now joined again starts over with the new join
   * time and no inviter.
   */
  async upsert(guild: GuildRegistration): Promise<void> {
    const now = new Date();
    const values = {
      id: guild.id,
      name: guild.name,
      iconUrl: guild.iconUrl,
      ownerId: guild.ownerId,
      joinedAt: guild.joinedAt,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    const client = this.client;
    if (client.dialect === 'sqlite') {
      const table = sqliteSchema.guilds;
      await client.db
        .insert(table)
        .values(values)
        .onConflictDoUpdate({
          target: table.id,
          set: {
            name: guild.name,
            iconUrl: guild.iconUrl,
            ownerId: guild.ownerId,
            joinedAt: sql`CASE WHEN ${table.isActive} THEN ${table.joinedAt} ELSE excluded.joined_at END`,
            invitedById: sql`CASE WHEN ${table.isActive} THEN ${table.invitedById} ELSE NULL END`,
            invitedVia: sql`CASE WHEN ${table.isActive} THEN ${table.invitedVia} ELSE NULL END`,
            isActive: true,
            updatedAt: now,
          },
        });
    } else {
      const table = pgSchema.guilds;
      await client.db
        .insert(table)
        .values(values)
        .onConflictDoUpdate({
          target: table.id,
          set: {
            name: guild.name,
            iconUrl: guild.iconUrl,
            ownerId: guild.ownerId,
            joinedAt: sql`CASE WHEN ${table.isActive} THEN ${table.joinedAt} ELSE excluded.joined_at END`,
            invitedById: sql`CASE WHEN ${table.isActive} THEN ${table.invitedById} ELSE NULL END`,
            invitedVia: sql`CASE WHEN ${table.isActive} THEN ${table.invitedVia} ELSE NULL END`,
            isActive: true,
            updatedAt: now,
          },
        });
    }
  }

  /** Marks these servers inactive (the bot left or was removed). Unknown IDs are ignored. */
  async markInactive(ids: readonly string[]): Promise<void> {
    const now = new Date();
    for (let start = 0; start < ids.length; start += ID_CHUNK) {
      const chunk = ids.slice(start, start + ID_CHUNK);
      if (this.client.dialect === 'sqlite') {
        const table = sqliteSchema.guilds;
        await this.client.db
          .update(table)
          .set({ isActive: false, updatedAt: now })
          .where(and(inArray(table.id, chunk), eq(table.isActive, true)));
      } else {
        const table = pgSchema.guilds;
        await this.client.db
          .update(table)
          .set({ isActive: false, updatedAt: now })
          .where(and(inArray(table.id, chunk), eq(table.isActive, true)));
      }
    }
  }

  /** Marks every active server not in `activeIds` inactive; returns the IDs it marked. */
  async markInactiveExcept(activeIds: readonly string[]): Promise<string[]> {
    const keep = new Set(activeIds);
    const rows =
      this.client.dialect === 'sqlite'
        ? await this.client.db
            .select({ id: sqliteSchema.guilds.id })
            .from(sqliteSchema.guilds)
            .where(eq(sqliteSchema.guilds.isActive, true))
        : await this.client.db
            .select({ id: pgSchema.guilds.id })
            .from(pgSchema.guilds)
            .where(eq(pgSchema.guilds.isActive, true));
    const stale = rows.map((row) => row.id).filter((id) => !keep.has(id));
    await this.markInactive(stale);
    return stale;
  }

  /**
   * Records a server from the dashboard invite flow: active, with `inviterId` as the inviter and
   * `oauth` as the source. The flow is authoritative, so it replaces any inviter the bot found
   * earlier; a later bot `upsert` of the active row keeps it. Join time rules are the same as
   * `upsert`'s.
   */
  async recordInvite(guild: GuildRegistration, inviterId: string): Promise<void> {
    await this.upsert(guild);
    const now = new Date();
    if (this.client.dialect === 'sqlite') {
      const table = sqliteSchema.guilds;
      await this.client.db
        .update(table)
        .set({ invitedById: inviterId, invitedVia: 'oauth', updatedAt: now })
        .where(eq(table.id, guild.id));
      return;
    }
    const table = pgSchema.guilds;
    await this.client.db
      .update(table)
      .set({ invitedById: inviterId, invitedVia: 'oauth', updatedAt: now })
      .where(eq(table.id, guild.id));
  }

  /**
   * Stores who invited the bot and how that was learned, only when no inviter is known yet.
   * Returns whether it did.
   */
  async setInviterIfMissing(id: string, userId: string, via: InviteSource): Promise<boolean> {
    const now = new Date();
    if (this.client.dialect === 'sqlite') {
      const table = sqliteSchema.guilds;
      const rows = await this.client.db
        .update(table)
        .set({ invitedById: userId, invitedVia: via, updatedAt: now })
        .where(and(eq(table.id, id), isNull(table.invitedById)))
        .returning({ id: table.id });
      return rows.length > 0;
    }
    const table = pgSchema.guilds;
    const rows = await this.client.db
      .update(table)
      .set({ invitedById: userId, invitedVia: via, updatedAt: now })
      .where(and(eq(table.id, id), isNull(table.invitedById)))
      .returning({ id: table.id });
    return rows.length > 0;
  }

  /** IDs of the active servers with no known inviter. */
  async listActiveIdsWithoutInviter(): Promise<string[]> {
    const rows =
      this.client.dialect === 'sqlite'
        ? await this.client.db
            .select({ id: sqliteSchema.guilds.id })
            .from(sqliteSchema.guilds)
            .where(
              and(eq(sqliteSchema.guilds.isActive, true), isNull(sqliteSchema.guilds.invitedById)),
            )
        : await this.client.db
            .select({ id: pgSchema.guilds.id })
            .from(pgSchema.guilds)
            .where(and(eq(pgSchema.guilds.isActive, true), isNull(pgSchema.guilds.invitedById)));
    return rows.map((row) => row.id);
  }

  /** Every server the bot knows, newest join first. */
  async listAll(): Promise<Guild[]> {
    if (this.client.dialect === 'sqlite') {
      const table = sqliteSchema.guilds;
      return this.client.db.select().from(table).orderBy(desc(table.joinedAt), table.id);
    }
    const table = pgSchema.guilds;
    return this.client.db.select().from(table).orderBy(desc(table.joinedAt), table.id);
  }

  /** One server, or null when the bot never recorded it. */
  async findById(id: string): Promise<Guild | null> {
    const [row] =
      this.client.dialect === 'sqlite'
        ? await this.client.db
            .select()
            .from(sqliteSchema.guilds)
            .where(eq(sqliteSchema.guilds.id, id))
        : await this.client.db.select().from(pgSchema.guilds).where(eq(pgSchema.guilds.id, id));
    return row ?? null;
  }
}
