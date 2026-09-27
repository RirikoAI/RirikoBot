import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { DatabaseClient } from '../client/types.js';
import { withTransaction } from '../transactions/index.js';
import * as sqlite from '../schema/sqlite/adventure.js';
import * as postgres from '../schema/pg/adventure.js';

/** The database package does not depend on service-domain types. */
export interface StoredAdventureSession {
  id: string;
  userId: string;
  guildId: string;
  channelId: string;
  revision: number;
  status: string;
  deadline: number;
  startedAt: number;
  deliveredRevision: number;
}

export class AdventureSessionRepository<T extends StoredAdventureSession> {
  constructor(
    readonly client: DatabaseClient,
    private readonly validateState?: (state: T) => void,
  ) {}

  async getSettings(guildId: string, tx = this.client): Promise<{ energyEnabled: boolean }> {
    const rows =
      tx.dialect === 'sqlite'
        ? await tx.db
            .select()
            .from(sqlite.adventureSettings)
            .where(eq(sqlite.adventureSettings.guildId, guildId))
        : await tx.db
            .select()
            .from(postgres.adventureSettings)
            .where(eq(postgres.adventureSettings.guildId, guildId));
    return { energyEnabled: rows[0]?.energyEnabled ?? true };
  }

  async setSettings(
    guildId: string,
    settings: { energyEnabled: boolean },
    tx = this.client,
  ): Promise<void> {
    if (typeof settings.energyEnabled !== 'boolean')
      throw new Error('energyEnabled must be a boolean');
    const values = { guildId, energyEnabled: settings.energyEnabled };
    if (tx.dialect === 'sqlite')
      await tx.db
        .insert(sqlite.adventureSettings)
        .values(values)
        .onConflictDoUpdate({ target: sqlite.adventureSettings.guildId, set: settings });
    else
      await tx.db
        .insert(postgres.adventureSettings)
        .values(values)
        .onConflictDoUpdate({ target: postgres.adventureSettings.guildId, set: settings });
  }

  /** Every state mutation must share this per-user transaction, across bot workers. */
  async withUser<R>(
    userId: string,
    work: (tx: DatabaseClient, cooldownUntil: number, lastStartAt: number) => Promise<R>,
  ): Promise<R> {
    return withTransaction(this.client, async (tx) => {
      if (tx.dialect === 'sqlite') {
        await tx.db.insert(sqlite.adventurePlayers).values({ userId }).onConflictDoNothing();
        const [player] = await tx.db
          .select()
          .from(sqlite.adventurePlayers)
          .where(eq(sqlite.adventurePlayers.userId, userId));
        return work(tx, player!.cooldownUntil, player!.lastStartAt);
      }
      await tx.db.insert(postgres.adventurePlayers).values({ userId }).onConflictDoNothing();
      const [player] = await tx.db
        .select()
        .from(postgres.adventurePlayers)
        .where(eq(postgres.adventurePlayers.userId, userId))
        .for('update');
      return work(tx, player!.cooldownUntil, player!.lastStartAt);
    });
  }

  async setLastStart(userId: string, lastStartAt: number, tx: DatabaseClient): Promise<void> {
    if (tx.dialect === 'sqlite')
      await tx.db
        .update(sqlite.adventurePlayers)
        .set({ lastStartAt })
        .where(eq(sqlite.adventurePlayers.userId, userId));
    else
      await tx.db
        .update(postgres.adventurePlayers)
        .set({ lastStartAt })
        .where(eq(postgres.adventurePlayers.userId, userId));
  }

  async listUndelivered(afterId = '', limit = 100): Promise<T[]> {
    const tx = this.client;
    const t = tx.dialect === 'sqlite' ? sqlite.adventureSessions : postgres.adventureSessions;
    const condition = and(sql`${t.id} > ${afterId}`, sql`${t.deliveredRevision} <> ${t.revision}`);
    const rows =
      tx.dialect === 'sqlite'
        ? await tx.db
            .select()
            .from(sqlite.adventureSessions)
            .where(condition)
            .orderBy(asc(sqlite.adventureSessions.id))
            .limit(limit)
        : await tx.db
            .select()
            .from(postgres.adventureSessions)
            .where(condition)
            .orderBy(asc(postgres.adventureSessions.id))
            .limit(limit);
    return rows.map((row) => this.decode(row)!);
  }

  async setCooldown(userId: string, cooldownUntil: number, tx: DatabaseClient): Promise<void> {
    if (tx.dialect === 'sqlite') {
      await tx.db
        .update(sqlite.adventurePlayers)
        .set({ cooldownUntil })
        .where(eq(sqlite.adventurePlayers.userId, userId));
    } else {
      await tx.db
        .update(postgres.adventurePlayers)
        .set({ cooldownUntil })
        .where(eq(postgres.adventurePlayers.userId, userId));
    }
  }

  private decode(
    row:
      { payload: string; id: string; userId: string; status: string; revision: number } | undefined,
  ): T | null {
    if (!row) return null;
    const state = JSON.parse(row.payload) as T;
    if (
      state.id !== row.id ||
      state.userId !== row.userId ||
      state.status !== row.status ||
      state.revision !== row.revision
    ) {
      throw new Error(`Inconsistent adventure state ${row.id}`);
    }
    this.validateState?.(state);
    return state;
  }

  async findById(id: string, tx = this.client): Promise<T | null> {
    const rows =
      tx.dialect === 'sqlite'
        ? await tx.db
            .select()
            .from(sqlite.adventureSessions)
            .where(eq(sqlite.adventureSessions.id, id))
        : await tx.db
            .select()
            .from(postgres.adventureSessions)
            .where(eq(postgres.adventureSessions.id, id));
    return this.decode(rows[0]);
  }

  async findActive(userId: string, tx = this.client): Promise<T | null> {
    const rows =
      tx.dialect === 'sqlite'
        ? await tx.db
            .select()
            .from(sqlite.adventureSessions)
            .where(
              and(
                eq(sqlite.adventureSessions.userId, userId),
                inArray(sqlite.adventureSessions.status, ['ACTIVE', 'SETTLING']),
              ),
            )
        : await tx.db
            .select()
            .from(postgres.adventureSessions)
            .where(
              and(
                eq(postgres.adventureSessions.userId, userId),
                inArray(postgres.adventureSessions.status, ['ACTIVE', 'SETTLING']),
              ),
            );
    return this.decode(rows[0]);
  }

  async findLatest(userId: string, tx = this.client): Promise<T | null> {
    const rows =
      tx.dialect === 'sqlite'
        ? await tx.db
            .select()
            .from(sqlite.adventureSessions)
            .where(eq(sqlite.adventureSessions.userId, userId))
            .orderBy(desc(sqlite.adventureSessions.createdAt))
            .limit(1)
        : await tx.db
            .select()
            .from(postgres.adventureSessions)
            .where(eq(postgres.adventureSessions.userId, userId))
            .orderBy(desc(postgres.adventureSessions.createdAt))
            .limit(1);
    return this.decode(rows[0]);
  }

  async create(state: T, tx: DatabaseClient): Promise<void> {
    const row = {
      id: state.id,
      userId: state.userId,
      guildId: state.guildId,
      channelId: state.channelId,
      revision: state.revision,
      deliveredRevision: state.deliveredRevision,
      status: state.status,
      deadline: state.deadline,
      createdAt: state.startedAt,
      payload: JSON.stringify(state),
    };
    if (tx.dialect === 'sqlite') await tx.db.insert(sqlite.adventureSessions).values(row);
    else await tx.db.insert(postgres.adventureSessions).values(row);
  }

  async save(state: T, expectedRevision: number, tx: DatabaseClient): Promise<void> {
    const row = {
      revision: state.revision,
      deliveredRevision: state.deliveredRevision,
      status: state.status,
      deadline: state.deadline,
      payload: JSON.stringify(state),
    };
    const updated =
      tx.dialect === 'sqlite'
        ? await tx.db
            .update(sqlite.adventureSessions)
            .set(row)
            .where(
              and(
                eq(sqlite.adventureSessions.id, state.id),
                eq(sqlite.adventureSessions.userId, state.userId),
                eq(sqlite.adventureSessions.revision, expectedRevision),
              ),
            )
            .returning({ id: sqlite.adventureSessions.id })
        : await tx.db
            .update(postgres.adventureSessions)
            .set(row)
            .where(
              and(
                eq(postgres.adventureSessions.id, state.id),
                eq(postgres.adventureSessions.userId, state.userId),
                eq(postgres.adventureSessions.revision, expectedRevision),
              ),
            )
            .returning({ id: postgres.adventureSessions.id });
    if (updated.length !== 1) throw new Error('Adventure revision conflict');
  }

  async recordChoice(
    sessionId: string,
    revision: number,
    receipt: unknown,
    tx: DatabaseClient,
  ): Promise<void> {
    const row = { sessionId, revision, payload: JSON.stringify(receipt) };
    if (tx.dialect === 'sqlite') await tx.db.insert(sqlite.adventureChoices).values(row);
    else await tx.db.insert(postgres.adventureChoices).values(row);
  }

  /** Cursor avoids a repeatedly failing settlement starving other sessions during recovery. */
  async listRecoverable(now: number, afterId = '', limit = 100): Promise<T[]> {
    const tx = this.client;
    const table = tx.dialect === 'sqlite' ? sqlite.adventureSessions : postgres.adventureSessions;
    const condition = and(
      sql`${table.id} > ${afterId}`,
      sql`(${table.status} = 'SETTLING' OR (${table.status} = 'ACTIVE' AND ${lte(table.deadline, now)}))`,
    );
    const rows =
      tx.dialect === 'sqlite'
        ? await tx.db
            .select()
            .from(sqlite.adventureSessions)
            .where(condition)
            .orderBy(asc(sqlite.adventureSessions.id))
            .limit(limit)
        : await tx.db
            .select()
            .from(postgres.adventureSessions)
            .where(condition)
            .orderBy(asc(postgres.adventureSessions.id))
            .limit(limit);
    return rows.map((row) => this.decode(row)!);
  }
}
