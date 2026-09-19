import { eq, and, or, desc, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type { CardTrade, NewCardTrade } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';

export type TradeStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

export class CardTradeRepository extends BaseRepository<
  CardTrade,
  NewCardTrade,
  Partial<NewCardTrade>
> {
  private normalizeTrade(row: Record<string, unknown>): CardTrade {
    return {
      id: String(row['id']),
      senderUserId: String(row['senderUserId']),
      receiverUserId: String(row['receiverUserId']),
      offeredCardIds: (row['offeredCardIds'] as string[]) ?? [],
      requestedCardIds: (row['requestedCardIds'] as string[]) ?? [],
      offeredCredits: Number(row['offeredCredits'] ?? 0),
      requestedCredits: Number(row['requestedCredits'] ?? 0),
      status: String(row['status']),
      createdAt: row['createdAt'] instanceof Date ? row['createdAt'] : new Date(row['createdAt'] as string | number),
      resolvedAt: row['resolvedAt']
        ? row['resolvedAt'] instanceof Date
          ? row['resolvedAt']
          : new Date(row['resolvedAt'] as string | number)
        : null,
    } as unknown as CardTrade;
  }

  async findById(id: string, tx?: DatabaseClient): Promise<CardTrade | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.cardTrades)
        .where(eq(sqliteSchema.cardTrades.id, id));
      return row ? this.normalizeTrade(row as unknown as Record<string, unknown>) : null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.cardTrades)
        .where(eq(pgSchema.cardTrades.id, id));
      return row ? this.normalizeTrade(row as unknown as Record<string, unknown>) : null;
    }
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    const trade = await this.findById(id, tx);
    return trade !== null;
  }

  async create(data: NewCardTrade, tx?: DatabaseClient): Promise<CardTrade> {
    const client = this.getClient(tx);
    const id = data.id ?? randomUUID();

    try {
      if (this.isSqlite(client)) {
        const [row] = await client.db
          .insert(sqliteSchema.cardTrades)
          .values({
            id,
            senderUserId: data.senderUserId,
            receiverUserId: data.receiverUserId,
            offeredCardIds: data.offeredCardIds ?? [],
            requestedCardIds: data.requestedCardIds ?? [],
            offeredCredits: Number(data.offeredCredits ?? 0),
            requestedCredits: Number(data.requestedCredits ?? 0),
            status: data.status ?? 'PENDING',
            createdAt: data.createdAt ?? new Date(),
            resolvedAt: data.resolvedAt ?? null,
          })
          .returning();
        if (!row) throw new DatabaseError('Failed to insert trade in SQLite');
        return this.normalizeTrade(row as unknown as Record<string, unknown>);
      } else {
        const [row] = await client.db
          .insert(pgSchema.cardTrades)
          .values({
            id,
            senderUserId: data.senderUserId,
            receiverUserId: data.receiverUserId,
            offeredCardIds: data.offeredCardIds ?? [],
            requestedCardIds: data.requestedCardIds ?? [],
            offeredCredits: BigInt(data.offeredCredits ?? 0),
            requestedCredits: BigInt(data.requestedCredits ?? 0),
            status: data.status ?? 'PENDING',
            createdAt: data.createdAt ?? new Date(),
            resolvedAt: data.resolvedAt ?? null,
          })
          .returning();
        if (!row) throw new DatabaseError('Failed to insert trade in PostgreSQL');
        return this.normalizeTrade(row as unknown as Record<string, unknown>);
      }
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(
        `Failed to create card trade: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error instanceof Error ? error : undefined },
      );
    }
  }

  async update(id: string, data: Partial<NewCardTrade>, tx?: DatabaseClient): Promise<CardTrade> {
    const client = this.getClient(tx);
    try {
      if (this.isSqlite(client)) {
        const updateData: Record<string, unknown> = { ...data };
        if (data.offeredCredits !== undefined) updateData['offeredCredits'] = Number(data.offeredCredits);
        if (data.requestedCredits !== undefined) updateData['requestedCredits'] = Number(data.requestedCredits);

        const [row] = await client.db
          .update(sqliteSchema.cardTrades)
          .set(updateData)
          .where(eq(sqliteSchema.cardTrades.id, id))
          .returning();
        if (!row) throw new DatabaseError(`Card trade not found: ${id}`);
        return this.normalizeTrade(row as unknown as Record<string, unknown>);
      } else {
        const updateData: Record<string, unknown> = { ...data };
        if (data.offeredCredits !== undefined) updateData['offeredCredits'] = BigInt(data.offeredCredits);
        if (data.requestedCredits !== undefined) updateData['requestedCredits'] = BigInt(data.requestedCredits);

        const [row] = await client.db
          .update(pgSchema.cardTrades)
          .set(updateData)
          .where(eq(pgSchema.cardTrades.id, id))
          .returning();
        if (!row) throw new DatabaseError(`Card trade not found: ${id}`);
        return this.normalizeTrade(row as unknown as Record<string, unknown>);
      }
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(
        `Failed to update card trade: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error instanceof Error ? error : undefined },
      );
    }
  }

  async updateStatus(id: string, status: TradeStatus, tx?: DatabaseClient): Promise<CardTrade> {
    const resolvedAt = status === 'PENDING' ? null : new Date();
    return this.update(id, { status, resolvedAt }, tx);
  }

  async listPendingTradesForUser(userId: string, tx?: DatabaseClient): Promise<CardTrade[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.cardTrades)
        .where(
          and(
            eq(sqliteSchema.cardTrades.status, 'PENDING'),
            or(
              eq(sqliteSchema.cardTrades.senderUserId, userId),
              eq(sqliteSchema.cardTrades.receiverUserId, userId),
            ),
          ),
        )
        .orderBy(desc(sqliteSchema.cardTrades.createdAt));
      return rows.map((r) => this.normalizeTrade(r as unknown as Record<string, unknown>));
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.cardTrades)
        .where(
          and(
            eq(pgSchema.cardTrades.status, 'PENDING'),
            or(
              eq(pgSchema.cardTrades.senderUserId, userId),
              eq(pgSchema.cardTrades.receiverUserId, userId),
            ),
          ),
        )
        .orderBy(desc(pgSchema.cardTrades.createdAt));
      return rows.map((r) => this.normalizeTrade(r as unknown as Record<string, unknown>));
    }
  }

  async findActiveTradeBetween(user1Id: string, user2Id: string, tx?: DatabaseClient): Promise<CardTrade | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.cardTrades)
        .where(
          and(
            eq(sqliteSchema.cardTrades.status, 'PENDING'),
            or(
              and(
                eq(sqliteSchema.cardTrades.senderUserId, user1Id),
                eq(sqliteSchema.cardTrades.receiverUserId, user2Id),
              ),
              and(
                eq(sqliteSchema.cardTrades.senderUserId, user2Id),
                eq(sqliteSchema.cardTrades.receiverUserId, user1Id),
              ),
            ),
          ),
        )
        .limit(1);
      return row ? this.normalizeTrade(row as unknown as Record<string, unknown>) : null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.cardTrades)
        .where(
          and(
            eq(pgSchema.cardTrades.status, 'PENDING'),
            or(
              and(
                eq(pgSchema.cardTrades.senderUserId, user1Id),
                eq(pgSchema.cardTrades.receiverUserId, user2Id),
              ),
              and(
                eq(pgSchema.cardTrades.senderUserId, user2Id),
                eq(pgSchema.cardTrades.receiverUserId, user1Id),
              ),
            ),
          ),
        )
        .limit(1);
      return row ? this.normalizeTrade(row as unknown as Record<string, unknown>) : null;
    }
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const res = await client.db
        .delete(sqliteSchema.cardTrades)
        .where(eq(sqliteSchema.cardTrades.id, id))
        .returning();
      return res.length > 0;
    } else {
      const res = await client.db
        .delete(pgSchema.cardTrades)
        .where(eq(pgSchema.cardTrades.id, id))
        .returning();
      return res.length > 0;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.cardTrades);
      return Number(res?.count ?? 0);
    } else {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.cardTrades);
      return Number(res?.count ?? 0);
    }
  }
}
