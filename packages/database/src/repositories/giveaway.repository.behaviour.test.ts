import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { GiveawayRepository } from './giveaway.repository.js';

/** The id is optional at runtime (generated when omitted), though the row type requires it. */
type NewGiveawayInput = Parameters<GiveawayRepository['create']>[0];

const MISSING_UUID = '00000000-0000-4000-8000-000000000001';
const T0 = new Date('2026-09-01T12:00:00Z');
const HOUR = 3_600_000;
const at = (hours: number) => new Date(T0.getTime() + hours * HOUR);

let messageCounter = 0;
const giveaway = (guildId: string, overrides: Record<string, unknown> = {}) =>
  ({
    guildId,
    channelId: 'channel',
    messageId: `message-${++messageCounter}`,
    prize: 'Nitro',
    endsAt: at(24),
    createdBy: 'host',
    ...overrides,
  }) as NewGiveawayInput;

describeDialects('GiveawayRepository behaviour', (db) => {
  it('creates a giveaway with defaults and finds it by id and message id', async () => {
    const repo = new GiveawayRepository(db.client);
    expect(await repo.findById(MISSING_UUID)).toBeNull();
    expect(await repo.findByMessageId('nope')).toBeNull();
    expect(await repo.exists(MISSING_UUID)).toBe(false);
    expect(await repo.count()).toBe(0);

    const created = await repo.create(giveaway('g1', { messageId: 'm-1' }));
    expect(created.winnerCount).toBe(1);
    expect(created.isEnded).toBe(false);
    expect(created.requirements).toEqual({});
    expect(created.startsAt).toBeInstanceOf(Date);

    expect((await repo.findById(created.id))?.prize).toBe('Nitro');
    expect((await repo.findByMessageId('m-1'))?.id).toBe(created.id);
    expect(await repo.exists(created.id)).toBe(true);
    expect(await repo.count()).toBe(1);

    const explicit = await repo.create(
      giveaway('g1', {
        id: randomUUID(),
        winnerCount: 3,
        requirements: { minLevel: 5 },
        startsAt: at(-1),
      }),
    );
    expect(explicit.winnerCount).toBe(3);
    expect(explicit.requirements).toEqual({ minLevel: 5 });
    expect(explicit.startsAt.getTime()).toBe(at(-1).getTime());
  });

  it('updates a giveaway and throws for a missing one', async () => {
    const repo = new GiveawayRepository(db.client);
    const created = await repo.create(giveaway('g1'));

    const updated = await repo.update(created.id, { prize: 'Steam key', winnerCount: 2 });
    expect(updated.prize).toBe('Steam key');
    expect(updated.winnerCount).toBe(2);

    await expect(repo.update(MISSING_UUID, { prize: 'x' })).rejects.toThrow(DatabaseError);
  });

  it('lists active, expired and guild giveaways', async () => {
    const repo = new GiveawayRepository(db.client);
    const soon = await repo.create(giveaway('g1', { endsAt: at(1), startsAt: at(-3) }));
    const later = await repo.create(giveaway('g1', { endsAt: at(48), startsAt: at(-2) }));
    const other = await repo.create(giveaway('g2', { endsAt: at(1), startsAt: at(-1) }));
    const ended = await repo.create(giveaway('g1', { isEnded: true, startsAt: at(-5) }));

    const ids = (list: { id: string }[]) => list.map((g) => g.id).sort();
    expect(ids(await repo.listActiveGiveaways())).toEqual(ids([soon, later, other]));
    expect(ids(await repo.listActiveGiveaways('g1'))).toEqual(ids([soon, later]));
    expect(ids(await repo.listExpiredPendingGiveaways(at(2)))).toEqual(ids([soon, other]));
    expect(await repo.listExpiredPendingGiveaways(at(0))).toEqual([]);
    expect(Array.isArray(await repo.listExpiredPendingGiveaways())).toBe(true);

    expect((await repo.listGuildGiveaways('g1')).map((g) => g.id)).toEqual([
      later.id,
      soon.id,
      ended.id,
    ]);
    expect((await repo.listGuildGiveaways('g1', 1)).map((g) => g.id)).toEqual([later.id]);
    expect(await repo.listGuildGiveaways('nowhere')).toEqual([]);
  });

  it('records one entry per member and reports duplicates', async () => {
    const repo = new GiveawayRepository(db.client);
    const created = await repo.create(giveaway('g1'));

    expect(await repo.hasUserEntered(created.id, 'u1')).toBe(false);
    expect(await repo.addEntry(created.id, 'u1')).toBe(true);
    expect(await repo.addEntry(created.id, 'u1')).toBe(false);
    expect(await repo.addEntry(created.id, 'u2', 3)).toBe(true);
    expect(await repo.addEntry(created.id, 'u3', 0)).toBe(true);

    expect(await repo.hasUserEntered(created.id, 'u1')).toBe(true);
    expect(await repo.getEntryCount(created.id)).toBe(3);
    const entries = await repo.getEntries(created.id);
    const bonus = Object.fromEntries(entries.map((e) => [e.userId, e.bonusMultiplier]));
    expect(bonus).toEqual({ u1: 1, u2: 3, u3: 1 });
    expect(await repo.getEntries(MISSING_UUID)).toEqual([]);
    expect(await repo.getEntryCount(MISSING_UUID)).toBe(0);
  });

  it('reports a failed entry as not recorded instead of throwing', async () => {
    const repo = new GiveawayRepository(db.client);
    const created = await repo.create(giveaway('g1'));

    expect(await repo.addEntry(created.id, null as never)).toBe(false);
    expect(await repo.getEntryCount(created.id)).toBe(0);
  });

  it('removes an entry once', async () => {
    const repo = new GiveawayRepository(db.client);
    const created = await repo.create(giveaway('g1'));
    await repo.addEntry(created.id, 'u1');

    expect(await repo.removeEntry(created.id, 'u1')).toBe(true);
    expect(await repo.removeEntry(created.id, 'u1')).toBe(false);
    expect(await repo.getEntryCount(created.id)).toBe(0);
  });

  it('records winners and rerolls', async () => {
    const repo = new GiveawayRepository(db.client);
    const created = await repo.create(giveaway('g1'));

    expect(await repo.recordWinners(created.id, [])).toEqual([]);
    const first = await repo.recordWinners(created.id, ['u1', 'u2']);
    expect(first.map((w) => w.userId).sort()).toEqual(['u1', 'u2']);
    expect(first.every((w) => w.isReroll === false)).toBe(true);
    const reroll = await repo.recordWinners(created.id, ['u3'], true);
    expect(reroll[0]?.isReroll).toBe(true);

    expect((await repo.getWinners(created.id)).map((w) => w.userId).sort()).toEqual([
      'u1',
      'u2',
      'u3',
    ]);
    expect(await repo.getWinners(MISSING_UUID)).toEqual([]);
  });

  it('ends a giveaway once, recording winners only for the caller that ended it', async () => {
    const repo = new GiveawayRepository(db.client);
    const created = await repo.create(giveaway('g1'));

    expect(await repo.endGiveaway(created.id, ['u1', 'u2'])).toBe(true);
    expect((await repo.findById(created.id))?.isEnded).toBe(true);
    expect(await repo.getWinners(created.id)).toHaveLength(2);

    expect(await repo.endGiveaway(created.id, ['u9'])).toBe(false);
    expect((await repo.getWinners(created.id)).map((w) => w.userId).sort()).toEqual(['u1', 'u2']);

    const empty = await repo.create(giveaway('g1'));
    expect(await repo.endGiveaway(empty.id, [])).toBe(true);
    expect(await repo.getWinners(empty.id)).toEqual([]);
    expect(await repo.endGiveaway(MISSING_UUID, ['u1'])).toBe(false);
  });

  it('deletes a giveaway with its entries and winners', async () => {
    const repo = new GiveawayRepository(db.client);
    const doomed = await repo.create(giveaway('g1'));
    const kept = await repo.create(giveaway('g1'));
    await repo.addEntry(doomed.id, 'u1');
    await repo.recordWinners(doomed.id, ['u1']);
    await repo.addEntry(kept.id, 'u1');

    expect(await repo.delete(doomed.id)).toBe(true);
    expect(await repo.delete(doomed.id)).toBe(false);
    expect(await repo.getEntries(doomed.id)).toEqual([]);
    expect(await repo.getWinners(doomed.id)).toEqual([]);
    expect(await repo.getEntryCount(kept.id)).toBe(1);
    expect(await repo.count()).toBe(1);
  });
});
