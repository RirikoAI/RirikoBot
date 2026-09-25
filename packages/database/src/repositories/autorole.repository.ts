import { eq, and, lte, sql } from 'drizzle-orm';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type {
  GuildAutoRole,
  NewGuildAutoRole,
  TemporaryRole,
  NewTemporaryRole,
} from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';
import { randomUUID } from 'node:crypto';

export class AutoRoleRepository extends BaseRepository<
  GuildAutoRole,
  NewGuildAutoRole,
  Partial<NewGuildAutoRole>
> {
  // ==========================================
  // Guild AutoRoles Configuration
  // ==========================================

  async getGuildAutoRoles(guildId: string, tx?: DatabaseClient): Promise<GuildAutoRole | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.guildAutoRoles)
        .where(eq(sqliteSchema.guildAutoRoles.guildId, guildId));
      return (row as GuildAutoRole) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.guildAutoRoles)
        .where(eq(pgSchema.guildAutoRoles.guildId, guildId));
      return (row as unknown as GuildAutoRole) ?? null;
    }
  }

  async upsertGuildAutoRoles(data: NewGuildAutoRole, tx?: DatabaseClient): Promise<GuildAutoRole> {
    const client = this.getClient(tx);
    const now = new Date();
    const payload = {
      ...data,
      updatedAt: now,
    };

    if (this.isSqlite(client)) {
      const [upserted] = await client.db
        .insert(sqliteSchema.guildAutoRoles)
        .values(payload)
        .onConflictDoUpdate({
          target: sqliteSchema.guildAutoRoles.guildId,
          set: payload,
        })
        .returning();
      if (!upserted)
        throw new DatabaseError(`Failed to upsert auto-roles for guild ${data.guildId}`);
      return upserted as GuildAutoRole;
    } else {
      const [upserted] = await client.db
        .insert(pgSchema.guildAutoRoles)
        .values(payload as unknown as typeof pgSchema.guildAutoRoles.$inferInsert)
        .onConflictDoUpdate({
          target: pgSchema.guildAutoRoles.guildId,
          set: payload as unknown as Partial<typeof pgSchema.guildAutoRoles.$inferInsert>,
        })
        .returning();
      if (!upserted)
        throw new DatabaseError(`Failed to upsert auto-roles for guild ${data.guildId}`);
      return upserted as unknown as GuildAutoRole;
    }
  }

  async setHumanRoleIds(
    guildId: string,
    roleIds: string[],
    tx?: DatabaseClient,
  ): Promise<GuildAutoRole> {
    return this.upsertGuildAutoRoles({ guildId, humanRoleIds: roleIds }, tx);
  }

  async setBotRoleIds(
    guildId: string,
    roleIds: string[],
    tx?: DatabaseClient,
  ): Promise<GuildAutoRole> {
    return this.upsertGuildAutoRoles({ guildId, botRoleIds: roleIds }, tx);
  }

  async setVerificationRole(
    guildId: string,
    roleId: string | null,
    channelId?: string | null,
    messageId?: string | null,
    tx?: DatabaseClient,
  ): Promise<GuildAutoRole> {
    return this.upsertGuildAutoRoles(
      {
        guildId,
        verificationRoleId: roleId,
        verificationChannelId: channelId,
        verificationMessageId: messageId,
      },
      tx,
    );
  }

  // ==========================================
  // Temporary Expiring Roles
  // ==========================================

  async addTemporaryRole(data: NewTemporaryRole, tx?: DatabaseClient): Promise<TemporaryRole> {
    const client = this.getClient(tx);
    const id = data.id || randomUUID();
    const payload = { ...data, id };

    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.temporaryRoles)
        .values(payload)
        .returning();
      if (!created) throw new DatabaseError('Failed to record temporary role');
      return created as TemporaryRole;
    } else {
      const [created] = await client.db
        .insert(pgSchema.temporaryRoles)
        .values(payload as unknown as typeof pgSchema.temporaryRoles.$inferInsert)
        .returning();
      if (!created) throw new DatabaseError('Failed to record temporary role');
      return created as unknown as TemporaryRole;
    }
  }

  async findExpiredTemporaryRoles(
    beforeTimestamp: Date = new Date(),
    tx?: DatabaseClient,
  ): Promise<TemporaryRole[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.temporaryRoles)
        .where(lte(sqliteSchema.temporaryRoles.expiresAt, beforeTimestamp));
      return rows as TemporaryRole[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.temporaryRoles)
        .where(lte(pgSchema.temporaryRoles.expiresAt, beforeTimestamp));
      return rows as unknown as TemporaryRole[];
    }
  }

  async removeTemporaryRole(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const result = await client.db
        .delete(sqliteSchema.temporaryRoles)
        .where(eq(sqliteSchema.temporaryRoles.id, id))
        .returning();
      return result.length > 0;
    } else {
      const result = await client.db
        .delete(pgSchema.temporaryRoles)
        .where(eq(pgSchema.temporaryRoles.id, id))
        .returning();
      return result.length > 0;
    }
  }

  async listTemporaryRoles(guildId: string, tx?: DatabaseClient): Promise<TemporaryRole[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.temporaryRoles)
        .where(eq(sqliteSchema.temporaryRoles.guildId, guildId));
      return rows as TemporaryRole[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.temporaryRoles)
        .where(eq(pgSchema.temporaryRoles.guildId, guildId));
      return rows as unknown as TemporaryRole[];
    }
  }

  async findTemporaryRolesByUser(
    guildId: string,
    userId: string,
    tx?: DatabaseClient,
  ): Promise<TemporaryRole[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.temporaryRoles)
        .where(
          and(
            eq(sqliteSchema.temporaryRoles.guildId, guildId),
            eq(sqliteSchema.temporaryRoles.userId, userId),
          ),
        );
      return rows as TemporaryRole[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.temporaryRoles)
        .where(
          and(
            eq(pgSchema.temporaryRoles.guildId, guildId),
            eq(pgSchema.temporaryRoles.userId, userId),
          ),
        );
      return rows as unknown as TemporaryRole[];
    }
  }

  async findTemporaryRole(
    guildId: string,
    userId: string,
    roleId: string,
    tx?: DatabaseClient,
  ): Promise<TemporaryRole | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.temporaryRoles)
        .where(
          and(
            eq(sqliteSchema.temporaryRoles.guildId, guildId),
            eq(sqliteSchema.temporaryRoles.userId, userId),
            eq(sqliteSchema.temporaryRoles.roleId, roleId),
          ),
        );
      return (row as TemporaryRole) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.temporaryRoles)
        .where(
          and(
            eq(pgSchema.temporaryRoles.guildId, guildId),
            eq(pgSchema.temporaryRoles.userId, userId),
            eq(pgSchema.temporaryRoles.roleId, roleId),
          ),
        );
      return (row as unknown as TemporaryRole) ?? null;
    }
  }

  // ==========================================
  // BaseRepository Lifecycle Implementations
  // ==========================================

  async findById(guildId: string, tx?: DatabaseClient): Promise<GuildAutoRole | null> {
    return this.getGuildAutoRoles(guildId, tx);
  }

  async exists(guildId: string, tx?: DatabaseClient): Promise<boolean> {
    const config = await this.findById(guildId, tx);
    return config !== null;
  }

  async create(data: NewGuildAutoRole, tx?: DatabaseClient): Promise<GuildAutoRole> {
    return this.upsertGuildAutoRoles(data, tx);
  }

  async update(
    guildId: string,
    data: Partial<NewGuildAutoRole>,
    tx?: DatabaseClient,
  ): Promise<GuildAutoRole> {
    return this.upsertGuildAutoRoles({ ...data, guildId }, tx);
  }

  async delete(guildId: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const result = await client.db
        .delete(sqliteSchema.guildAutoRoles)
        .where(eq(sqliteSchema.guildAutoRoles.guildId, guildId))
        .returning();
      return result.length > 0;
    } else {
      const result = await client.db
        .delete(pgSchema.guildAutoRoles)
        .where(eq(pgSchema.guildAutoRoles.guildId, guildId))
        .returning();
      return result.length > 0;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [result] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.guildAutoRoles);
      return Number(result?.count ?? 0);
    } else {
      const [result] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.guildAutoRoles);
      return Number(result?.count ?? 0);
    }
  }
}
