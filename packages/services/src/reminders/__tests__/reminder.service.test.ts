import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDatabaseClient, ReminderRepository } from '@ririko/database';
import type { SqliteDatabaseClient } from '@ririko/database';
import { ReminderService, REMINDER_LIMITS, shortReminderId } from '../reminder.service.js';
import { ReminderScheduler, createDiscordReminderDelivery } from '../reminder.scheduler.js';

const NOW = new Date('2026-09-22T12:00:00Z');

// Mirrors the `reminders` table in the database package's SQLite DDL.
const REMINDERS_DDL = `
  CREATE TABLE reminders (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    guild_id TEXT,
    channel_id TEXT NOT NULL,
    message TEXT NOT NULL,
    trigger_at INTEGER NOT NULL,
    repeat_interval TEXT DEFAULT 'NONE' NOT NULL,
    is_completed INTEGER DEFAULT false NOT NULL
  );
`;
const KL = 'Asia/Kuala_Lumpur';

describe('ReminderService & ReminderScheduler (TASK-1412)', () => {
  let client: SqliteDatabaseClient;
  let repo: ReminderRepository;
  let service: ReminderService;
  let clock: Date;

  const base = { userId: 'u1', guildId: 'g1', channelId: 'c1', timeZone: KL };

  beforeEach(async () => {
    const raw = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = raw;
    client.raw.exec(REMINDERS_DDL);
    repo = new ReminderRepository(client);
    clock = NOW;
    service = new ReminderService({ repo, now: () => clock });
  });

  afterEach(async () => {
    await client.close();
  });

  describe('create', () => {
    it('stores the parsed time and the separate message', async () => {
      const reminder = await service.create({
        ...base,
        when: 'tomorrow 9am',
        message: 'Stand-up',
        repeat: 'DAILY',
      });
      expect(reminder).toMatchObject({
        message: 'Stand-up',
        repeatInterval: 'DAILY',
        isCompleted: false,
      });
      expect(reminder.triggerAt.toISOString()).toBe('2026-09-23T01:00:00.000Z');
    });

    it('takes the message from the rest of the text when none is given', async () => {
      const reminder = await service.create({
        ...base,
        guildId: null,
        when: 'call mom tomorrow at 6pm',
      });
      expect(reminder).toMatchObject({
        message: 'call mom',
        guildId: null,
        repeatInterval: 'NONE',
      });
    });

    it.each([
      [{ when: 'someday maybe', message: 'x' }, 'could not find a time'],
      [{ when: '2025-01-01 10:00', message: 'x' }, 'in the past'],
      [{ when: '2028-01-01 10:00', message: 'x' }, 'one year ahead'],
      [{ when: 'in 5 minutes' }, 'What should I remind you about'],
      [
        { when: '1h', message: 'x'.repeat(REMINDER_LIMITS.maxMessageLength + 1) },
        'at most 500 characters',
      ],
    ])('rejects %o', async (input, userMessage) => {
      await expect(service.create({ ...base, ...input })).rejects.toMatchObject({
        userMessage: expect.stringContaining(userMessage),
      });
    });

    it('caps active reminders per user', async () => {
      for (let i = 0; i < REMINDER_LIMITS.maxActivePerUser; i++) {
        await service.create({ ...base, when: `${i + 1}h`, message: `n${i}` });
      }
      await expect(
        service.create({ ...base, when: '1h', message: 'one more' }),
      ).rejects.toMatchObject({
        userMessage: expect.stringContaining('25 active reminders'),
      });
      await expect(
        service.create({ ...base, userId: 'u2', when: '1h', message: 'ok' }),
      ).resolves.toBeTruthy();
    });
  });

  describe('list and cancel', () => {
    it('cancels by short id, only for the owner, and rejects short or ambiguous ids', async () => {
      const a = await service.create({ ...base, when: '1h', message: 'a' });
      await service.create({ ...base, when: '2h', message: 'b' });

      await expect(service.cancel('u2', shortReminderId(a.id))).rejects.toMatchObject({
        userMessage: expect.stringContaining('no active reminder'),
      });
      await expect(service.cancel('u1', 'ab')).rejects.toMatchObject({
        userMessage: expect.stringContaining('id shown'),
      });

      expect((await service.cancel('u1', shortReminderId(a.id).toUpperCase())).message).toBe('a');
      expect((await service.list('u1')).map((r) => r.message)).toEqual(['b']);
    });
  });

  describe('scheduler', () => {
    const makeScheduler = (deliver: (r: { id: string }) => Promise<boolean>) =>
      new ReminderScheduler({
        repo,
        deliver: vi.fn(deliver),
        resolveTimeZone: async () => KL,
        now: () => clock,
        logger: { warn: vi.fn(), error: vi.fn() },
      });

    it('delivers due reminders once and completes one-off reminders', async () => {
      const r = await service.create({ ...base, when: '30m', message: 'tea' });
      const scheduler = makeScheduler(async () => true);

      expect(await scheduler.sweep()).toEqual({ delivered: 0, rescheduled: 0, dropped: 0 });

      clock = new Date('2026-09-22T12:31:00Z');
      expect(await scheduler.sweep()).toEqual({ delivered: 1, rescheduled: 0, dropped: 0 });
      expect(await scheduler.sweep()).toEqual({ delivered: 0, rescheduled: 0, dropped: 0 });
      expect((await repo.findById(r.id))?.isCompleted).toBe(true);
    });

    it('re-arms repeating reminders for the next slot', async () => {
      const r = await service.create({
        ...base,
        when: 'tomorrow 9am',
        message: 'pills',
        repeat: 'DAILY',
      });
      clock = new Date('2026-09-23T01:00:30Z');

      expect(await makeScheduler(async () => true).sweep()).toMatchObject({
        delivered: 1,
        rescheduled: 1,
      });
      const rearmed = await repo.findById(r.id);
      expect(rearmed?.isCompleted).toBe(false);
      expect(rearmed?.triggerAt.toISOString()).toBe('2026-09-24T01:00:00.000Z');
    });

    it('drops reminders, repeating ones included, when delivery fails everywhere', async () => {
      const once = await service.create({ ...base, when: '30m', message: 'a' });
      const daily = await service.create({ ...base, when: '30m', message: 'b', repeat: 'DAILY' });
      clock = new Date('2026-09-22T13:00:00Z');

      const scheduler = makeScheduler(async (reminder) => {
        if (reminder.id === daily.id) throw new Error('boom');
        return false;
      });
      expect(await scheduler.sweep()).toEqual({ delivered: 0, rescheduled: 0, dropped: 2 });
      expect((await repo.findById(once.id))?.isCompleted).toBe(true);
      expect((await repo.findById(daily.id))?.isCompleted).toBe(true);
      expect(await scheduler.sweep()).toEqual({ delivered: 0, rescheduled: 0, dropped: 0 });
    });
  });
});

describe('createDiscordReminderDelivery', () => {
  const reminder = {
    id: 'r1',
    userId: 'u1',
    guildId: 'g1',
    channelId: 'c1',
    message: 'drink water',
    triggerAt: NOW,
    repeatInterval: 'WEEKLY',
    isCompleted: true,
  };

  function fakeClient(options: { dm: boolean; channel: boolean }) {
    const user = {
      send: vi.fn(async () => (options.dm ? {} : Promise.reject(new Error('Cannot send DMs')))),
    };
    const channel = { isSendable: () => true, send: vi.fn(async () => ({})) };
    const client = {
      users: { fetch: vi.fn(async () => user) },
      channels: {
        fetch: vi.fn(async () =>
          options.channel ? channel : Promise.reject(new Error('Unknown Channel')),
        ),
      },
    };
    return { client: client as never, user, channel };
  }

  it('sends a DM first', async () => {
    const { client, user, channel } = fakeClient({ dm: true, channel: true });
    expect(await createDiscordReminderDelivery(client)(reminder)).toBe(true);
    expect(user.send).toHaveBeenCalledWith({
      content: '⏰ **Reminder:** drink water *(repeats weekly)*',
      allowedMentions: { parse: [] },
    });
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('falls back to the original channel, pinging only the user', async () => {
    const { client, channel } = fakeClient({ dm: false, channel: true });
    expect(await createDiscordReminderDelivery(client)(reminder)).toBe(true);
    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('<@u1>, ⏰ **Reminder:** drink water'),
        allowedMentions: { users: ['u1'] },
      }),
    );
  });

  it('reports failure when neither DM nor channel works', async () => {
    const { client } = fakeClient({ dm: false, channel: false });
    expect(await createDiscordReminderDelivery(client)(reminder)).toBe(false);
  });
});
