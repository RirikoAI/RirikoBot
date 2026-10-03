import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { CardTradeRepository } from './card-trade.repository.js';

const MISSING_UUID = '00000000-0000-4000-8000-000000000001';
const T0 = new Date('2026-04-10T10:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

const trade = (sender: string, receiver: string, overrides: Record<string, unknown> = {}) => ({
  senderUserId: sender,
  receiverUserId: receiver,
  ...overrides,
});

describeDialects('CardTradeRepository behaviour', (db) => {
  it('creates a trade with defaults and reads it back', async () => {
    const repo = new CardTradeRepository(db.client);
    expect(await repo.findById(MISSING_UUID)).toBeNull();
    expect(await repo.exists(MISSING_UUID)).toBe(false);
    expect(await repo.count()).toBe(0);

    const created = await repo.create(trade('alice', 'bob'));
    expect(created.status).toBe('PENDING');
    expect(created.offeredCardIds).toEqual([]);
    expect(created.requestedCardIds).toEqual([]);
    expect(created.offeredCredits).toBe(0);
    expect(created.requestedCredits).toBe(0);
    expect(created.resolvedAt).toBeNull();
    expect(created.createdAt).toBeInstanceOf(Date);

    expect((await repo.findById(created.id))?.senderUserId).toBe('alice');
    expect(await repo.exists(created.id)).toBe(true);
    expect(await repo.count()).toBe(1);
  });

  it('keeps explicit offers, requests, credits and timestamps', async () => {
    const repo = new CardTradeRepository(db.client);
    const cardA = randomUUID();
    const cardB = randomUUID();

    const created = await repo.create(
      trade('alice', 'bob', {
        id: randomUUID(),
        offeredCardIds: [cardA],
        requestedCardIds: [cardB],
        offeredCredits: 500,
        requestedCredits: 250,
        status: 'ACCEPTED',
        createdAt: at(0),
        resolvedAt: at(5),
      }),
    );

    expect(created.offeredCardIds).toEqual([cardA]);
    expect(created.requestedCardIds).toEqual([cardB]);
    expect(created.offeredCredits).toBe(500);
    expect(created.requestedCredits).toBe(250);
    expect(created.status).toBe('ACCEPTED');
    expect(created.createdAt.getTime()).toBe(at(0).getTime());
    expect(created.resolvedAt?.getTime()).toBe(at(5).getTime());
  });

  it('wraps a duplicate id in a DatabaseError', async () => {
    const repo = new CardTradeRepository(db.client);
    const created = await repo.create(trade('alice', 'bob'));

    await expect(repo.create(trade('carol', 'dave', { id: created.id }))).rejects.toThrow(
      /Failed to create card trade/,
    );
  });

  it('updates a trade, coercing credits, and throws for a missing one', async () => {
    const repo = new CardTradeRepository(db.client);
    const created = await repo.create(trade('alice', 'bob'));

    const updated = await repo.update(created.id, { offeredCredits: 700, requestedCredits: 100 });
    expect(updated.offeredCredits).toBe(700);
    expect(updated.requestedCredits).toBe(100);
    expect((await repo.update(created.id, { status: 'REJECTED' })).offeredCredits).toBe(700);

    await expect(repo.update(MISSING_UUID, { offeredCredits: 1 })).rejects.toThrow(DatabaseError);
    await expect(repo.update(created.id, { createdAt: 'bad' as never })).rejects.toThrow(
      /Failed to update card trade/,
    );
  });

  it('stamps resolution time when a status is set, and clears it for pending', async () => {
    const repo = new CardTradeRepository(db.client);
    const created = await repo.create(trade('alice', 'bob'));

    const accepted = await repo.updateStatus(created.id, 'ACCEPTED');
    expect(accepted.status).toBe('ACCEPTED');
    expect(accepted.resolvedAt).toBeInstanceOf(Date);

    const reopened = await repo.updateStatus(created.id, 'PENDING');
    expect(reopened.status).toBe('PENDING');
    expect(reopened.resolvedAt).toBeNull();
  });

  it('moves a trade between statuses only from the expected one', async () => {
    const repo = new CardTradeRepository(db.client);
    const created = await repo.create(trade('alice', 'bob'));

    const claimed = await repo.transitionStatus(created.id, 'PENDING', 'ACCEPTED');
    expect(claimed?.status).toBe('ACCEPTED');
    expect(claimed?.resolvedAt).toBeInstanceOf(Date);
    expect(await repo.transitionStatus(created.id, 'PENDING', 'CANCELLED')).toBeNull();
    expect(await repo.transitionStatus(MISSING_UUID, 'PENDING', 'ACCEPTED')).toBeNull();

    const reopened = await repo.transitionStatus(created.id, 'ACCEPTED', 'PENDING');
    expect(reopened?.resolvedAt).toBeNull();
  });

  it('lists the pending trades a user sent or received, newest first', async () => {
    const repo = new CardTradeRepository(db.client);
    const sent = await repo.create(trade('alice', 'bob', { createdAt: at(1) }));
    const received = await repo.create(trade('carol', 'alice', { createdAt: at(2) }));
    await repo.create(trade('alice', 'dave', { createdAt: at(3), status: 'ACCEPTED' }));
    await repo.create(trade('erin', 'frank', { createdAt: at(4) }));

    expect((await repo.listPendingTradesForUser('alice')).map((t) => t.id)).toEqual([
      received.id,
      sent.id,
    ]);
    expect(await repo.listPendingTradesForUser('nobody')).toEqual([]);
  });

  it('finds the pending trade between two users in either direction', async () => {
    const repo = new CardTradeRepository(db.client);
    const open = await repo.create(trade('alice', 'bob'));
    await repo.create(trade('alice', 'carol', { status: 'REJECTED' }));

    expect((await repo.findActiveTradeBetween('alice', 'bob'))?.id).toBe(open.id);
    expect((await repo.findActiveTradeBetween('bob', 'alice'))?.id).toBe(open.id);
    expect(await repo.findActiveTradeBetween('alice', 'carol')).toBeNull();
    expect(await repo.findActiveTradeBetween('bob', 'carol')).toBeNull();
  });

  it('deletes a trade once', async () => {
    const repo = new CardTradeRepository(db.client);
    const created = await repo.create(trade('alice', 'bob'));

    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.delete(created.id)).toBe(false);
    expect(await repo.count()).toBe(0);
  });
});
