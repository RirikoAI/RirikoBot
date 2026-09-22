import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { SqliteDatabaseClient } from '../client/types.js';
import { ReminderRepository } from './reminder.repository.js';
import { SQLITE_SCHEMA_DDL } from '../schema/sqlite/ddl.js';

describe('ReminderRepository (TASK-1411)', () => {
  let client: SqliteDatabaseClient;
  let repo: ReminderRepository;
  const at = (iso: string) => new Date(iso);

  const add = (id: string, userId: string, triggerAt: string, isCompleted = false) =>
    repo.create({
      id,
      userId,
      guildId: 'guild-1',
      channelId: 'channel-1',
      message: `note ${id}`,
      triggerAt: at(triggerAt),
      isCompleted,
    });

  beforeEach(async () => {
    const raw = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = raw;
    client.raw.exec(SQLITE_SCHEMA_DDL);
    repo = new ReminderRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it('creates reminders with a generated id and default repeat', async () => {
    const created = await repo.create({
      userId: 'u1',
      guildId: null,
      channelId: 'dm-1',
      message: 'hello',
      triggerAt: at('2026-09-23T01:00:00Z'),
    });
    expect(created.id).toMatch(/[0-9a-f-]{36}/);
    expect(created).toMatchObject({ repeatInterval: 'NONE', isCompleted: false, guildId: null });
    expect((await repo.findById(created.id))?.triggerAt.toISOString()).toBe('2026-09-23T01:00:00.000Z');
    expect(await repo.count()).toBe(1);
  });

  it('lists and counts a user\'s active reminders soonest first', async () => {
    await add('b', 'u1', '2026-09-24T00:00:00Z');
    await add('a', 'u1', '2026-09-23T00:00:00Z');
    await add('done', 'u1', '2026-09-22T00:00:00Z', true);
    await add('other', 'u2', '2026-09-22T00:00:00Z');

    expect((await repo.listActiveByUser('u1')).map((r) => r.id)).toEqual(['a', 'b']);
    expect(await repo.countActiveByUser('u1')).toBe(2);
  });

  it('finds due active reminders, oldest first, up to the limit', async () => {
    await add('late', 'u1', '2026-09-22T10:00:00Z');
    await add('later', 'u2', '2026-09-22T11:00:00Z');
    await add('future', 'u1', '2026-09-23T00:00:00Z');
    await add('sent', 'u1', '2026-09-22T09:00:00Z', true);

    const now = at('2026-09-22T12:00:00Z');
    expect((await repo.findDue(now)).map((r) => r.id)).toEqual(['late', 'later']);
    expect((await repo.findDue(now, 1)).map((r) => r.id)).toEqual(['late']);
  });

  it('lets exactly one caller claim a reminder, and reschedule re-arms it', async () => {
    await add('r', 'u1', '2026-09-22T10:00:00Z');

    const results = await Promise.all([repo.claim('r'), repo.claim('r')]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await repo.claim('missing')).toBe(false);

    const rearmed = await repo.reschedule('r', at('2026-09-29T10:00:00Z'));
    expect(rearmed).toMatchObject({ isCompleted: false });
    expect(rearmed.triggerAt.toISOString()).toBe('2026-09-29T10:00:00.000Z');
  });

  it('deletes only the owner\'s reminder', async () => {
    await add('r', 'u1', '2026-09-22T10:00:00Z');
    expect(await repo.deleteForUser('r', 'u2')).toBe(false);
    expect(await repo.deleteForUser('r', 'u1')).toBe(true);
    expect(await repo.exists('r')).toBe(false);
  });
});
