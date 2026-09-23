import { eq, and, desc, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type {
  ImageJob,
  NewImageJob,
  ImagePreset,
  NewImagePreset,
  ImageProvider,
  NewImageProvider,
  ImageUsage,
  NewImageUsage,
} from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { DatabaseError } from '@ririko/core';

export class ImageRepository extends BaseRepository<
  ImageJob,
  NewImageJob,
  Partial<NewImageJob>
> {
  async findById(id: string, tx?: DatabaseClient): Promise<ImageJob | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.imageJobs)
        .where(eq(sqliteSchema.imageJobs.id, id));
      return (row as ImageJob) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.imageJobs)
        .where(eq(pgSchema.imageJobs.id, id));
      return (row as unknown as ImageJob) ?? null;
    }
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    const job = await this.findById(id, tx);
    return job !== null;
  }

  async create(data: NewImageJob, tx?: DatabaseClient): Promise<ImageJob> {
    const client = this.getClient(tx);
    const id = data.id ?? randomUUID();
    const payload = {
      ...data,
      id,
      status: data.status ?? 'QUEUED',
      createdAt: data.createdAt ?? new Date(),
    };

    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.imageJobs)
        .values(payload)
        .returning();
      if (!created) throw new DatabaseError(`Failed to insert image job ${id}`);
      return created as ImageJob;
    } else {
      const [created] = await client.db
        .insert(pgSchema.imageJobs)
        .values(payload as unknown as typeof pgSchema.imageJobs.$inferInsert)
        .returning();
      if (!created) throw new DatabaseError(`Failed to insert image job ${id}`);
      return created as unknown as ImageJob;
    }
  }

  async update(id: string, data: Partial<NewImageJob>, tx?: DatabaseClient): Promise<ImageJob> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [updated] = await client.db
        .update(sqliteSchema.imageJobs)
        .set(data)
        .where(eq(sqliteSchema.imageJobs.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`Failed to update image job ${id}`);
      return updated as ImageJob;
    } else {
      const [updated] = await client.db
        .update(pgSchema.imageJobs)
        .set(data as unknown as Partial<typeof pgSchema.imageJobs.$inferInsert>)
        .where(eq(pgSchema.imageJobs.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`Failed to update image job ${id}`);
      return updated as unknown as ImageJob;
    }
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const res = await client.db
        .delete(sqliteSchema.imageJobs)
        .where(eq(sqliteSchema.imageJobs.id, id));
      return (res.changes ?? 0) > 0;
    } else {
      const res = await client.db
        .delete(pgSchema.imageJobs)
        .where(eq(pgSchema.imageJobs.id, id));
      return (res.rowCount ?? 0) > 0;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db.select().from(sqliteSchema.imageJobs);
      return rows.length;
    } else {
      const rows = await client.db.select().from(pgSchema.imageJobs);
      return rows.length;
    }
  }

  async updateJobStatus(
    id: string,
    status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    options: {
      resultUrl?: string | undefined;
      errorMessage?: string | undefined;
      completedAt?: Date | undefined;
    } = {},
    tx?: DatabaseClient,
  ): Promise<ImageJob> {
    return this.update(
      id,
      {
        status,
        resultUrl: options.resultUrl,
        errorMessage: options.errorMessage,
        completedAt: options.completedAt ?? (status === 'COMPLETED' || status === 'FAILED' ? new Date() : undefined),
      },
      tx,
    );
  }

  async findRecentJobs(userId: string, limit = 10, tx?: DatabaseClient): Promise<ImageJob[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.imageJobs)
        .where(eq(sqliteSchema.imageJobs.userId, userId))
        .orderBy(desc(sqliteSchema.imageJobs.createdAt))
        .limit(limit);
      return rows as ImageJob[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.imageJobs)
        .where(eq(pgSchema.imageJobs.userId, userId))
        .orderBy(desc(pgSchema.imageJobs.createdAt))
        .limit(limit);
      return rows as unknown as ImageJob[];
    }
  }

  async findActiveJob(userId: string, tx?: DatabaseClient): Promise<ImageJob | null> {
    const client = this.getClient(tx);
    const activeStatuses = ['QUEUED', 'PROCESSING'];
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.imageJobs)
        .where(
          and(
            eq(sqliteSchema.imageJobs.userId, userId),
            inArray(sqliteSchema.imageJobs.status, activeStatuses),
          ),
        )
        .orderBy(desc(sqliteSchema.imageJobs.createdAt))
        .limit(1);
      return (row as ImageJob) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.imageJobs)
        .where(
          and(
            eq(pgSchema.imageJobs.userId, userId),
            inArray(pgSchema.imageJobs.status, activeStatuses),
          ),
        )
        .orderBy(desc(pgSchema.imageJobs.createdAt))
        .limit(1);
      return (row as unknown as ImageJob) ?? null;
    }
  }

  // --- Quota & Usage Methods ---

  async getUsage(userId: string, providerId: string, tx?: DatabaseClient): Promise<ImageUsage | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.imageUsage)
        .where(
          and(
            eq(sqliteSchema.imageUsage.userId, userId),
            eq(sqliteSchema.imageUsage.providerId, providerId),
          ),
        );
      return (row as ImageUsage) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.imageUsage)
        .where(
          and(
            eq(pgSchema.imageUsage.userId, userId),
            eq(pgSchema.imageUsage.providerId, providerId),
          ),
        );
      return (row as unknown as ImageUsage) ?? null;
    }
  }

  async incrementUsage(
    userId: string,
    providerId: string,
    resetWindowMs = 24 * 60 * 60 * 1000,
    tx?: DatabaseClient,
  ): Promise<ImageUsage> {
    const client = this.getClient(tx);
    const existing = await this.getUsage(userId, providerId, tx);
    const now = new Date();

    if (!existing) {
      const initial: NewImageUsage = {
        userId,
        providerId,
        imagesGeneratedToday: 1,
        lastResetAt: now,
      };
      if (this.isSqlite(client)) {
        const [created] = await client.db
          .insert(sqliteSchema.imageUsage)
          .values(initial)
          .returning();
        return created as ImageUsage;
      } else {
        const [created] = await client.db
          .insert(pgSchema.imageUsage)
          .values(initial as unknown as typeof pgSchema.imageUsage.$inferInsert)
          .returning();
        return created as unknown as ImageUsage;
      }
    }

    const elapsed = now.getTime() - new Date(existing.lastResetAt).getTime();
    const shouldReset = elapsed >= resetWindowMs;
    const newCount = shouldReset ? 1 : existing.imagesGeneratedToday + 1;
    const lastReset = shouldReset ? now : existing.lastResetAt;

    if (this.isSqlite(client)) {
      const [updated] = await client.db
        .update(sqliteSchema.imageUsage)
        .set({
          imagesGeneratedToday: newCount,
          lastResetAt: lastReset,
        })
        .where(
          and(
            eq(sqliteSchema.imageUsage.userId, userId),
            eq(sqliteSchema.imageUsage.providerId, providerId),
          ),
        )
        .returning();
      return updated as ImageUsage;
    } else {
      const [updated] = await client.db
        .update(pgSchema.imageUsage)
        .set({
          imagesGeneratedToday: newCount,
          lastResetAt: lastReset as unknown as Date,
        })
        .where(
          and(
            eq(pgSchema.imageUsage.userId, userId),
            eq(pgSchema.imageUsage.providerId, providerId),
          ),
        )
        .returning();
      return updated as unknown as ImageUsage;
    }
  }

  // --- Presets Methods ---

  async getPresetByName(name: string, tx?: DatabaseClient): Promise<ImagePreset | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.imagePresets)
        .where(eq(sqliteSchema.imagePresets.name, name));
      return (row as ImagePreset) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.imagePresets)
        .where(eq(pgSchema.imagePresets.name, name));
      return (row as unknown as ImagePreset) ?? null;
    }
  }

  async listPresets(tx?: DatabaseClient): Promise<ImagePreset[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db.select().from(sqliteSchema.imagePresets);
      return rows as ImagePreset[];
    } else {
      const rows = await client.db.select().from(pgSchema.imagePresets);
      return rows as unknown as ImagePreset[];
    }
  }

  async savePreset(preset: NewImagePreset, tx?: DatabaseClient): Promise<ImagePreset> {
    const client = this.getClient(tx);
    const id = preset.id ?? randomUUID();
    const payload = {
      ...preset,
      id,
    };
    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.imagePresets)
        .values(payload)
        .returning();
      return created as ImagePreset;
    } else {
      const [created] = await client.db
        .insert(pgSchema.imagePresets)
        .values(payload as unknown as typeof pgSchema.imagePresets.$inferInsert)
        .returning();
      return created as unknown as ImagePreset;
    }
  }

  // --- Providers Configuration Methods ---

  async getProviders(tx?: DatabaseClient): Promise<ImageProvider[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db.select().from(sqliteSchema.imageProviders);
      return rows as ImageProvider[];
    } else {
      const rows = await client.db.select().from(pgSchema.imageProviders);
      return rows as unknown as ImageProvider[];
    }
  }

  async getProviderById(id: string, tx?: DatabaseClient): Promise<ImageProvider | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.imageProviders)
        .where(eq(sqliteSchema.imageProviders.id, id));
      return (row as ImageProvider) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.imageProviders)
        .where(eq(pgSchema.imageProviders.id, id));
      return (row as unknown as ImageProvider) ?? null;
    }
  }

  async upsertProvider(provider: NewImageProvider, tx?: DatabaseClient): Promise<ImageProvider> {
    const client = this.getClient(tx);
    const existing = await this.getProviderById(provider.id, tx);
    if (existing) {
      if (this.isSqlite(client)) {
        const [updated] = await client.db
          .update(sqliteSchema.imageProviders)
          .set(provider)
          .where(eq(sqliteSchema.imageProviders.id, provider.id))
          .returning();
        return updated as ImageProvider;
      } else {
        const [updated] = await client.db
          .update(pgSchema.imageProviders)
          .set(provider as unknown as Partial<typeof pgSchema.imageProviders.$inferInsert>)
          .where(eq(pgSchema.imageProviders.id, provider.id))
          .returning();
        return updated as unknown as ImageProvider;
      }
    } else {
      if (this.isSqlite(client)) {
        const [created] = await client.db
          .insert(sqliteSchema.imageProviders)
          .values(provider)
          .returning();
        return created as ImageProvider;
      } else {
        const [created] = await client.db
          .insert(pgSchema.imageProviders)
          .values(provider as unknown as typeof pgSchema.imageProviders.$inferInsert)
          .returning();
        return created as unknown as ImageProvider;
      }
    }
  }
}
