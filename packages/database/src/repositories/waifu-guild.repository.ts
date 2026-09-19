import { eq, and, desc, sql, count } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type {
  WaifuGuild,
  NewWaifuGuild,
  WaifuGuildMember,
  NewWaifuGuildMember,
} from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';

export class WaifuGuildRepository extends BaseRepository<
  WaifuGuild,
  NewWaifuGuild,
  Partial<NewWaifuGuild>
> {
  private normalizeGuild(row: Record<string, unknown>): WaifuGuild {
    return {
      id: String(row['id']),
      name: String(row['name']),
      leaderUserId: String(row['leaderUserId']),
      level: Number(row['level'] ?? 1),
      guildXp: Number(row['guildXp'] ?? 0),
      guildBank: Number(row['guildBank'] ?? 0),
      createdAt:
        row['createdAt'] instanceof Date
          ? row['createdAt']
          : new Date(row['createdAt'] as string | number),
    } as unknown as WaifuGuild;
  }

  private normalizeMember(row: Record<string, unknown>): WaifuGuildMember {
    return {
      guildId: String(row['guildId']),
      userId: String(row['userId']),
      rank: String(row['rank'] ?? 'MEMBER'),
      contributionXp: Number(row['contributionXp'] ?? 0),
      joinedAt:
        row['joinedAt'] instanceof Date
          ? row['joinedAt']
          : new Date(row['joinedAt'] as string | number),
    } as unknown as WaifuGuildMember;
  }

  async findById(id: string, tx?: DatabaseClient): Promise<WaifuGuild | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.waifuGuilds)
        .where(eq(sqliteSchema.waifuGuilds.id, id));
      return row ? this.normalizeGuild(row as unknown as Record<string, unknown>) : null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.waifuGuilds)
        .where(eq(pgSchema.waifuGuilds.id, id));
      return row ? this.normalizeGuild(row as unknown as Record<string, unknown>) : null;
    }
  }

  async findByName(name: string, tx?: DatabaseClient): Promise<WaifuGuild | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.waifuGuilds)
        .where(eq(sqliteSchema.waifuGuilds.name, name));
      return row ? this.normalizeGuild(row as unknown as Record<string, unknown>) : null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.waifuGuilds)
        .where(eq(pgSchema.waifuGuilds.name, name));
      return row ? this.normalizeGuild(row as unknown as Record<string, unknown>) : null;
    }
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    const guild = await this.findById(id, tx);
    return guild !== null;
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.waifuGuilds);
      return Number(row?.count ?? 0);
    } else {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.waifuGuilds);
      return Number(row?.count ?? 0);
    }
  }

  async create(data: NewWaifuGuild, tx?: DatabaseClient): Promise<WaifuGuild> {
    const client = this.getClient(tx);
    const id = data.id ?? randomUUID();
    const now = new Date();

    if (this.isSqlite(client)) {
      const [row] = await client.db
        .insert(sqliteSchema.waifuGuilds)
        .values({
          id,
          name: data.name,
          leaderUserId: data.leaderUserId,
          level: data.level ?? 1,
          guildXp: data.guildXp ?? 0,
          guildBank: data.guildBank ?? 0,
          createdAt: now,
        })
        .returning();

      if (!row) {
        throw new DatabaseError('Failed to create WaifuGuild');
      }
      return this.normalizeGuild(row as unknown as Record<string, unknown>);
    } else {
      const [row] = await client.db
        .insert(pgSchema.waifuGuilds)
        .values({
          id,
          name: data.name,
          leaderUserId: data.leaderUserId,
          level: data.level ?? 1,
          guildXp: BigInt(data.guildXp ?? 0),
          guildBank: BigInt(data.guildBank ?? 0),
          createdAt: now,
        } as unknown as typeof pgSchema.waifuGuilds.$inferInsert)
        .returning();

      if (!row) {
        throw new DatabaseError('Failed to create WaifuGuild');
      }
      return this.normalizeGuild(row as unknown as Record<string, unknown>);
    }
  }

  async update(id: string, data: Partial<NewWaifuGuild>, tx?: DatabaseClient): Promise<WaifuGuild> {
    const client = this.getClient(tx);
    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData['name'] = data.name;
    if (data.leaderUserId !== undefined) updateData['leaderUserId'] = data.leaderUserId;
    if (data.level !== undefined) updateData['level'] = data.level;
    if (data.guildXp !== undefined) updateData['guildXp'] = data.guildXp;
    if (data.guildBank !== undefined) updateData['guildBank'] = data.guildBank;

    if (this.isSqlite(client)) {
      const [row] = await client.db
        .update(sqliteSchema.waifuGuilds)
        .set(updateData)
        .where(eq(sqliteSchema.waifuGuilds.id, id))
        .returning();
      if (!row) {
        throw new DatabaseError(`WaifuGuild with id ${id} not found`);
      }
      return this.normalizeGuild(row as unknown as Record<string, unknown>);
    } else {
      const [row] = await client.db
        .update(pgSchema.waifuGuilds)
        .set(updateData)
        .where(eq(pgSchema.waifuGuilds.id, id))
        .returning();
      if (!row) {
        throw new DatabaseError(`WaifuGuild with id ${id} not found`);
      }
      return this.normalizeGuild(row as unknown as Record<string, unknown>);
    }
  }

  async addGuildXp(id: string, amount: number, tx?: DatabaseClient): Promise<WaifuGuild> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .update(sqliteSchema.waifuGuilds)
        .set({
          guildXp: sql`${sqliteSchema.waifuGuilds.guildXp} + ${amount}`,
        })
        .where(eq(sqliteSchema.waifuGuilds.id, id))
        .returning();
      if (!row) throw new DatabaseError(`WaifuGuild with id ${id} not found`);
      return this.normalizeGuild(row as unknown as Record<string, unknown>);
    } else {
      const [row] = await client.db
        .update(pgSchema.waifuGuilds)
        .set({
          guildXp: sql`${pgSchema.waifuGuilds.guildXp} + ${amount}`,
        })
        .where(eq(pgSchema.waifuGuilds.id, id))
        .returning();
      if (!row) throw new DatabaseError(`WaifuGuild with id ${id} not found`);
      return this.normalizeGuild(row as unknown as Record<string, unknown>);
    }
  }

  async modifyGuildBank(id: string, delta: number, tx?: DatabaseClient): Promise<WaifuGuild> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .update(sqliteSchema.waifuGuilds)
        .set({
          guildBank: sql`${sqliteSchema.waifuGuilds.guildBank} + ${delta}`,
        })
        .where(eq(sqliteSchema.waifuGuilds.id, id))
        .returning();
      if (!row) throw new DatabaseError(`WaifuGuild with id ${id} not found`);
      return this.normalizeGuild(row as unknown as Record<string, unknown>);
    } else {
      const [row] = await client.db
        .update(pgSchema.waifuGuilds)
        .set({
          guildBank: sql`${pgSchema.waifuGuilds.guildBank} + ${delta}`,
        })
        .where(eq(pgSchema.waifuGuilds.id, id))
        .returning();
      if (!row) throw new DatabaseError(`WaifuGuild with id ${id} not found`);
      return this.normalizeGuild(row as unknown as Record<string, unknown>);
    }
  }

  async listGuildsByRank(limit = 10, offset = 0, tx?: DatabaseClient): Promise<WaifuGuild[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.waifuGuilds)
        .orderBy(desc(sqliteSchema.waifuGuilds.level), desc(sqliteSchema.waifuGuilds.guildXp))
        .limit(limit)
        .offset(offset);
      return rows.map((r) => this.normalizeGuild(r as unknown as Record<string, unknown>));
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.waifuGuilds)
        .orderBy(desc(pgSchema.waifuGuilds.level), desc(pgSchema.waifuGuilds.guildXp))
        .limit(limit)
        .offset(offset);
      return rows.map((r) => this.normalizeGuild(r as unknown as Record<string, unknown>));
    }
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      await client.db
        .delete(sqliteSchema.waifuGuildMembers)
        .where(eq(sqliteSchema.waifuGuildMembers.guildId, id));
      const res = await client.db
        .delete(sqliteSchema.waifuGuilds)
        .where(eq(sqliteSchema.waifuGuilds.id, id));
      return res.changes > 0;
    } else {
      await client.db
        .delete(pgSchema.waifuGuildMembers)
        .where(eq(pgSchema.waifuGuildMembers.guildId, id));
      const res = await client.db
        .delete(pgSchema.waifuGuilds)
        .where(eq(pgSchema.waifuGuilds.id, id));
      return (res.rowCount ?? 0) > 0;
    }
  }

  // --- Member Methods ---

  async addMember(
    data: { guildId: string; userId: string; rank?: 'LEADER' | 'OFFICER' | 'MEMBER' },
    tx?: DatabaseClient,
  ): Promise<WaifuGuildMember> {
    const client = this.getClient(tx);
    const now = new Date();
    const rank = data.rank ?? 'MEMBER';

    if (this.isSqlite(client)) {
      const [row] = await client.db
        .insert(sqliteSchema.waifuGuildMembers)
        .values({
          guildId: data.guildId,
          userId: data.userId,
          rank,
          contributionXp: 0,
          joinedAt: now,
        })
        .returning();
      if (!row) throw new DatabaseError('Failed to add guild member');
      return this.normalizeMember(row as unknown as Record<string, unknown>);
    } else {
      const [row] = await client.db
        .insert(pgSchema.waifuGuildMembers)
        .values({
          guildId: data.guildId,
          userId: data.userId,
          rank,
          contributionXp: 0n,
          joinedAt: now,
        } as unknown as typeof pgSchema.waifuGuildMembers.$inferInsert)
        .returning();
      if (!row) throw new DatabaseError('Failed to add guild member');
      return this.normalizeMember(row as unknown as Record<string, unknown>);
    }
  }

  async findMember(
    guildId: string,
    userId: string,
    tx?: DatabaseClient,
  ): Promise<WaifuGuildMember | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.waifuGuildMembers)
        .where(
          and(
            eq(sqliteSchema.waifuGuildMembers.guildId, guildId),
            eq(sqliteSchema.waifuGuildMembers.userId, userId),
          ),
        );
      return row ? this.normalizeMember(row as unknown as Record<string, unknown>) : null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.waifuGuildMembers)
        .where(
          and(
            eq(pgSchema.waifuGuildMembers.guildId, guildId),
            eq(pgSchema.waifuGuildMembers.userId, userId),
          ),
        );
      return row ? this.normalizeMember(row as unknown as Record<string, unknown>) : null;
    }
  }

  async findUserGuild(
    userId: string,
    tx?: DatabaseClient,
  ): Promise<{ guild: WaifuGuild; member: WaifuGuildMember } | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [memberRow] = await client.db
        .select()
        .from(sqliteSchema.waifuGuildMembers)
        .where(eq(sqliteSchema.waifuGuildMembers.userId, userId));
      if (!memberRow) return null;

      const [guildRow] = await client.db
        .select()
        .from(sqliteSchema.waifuGuilds)
        .where(eq(sqliteSchema.waifuGuilds.id, memberRow.guildId));
      if (!guildRow) return null;

      return {
        guild: this.normalizeGuild(guildRow as unknown as Record<string, unknown>),
        member: this.normalizeMember(memberRow as unknown as Record<string, unknown>),
      };
    } else {
      const [memberRow] = await client.db
        .select()
        .from(pgSchema.waifuGuildMembers)
        .where(eq(pgSchema.waifuGuildMembers.userId, userId));
      if (!memberRow) return null;

      const [guildRow] = await client.db
        .select()
        .from(pgSchema.waifuGuilds)
        .where(eq(pgSchema.waifuGuilds.id, memberRow.guildId));
      if (!guildRow) return null;

      return {
        guild: this.normalizeGuild(guildRow as unknown as Record<string, unknown>),
        member: this.normalizeMember(memberRow as unknown as Record<string, unknown>),
      };
    }
  }

  async listMembers(
    guildId: string,
    limit = 50,
    offset = 0,
    tx?: DatabaseClient,
  ): Promise<WaifuGuildMember[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.waifuGuildMembers)
        .where(eq(sqliteSchema.waifuGuildMembers.guildId, guildId))
        .orderBy(desc(sqliteSchema.waifuGuildMembers.contributionXp))
        .limit(limit)
        .offset(offset);
      return rows.map((r) => this.normalizeMember(r as unknown as Record<string, unknown>));
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.waifuGuildMembers)
        .where(eq(pgSchema.waifuGuildMembers.guildId, guildId))
        .orderBy(desc(pgSchema.waifuGuildMembers.contributionXp))
        .limit(limit)
        .offset(offset);
      return rows.map((r) => this.normalizeMember(r as unknown as Record<string, unknown>));
    }
  }

  async updateMemberRank(
    guildId: string,
    userId: string,
    rank: 'LEADER' | 'OFFICER' | 'MEMBER',
    tx?: DatabaseClient,
  ): Promise<WaifuGuildMember> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .update(sqliteSchema.waifuGuildMembers)
        .set({ rank })
        .where(
          and(
            eq(sqliteSchema.waifuGuildMembers.guildId, guildId),
            eq(sqliteSchema.waifuGuildMembers.userId, userId),
          ),
        )
        .returning();
      if (!row) throw new DatabaseError('Guild member not found');
      return this.normalizeMember(row as unknown as Record<string, unknown>);
    } else {
      const [row] = await client.db
        .update(pgSchema.waifuGuildMembers)
        .set({ rank })
        .where(
          and(
            eq(pgSchema.waifuGuildMembers.guildId, guildId),
            eq(pgSchema.waifuGuildMembers.userId, userId),
          ),
        )
        .returning();
      if (!row) throw new DatabaseError('Guild member not found');
      return this.normalizeMember(row as unknown as Record<string, unknown>);
    }
  }

  async addContributionXp(
    guildId: string,
    userId: string,
    amount: number,
    tx?: DatabaseClient,
  ): Promise<WaifuGuildMember> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .update(sqliteSchema.waifuGuildMembers)
        .set({
          contributionXp: sql`${sqliteSchema.waifuGuildMembers.contributionXp} + ${amount}`,
        })
        .where(
          and(
            eq(sqliteSchema.waifuGuildMembers.guildId, guildId),
            eq(sqliteSchema.waifuGuildMembers.userId, userId),
          ),
        )
        .returning();
      if (!row) throw new DatabaseError('Guild member not found');
      return this.normalizeMember(row as unknown as Record<string, unknown>);
    } else {
      const [row] = await client.db
        .update(pgSchema.waifuGuildMembers)
        .set({
          contributionXp: sql`${pgSchema.waifuGuildMembers.contributionXp} + ${amount}`,
        })
        .where(
          and(
            eq(pgSchema.waifuGuildMembers.guildId, guildId),
            eq(pgSchema.waifuGuildMembers.userId, userId),
          ),
        )
        .returning();
      if (!row) throw new DatabaseError('Guild member not found');
      return this.normalizeMember(row as unknown as Record<string, unknown>);
    }
  }

  async removeMember(guildId: string, userId: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const res = await client.db
        .delete(sqliteSchema.waifuGuildMembers)
        .where(
          and(
            eq(sqliteSchema.waifuGuildMembers.guildId, guildId),
            eq(sqliteSchema.waifuGuildMembers.userId, userId),
          ),
        );
      return res.changes > 0;
    } else {
      const res = await client.db
        .delete(pgSchema.waifuGuildMembers)
        .where(
          and(
            eq(pgSchema.waifuGuildMembers.guildId, guildId),
            eq(pgSchema.waifuGuildMembers.userId, userId),
          ),
        );
      return (res.rowCount ?? 0) > 0;
    }
  }

  async countMembers(guildId: string, tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select({ total: count() })
        .from(sqliteSchema.waifuGuildMembers)
        .where(eq(sqliteSchema.waifuGuildMembers.guildId, guildId));
      return Number(row?.total ?? 0);
    } else {
      const [row] = await client.db
        .select({ total: count() })
        .from(pgSchema.waifuGuildMembers)
        .where(eq(pgSchema.waifuGuildMembers.guildId, guildId));
      return Number(row?.total ?? 0);
    }
  }
}
