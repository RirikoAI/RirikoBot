import { eq, and, sql } from 'drizzle-orm';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type { ReactionRole, NewReactionRole } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';
import { randomUUID } from 'node:crypto';

export class ReactionRoleRepository extends BaseRepository<
  ReactionRole,
  NewReactionRole,
  Partial<NewReactionRole>
> {
  async findById(id: string, tx?: DatabaseClient): Promise<ReactionRole | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.reactionRoles)
        .where(eq(sqliteSchema.reactionRoles.id, id));
      return (row as ReactionRole) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.reactionRoles)
        .where(eq(pgSchema.reactionRoles.id, id));
      return (row as unknown as ReactionRole) ?? null;
    }
  }

  async findByMessageAndEmoji(
    messageId: string,
    emojiOrComponentId: string,
    tx?: DatabaseClient,
  ): Promise<ReactionRole | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.reactionRoles)
        .where(
          and(
            eq(sqliteSchema.reactionRoles.messageId, messageId),
            eq(sqliteSchema.reactionRoles.emojiOrComponentId, emojiOrComponentId),
          ),
        );
      return (row as ReactionRole) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.reactionRoles)
        .where(
          and(
            eq(pgSchema.reactionRoles.messageId, messageId),
            eq(pgSchema.reactionRoles.emojiOrComponentId, emojiOrComponentId),
          ),
        );
      return (row as unknown as ReactionRole) ?? null;
    }
  }

  async findByMessageId(messageId: string, tx?: DatabaseClient): Promise<ReactionRole[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.reactionRoles)
        .where(eq(sqliteSchema.reactionRoles.messageId, messageId));
      return rows as ReactionRole[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.reactionRoles)
        .where(eq(pgSchema.reactionRoles.messageId, messageId));
      return rows as unknown as ReactionRole[];
    }
  }

  async findByGuildId(guildId: string, tx?: DatabaseClient): Promise<ReactionRole[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.reactionRoles)
        .where(eq(sqliteSchema.reactionRoles.guildId, guildId));
      return rows as ReactionRole[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.reactionRoles)
        .where(eq(pgSchema.reactionRoles.guildId, guildId));
      return rows as unknown as ReactionRole[];
    }
  }

  async findByGroup(guildId: string, groupId: string, tx?: DatabaseClient): Promise<ReactionRole[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.reactionRoles)
        .where(
          and(
            eq(sqliteSchema.reactionRoles.guildId, guildId),
            eq(sqliteSchema.reactionRoles.groupId, groupId),
          ),
        );
      return rows as ReactionRole[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.reactionRoles)
        .where(
          and(
            eq(pgSchema.reactionRoles.guildId, guildId),
            eq(pgSchema.reactionRoles.groupId, groupId),
          ),
        );
      return rows as unknown as ReactionRole[];
    }
  }

  async create(data: NewReactionRole, tx?: DatabaseClient): Promise<ReactionRole> {
    const client = this.getClient(tx);
    const id = data.id || randomUUID();
    const payload = { ...data, id };

    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.reactionRoles)
        .values(payload)
        .returning();
      if (!created) throw new DatabaseError('Failed to create reaction role');
      return created as ReactionRole;
    } else {
      const [created] = await client.db
        .insert(pgSchema.reactionRoles)
        .values(payload as unknown as typeof pgSchema.reactionRoles.$inferInsert)
        .returning();
      if (!created) throw new DatabaseError('Failed to create reaction role');
      return created as unknown as ReactionRole;
    }
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const result = await client.db
        .delete(sqliteSchema.reactionRoles)
        .where(eq(sqliteSchema.reactionRoles.id, id))
        .returning();
      return result.length > 0;
    } else {
      const result = await client.db
        .delete(pgSchema.reactionRoles)
        .where(eq(pgSchema.reactionRoles.id, id))
        .returning();
      return result.length > 0;
    }
  }

  async deleteByMessageId(messageId: string, tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const result = await client.db
        .delete(sqliteSchema.reactionRoles)
        .where(eq(sqliteSchema.reactionRoles.messageId, messageId))
        .returning();
      return result.length;
    } else {
      const result = await client.db
        .delete(pgSchema.reactionRoles)
        .where(eq(pgSchema.reactionRoles.messageId, messageId))
        .returning();
      return result.length;
    }
  }

  async deleteByMessageAndEmoji(
    messageId: string,
    emojiOrComponentId: string,
    tx?: DatabaseClient,
  ): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const result = await client.db
        .delete(sqliteSchema.reactionRoles)
        .where(
          and(
            eq(sqliteSchema.reactionRoles.messageId, messageId),
            eq(sqliteSchema.reactionRoles.emojiOrComponentId, emojiOrComponentId),
          ),
        );
      return (result as unknown as { changes?: number }).changes !== undefined
        ? ((result as unknown as { changes: number }).changes > 0)
        : true;
    } else {
      const result = await client.db
        .delete(pgSchema.reactionRoles)
        .where(
          and(
            eq(pgSchema.reactionRoles.messageId, messageId),
            eq(pgSchema.reactionRoles.emojiOrComponentId, emojiOrComponentId),
          ),
        )
        .returning();
      return result.length > 0;
    }
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    const record = await this.findById(id, tx);
    return record !== null;
  }

  async update(
    id: string,
    data: Partial<NewReactionRole>,
    tx?: DatabaseClient,
  ): Promise<ReactionRole> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [updated] = await client.db
        .update(sqliteSchema.reactionRoles)
        .set(data)
        .where(eq(sqliteSchema.reactionRoles.id, id))
        .returning();
      if (!updated) {
        throw new DatabaseError(`Reaction role with id ${id} not found for update`);
      }
      return updated as ReactionRole;
    } else {
      const [updated] = await client.db
        .update(pgSchema.reactionRoles)
        .set(data as unknown as Partial<typeof pgSchema.reactionRoles.$inferInsert>)
        .where(eq(pgSchema.reactionRoles.id, id))
        .returning();
      if (!updated) {
        throw new DatabaseError(`Reaction role with id ${id} not found for update`);
      }
      return updated as unknown as ReactionRole;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [result] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.reactionRoles);
      return Number(result?.count ?? 0);
    } else {
      const [result] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.reactionRoles);
      return Number(result?.count ?? 0);
    }
  }
}
