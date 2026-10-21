import { and, asc, eq, sql } from 'drizzle-orm';
import { DatabaseError } from '@ririko/core';
import { BaseRepository } from './base.js';
import type { DatabaseClient } from '../client/types.js';
import type {
  NewTicket,
  NewTicketSettings,
  Ticket,
  TicketSettings,
} from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { withTransaction } from '../transactions/index.js';

/** The settings a server admin edits. `guildId` is the key and `nextNumber` belongs to openTicket. */
export type TicketSettingsPatch = Partial<Omit<NewTicketSettings, 'guildId' | 'nextNumber'>>;

/** What opening a ticket needs. The number and the id come from the repository. */
export interface OpenTicketInput {
  guildId: string;
  channelId: string;
  openerId: string;
  subject?: string | null;
}

/** The id is optional at runtime (generated when omitted), though the row type requires it. */
export type NewTicketInput = Omit<NewTicket, 'id'> & { id?: string };

/** Who closes a ticket, and why. `closedBy` is null when the channel was deleted by hand. */
export interface CloseTicketInput {
  closedBy: string | null;
  reason?: string | null;
  closedAt?: Date;
}

/**
 * Support ticket settings and tickets (STORY-198). Ticket numbers are per server: `openTicket`
 * takes `ticket_settings.next_number` and increments it in the same transaction as the insert.
 */
export class TicketRepository extends BaseRepository<Ticket, NewTicket, Partial<NewTicket>> {
  // ==========================================
  // SETTINGS
  // ==========================================

  /** The server's settings, or null when nobody has saved any yet (tickets are then off). */
  async getSettings(guildId: string, tx?: DatabaseClient): Promise<TicketSettings | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.ticketSettings)
        .where(eq(sqliteSchema.ticketSettings.guildId, guildId));
      return (row as TicketSettings) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.ticketSettings)
        .where(eq(pgSchema.ticketSettings.guildId, guildId));
      return (row as unknown as TicketSettings) ?? null;
    }
  }

  /**
   * Creates the settings row or changes the given fields of it. It never touches `next_number`,
   * so saving settings cannot reuse a ticket number.
   */
  async upsertSettings(
    guildId: string,
    patch: TicketSettingsPatch,
    tx?: DatabaseClient,
  ): Promise<TicketSettings> {
    const client = this.getClient(tx);
    const payload = { ...patch, updatedAt: new Date() };

    if (this.isSqlite(client)) {
      const [upserted] = await client.db
        .insert(sqliteSchema.ticketSettings)
        .values({ guildId, ...payload })
        .onConflictDoUpdate({ target: sqliteSchema.ticketSettings.guildId, set: payload })
        .returning();
      if (!upserted) throw new DatabaseError(`Failed to upsert ticket settings for ${guildId}`);
      return upserted as TicketSettings;
    } else {
      const [upserted] = await client.db
        .insert(pgSchema.ticketSettings)
        .values({ guildId, ...payload } as unknown as typeof pgSchema.ticketSettings.$inferInsert)
        .onConflictDoUpdate({
          target: pgSchema.ticketSettings.guildId,
          set: payload as unknown as Partial<typeof pgSchema.ticketSettings.$inferInsert>,
        })
        .returning();
      if (!upserted) throw new DatabaseError(`Failed to upsert ticket settings for ${guildId}`);
      return upserted as unknown as TicketSettings;
    }
  }

  // ==========================================
  // TICKETS
  // ==========================================

  /**
   * Inserts an open ticket with the next number of its server. The number is taken by an atomic
   * `next_number = next_number + 1` on the settings row (created here when missing), inside the
   * same transaction as the insert, so two tickets of one server never share a number. A failed
   * insert (a channel that already has a ticket) rolls the increment back.
   */
  async openTicket(input: OpenTicketInput, tx?: DatabaseClient): Promise<Ticket> {
    return withTransaction(this.getClient(tx), async (txClient) => {
      const id = crypto.randomUUID();
      if (this.isSqlite(txClient)) {
        await txClient.db
          .insert(sqliteSchema.ticketSettings)
          .values({ guildId: input.guildId })
          .onConflictDoNothing();
        const [counter] = await txClient.db
          .update(sqliteSchema.ticketSettings)
          .set({ nextNumber: sql`${sqliteSchema.ticketSettings.nextNumber} + 1` })
          .where(eq(sqliteSchema.ticketSettings.guildId, input.guildId))
          .returning({ nextNumber: sqliteSchema.ticketSettings.nextNumber });
        if (!counter) throw new DatabaseError(`No ticket counter for guild ${input.guildId}`);
        const [created] = await txClient.db
          .insert(sqliteSchema.tickets)
          .values({
            id,
            guildId: input.guildId,
            number: counter.nextNumber - 1,
            channelId: input.channelId,
            openerId: input.openerId,
            subject: input.subject ?? null,
          })
          .returning();
        if (!created) throw new DatabaseError(`Failed to insert ticket ${id}`);
        return created as Ticket;
      } else {
        await txClient.db
          .insert(pgSchema.ticketSettings)
          .values({ guildId: input.guildId })
          .onConflictDoNothing();
        const [counter] = await txClient.db
          .update(pgSchema.ticketSettings)
          .set({ nextNumber: sql`${pgSchema.ticketSettings.nextNumber} + 1` })
          .where(eq(pgSchema.ticketSettings.guildId, input.guildId))
          .returning({ nextNumber: pgSchema.ticketSettings.nextNumber });
        if (!counter) throw new DatabaseError(`No ticket counter for guild ${input.guildId}`);
        const [created] = await txClient.db
          .insert(pgSchema.tickets)
          .values({
            id,
            guildId: input.guildId,
            number: counter.nextNumber - 1,
            channelId: input.channelId,
            openerId: input.openerId,
            subject: input.subject ?? null,
          })
          .returning();
        if (!created) throw new DatabaseError(`Failed to insert ticket ${id}`);
        return created as unknown as Ticket;
      }
    });
  }

  async findByChannelId(channelId: string, tx?: DatabaseClient): Promise<Ticket | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.tickets)
        .where(eq(sqliteSchema.tickets.channelId, channelId));
      return (row as Ticket) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.tickets)
        .where(eq(pgSchema.tickets.channelId, channelId));
      return (row as unknown as Ticket) ?? null;
    }
  }

  /** How many open tickets one member has in a server, for the `max_open_per_user` limit. */
  async countOpenForUser(guildId: string, openerId: string, tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.tickets)
        .where(
          and(
            eq(sqliteSchema.tickets.guildId, guildId),
            eq(sqliteSchema.tickets.openerId, openerId),
            eq(sqliteSchema.tickets.status, 'open'),
          ),
        );
      return Number(row?.count ?? 0);
    } else {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.tickets)
        .where(
          and(
            eq(pgSchema.tickets.guildId, guildId),
            eq(pgSchema.tickets.openerId, openerId),
            eq(pgSchema.tickets.status, 'open'),
          ),
        );
      return Number(row?.count ?? 0);
    }
  }

  /** The open tickets of a server, oldest number first. */
  async listOpen(guildId: string, tx?: DatabaseClient): Promise<Ticket[]> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .select()
        .from(sqliteSchema.tickets)
        .where(
          and(eq(sqliteSchema.tickets.guildId, guildId), eq(sqliteSchema.tickets.status, 'open')),
        )
        .orderBy(asc(sqliteSchema.tickets.number));
      return rows as Ticket[];
    } else {
      const rows = await client.db
        .select()
        .from(pgSchema.tickets)
        .where(and(eq(pgSchema.tickets.guildId, guildId), eq(pgSchema.tickets.status, 'open')))
        .orderBy(asc(pgSchema.tickets.number));
      return rows as unknown as Ticket[];
    }
  }

  /**
   * Sets (or, with null, clears) who claimed an open ticket. Returns the ticket, or null when it
   * does not exist or is already closed.
   */
  async setClaimedBy(
    ticketId: string,
    claimedBy: string | null,
    tx?: DatabaseClient,
  ): Promise<Ticket | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .update(sqliteSchema.tickets)
        .set({ claimedBy })
        .where(and(eq(sqliteSchema.tickets.id, ticketId), eq(sqliteSchema.tickets.status, 'open')))
        .returning();
      return (row as Ticket) ?? null;
    } else {
      const [row] = await client.db
        .update(pgSchema.tickets)
        .set({ claimedBy })
        .where(and(eq(pgSchema.tickets.id, ticketId), eq(pgSchema.tickets.status, 'open')))
        .returning();
      return (row as unknown as Ticket) ?? null;
    }
  }

  /**
   * Closes a ticket that is open. Returns true when this call closed it, false when the ticket is
   * missing or was already closed, so a second press of the Close button changes nothing.
   */
  async close(ticketId: string, input: CloseTicketInput, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    const changes = {
      status: 'closed' as const,
      closedBy: input.closedBy,
      closeReason: input.reason ?? null,
      closedAt: input.closedAt ?? new Date(),
    };
    if (this.isSqlite(client)) {
      const rows = await client.db
        .update(sqliteSchema.tickets)
        .set(changes)
        .where(and(eq(sqliteSchema.tickets.id, ticketId), eq(sqliteSchema.tickets.status, 'open')))
        .returning({ id: sqliteSchema.tickets.id });
      return rows.length > 0;
    } else {
      const rows = await client.db
        .update(pgSchema.tickets)
        .set(changes)
        .where(and(eq(pgSchema.tickets.id, ticketId), eq(pgSchema.tickets.status, 'open')))
        .returning({ id: pgSchema.tickets.id });
      return rows.length > 0;
    }
  }

  // ==========================================
  // BASE REPOSITORY
  // ==========================================

  async findById(id: string, tx?: DatabaseClient): Promise<Ticket | null> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select()
        .from(sqliteSchema.tickets)
        .where(eq(sqliteSchema.tickets.id, id));
      return (row as Ticket) ?? null;
    } else {
      const [row] = await client.db
        .select()
        .from(pgSchema.tickets)
        .where(eq(pgSchema.tickets.id, id));
      return (row as unknown as Ticket) ?? null;
    }
  }

  async exists(id: string, tx?: DatabaseClient): Promise<boolean> {
    return (await this.findById(id, tx)) !== null;
  }

  /** Inserts a ticket with the number the caller gives. Prefer `openTicket`, which numbers it. */
  async create(data: NewTicketInput, tx?: DatabaseClient): Promise<Ticket> {
    const client = this.getClient(tx);
    const id = data.id ?? crypto.randomUUID();
    if (this.isSqlite(client)) {
      const [created] = await client.db
        .insert(sqliteSchema.tickets)
        .values({ ...data, id })
        .returning();
      if (!created) throw new DatabaseError(`Failed to insert ticket ${id}`);
      return created as Ticket;
    } else {
      const [created] = await client.db
        .insert(pgSchema.tickets)
        .values({ ...data, id } as unknown as typeof pgSchema.tickets.$inferInsert)
        .returning();
      if (!created) throw new DatabaseError(`Failed to insert ticket ${id}`);
      return created as unknown as Ticket;
    }
  }

  async update(id: string, data: Partial<NewTicket>, tx?: DatabaseClient): Promise<Ticket> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [updated] = await client.db
        .update(sqliteSchema.tickets)
        .set(data)
        .where(eq(sqliteSchema.tickets.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`Ticket with ID ${id} not found for update`);
      return updated as Ticket;
    } else {
      const [updated] = await client.db
        .update(pgSchema.tickets)
        .set(data as unknown as Partial<typeof pgSchema.tickets.$inferInsert>)
        .where(eq(pgSchema.tickets.id, id))
        .returning();
      if (!updated) throw new DatabaseError(`Ticket with ID ${id} not found for update`);
      return updated as unknown as Ticket;
    }
  }

  async delete(id: string, tx?: DatabaseClient): Promise<boolean> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const rows = await client.db
        .delete(sqliteSchema.tickets)
        .where(eq(sqliteSchema.tickets.id, id))
        .returning({ id: sqliteSchema.tickets.id });
      return rows.length > 0;
    } else {
      const rows = await client.db
        .delete(pgSchema.tickets)
        .where(eq(pgSchema.tickets.id, id))
        .returning({ id: pgSchema.tickets.id });
      return rows.length > 0;
    }
  }

  async count(tx?: DatabaseClient): Promise<number> {
    const client = this.getClient(tx);
    if (this.isSqlite(client)) {
      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.tickets);
      return Number(row?.count ?? 0);
    } else {
      const [row] = await client.db.select({ count: sql<number>`count(*)` }).from(pgSchema.tickets);
      return Number(row?.count ?? 0);
    }
  }
}
