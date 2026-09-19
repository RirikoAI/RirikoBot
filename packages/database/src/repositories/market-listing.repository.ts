import { eq, and, lte, desc, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type { MarketListing, NewMarketListing } from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';

export type MarketListingStatus = 'ACTIVE' | 'SOLD' | 'CANCELLED' | 'EXPIRED';

export class MarketListingRepository extends BaseRepository<
  MarketListing,
  NewMarketListing,
  Partial<NewMarketListing>
> {
  private normalizeListing(row: Record<string, unknown>): MarketListing {
    return {
      id: String(row['id']),
      sellerUserId: String(row['sellerUserId']),
      userCardId: String(row['userCardId']),
      price: Number(row['price']),
      taxPaid: Number(row['taxPaid'] ?? 0),
      status: String(row['status']),
      createdAt: row['createdAt'] instanceof Date ? row['createdAt'] : new Date(row['createdAt'] as string | number),
      expiresAt: row['expiresAt'] instanceof Date ? row['expiresAt'] : new Date(row['expiresAt'] as string | number),
    } as unknown as MarketListing;
  }

  async findById(id: string, tx?: DatabaseClient): Promise<MarketListing | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.marketListings)
        .where(eq(sqliteSchema.marketListings.id, id));
      return row ? this.normalizeListing(row as unknown as Record<string, unknown>) : null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.marketListings)
        .where(eq(pgSchema.marketListings.id, id));
      return row ? this.normalizeListing(row as unknown as Record<string, unknown>) : null;
    }
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    const listing = await this.findById(id, tx);
    return listing !== null;
  }

  async create(data: NewMarketListing, tx?: DatabaseClient): Promise<MarketListing> {
    const client = this.getClient(tx);
    const id = data.id ?? randomUUID();

    try {
      if (this.isSqlite(client)) {
        const [row] = await client.db
          .insert(sqliteSchema.marketListings)
          .values({
            id,
            sellerUserId: data.sellerUserId,
            userCardId: data.userCardId,
            price: Number(data.price),
            taxPaid: Number(data.taxPaid ?? 0),
            status: data.status ?? 'ACTIVE',
            createdAt: data.createdAt ?? new Date(),
            expiresAt: data.expiresAt,
          })
          .returning();
        if (!row) throw new DatabaseError('Failed to insert market listing in SQLite');
        return this.normalizeListing(row as unknown as Record<string, unknown>);
      } else {
        const [row] = await client.db
          .insert(pgSchema.marketListings)
          .values({
            id,
            sellerUserId: data.sellerUserId,
            userCardId: data.userCardId,
            price: BigInt(data.price),
            taxPaid: BigInt(data.taxPaid ?? 0),
            status: data.status ?? 'ACTIVE',
            createdAt: data.createdAt ?? new Date(),
            expiresAt: data.expiresAt,
          })
          .returning();
        if (!row) throw new DatabaseError('Failed to insert market listing in PostgreSQL');
        return this.normalizeListing(row as unknown as Record<string, unknown>);
      }
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(
        `Failed to create market listing: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error instanceof Error ? error : undefined },
      );
    }
  }

  async update(id: string, data: Partial<NewMarketListing>, tx?: DatabaseClient): Promise<MarketListing> {
    const client = this.getClient(tx);
    try {
      if (this.isSqlite(client)) {
        const updateData: Record<string, unknown> = { ...data };
        if (data.price !== undefined) updateData['price'] = Number(data.price);
        if (data.taxPaid !== undefined) updateData['taxPaid'] = Number(data.taxPaid);

        const [row] = await client.db
          .update(sqliteSchema.marketListings)
          .set(updateData)
          .where(eq(sqliteSchema.marketListings.id, id))
          .returning();
        if (!row) throw new DatabaseError(`Market listing not found: ${id}`);
        return this.normalizeListing(row as unknown as Record<string, unknown>);
      } else {
        const updateData: Record<string, unknown> = { ...data };
        if (data.price !== undefined) updateData['price'] = BigInt(data.price);
        if (data.taxPaid !== undefined) updateData['taxPaid'] = BigInt(data.taxPaid);

        const [row] = await client.db
          .update(pgSchema.marketListings)
          .set(updateData)
          .where(eq(pgSchema.marketListings.id, id))
          .returning();
        if (!row) throw new DatabaseError(`Market listing not found: ${id}`);
        return this.normalizeListing(row as unknown as Record<string, unknown>);
      }
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(
        `Failed to update market listing: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error instanceof Error ? error : undefined },
      );
    }
  }

  async updateStatus(id: string, status: MarketListingStatus, tx?: DatabaseClient): Promise<MarketListing> {
    return this.update(id, { status }, tx);
  }

  async listActiveListings(
    options?: { sellerUserId?: string | undefined; limit?: number | undefined; offset?: number | undefined },
    tx?: DatabaseClient,
  ): Promise<MarketListing[]> {
    const client = this.getClient(tx);
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    if (this.isSqlite(client)) {
      const conditions = [eq(sqliteSchema.marketListings.status, 'ACTIVE')];
      if (options?.sellerUserId) {
        conditions.push(eq(sqliteSchema.marketListings.sellerUserId, options.sellerUserId));
      }

      const rows = await client.db
        .select()
        .from(sqliteSchema.marketListings)
        .where(and(...conditions))
        .orderBy(desc(sqliteSchema.marketListings.createdAt))
        .limit(limit)
        .offset(offset);

      return rows.map((r) => this.normalizeListing(r as unknown as Record<string, unknown>));
    } else {
      const conditions = [eq(pgSchema.marketListings.status, 'ACTIVE')];
      if (options?.sellerUserId) {
        conditions.push(eq(pgSchema.marketListings.sellerUserId, options.sellerUserId));
      }

      const rows = await client.db
        .select()
        .from(pgSchema.marketListings)
        .where(and(...conditions))
        .orderBy(desc(pgSchema.marketListings.createdAt))
        .limit(limit)
        .offset(offset);

      return rows.map((r) => this.normalizeListing(r as unknown as Record<string, unknown>));
    }
  }

  async listUserListings(sellerUserId: string, tx?: DatabaseClient): Promise<MarketListing[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.marketListings)
        .where(eq(sqliteSchema.marketListings.sellerUserId, sellerUserId))
        .orderBy(desc(sqliteSchema.marketListings.createdAt));
      return rows.map((r) => this.normalizeListing(r as unknown as Record<string, unknown>));
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.marketListings)
        .where(eq(pgSchema.marketListings.sellerUserId, sellerUserId))
        .orderBy(desc(pgSchema.marketListings.createdAt));
      return rows.map((r) => this.normalizeListing(r as unknown as Record<string, unknown>));
    }
  }

  async findExpiredListings(now: Date = new Date(), tx?: DatabaseClient): Promise<MarketListing[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.marketListings)
        .where(
          and(
            eq(sqliteSchema.marketListings.status, 'ACTIVE'),
            lte(sqliteSchema.marketListings.expiresAt, now),
          ),
        );
      return rows.map((r) => this.normalizeListing(r as unknown as Record<string, unknown>));
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.marketListings)
        .where(
          and(
            eq(pgSchema.marketListings.status, 'ACTIVE'),
            lte(pgSchema.marketListings.expiresAt, now),
          ),
        );
      return rows.map((r) => this.normalizeListing(r as unknown as Record<string, unknown>));
    }
  }

  async countActiveListings(options?: { sellerUserId?: string | undefined }, tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const conditions = [eq(sqliteSchema.marketListings.status, 'ACTIVE')];
      if (options?.sellerUserId) {
        conditions.push(eq(sqliteSchema.marketListings.sellerUserId, options.sellerUserId));
      }

      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.marketListings)
        .where(and(...conditions));
      return Number(res?.count ?? 0);
    } else {
      const conditions = [eq(pgSchema.marketListings.status, 'ACTIVE')];
      if (options?.sellerUserId) {
        conditions.push(eq(pgSchema.marketListings.sellerUserId, options.sellerUserId));
      }

      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.marketListings)
        .where(and(...conditions));
      return Number(res?.count ?? 0);
    }
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const res = await client.db
        .delete(sqliteSchema.marketListings)
        .where(eq(sqliteSchema.marketListings.id, id))
        .returning();
      return res.length > 0;
    } else {
      const res = await client.db
        .delete(pgSchema.marketListings)
        .where(eq(pgSchema.marketListings.id, id))
        .returning();
      return res.length > 0;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.marketListings);
      return Number(res?.count ?? 0);
    } else {
      const [res] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.marketListings);
      return Number(res?.count ?? 0);
    }
  }
}
