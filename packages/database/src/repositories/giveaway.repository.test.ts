import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { SqliteDatabaseClient } from '../client/types.js';
import { GiveawayRepository } from './giveaway.repository.js';

describe('GiveawayRepository (TASK-0901)', () => {
  let client: SqliteDatabaseClient;
  let giveawayRepo: GiveawayRepository;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    client.raw.exec(`
      CREATE TABLE giveaways (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        prize TEXT NOT NULL,
        winner_count INTEGER NOT NULL DEFAULT 1,
        starts_at INTEGER NOT NULL,
        ends_at INTEGER NOT NULL,
        is_ended INTEGER NOT NULL DEFAULT 0,
        requirements TEXT DEFAULT '{}',
        created_by TEXT NOT NULL
      );

      CREATE TABLE giveaway_entries (
        giveaway_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        bonus_multiplier INTEGER NOT NULL DEFAULT 1,
        entered_at INTEGER NOT NULL,
        PRIMARY KEY (giveaway_id, user_id)
      );

      CREATE TABLE giveaway_winners (
        giveaway_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        won_at INTEGER NOT NULL,
        is_reroll INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (giveaway_id, user_id)
      );
    `);

    giveawayRepo = new GiveawayRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  describe('Giveaway Lifecycle CRUD', () => {
    it('should create and retrieve a giveaway by id and messageId', async () => {
      const startsAt = new Date('2026-09-17T20:00:00.000Z');
      const endsAt = new Date('2026-09-18T20:00:00.000Z');

      const created = await giveawayRepo.create({
        id: 'gw-101',
        guildId: 'guild-1',
        channelId: 'chan-1',
        messageId: 'msg-101',
        prize: 'Discord Nitro 1 Month',
        winnerCount: 2,
        startsAt,
        endsAt,
        isEnded: false,
        requirements: { minAccountAgeDays: 7 },
        createdBy: 'user-host',
      });

      expect(created.id).toBe('gw-101');
      expect(created.prize).toBe('Discord Nitro 1 Month');
      expect(created.winnerCount).toBe(2);

      const byId = await giveawayRepo.findById('gw-101');
      expect(byId).not.toBeNull();
      expect(byId?.prize).toBe('Discord Nitro 1 Month');

      const byMsg = await giveawayRepo.findByMessageId('msg-101');
      expect(byMsg).not.toBeNull();
      expect(byMsg?.id).toBe('gw-101');

      const exists = await giveawayRepo.exists('gw-101');
      expect(exists).toBe(true);
    });

    it('should list active and expired pending giveaways accurately', async () => {
      const now = new Date('2026-09-17T22:00:00.000Z');
      const past = new Date('2026-09-17T21:00:00.000Z');
      const future = new Date('2026-09-17T23:00:00.000Z');

      // 1. Expired but not yet rolled/ended (crash recovery target)
      await giveawayRepo.create({
        id: 'gw-expired',
        guildId: 'guild-1',
        channelId: 'chan-1',
        messageId: 'msg-expired',
        prize: 'Game Key',
        endsAt: past,
        isEnded: false,
        createdBy: 'host-1',
      });

      // 2. Active future giveaway
      await giveawayRepo.create({
        id: 'gw-future',
        guildId: 'guild-1',
        channelId: 'chan-1',
        messageId: 'msg-future',
        prize: 'Steam Card',
        endsAt: future,
        isEnded: false,
        createdBy: 'host-1',
      });

      // 3. Ended giveaway
      await giveawayRepo.create({
        id: 'gw-ended',
        guildId: 'guild-1',
        channelId: 'chan-1',
        messageId: 'msg-ended',
        prize: 'Role Reward',
        endsAt: past,
        isEnded: true,
        createdBy: 'host-1',
      });

      const active = await giveawayRepo.listActiveGiveaways('guild-1');
      expect(active.length).toBe(2); // gw-expired and gw-future are both isEnded: false

      const expiredPending = await giveawayRepo.listExpiredPendingGiveaways(now);
      expect(expiredPending.length).toBe(1);
      expect(expiredPending[0]?.id).toBe('gw-expired');
    });

    it('should delete a giveaway and clean up cascade relations', async () => {
      const giveaway = await giveawayRepo.create({
        id: 'gw-to-delete',
        guildId: 'guild-1',
        channelId: 'chan-1',
        messageId: 'msg-del',
        prize: 'Anime Figure',
        endsAt: new Date(Date.now() + 60000),
        createdBy: 'host-1',
      });

      await giveawayRepo.addEntry(giveaway.id, 'user-1', 2);
      await giveawayRepo.recordWinners(giveaway.id, ['user-1']);

      const deleted = await giveawayRepo.delete(giveaway.id);
      expect(deleted).toBe(true);

      expect(await giveawayRepo.findById(giveaway.id)).toBeNull();
      expect(await giveawayRepo.getEntries(giveaway.id)).toHaveLength(0);
      expect(await giveawayRepo.getWinners(giveaway.id)).toHaveLength(0);
    });
  });

  describe('Giveaway Entries & Multipliers', () => {
    it('should register unique entries and prevent duplicates', async () => {
      const giveaway = await giveawayRepo.create({
        id: 'gw-entries-test',
        guildId: 'guild-1',
        channelId: 'chan-1',
        messageId: 'msg-entry',
        prize: 'Special Badge',
        endsAt: new Date(Date.now() + 60000),
        createdBy: 'host-1',
      });

      const enteredFirst = await giveawayRepo.addEntry(giveaway.id, 'user-alpha', 3);
      expect(enteredFirst).toBe(true);

      const enteredSecondTime = await giveawayRepo.addEntry(giveaway.id, 'user-alpha', 5);
      expect(enteredSecondTime).toBe(false);

      const count = await giveawayRepo.getEntryCount(giveaway.id);
      expect(count).toBe(1);

      const hasEntered = await giveawayRepo.hasUserEntered(giveaway.id, 'user-alpha');
      expect(hasEntered).toBe(true);

      const hasNotEntered = await giveawayRepo.hasUserEntered(giveaway.id, 'user-bravo');
      expect(hasNotEntered).toBe(false);

      const entries = await giveawayRepo.getEntries(giveaway.id);
      expect(entries[0]?.userId).toBe('user-alpha');
      expect(entries[0]?.bonusMultiplier).toBe(3);
    });

    it('should remove entry cleanly', async () => {
      const giveaway = await giveawayRepo.create({
        id: 'gw-remove-test',
        guildId: 'guild-1',
        channelId: 'chan-1',
        messageId: 'msg-remove',
        prize: '1000 Coins',
        endsAt: new Date(Date.now() + 60000),
        createdBy: 'host-1',
      });

      await giveawayRepo.addEntry(giveaway.id, 'user-x', 1);
      expect(await giveawayRepo.hasUserEntered(giveaway.id, 'user-x')).toBe(true);

      const removed = await giveawayRepo.removeEntry(giveaway.id, 'user-x');
      expect(removed).toBe(true);
      expect(await giveawayRepo.hasUserEntered(giveaway.id, 'user-x')).toBe(false);
    });
  });

  describe('Winners & End Transitions', () => {
    it('should atomically end a giveaway and record winners', async () => {
      const giveaway = await giveawayRepo.create({
        id: 'gw-end-test',
        guildId: 'guild-1',
        channelId: 'chan-1',
        messageId: 'msg-end',
        prize: 'Steam Deck',
        winnerCount: 2,
        endsAt: new Date(Date.now() + 60000),
        createdBy: 'host-1',
      });

      await giveawayRepo.addEntry(giveaway.id, 'user-win1', 1);
      await giveawayRepo.addEntry(giveaway.id, 'user-win2', 2);

      await giveawayRepo.endGiveaway(giveaway.id, ['user-win1', 'user-win2']);

      const updated = await giveawayRepo.findById(giveaway.id);
      expect(updated?.isEnded).toBe(true);

      const winners = await giveawayRepo.getWinners(giveaway.id);
      expect(winners).toHaveLength(2);
      expect(winners.map((w) => w.userId).sort()).toEqual(['user-win1', 'user-win2']);
    });

    it('should record reroll winners with isReroll flag', async () => {
      const giveaway = await giveawayRepo.create({
        id: 'gw-reroll-test',
        guildId: 'guild-1',
        channelId: 'chan-1',
        messageId: 'msg-reroll',
        prize: 'T-Shirt',
        endsAt: new Date(Date.now() + 60000),
        createdBy: 'host-1',
      });

      await giveawayRepo.recordWinners(giveaway.id, ['user-reroll-winner'], true);

      const winners = await giveawayRepo.getWinners(giveaway.id);
      expect(winners).toHaveLength(1);
      expect(winners[0]?.userId).toBe('user-reroll-winner');
      expect(winners[0]?.isReroll).toBe(true);
    });
  });
});
