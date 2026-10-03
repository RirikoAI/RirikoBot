import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { ReminderRepository } from './reminder.repository.js';

const MISSING_UUID = '00000000-0000-4000-8000-000000000001';
const T0 = new Date('2026-09-23T01:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

const reminder = (userId: string, minutes: number, overrides: Record<string, unknown> = {}) => ({
  userId,
  guildId: 'g1',
  channelId: 'c1',
  message: `note at ${minutes}`,
  triggerAt: at(minutes),
  ...overrides,
});

describeDialects('ReminderRepository behaviour', (db) => {
  it('creates a reminder with defaults and reads it back', async () => {
    const repo = new ReminderRepository(db.client);
    expect(await repo.findById(MISSING_UUID)).toBeNull();
    expect(await repo.exists(MISSING_UUID)).toBe(false);
    expect(await repo.count()).toBe(0);

    const created = await repo.create(reminder('u1', 10, { guildId: null }));
    expect(created.repeatInterval).toBe('NONE');
    expect(created.isCompleted).toBe(false);
    expect(created.guildId).toBeNull();
    expect(created.triggerAt.getTime()).toBe(at(10).getTime());

    expect((await repo.findById(created.id))?.message).toBe('note at 10');
    expect(await repo.exists(created.id)).toBe(true);
    expect(await repo.count()).toBe(1);

    const id = randomUUID();
    expect((await repo.create(reminder('u1', 20, { id }))).id).toBe(id);
  });

  it('updates a reminder and throws for a missing one', async () => {
    const repo = new ReminderRepository(db.client);
    const created = await repo.create(reminder('u1', 10));

    const updated = await repo.update(created.id, { message: 'edited', repeatInterval: 'DAILY' });
    expect(updated.message).toBe('edited');
    expect(updated.repeatInterval).toBe('DAILY');

    await expect(repo.update(MISSING_UUID, { message: 'x' })).rejects.toThrow(DatabaseError);
  });

  it('deletes a reminder once', async () => {
    const repo = new ReminderRepository(db.client);
    const created = await repo.create(reminder('u1', 10));

    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.delete(created.id)).toBe(false);
    expect(await repo.count()).toBe(0);
  });

  it('lists and counts the active reminders of a user, soonest first', async () => {
    const repo = new ReminderRepository(db.client);
    const later = await repo.create(reminder('u1', 30));
    const sooner = await repo.create(reminder('u1', 5));
    await repo.create(reminder('u1', 1, { isCompleted: true }));
    await repo.create(reminder('u2', 2));

    expect((await repo.listActiveByUser('u1')).map((r) => r.id)).toEqual([sooner.id, later.id]);
    expect(await repo.countActiveByUser('u1')).toBe(2);
    expect(await repo.countActiveByUser('nobody')).toBe(0);
    expect(await repo.listActiveByUser('nobody')).toEqual([]);
  });

  it('finds the active reminders that are due, oldest first, up to the limit', async () => {
    const repo = new ReminderRepository(db.client);
    const second = await repo.create(reminder('u1', 2));
    const first = await repo.create(reminder('u2', 1));
    await repo.create(reminder('u1', 3, { isCompleted: true }));
    await repo.create(reminder('u1', 90));

    expect((await repo.findDue(at(5))).map((r) => r.id)).toEqual([first.id, second.id]);
    expect((await repo.findDue(at(5), 1)).map((r) => r.id)).toEqual([first.id]);
    expect(await repo.findDue(at(0))).toEqual([]);
  });

  it('lets one caller claim a reminder, and re-arms it for the next occurrence', async () => {
    const repo = new ReminderRepository(db.client);
    const created = await repo.create(reminder('u1', 1, { repeatInterval: 'DAILY' }));

    expect(await repo.claim(created.id)).toBe(true);
    expect(await repo.claim(created.id)).toBe(false);
    expect(await repo.claim(MISSING_UUID)).toBe(false);
    expect((await repo.findById(created.id))?.isCompleted).toBe(true);
    expect(await repo.findDue(at(5))).toEqual([]);

    const rearmed = await repo.reschedule(created.id, at(1441));
    expect(rearmed.isCompleted).toBe(false);
    expect(rearmed.triggerAt.getTime()).toBe(at(1441).getTime());
    expect((await repo.findDue(at(1500))).map((r) => r.id)).toEqual([created.id]);
  });

  it('deletes a reminder only for its owner', async () => {
    const repo = new ReminderRepository(db.client);
    const created = await repo.create(reminder('u1', 1));

    expect(await repo.deleteForUser(created.id, 'u2')).toBe(false);
    expect(await repo.exists(created.id)).toBe(true);
    expect(await repo.deleteForUser(created.id, 'u1')).toBe(true);
    expect(await repo.deleteForUser(created.id, 'u1')).toBe(false);
  });
});
