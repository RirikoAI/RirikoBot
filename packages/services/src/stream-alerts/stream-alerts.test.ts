import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  AuditLogRepository,
  createDatabaseClient,
  StreamRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import type { StreamPlatformAdapter } from '../stream-platforms/types.js';
import {
  DEFAULT_STREAM_TEMPLATE,
  formatStreamAnnouncement,
  streamAnnouncementMentions,
} from './format.js';
import {
  cleanStreamerIdentifier,
  fallbackPlatformUserId,
  inferPlatform,
  parseStreamPlatform,
} from './handles.js';
import {
  MAX_STREAM_SUBSCRIPTIONS,
  StreamAlertError,
  StreamAlertService,
  type StreamAlertActor,
} from './stream-alert.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CHANNEL_ID = 'CHANNEL_ID';

describe('stream handles (TASK-1661)', () => {
  it('reads the platform from links and YouTube channel IDs; a bare name is Twitch', () => {
    expect(inferPlatform('https://www.youtube.com/@LofiGirl')).toBe('YOUTUBE');
    expect(inferPlatform('https://youtu.be/abc')).toBe('YOUTUBE');
    expect(inferPlatform('UCSJ4gkVC6NrvII8umztf0Ow')).toBe('YOUTUBE');
    expect(inferPlatform('https://www.tiktok.com/@someone/live')).toBe('TIKTOK');
    expect(inferPlatform('https://twitch.tv/shroud')).toBe('TWITCH');
    expect(inferPlatform('shroud')).toBe('TWITCH');
  });

  it('does not treat a Twitch name starting with "uc" as YouTube', () => {
    expect(inferPlatform('ucla')).toBe('TWITCH');
    expect(inferPlatform('ucanthelp')).toBe('TWITCH');
  });

  it('lets an explicit platform win in any case', () => {
    expect(inferPlatform('https://twitch.tv/shroud', 'youtube')).toBe('YOUTUBE');
    expect(inferPlatform('shroud', 'nope')).toBe('TWITCH');
    expect(parseStreamPlatform(' tiktok ')).toBe('TIKTOK');
    expect(parseStreamPlatform('kick')).toBeNull();
  });

  it('strips profile links, query strings and a leading @', () => {
    expect(cleanStreamerIdentifier('https://www.twitch.tv/shroud?ref=x')).toBe('shroud');
    expect(cleanStreamerIdentifier('https://www.youtube.com/@LofiGirl/streams')).toBe('LofiGirl');
    expect(cleanStreamerIdentifier('https://youtube.com/channel/UCSJ4gkVC6NrvII8umztf0Ow')).toBe(
      'UCSJ4gkVC6NrvII8umztf0Ow',
    );
    expect(cleanStreamerIdentifier('https://www.tiktok.com/@someone/live')).toBe('someone');
    expect(cleanStreamerIdentifier('  @handle ')).toBe('handle');
  });

  it('keeps the case of YouTube channel IDs only', () => {
    expect(fallbackPlatformUserId('UCSJ4gkVC6NrvII8umztf0Ow')).toBe('UCSJ4gkVC6NrvII8umztf0Ow');
    expect(fallbackPlatformUserId('Shroud')).toBe('shroud');
  });
});

describe('formatStreamAnnouncement (TASK-1661)', () => {
  const values = {
    streamer: 'Ririko',
    title: 'Singing',
    game: 'Music',
    platform: 'TWITCH',
    url: 'https://twitch.tv/ririko',
  };

  it('keeps line breaks and collapses the space left by an empty role', () => {
    expect(formatStreamAnnouncement(null, values)).toBe(
      '🔴 **Ririko** is now live on **TWITCH**!\n<https://twitch.tv/ririko>',
    );
    expect(DEFAULT_STREAM_TEMPLATE).toContain('\n');
  });

  it('inserts titles as written, without expanding $& or nested variables', () => {
    const text = formatStreamAnnouncement('{title} by {streamer} {role}', {
      ...values,
      title: 'Win $& {role} $1',
      mentionRoleId: '123',
    });
    expect(text).toBe('Win $& {role} $1 by Ririko <@&123>');
  });

  it('uses "Streaming" for a stream without a game and caps the length', () => {
    expect(formatStreamAnnouncement('{game}', { ...values, game: null })).toBe('Streaming');
    expect(
      formatStreamAnnouncement('{title}', { ...values, title: 'x'.repeat(3000) }),
    ).toHaveLength(2000);
  });

  it('allows pinging only the subscription role', () => {
    expect(streamAnnouncementMentions('123')).toEqual({ parse: [], roles: ['123'] });
    expect(streamAnnouncementMentions(null)).toEqual({ parse: [], roles: [] });
  });
});

describe('StreamAlertService (TASK-1661)', () => {
  let db: SqliteDatabaseClient;
  let streams: StreamRepository;
  let resolveStreamer: Mock<StreamPlatformAdapter['resolveStreamer']>;
  let service: StreamAlertService;
  const actor: StreamAlertActor = { userId: 'user-1', source: 'dashboard', ipAddress: '1.2.3.4' };

  const auditActions = () =>
    (
      db.raw.prepare('SELECT action, details FROM audit_logs ORDER BY rowid').all() as {
        action: string;
        details: string;
      }[]
    ).map((row) => ({ action: row.action, details: JSON.parse(row.details) }));

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    db = raw;
    streams = new StreamRepository(db);
    resolveStreamer = vi.fn<StreamPlatformAdapter['resolveStreamer']>().mockResolvedValue({
      platform: 'TWITCH',
      platformUserId: '71092938',
      username: 'shroud',
      displayName: 'shroud',
      avatarUrl: 'https://example.com/a.png',
    });
    const twitch: StreamPlatformAdapter = {
      platform: 'TWITCH',
      name: 'Twitch',
      isConfigured: () => true,
      resolveStreamer,
      getStreamStatus: vi.fn(),
    };
    service = new StreamAlertService({
      db,
      streams,
      audit: new AuditLogRepository(db),
      adapters: [twitch],
      now: () => new Date('2026-09-28T00:00:00Z'),
    });
  });

  afterEach(() => {
    db.raw.close();
  });

  it('stores uuid IDs and the resolved streamer, and audits the subscription', async () => {
    const { alert, created } = await service.subscribe(
      {
        guildId: 'guild-1',
        streamer: 'https://twitch.tv/Shroud',
        channelId: CHANNEL_ID,
        mentionRoleId: 'role-1',
        customMessage: '  {streamer} is live  ',
      },
      actor,
    );

    expect(created).toBe(true);
    expect(alert.streamer.id).toMatch(UUID);
    expect(alert.subscription.id).toMatch(UUID);
    expect(alert.subscription.streamerId).toBe(alert.streamer.id);
    expect(alert.streamer.platformUserId).toBe('71092938');
    expect(alert.subscription.customMessage).toBe('{streamer} is live');
    expect(resolveStreamer).toHaveBeenCalledWith('Shroud');
    expect(auditActions()).toEqual([
      {
        action: 'stream_alerts.subscribe',
        details: expect.objectContaining({
          source: 'dashboard',
          streamer: 'shroud',
          mentionRoleId: 'role-1',
        }),
      },
    ]);
  });

  it('changes the existing subscription when the guild follows the streamer again', async () => {
    await service.subscribe({ guildId: 'guild-1', streamer: 'shroud', channelId: 'a' }, actor);
    const again = await service.subscribe(
      { guildId: 'guild-1', streamer: 'SHROUD', channelId: 'b' },
      actor,
    );

    expect(again.created).toBe(false);
    expect(await service.list('guild-1')).toHaveLength(1);
    expect((await service.list('guild-1'))[0]!.subscription.channelId).toBe('b');
    expect(auditActions().map((row) => row.action)).toEqual([
      'stream_alerts.subscribe',
      'stream_alerts.update',
    ]);
  });

  it('falls back to the handle when the platform cannot resolve it', async () => {
    const { alert } = await service.subscribe(
      { guildId: 'guild-1', streamer: 'UCSJ4gkVC6NrvII8umztf0Ow', channelId: CHANNEL_ID },
      actor,
    );
    expect(alert.streamer.platform).toBe('YOUTUBE');
    expect(alert.streamer.platformUserId).toBe('UCSJ4gkVC6NrvII8umztf0Ow');
  });

  it(`refuses more than ${MAX_STREAM_SUBSCRIPTIONS} streamers per guild`, async () => {
    resolveStreamer.mockResolvedValue(null);
    for (let i = 0; i < MAX_STREAM_SUBSCRIPTIONS; i++) {
      await service.subscribe({ guildId: 'guild-1', streamer: `s${i}`, channelId: 'c' }, actor);
    }
    await expect(
      service.subscribe({ guildId: 'guild-1', streamer: 'one-more', channelId: 'c' }, actor),
    ).rejects.toThrow(StreamAlertError);
    // Changing an existing subscription is still allowed at the limit.
    await expect(
      service.subscribe({ guildId: 'guild-1', streamer: 's0', channelId: 'd' }, actor),
    ).resolves.toMatchObject({ created: false });
    // Other guilds have their own limit.
    await expect(
      service.subscribe({ guildId: 'guild-2', streamer: 'one-more', channelId: 'c' }, actor),
    ).resolves.toMatchObject({ created: true });
  });

  it('refuses empty streamers and messages that are too long', async () => {
    await expect(
      service.subscribe({ guildId: 'guild-1', streamer: ' @ ', channelId: 'c' }, actor),
    ).rejects.toThrow(StreamAlertError);
    await expect(
      service.subscribe(
        { guildId: 'guild-1', streamer: 'shroud', channelId: 'c', customMessage: 'x'.repeat(1001) },
        actor,
      ),
    ).rejects.toThrow(StreamAlertError);
    expect(await service.list('guild-1')).toHaveLength(0);
  });

  it('updates and removes only the guild’s own subscriptions', async () => {
    const { alert } = await service.subscribe(
      { guildId: 'guild-1', streamer: 'shroud', channelId: 'c' },
      actor,
    );
    const id = alert.subscription.id;

    await expect(
      service.update(
        'guild-2',
        id,
        { channelId: 'x', mentionRoleId: null, customMessage: null },
        actor,
      ),
    ).rejects.toThrow(StreamAlertError);
    await expect(service.remove('guild-2', id, actor)).rejects.toThrow(StreamAlertError);

    const updated = await service.update(
      'guild-1',
      id,
      { channelId: 'x', mentionRoleId: 'r', customMessage: '' },
      actor,
    );
    expect(updated.subscription).toMatchObject({
      channelId: 'x',
      mentionRoleId: 'r',
      customMessage: null,
    });

    const removed = await service.remove('guild-1', id, actor);
    expect(removed.streamer?.username).toBe('shroud');
    expect(await service.get('guild-1', id)).toBeNull();
    expect(auditActions().map((row) => row.action)).toEqual([
      'stream_alerts.subscribe',
      'stream_alerts.update',
      'stream_alerts.remove',
    ]);
  });
});
