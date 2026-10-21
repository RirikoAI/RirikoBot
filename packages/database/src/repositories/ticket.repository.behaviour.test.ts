import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { withTransaction } from '../transactions/index.js';
import { TicketRepository } from './ticket.repository.js';

const MISSING_UUID = '00000000-0000-4000-8000-000000000001';
const T0 = new Date('2026-10-01T12:00:00Z');

describeDialects('TicketRepository behaviour', (db) => {
  it('reads no settings for a new server and saves them with their defaults', async () => {
    const repo = new TicketRepository(db.client);
    expect(await repo.getSettings('g1')).toBeNull();

    const created = await repo.upsertSettings('g1', { isEnabled: true });
    expect(created).toMatchObject({
      guildId: 'g1',
      isEnabled: true,
      categoryId: null,
      staffRoleIds: [],
      transcriptChannelId: null,
      maxOpenPerUser: 1,
      welcomeMessage: null,
      nextNumber: 1,
    });
    expect(created.updatedAt).toBeInstanceOf(Date);
    expect((await repo.getSettings('g1'))?.isEnabled).toBe(true);
    expect(await repo.getSettings('g2')).toBeNull();
  });

  it('changes only the given settings and never the ticket counter', async () => {
    const repo = new TicketRepository(db.client);
    await repo.upsertSettings('g1', { isEnabled: true, categoryId: 'cat', maxOpenPerUser: 2 });
    await repo.openTicket({ guildId: 'g1', channelId: 'c1', openerId: 'u1' });
    await repo.openTicket({ guildId: 'g1', channelId: 'c2', openerId: 'u2' });

    const updated = await repo.upsertSettings('g1', {
      staffRoleIds: ['r1', 'r2'],
      transcriptChannelId: 'logs',
      welcomeMessage: 'Hello!',
    });
    expect(updated).toMatchObject({
      isEnabled: true,
      categoryId: 'cat',
      maxOpenPerUser: 2,
      staffRoleIds: ['r1', 'r2'],
      transcriptChannelId: 'logs',
      welcomeMessage: 'Hello!',
      nextNumber: 3,
    });

    const cleared = await repo.upsertSettings('g1', { categoryId: null, isEnabled: false });
    expect(cleared.categoryId).toBeNull();
    expect(cleared.isEnabled).toBe(false);
    expect(cleared.staffRoleIds).toEqual(['r1', 'r2']);
    expect(cleared.nextNumber).toBe(3);
  });

  it('numbers tickets per server, creating the settings row when it is missing', async () => {
    const repo = new TicketRepository(db.client);
    const first = await repo.openTicket({
      guildId: 'g1',
      channelId: 'c1',
      openerId: 'u1',
      subject: 'Help me',
    });
    const second = await repo.openTicket({ guildId: 'g1', channelId: 'c2', openerId: 'u2' });
    const other = await repo.openTicket({ guildId: 'g2', channelId: 'c3', openerId: 'u1' });

    expect([first.number, second.number, other.number]).toEqual([1, 2, 1]);
    expect(first).toMatchObject({
      guildId: 'g1',
      channelId: 'c1',
      openerId: 'u1',
      subject: 'Help me',
      status: 'open',
      claimedBy: null,
      closedBy: null,
      closeReason: null,
      closedAt: null,
    });
    expect(first.createdAt).toBeInstanceOf(Date);
    expect(first.id).not.toBe(second.id);
    expect(second.subject).toBeNull();

    const settings = await repo.getSettings('g1');
    expect(settings?.nextNumber).toBe(3);
    expect(settings?.isEnabled).toBe(false);
    expect((await repo.getSettings('g2'))?.nextNumber).toBe(2);
  });

  it('gives every ticket a different number when they are opened at once', async () => {
    const repo = new TicketRepository(db.client);
    const opened = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        repo.openTicket({ guildId: 'g1', channelId: `c${i}`, openerId: `u${i}` }),
      ),
    );
    expect(opened.map((t) => t.number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect((await repo.getSettings('g1'))?.nextNumber).toBe(6);
  });

  it('rolls the number back when the ticket cannot be inserted', async () => {
    const repo = new TicketRepository(db.client);
    await repo.openTicket({ guildId: 'g1', channelId: 'c1', openerId: 'u1' });

    // The channel already has a ticket: the unique index refuses the insert.
    await expect(
      repo.openTicket({ guildId: 'g1', channelId: 'c1', openerId: 'u2' }),
    ).rejects.toThrow();
    expect((await repo.getSettings('g1'))?.nextNumber).toBe(2);

    const next = await repo.openTicket({ guildId: 'g1', channelId: 'c2', openerId: 'u2' });
    expect(next.number).toBe(2);
  });

  it('finds a ticket by channel and by id', async () => {
    const repo = new TicketRepository(db.client);
    expect(await repo.findByChannelId('nope')).toBeNull();
    expect(await repo.findById(MISSING_UUID)).toBeNull();
    expect(await repo.exists(MISSING_UUID)).toBe(false);

    const ticket = await repo.openTicket({ guildId: 'g1', channelId: 'c1', openerId: 'u1' });
    expect((await repo.findByChannelId('c1'))?.id).toBe(ticket.id);
    expect((await repo.findById(ticket.id))?.channelId).toBe('c1');
    expect(await repo.exists(ticket.id)).toBe(true);
  });

  it('counts the open tickets of one member in one server', async () => {
    const repo = new TicketRepository(db.client);
    expect(await repo.countOpenForUser('g1', 'u1')).toBe(0);

    const a = await repo.openTicket({ guildId: 'g1', channelId: 'c1', openerId: 'u1' });
    await repo.openTicket({ guildId: 'g1', channelId: 'c2', openerId: 'u1' });
    await repo.openTicket({ guildId: 'g1', channelId: 'c3', openerId: 'u2' });
    await repo.openTicket({ guildId: 'g2', channelId: 'c4', openerId: 'u1' });
    expect(await repo.countOpenForUser('g1', 'u1')).toBe(2);
    expect(await repo.countOpenForUser('g1', 'u2')).toBe(1);
    expect(await repo.countOpenForUser('g2', 'u1')).toBe(1);

    await repo.close(a.id, { closedBy: 'staff' });
    expect(await repo.countOpenForUser('g1', 'u1')).toBe(1);
  });

  it('lists the open tickets of a server by number', async () => {
    const repo = new TicketRepository(db.client);
    expect(await repo.listOpen('g1')).toEqual([]);

    const a = await repo.openTicket({ guildId: 'g1', channelId: 'c1', openerId: 'u1' });
    const b = await repo.openTicket({ guildId: 'g1', channelId: 'c2', openerId: 'u2' });
    const c = await repo.openTicket({ guildId: 'g1', channelId: 'c3', openerId: 'u3' });
    await repo.openTicket({ guildId: 'g2', channelId: 'c4', openerId: 'u1' });
    await repo.close(b.id, { closedBy: 'staff' });

    expect((await repo.listOpen('g1')).map((t) => t.id)).toEqual([a.id, c.id]);
    expect((await repo.listOpen('g2')).map((t) => t.number)).toEqual([1]);
  });

  it('claims and unclaims an open ticket, and ignores a closed or missing one', async () => {
    const repo = new TicketRepository(db.client);
    const ticket = await repo.openTicket({ guildId: 'g1', channelId: 'c1', openerId: 'u1' });

    expect((await repo.setClaimedBy(ticket.id, 'staff'))?.claimedBy).toBe('staff');
    expect((await repo.findById(ticket.id))?.claimedBy).toBe('staff');
    expect((await repo.setClaimedBy(ticket.id, null))?.claimedBy).toBeNull();

    expect(await repo.setClaimedBy(MISSING_UUID, 'staff')).toBeNull();

    await repo.close(ticket.id, { closedBy: 'staff' });
    expect(await repo.setClaimedBy(ticket.id, 'other')).toBeNull();
    expect((await repo.findById(ticket.id))?.claimedBy).toBeNull();
  });

  it('closes an open ticket once and treats a second close as a no-op', async () => {
    const repo = new TicketRepository(db.client);
    const ticket = await repo.openTicket({ guildId: 'g1', channelId: 'c1', openerId: 'u1' });
    await repo.setClaimedBy(ticket.id, 'staff');

    expect(await repo.close(ticket.id, { closedBy: 'u1', reason: 'Solved', closedAt: T0 })).toBe(
      true,
    );
    const closed = await repo.findById(ticket.id);
    expect(closed).toMatchObject({
      status: 'closed',
      closedBy: 'u1',
      closeReason: 'Solved',
      claimedBy: 'staff',
    });
    expect(closed?.closedAt?.getTime()).toBe(T0.getTime());

    expect(await repo.close(ticket.id, { closedBy: 'staff', reason: 'Again' })).toBe(false);
    const again = await repo.findById(ticket.id);
    expect(again?.closedBy).toBe('u1');
    expect(again?.closeReason).toBe('Solved');
    expect(again?.closedAt?.getTime()).toBe(T0.getTime());

    expect(await repo.close(MISSING_UUID, { closedBy: 'staff' })).toBe(false);
  });

  it('closes a ticket with no closer when its channel was deleted', async () => {
    const repo = new TicketRepository(db.client);
    const ticket = await repo.openTicket({ guildId: 'g1', channelId: 'c1', openerId: 'u1' });

    expect(await repo.close(ticket.id, { closedBy: null, reason: 'Channel deleted' })).toBe(true);
    expect(await repo.findById(ticket.id)).toMatchObject({
      status: 'closed',
      closedBy: null,
      closeReason: 'Channel deleted',
    });
  });

  it('stamps the close time and allows no reason', async () => {
    const repo = new TicketRepository(db.client);
    const ticket = await repo.openTicket({ guildId: 'g1', channelId: 'c1', openerId: 'u1' });
    const before = Date.now();
    expect(await repo.close(ticket.id, { closedBy: 'u1' })).toBe(true);
    const closed = await repo.findById(ticket.id);
    expect(closed?.closeReason).toBeNull();
    expect(closed?.closedAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('keeps a number after the ticket closes, so numbers are never reused', async () => {
    const repo = new TicketRepository(db.client);
    const first = await repo.openTicket({ guildId: 'g1', channelId: 'c1', openerId: 'u1' });
    await repo.close(first.id, { closedBy: 'u1' });
    const second = await repo.openTicket({ guildId: 'g1', channelId: 'c2', openerId: 'u1' });
    expect(second.number).toBe(2);
  });

  it('creates, updates, deletes and counts tickets through the base methods', async () => {
    const repo = new TicketRepository(db.client);
    expect(await repo.count()).toBe(0);

    const created = await repo.create({
      guildId: 'g1',
      number: 7,
      channelId: 'c1',
      openerId: 'u1',
    });
    expect(created).toMatchObject({ number: 7, status: 'open' });
    expect(await repo.count()).toBe(1);

    const updated = await repo.update(created.id, { subject: 'New subject' });
    expect(updated.subject).toBe('New subject');
    await expect(repo.update(MISSING_UUID, { subject: 'x' })).rejects.toThrow(DatabaseError);

    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.delete(created.id)).toBe(false);
    expect(await repo.count()).toBe(0);
  });

  it('joins a caller transaction and rolls the ticket back with it', async () => {
    const repo = new TicketRepository(db.client);

    await expect(
      withTransaction(db.client, async (tx) => {
        await repo.openTicket({ guildId: 'g1', channelId: 'c1', openerId: 'u1' }, tx);
        expect(await repo.countOpenForUser('g1', 'u1', tx)).toBe(1);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    expect(await repo.findByChannelId('c1')).toBeNull();
    expect(await repo.getSettings('g1')).toBeNull();
  });
});
