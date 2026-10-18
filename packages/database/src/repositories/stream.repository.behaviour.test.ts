import { describe, expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { StreamRepository } from './stream.repository.js';

type NewStreamerInput = Parameters<StreamRepository['create']>[0];

const MISSING_UUID = '00000000-0000-4000-8000-000000000001';
const T0 = new Date('2026-09-17T20:00:00.000Z');

const streamer = (platformUserId: string, overrides: Record<string, unknown> = {}) =>
  ({
    platform: 'twitch',
    platformUserId,
    username: `user_${platformUserId}`,
    ...overrides,
  }) as NewStreamerInput;

describeDialects('StreamRepository', (db) => {
  /** The `ended_at` of a stream's event as epoch milliseconds, or null while it is still live. */
  async function endedAtOf(streamId: string): Promise<number | null> {
    const client = db.client;
    if (client.dialect === 'sqlite') {
      const row = client.raw
        .prepare('SELECT ended_at FROM stream_events WHERE stream_id = ?')
        .get(streamId) as { ended_at: number | null };
      return row.ended_at;
    }
    const { rows } = await client.raw.query<{ ended_at: Date | null }>(
      'SELECT ended_at FROM stream_events WHERE stream_id = $1',
      [streamId],
    );
    return rows[0]?.ended_at ? rows[0].ended_at.getTime() : null;
  }

  describe('streamers', () => {
    it('creates a streamer, upper-casing the platform, and reads it back', async () => {
      const repo = new StreamRepository(db.client);
      const created = await repo.create(streamer('1', { displayName: 'One', isLive: true }));

      expect(created.platform).toBe('TWITCH');
      expect(created.displayName).toBe('One');
      expect(created.isLive).toBe(true);
      expect(created.lastCheckedAt).toBeInstanceOf(Date);

      expect((await repo.findById(created.id))?.username).toBe('user_1');
      expect(await repo.exists(created.id)).toBe(true);
      expect(await repo.exists(MISSING_UUID)).toBe(false);
      expect(await repo.findById(MISSING_UUID)).toBeNull();
      expect(await repo.count()).toBe(1);
    });

    it('updates a streamer and throws for a missing one', async () => {
      const repo = new StreamRepository(db.client);
      const created = await repo.create(streamer('1'));

      const updated = await repo.update(created.id, { displayName: 'Renamed', isLive: true });
      expect(updated.displayName).toBe('Renamed');
      expect(updated.isLive).toBe(true);

      await expect(repo.update(MISSING_UUID, { displayName: 'x' })).rejects.toThrow(DatabaseError);
    });

    it('deletes a streamer once', async () => {
      const repo = new StreamRepository(db.client);
      const created = await repo.create(streamer('1'));

      expect(await repo.delete(created.id)).toBe(true);
      expect(await repo.delete(created.id)).toBe(false);
      expect(await repo.count()).toBe(0);
    });

    it('finds streamers by platform user and username ignoring case', async () => {
      const repo = new StreamRepository(db.client);
      const created = await repo.create(streamer('42', { username: 'CoolGamer' }));
      await repo.create(streamer('43', { platform: 'youtube', username: 'CoolGamer' }));

      expect((await repo.findByPlatformUser('TWITCH', '42'))?.id).toBe(created.id);
      expect((await repo.findByPlatformUser('twitch', '42'))?.id).toBe(created.id);
      expect(await repo.findByPlatformUser('twitch', '43')).toBeNull();
      expect((await repo.findByUsername('Twitch', 'coolgamer'))?.id).toBe(created.id);
      expect(await repo.findByUsername('tiktok', 'coolgamer')).toBeNull();
    });

    it('upserts: inserts first, then updates in place keeping untouched fields', async () => {
      const repo = new StreamRepository(db.client);
      const first = await repo.upsertStreamer({
        platform: 'twitch',
        platformUserId: '7',
        username: 'old_name',
        displayName: 'Display',
        avatarUrl: 'https://example.com/a.png',
        lastCheckedAt: T0,
      });
      expect(first.platform).toBe('TWITCH');
      expect(first.isLive).toBe(false);
      expect(first.lastCheckedAt.getTime()).toBe(T0.getTime());

      const second = await repo.upsertStreamer({
        platform: 'TWITCH',
        platformUserId: '7',
        username: 'new_name',
        isLive: true,
      });
      expect(second.id).toBe(first.id);
      expect(second.username).toBe('new_name');
      expect(second.displayName).toBe('Display');
      expect(second.avatarUrl).toBe('https://example.com/a.png');
      expect(second.isLive).toBe(true);

      const third = await repo.upsertStreamer({
        platform: 'TWITCH',
        platformUserId: '7',
        username: 'new_name',
        displayName: null,
        avatarUrl: null,
      });
      expect(third.displayName).toBeNull();
      expect(third.avatarUrl).toBeNull();
      expect(third.isLive).toBe(true);
      expect(await repo.count()).toBe(1);
    });

    it('updates the live flag and last check time', async () => {
      const repo = new StreamRepository(db.client);
      const created = await repo.create(streamer('1'));

      await repo.updateLiveStatus(created.id, true, T0);
      const live = await repo.findById(created.id);
      expect(live?.isLive).toBe(true);
      expect(live?.lastCheckedAt.getTime()).toBe(T0.getTime());

      await repo.updateLiveStatus(created.id, false);
      expect((await repo.findById(created.id))?.isLive).toBe(false);
    });

    it('lists every streamer, and only the monitored ones with a subscription', async () => {
      const repo = new StreamRepository(db.client);
      const watched = await repo.create(streamer('1'));
      await repo.create(streamer('2'));
      await repo.addSubscription({ streamerId: watched.id, guildId: 'g1', channelId: 'c1' });
      await repo.addSubscription({ streamerId: watched.id, guildId: 'g2', channelId: 'c2' });

      expect(await repo.listAllStreamers()).toHaveLength(2);
      const monitored = await repo.listActiveMonitoredStreamers();
      expect(monitored.map((s) => s.id)).toEqual([watched.id]);
    });
  });

  describe('subscriptions', () => {
    it('adds a subscription and updates the existing one for the same guild and streamer', async () => {
      const repo = new StreamRepository(db.client);
      const s = await repo.create(streamer('1'));

      const first = await repo.addSubscription({
        streamerId: s.id,
        guildId: 'g1',
        channelId: 'c1',
        customMessage: 'hello',
        mentionRoleId: 'r1',
      });
      expect(first.customMessage).toBe('hello');

      const again = await repo.addSubscription({
        streamerId: s.id,
        guildId: 'g1',
        channelId: 'c2',
      });
      expect(again.id).toBe(first.id);
      expect(again.channelId).toBe('c2');
      expect(again.customMessage).toBe('hello');
      expect(again.mentionRoleId).toBe('r1');

      const cleared = await repo.addSubscription({
        streamerId: s.id,
        guildId: 'g1',
        channelId: 'c2',
        customMessage: null,
        mentionRoleId: null,
      });
      expect(cleared.customMessage).toBeNull();
      expect(cleared.mentionRoleId).toBeNull();
      expect(await repo.countSubscriptionsByGuild('g1')).toBe(1);
    });

    it('finds subscriptions by guild and streamer, by id, and by streamer', async () => {
      const repo = new StreamRepository(db.client);
      const a = await repo.create(streamer('1'));
      const b = await repo.create(streamer('2'));
      const subA = await repo.addSubscription({ streamerId: a.id, guildId: 'g1', channelId: 'c1' });
      await repo.addSubscription({ streamerId: b.id, guildId: 'g1', channelId: 'c1' });
      await repo.addSubscription({ streamerId: a.id, guildId: 'g2', channelId: 'c9' });

      expect((await repo.findSubscription('g1', a.id))?.id).toBe(subA.id);
      expect(await repo.findSubscription('g3', a.id)).toBeNull();
      expect((await repo.findSubscriptionById(subA.id))?.guildId).toBe('g1');
      expect(await repo.findSubscriptionById(MISSING_UUID)).toBeNull();
      expect(await repo.findSubscriptionById('not-a-uuid')).toBeNull();
      expect(await repo.getSubscriptionsByGuild('g1')).toHaveLength(2);
      expect(await repo.getSubscriptionsByGuild('g3')).toEqual([]);
      expect(await repo.getSubscriptionsByStreamer(a.id)).toHaveLength(2);
      expect(await repo.countSubscriptionsByGuild('g1')).toBe(2);
      expect(await repo.countSubscriptionsByGuild('g3')).toBe(0);
    });

    it('lists a guild subscriptions together with their streamers', async () => {
      const repo = new StreamRepository(db.client);
      const a = await repo.create(streamer('1'));
      await repo.addSubscription({ streamerId: a.id, guildId: 'g1', channelId: 'c1' });
      await repo.addSubscription({ streamerId: a.id, guildId: 'g2', channelId: 'c2' });

      const rows = await repo.listGuildSubscriptionsWithStreamers('g1');
      expect(rows).toHaveLength(1);
      expect(rows[0]?.streamer.id).toBe(a.id);
      expect(rows[0]?.subscription.channelId).toBe('c1');
      expect(await repo.listGuildSubscriptionsWithStreamers('g9')).toEqual([]);
    });

    it('updates a subscription only inside its own guild', async () => {
      const repo = new StreamRepository(db.client);
      const a = await repo.create(streamer('1'));
      const sub = await repo.addSubscription({ streamerId: a.id, guildId: 'g1', channelId: 'c1' });

      const updated = await repo.updateSubscription('g1', sub.id, {
        channelId: 'c5',
        customMessage: 'live!',
      });
      expect(updated?.channelId).toBe('c5');
      expect(updated?.customMessage).toBe('live!');

      expect(await repo.updateSubscription('g2', sub.id, { channelId: 'x' })).toBeNull();
      expect(await repo.updateSubscription('g1', MISSING_UUID, { channelId: 'x' })).toBeNull();
      expect(await repo.updateSubscription('g1', 'not-a-uuid', { channelId: 'x' })).toBeNull();
      expect((await repo.findSubscriptionById(sub.id))?.channelId).toBe('c5');
    });

    it('removes a subscription by guild and streamer, or by id inside its guild', async () => {
      const repo = new StreamRepository(db.client);
      const a = await repo.create(streamer('1'));
      const b = await repo.create(streamer('2'));
      await repo.addSubscription({ streamerId: a.id, guildId: 'g1', channelId: 'c1' });
      const subB = await repo.addSubscription({ streamerId: b.id, guildId: 'g1', channelId: 'c1' });

      expect(await repo.removeSubscription('g1', a.id)).toBe(true);
      expect(await repo.removeSubscription('g1', a.id)).toBe(false);

      expect(await repo.removeSubscriptionById('g2', subB.id)).toBe(false);
      expect(await repo.removeSubscriptionById('g1', 'not-a-uuid')).toBe(false);
      expect(await repo.removeSubscriptionById('g1', subB.id)).toBe(true);
      expect(await repo.removeSubscriptionById('g1', subB.id)).toBe(false);
      expect(await repo.countSubscriptionsByGuild('g1')).toBe(0);
    });
  });

  describe('events, announcements and assets', () => {
    it('records a stream event and ends every event of the stream', async () => {
      const repo = new StreamRepository(db.client);
      const s = await repo.create(streamer('1'));

      const event = await repo.recordStreamEvent({
        streamerId: s.id,
        streamId: 'stream-1',
        title: 'Late night',
        startedAt: T0,
      });
      expect(event.gameName).toBeNull();
      expect(event.viewerCount).toBe(0);
      expect(event.endedAt).toBeNull();

      const withGame = await repo.recordStreamEvent({
        streamerId: s.id,
        streamId: 'stream-2',
        title: 'Ranked',
        gameName: 'Chess',
        viewerCount: 150,
        startedAt: T0,
        endedAt: T0,
      });
      expect(withGame.gameName).toBe('Chess');
      expect(withGame.viewerCount).toBe(150);
      expect(withGame.endedAt?.getTime()).toBe(T0.getTime());

      const end = new Date('2026-09-17T21:30:00.000Z');
      expect(await endedAtOf('stream-1')).toBeNull();
      await repo.endStreamEvent('stream-1', end);
      expect(await endedAtOf('stream-1')).toBe(end.getTime());
      expect(await endedAtOf('stream-2')).toBe(T0.getTime());

      await repo.endStreamEvent('stream-1');
      expect(await endedAtOf('stream-1')).toBeGreaterThan(end.getTime());
      await expect(repo.endStreamEvent('unknown-stream', end)).resolves.toBeUndefined();
    });

    it('detects announcements by idempotency key and rejects a duplicate key', async () => {
      const repo = new StreamRepository(db.client);
      const key = 'TWITCH:stream_1:g1:c1';
      expect(await repo.isAnnounced(key)).toBe(false);

      const recorded = await repo.recordAnnouncement({
        idempotencyKey: key,
        guildId: 'g1',
        channelId: 'c1',
        messageId: 'm1',
        announcedAt: T0,
      });
      expect(recorded.messageId).toBe('m1');
      expect(recorded.announcedAt.getTime()).toBe(T0.getTime());
      expect(await repo.isAnnounced(key)).toBe(true);
      expect(await repo.isAnnounced('other')).toBe(false);

      await expect(
        repo.recordAnnouncement({
          idempotencyKey: key,
          guildId: 'g1',
          channelId: 'c1',
          messageId: 'm2',
        }),
      ).rejects.toThrow();
      const defaulted = await repo.recordAnnouncement({
        idempotencyKey: 'another',
        guildId: 'g1',
        channelId: 'c1',
        messageId: 'm3',
      });
      expect(defaulted.announcedAt).toBeInstanceOf(Date);
    });

    it('caches a thumbnail asset and replaces it on a second save', async () => {
      const repo = new StreamRepository(db.client);
      expect(await repo.getCachedAsset('s1')).toBeNull();

      const first = await repo.saveCachedAsset({
        streamId: 's1',
        originalUrl: 'https://example.com/a.jpg',
        discordAttachmentUrl: 'https://cdn.example.com/a.jpg',
        fileHash: 'hash-a',
        cachedAt: T0,
      });
      expect(first.fileHash).toBe('hash-a');
      expect(first.cachedAt.getTime()).toBe(T0.getTime());

      const second = await repo.saveCachedAsset({
        streamId: 's1',
        originalUrl: 'https://example.com/b.jpg',
        discordAttachmentUrl: 'https://cdn.example.com/b.jpg',
        fileHash: 'hash-b',
      });
      expect(second.fileHash).toBe('hash-b');
      expect((await repo.getCachedAsset('s1'))?.originalUrl).toBe('https://example.com/b.jpg');
    });
  });
});
