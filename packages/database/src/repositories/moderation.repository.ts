import { eq, and, desc, gte, lt, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type { PaginationOptions, PaginatedResult } from './types.js';
import type {
  ModerationCase,
  NewModerationCase,
  ModerationWarning,
  NewModerationWarning,
  ModerationRule,
  NewModerationRule,
  ModerationNote,
  NewModerationNote,
} from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';

export interface ListCasesOptions extends PaginationOptions {
  targetUserId?: string | undefined;
  moderatorUserId?: string | undefined;
  type?: string | undefined;
  /** Only cases created at or after this time. */
  createdFrom?: Date | undefined;
  /** Only cases created before this time. */
  createdBefore?: Date | undefined;
  /**
   * Cursor: only cases numbered below this. `total` ignores it, so it stays the count of all
   * cases matching the filters.
   */
  beforeCaseNumber?: number | undefined;
}

export type InsertModerationCase = Omit<NewModerationCase, 'id' | 'caseNumber' | 'createdAt'> & {
  id?: string | undefined;
  caseNumber?: number | undefined;
  createdAt?: Date | undefined;
};

export type InsertModerationWarning = Omit<NewModerationWarning, 'id' | 'createdAt'> & {
  id?: string | undefined;
  createdAt?: Date | undefined;
};

export type InsertModerationNote = Omit<NewModerationNote, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string | undefined;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
};

export type InsertModerationRule = Omit<NewModerationRule, 'id'> & {
  id?: string | undefined;
};

export class ModerationRepository extends BaseRepository<
  ModerationCase,
  InsertModerationCase,
  Partial<NewModerationCase>
> {
  // --- BaseRepository Compliance ---

  async findById(id: string, tx?: DatabaseClient): Promise<ModerationCase | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.moderationCases)
        .where(eq(sqliteSchema.moderationCases.id, id));
      return (row as ModerationCase) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.moderationCases)
        .where(eq(pgSchema.moderationCases.id, id));
      return (row as unknown as ModerationCase) ?? null;
    }
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    const modCase = await this.findById(id, tx);
    return modCase !== null;
  }

  async create(data: InsertModerationCase, tx?: DatabaseClient): Promise<ModerationCase> {
    return this.createCase(data, tx);
  }

  async update(
    id: string,
    data: Partial<NewModerationCase>,
    tx?: DatabaseClient,
  ): Promise<ModerationCase> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [updated] = await client.db
        .update(sqliteSchema.moderationCases)
        .set(data)
        .where(eq(sqliteSchema.moderationCases.id, id))
        .returning();
      if (!updated) {
        throw new DatabaseError(`Failed to update moderation case with id ${id}`);
      }
      return updated as ModerationCase;
    } else {
      const [updated] = await client.db
        .update(pgSchema.moderationCases)
        .set(data as unknown as typeof pgSchema.moderationCases.$inferInsert)
        .where(eq(pgSchema.moderationCases.id, id))
        .returning();
      if (!updated) {
        throw new DatabaseError(`Failed to update moderation case with id ${id}`);
      }
      return updated as unknown as ModerationCase;
    }
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const result = await client.db
        .delete(sqliteSchema.moderationCases)
        .where(eq(sqliteSchema.moderationCases.id, id))
        .returning();
      return result.length > 0;
    } else {
      const result = await client.db
        .delete(pgSchema.moderationCases)
        .where(eq(pgSchema.moderationCases.id, id))
        .returning();
      return result.length > 0;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.moderationCases);
      return Number(row?.count ?? 0);
    } else {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.moderationCases);
      return Number(row?.count ?? 0);
    }
  }

  // --- Case Management ---

  /**
   * Calculates the next sequential case number for a guild.
   */
  async getNextCaseNumber(guildId: string, tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [result] = await client.db
        .select({ maxCase: sql<number>`COALESCE(MAX(${sqliteSchema.moderationCases.caseNumber}), 0)` })
        .from(sqliteSchema.moderationCases)
        .where(eq(sqliteSchema.moderationCases.guildId, guildId));
      return Number(result?.maxCase ?? 0) + 1;
    } else {
      const [result] = await client.db
        .select({ maxCase: sql<number>`COALESCE(MAX(${pgSchema.moderationCases.caseNumber}), 0)` })
        .from(pgSchema.moderationCases)
        .where(eq(pgSchema.moderationCases.guildId, guildId));
      return Number(result?.maxCase ?? 0) + 1;
    }
  }

  /**
   * Creates a new moderation case with auto-assigned sequential case number.
   */
  async createCase(data: InsertModerationCase, tx?: DatabaseClient): Promise<ModerationCase> {
    const client = this.getClient(tx);
    const id = data.id ?? randomUUID();
    const caseNumber = data.caseNumber ?? (await this.getNextCaseNumber(data.guildId, tx));

    if (this.isSqlite(client)) {
      const insertData: NewModerationCase = {
        id,
        guildId: data.guildId,
        caseNumber,
        type: data.type,
        targetUserId: data.targetUserId,
        moderatorUserId: data.moderatorUserId,
        reason: data.reason ?? 'No reason provided',
        durationSeconds: data.durationSeconds ?? null,
        metadata: data.metadata ?? {},
        createdAt: data.createdAt ?? new Date(),
      };
      const [created] = await client.db
        .insert(sqliteSchema.moderationCases)
        .values(insertData)
        .returning();
      if (!created) {
        throw new DatabaseError(`Failed to insert moderation case for guild ${data.guildId}`);
      }
      return created as ModerationCase;
    } else {
      const insertData = {
        id,
        guildId: data.guildId,
        caseNumber,
        type: data.type,
        targetUserId: data.targetUserId,
        moderatorUserId: data.moderatorUserId,
        reason: data.reason ?? 'No reason provided',
        durationSeconds: data.durationSeconds ?? null,
        metadata: data.metadata ?? {},
        createdAt: data.createdAt ?? new Date(),
      };
      const [created] = await client.db
        .insert(pgSchema.moderationCases)
        .values(insertData as unknown as typeof pgSchema.moderationCases.$inferInsert)
        .returning();
      if (!created) {
        throw new DatabaseError(`Failed to insert moderation case for guild ${data.guildId}`);
      }
      return created as unknown as ModerationCase;
    }
  }

  /**
   * Finds a case by guild ID and case number.
   */
  async getCaseByNumber(
    guildId: string,
    caseNumber: number,
    tx?: DatabaseClient,
  ): Promise<ModerationCase | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.moderationCases)
        .where(
          and(
            eq(sqliteSchema.moderationCases.guildId, guildId),
            eq(sqliteSchema.moderationCases.caseNumber, caseNumber),
          ),
        );
      return (row as ModerationCase) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.moderationCases)
        .where(
          and(
            eq(pgSchema.moderationCases.guildId, guildId),
            eq(pgSchema.moderationCases.caseNumber, caseNumber),
          ),
        );
      return (row as unknown as ModerationCase) ?? null;
    }
  }

  /**
   * Lists moderation cases for a guild with optional filters and pagination.
   */
  async listCases(
    guildId: string,
    options: ListCasesOptions = {},
    tx?: DatabaseClient,
  ): Promise<PaginatedResult<ModerationCase>> {
    const client = this.getClient(tx);
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);

    if (this.isSqlite(client)) {
      const conditions = [eq(sqliteSchema.moderationCases.guildId, guildId)];
      if (options.targetUserId) {
        conditions.push(eq(sqliteSchema.moderationCases.targetUserId, options.targetUserId));
      }
      if (options.moderatorUserId) {
        conditions.push(eq(sqliteSchema.moderationCases.moderatorUserId, options.moderatorUserId));
      }
      if (options.type) {
        conditions.push(eq(sqliteSchema.moderationCases.type, options.type));
      }
      if (options.createdFrom) {
        conditions.push(gte(sqliteSchema.moderationCases.createdAt, options.createdFrom));
      }
      if (options.createdBefore) {
        conditions.push(lt(sqliteSchema.moderationCases.createdAt, options.createdBefore));
      }

      const whereClause = and(...conditions);

      const [totalRow] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.moderationCases)
        .where(whereClause);
      const total = Number(totalRow?.count ?? 0);

      const items = await client.db
        .select()
        .from(sqliteSchema.moderationCases)
        .where(
          options.beforeCaseNumber === undefined
            ? whereClause
            : and(
                whereClause,
                lt(sqliteSchema.moderationCases.caseNumber, options.beforeCaseNumber),
              ),
        )
        .orderBy(desc(sqliteSchema.moderationCases.caseNumber))
        .limit(limit)
        .offset(offset);

      return {
        items: items as ModerationCase[],
        total,
        limit,
        offset,
      };
    } else {
      const conditions = [eq(pgSchema.moderationCases.guildId, guildId)];
      if (options.targetUserId) {
        conditions.push(eq(pgSchema.moderationCases.targetUserId, options.targetUserId));
      }
      if (options.moderatorUserId) {
        conditions.push(eq(pgSchema.moderationCases.moderatorUserId, options.moderatorUserId));
      }
      if (options.type) {
        conditions.push(eq(pgSchema.moderationCases.type, options.type));
      }
      if (options.createdFrom) {
        conditions.push(gte(pgSchema.moderationCases.createdAt, options.createdFrom));
      }
      if (options.createdBefore) {
        conditions.push(lt(pgSchema.moderationCases.createdAt, options.createdBefore));
      }

      const whereClause = and(...conditions);

      const [totalRow] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.moderationCases)
        .where(whereClause);
      const total = Number(totalRow?.count ?? 0);

      const items = await client.db
        .select()
        .from(pgSchema.moderationCases)
        .where(
          options.beforeCaseNumber === undefined
            ? whereClause
            : and(whereClause, lt(pgSchema.moderationCases.caseNumber, options.beforeCaseNumber)),
        )
        .orderBy(desc(pgSchema.moderationCases.caseNumber))
        .limit(limit)
        .offset(offset);

      return {
        items: items as unknown as ModerationCase[],
        total,
        limit,
        offset,
      };
    }
  }

  /** Case types recorded in a guild, for filters. */
  async listCaseTypes(guildId: string, tx?: DatabaseClient): Promise<string[]> {
    const client = this.getClient(tx);
    const rows = this.isSqlite(client)
      ? await client.db
          .selectDistinct({ type: sqliteSchema.moderationCases.type })
          .from(sqliteSchema.moderationCases)
          .where(eq(sqliteSchema.moderationCases.guildId, guildId))
      : await client.db
          .selectDistinct({ type: pgSchema.moderationCases.type })
          .from(pgSchema.moderationCases)
          .where(eq(pgSchema.moderationCases.guildId, guildId));
    return rows.map((row) => row.type).sort();
  }

  // --- Warning Management ---

  /**
   * Creates a formal warning.
   */
  async createWarning(
    data: InsertModerationWarning,
    tx?: DatabaseClient,
  ): Promise<ModerationWarning> {
    const client = this.getClient(tx);
    const id = data.id ?? randomUUID();

    if (this.isSqlite(client)) {
      const insertData: NewModerationWarning = {
        id,
        guildId: data.guildId,
        userId: data.userId,
        moderatorId: data.moderatorId,
        reason: data.reason,
        severity: data.severity ?? 1,
        isActive: data.isActive ?? true,
        expiresAt: data.expiresAt ?? null,
        createdAt: data.createdAt ?? new Date(),
      };
      const [created] = await client.db
        .insert(sqliteSchema.moderationWarnings)
        .values(insertData)
        .returning();
      if (!created) {
        throw new DatabaseError(`Failed to insert warning for user ${data.userId}`);
      }
      return created as ModerationWarning;
    } else {
      const insertData = {
        id,
        guildId: data.guildId,
        userId: data.userId,
        moderatorId: data.moderatorId,
        reason: data.reason,
        severity: data.severity ?? 1,
        isActive: data.isActive ?? true,
        expiresAt: data.expiresAt ?? null,
        createdAt: data.createdAt ?? new Date(),
      };
      const [created] = await client.db
        .insert(pgSchema.moderationWarnings)
        .values(insertData as unknown as typeof pgSchema.moderationWarnings.$inferInsert)
        .returning();
      if (!created) {
        throw new DatabaseError(`Failed to insert warning for user ${data.userId}`);
      }
      return created as unknown as ModerationWarning;
    }
  }

  /**
   * Retrieves all active warnings for a user in a guild.
   */
  async getActiveWarnings(
    guildId: string,
    userId: string,
    tx?: DatabaseClient,
  ): Promise<ModerationWarning[]> {
    const client = this.getClient(tx);
    const now = new Date();

    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.moderationWarnings)
        .where(
          and(
            eq(sqliteSchema.moderationWarnings.guildId, guildId),
            eq(sqliteSchema.moderationWarnings.userId, userId),
            eq(sqliteSchema.moderationWarnings.isActive, true),
          ),
        )
        .orderBy(desc(sqliteSchema.moderationWarnings.createdAt));

      // Filter out any warnings past their expiry timestamp
      return (rows as ModerationWarning[]).filter(
        (w) => !w.expiresAt || new Date(w.expiresAt).getTime() > now.getTime(),
      );
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.moderationWarnings)
        .where(
          and(
            eq(pgSchema.moderationWarnings.guildId, guildId),
            eq(pgSchema.moderationWarnings.userId, userId),
            eq(pgSchema.moderationWarnings.isActive, true),
          ),
        )
        .orderBy(desc(pgSchema.moderationWarnings.createdAt));

      return (rows as unknown as ModerationWarning[]).filter(
        (w) => !w.expiresAt || new Date(w.expiresAt).getTime() > now.getTime(),
      );
    }
  }

  /** Every warning a user received in a guild, active or not, newest first. */
  async listWarnings(
    guildId: string,
    userId: string,
    tx?: DatabaseClient,
  ): Promise<ModerationWarning[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.moderationWarnings)
        .where(
          and(
            eq(sqliteSchema.moderationWarnings.guildId, guildId),
            eq(sqliteSchema.moderationWarnings.userId, userId),
          ),
        )
        .orderBy(desc(sqliteSchema.moderationWarnings.createdAt));
      return rows as ModerationWarning[];
    }
    const rows = await client.db
      .select()
      .from(pgSchema.moderationWarnings)
      .where(
        and(
          eq(pgSchema.moderationWarnings.guildId, guildId),
          eq(pgSchema.moderationWarnings.userId, userId),
        ),
      )
      .orderBy(desc(pgSchema.moderationWarnings.createdAt));
    return rows as unknown as ModerationWarning[];
  }

  /**
   * Deactivates a specific warning by ID.
   */
  async deactivateWarning(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const updated = await client.db
        .update(sqliteSchema.moderationWarnings)
        .set({ isActive: false })
        .where(eq(sqliteSchema.moderationWarnings.id, id))
        .returning();
      return updated.length > 0;
    } else {
      const updated = await client.db
        .update(pgSchema.moderationWarnings)
        .set({ isActive: false })
        .where(eq(pgSchema.moderationWarnings.id, id))
        .returning();
      return updated.length > 0;
    }
  }

  /**
   * Clears (deactivates) all active warnings for a user in a guild.
   */
  async clearUserWarnings(guildId: string, userId: string, tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const updated = await client.db
        .update(sqliteSchema.moderationWarnings)
        .set({ isActive: false })
        .where(
          and(
            eq(sqliteSchema.moderationWarnings.guildId, guildId),
            eq(sqliteSchema.moderationWarnings.userId, userId),
            eq(sqliteSchema.moderationWarnings.isActive, true),
          ),
        )
        .returning();
      return updated.length;
    } else {
      const updated = await client.db
        .update(pgSchema.moderationWarnings)
        .set({ isActive: false })
        .where(
          and(
            eq(pgSchema.moderationWarnings.guildId, guildId),
            eq(pgSchema.moderationWarnings.userId, userId),
            eq(pgSchema.moderationWarnings.isActive, true),
          ),
        )
        .returning();
      return updated.length;
    }
  }

  // --- Staff Notes ---

  /**
   * Adds a staff note to a member.
   */
  async createNote(data: InsertModerationNote, tx?: DatabaseClient): Promise<ModerationNote> {
    const client = this.getClient(tx);
    const id = data.id ?? randomUUID();
    const now = new Date();

    if (this.isSqlite(client)) {
      const insertData: NewModerationNote = {
        id,
        guildId: data.guildId,
        targetUserId: data.targetUserId,
        authorUserId: data.authorUserId,
        content: data.content,
        createdAt: data.createdAt ?? now,
        updatedAt: data.updatedAt ?? now,
      };
      const [created] = await client.db
        .insert(sqliteSchema.moderationNotes)
        .values(insertData)
        .returning();
      if (!created) {
        throw new DatabaseError(`Failed to insert note for user ${data.targetUserId}`);
      }
      return created as ModerationNote;
    } else {
      const insertData = {
        id,
        guildId: data.guildId,
        targetUserId: data.targetUserId,
        authorUserId: data.authorUserId,
        content: data.content,
        createdAt: data.createdAt ?? now,
        updatedAt: data.updatedAt ?? now,
      };
      const [created] = await client.db
        .insert(pgSchema.moderationNotes)
        .values(insertData as unknown as typeof pgSchema.moderationNotes.$inferInsert)
        .returning();
      if (!created) {
        throw new DatabaseError(`Failed to insert note for user ${data.targetUserId}`);
      }
      return created as unknown as ModerationNote;
    }
  }

  /**
   * Retrieves all staff notes for a user in a guild.
   */
  async getNotesByUser(
    guildId: string,
    targetUserId: string,
    tx?: DatabaseClient,
  ): Promise<ModerationNote[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.moderationNotes)
        .where(
          and(
            eq(sqliteSchema.moderationNotes.guildId, guildId),
            eq(sqliteSchema.moderationNotes.targetUserId, targetUserId),
          ),
        )
        .orderBy(desc(sqliteSchema.moderationNotes.createdAt));
      return rows as ModerationNote[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.moderationNotes)
        .where(
          and(
            eq(pgSchema.moderationNotes.guildId, guildId),
            eq(pgSchema.moderationNotes.targetUserId, targetUserId),
          ),
        )
        .orderBy(desc(pgSchema.moderationNotes.createdAt));
      return rows as unknown as ModerationNote[];
    }
  }

  /**
   * Deletes a staff note by ID.
   */
  async deleteNote(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const result = await client.db
        .delete(sqliteSchema.moderationNotes)
        .where(eq(sqliteSchema.moderationNotes.id, id))
        .returning();
      return result.length > 0;
    } else {
      const result = await client.db
        .delete(pgSchema.moderationNotes)
        .where(eq(pgSchema.moderationNotes.id, id))
        .returning();
      return result.length > 0;
    }
  }

  // --- AutoMod Rules ---

  /**
   * Retrieves all moderation rules for a guild.
   */
  async getRules(guildId: string, tx?: DatabaseClient): Promise<ModerationRule[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.moderationRules)
        .where(eq(sqliteSchema.moderationRules.guildId, guildId));
      return rows as ModerationRule[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.moderationRules)
        .where(eq(pgSchema.moderationRules.guildId, guildId));
      return rows as unknown as ModerationRule[];
    }
  }

  /**
   * Retrieves a rule by rule type for a guild.
   */
  async getRuleByType(
    guildId: string,
    ruleType: string,
    tx?: DatabaseClient,
  ): Promise<ModerationRule | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.moderationRules)
        .where(
          and(
            eq(sqliteSchema.moderationRules.guildId, guildId),
            eq(sqliteSchema.moderationRules.ruleType, ruleType),
          ),
        );
      return (row as ModerationRule) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.moderationRules)
        .where(
          and(
            eq(pgSchema.moderationRules.guildId, guildId),
            eq(pgSchema.moderationRules.ruleType, ruleType),
          ),
        );
      return (row as unknown as ModerationRule) ?? null;
    }
  }

  /**
   * Upserts a moderation rule by guildId and ruleType.
   */
  async upsertRule(rule: InsertModerationRule, tx?: DatabaseClient): Promise<ModerationRule> {
    const client = this.getClient(tx);
    const existing = await this.getRuleByType(rule.guildId, rule.ruleType, tx);

    if (existing) {
      if (this.isSqlite(client)) {
        const [updated] = await client.db
          .update(sqliteSchema.moderationRules)
          .set({
            action: rule.action ?? existing.action,
            threshold: rule.threshold ?? existing.threshold,
            isEnabled: rule.isEnabled !== undefined ? rule.isEnabled : existing.isEnabled,
            exemptRoles: rule.exemptRoles ?? existing.exemptRoles,
            exemptChannels: rule.exemptChannels ?? existing.exemptChannels,
          })
          .where(eq(sqliteSchema.moderationRules.id, existing.id))
          .returning();
        return updated as ModerationRule;
      } else {
        const [updated] = await client.db
          .update(pgSchema.moderationRules)
          .set({
            action: rule.action ?? existing.action,
            threshold: rule.threshold ?? existing.threshold,
            isEnabled: rule.isEnabled !== undefined ? rule.isEnabled : existing.isEnabled,
            exemptRoles: rule.exemptRoles ?? existing.exemptRoles,
            exemptChannels: rule.exemptChannels ?? existing.exemptChannels,
          } as unknown as typeof pgSchema.moderationRules.$inferInsert)
          .where(eq(pgSchema.moderationRules.id, existing.id))
          .returning();
        return updated as unknown as ModerationRule;
      }
    } else {
      const id = rule.id ?? randomUUID();
      if (this.isSqlite(client)) {
        const [created] = await client.db
          .insert(sqliteSchema.moderationRules)
          .values({
            id,
            guildId: rule.guildId,
            ruleType: rule.ruleType,
            action: rule.action ?? 'WARN',
            threshold: rule.threshold ?? 3,
            isEnabled: rule.isEnabled !== undefined ? rule.isEnabled : true,
            exemptRoles: rule.exemptRoles ?? [],
            exemptChannels: rule.exemptChannels ?? [],
          })
          .returning();
        return created as ModerationRule;
      } else {
        const [created] = await client.db
          .insert(pgSchema.moderationRules)
          .values({
            id,
            guildId: rule.guildId,
            ruleType: rule.ruleType,
            action: rule.action ?? 'WARN',
            threshold: rule.threshold ?? 3,
            isEnabled: rule.isEnabled !== undefined ? rule.isEnabled : true,
            exemptRoles: rule.exemptRoles ?? [],
            exemptChannels: rule.exemptChannels ?? [],
          } as unknown as typeof pgSchema.moderationRules.$inferInsert)
          .returning();
        return created as unknown as ModerationRule;
      }
    }
  }
}
