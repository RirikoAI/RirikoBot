import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { EventLogService } from '../event-log.service.js';
import { EVENT_LOG_COLORS } from '../embeds.js';
import {
  NOW,
  fake,
  fieldOf,
  makeBan,
  makeGuild,
  makeGuildChannel,
  makeLogChannel,
  makeMember,
  makeMessage,
  makeRole,
  makeSettings,
  makeTextChannel,
  makeThreadChannel,
  makeUser,
  makeVoiceState,
  roleCache,
  sentEmbed,
  type FakeLogChannel,
} from './fixtures.js';
import type { Message } from 'discord.js';
import type { EventLogSettings } from '@ririko/database';

describe('EventLogService (TASK-1993)', () => {
  let clock: number;
  let repo: { get: Mock<(guildId: string) => Promise<EventLogSettings | null>> };
  let service: EventLogService;
  let mlog: FakeLogChannel;
  let plog: FakeLogChannel;
  let slog: FakeLogChannel;
  let vlog: FakeLogChannel;
  let guild: ReturnType<typeof makeGuild>;
  let errors: ReturnType<typeof vi.spyOn>;

  function configure(overrides: Partial<EventLogSettings> = {}): void {
    repo.get.mockResolvedValue(makeSettings(overrides));
  }

  beforeEach(() => {
    clock = NOW;
    repo = { get: vi.fn(async () => makeSettings()) };
    service = new EventLogService({ repo, cacheTtlMs: 1000, now: () => clock });
    mlog = makeLogChannel('mlog');
    plog = makeLogChannel('plog');
    slog = makeLogChannel('slog');
    vlog = makeLogChannel('vlog');
    guild = makeGuild([mlog, plog, slog, vlog]);
    errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================
  // Message edits
  // ==========================================

  describe('messageEdited', () => {
    it('posts the old and new content with author, channel and time', async () => {
      const oldMessage = makeMessage(guild, { content: 'before' });
      const newMessage = makeMessage(guild, { content: 'after' });
      await service.messageEdited(fake(oldMessage), fake(newMessage));

      expect(mlog.send).toHaveBeenCalledTimes(1);
      const embed = sentEmbed(mlog);
      expect(embed.title).toBe('Message edited');
      expect(embed.color).toBe(EVENT_LOG_COLORS.amber);
      expect(embed.timestamp).toBe(new Date(NOW).toISOString());
      expect(fieldOf(embed, 'Author')).toBe('<@u1> u1#0 (u1)');
      expect(fieldOf(embed, 'Channel')).toBe('<#c1> (c1)');
      expect(fieldOf(embed, 'Before')).toBe('before');
      expect(fieldOf(embed, 'After')).toBe('after');
      expect(fieldOf(embed, 'Message')).toContain('https://discord.com/channels/g1/c1/m1');
    });

    it('never pings: every send uses allowedMentions parse []', async () => {
      await service.messageEdited(
        fake(makeMessage(guild, { content: '@everyone a' })),
        fake(makeMessage(guild, { content: '@everyone b' })),
      );
      expect(mlog.send.mock.calls[0]?.[0].allowedMentions).toEqual({ parse: [] });
    });

    it('skips an edit whose content did not change (a link preview update)', async () => {
      await service.messageEdited(fake(makeMessage(guild)), fake(makeMessage(guild)));
      expect(mlog.send).not.toHaveBeenCalled();
    });

    it('skips a message outside a server', async () => {
      await service.messageEdited(
        fake(makeMessage(null, { content: 'a' })),
        fake(makeMessage(null, { content: 'b' })),
      );
      expect(mlog.send).not.toHaveBeenCalled();
      expect(repo.get).not.toHaveBeenCalled();
    });

    it('logs an uncached old message as "Content unknown" when Discord set an edit time', async () => {
      await service.messageEdited(
        fake(makeMessage(guild, { content: null, partial: true })),
        fake(makeMessage(guild, { content: 'new', editedTimestamp: NOW })),
      );
      const embed = sentEmbed(mlog);
      expect(fieldOf(embed, 'Before')).toBe('Content unknown');
      expect(fieldOf(embed, 'After')).toBe('new');
    });

    it('skips an uncached old message without an edit time', async () => {
      await service.messageEdited(
        fake(makeMessage(guild, { content: null, partial: true })),
        fake(makeMessage(guild, { content: 'new', editedTimestamp: null })),
      );
      expect(mlog.send).not.toHaveBeenCalled();
    });

    it('skips an edit whose new content is unknown', async () => {
      await service.messageEdited(
        fake(makeMessage(guild, { content: 'old' })),
        fake(makeMessage(guild, { content: null, partial: true })),
      );
      expect(mlog.send).not.toHaveBeenCalled();
    });

    it('shows an unknown author and falls back to the old author', async () => {
      await service.messageEdited(
        fake(makeMessage(guild, { content: 'a', author: null })),
        fake(makeMessage(guild, { content: 'b', author: null })),
      );
      expect(fieldOf(sentEmbed(mlog), 'Author')).toBe('Unknown');

      mlog.send.mockClear();
      await service.messageEdited(
        fake(makeMessage(guild, { content: 'a', author: makeUser('old') })),
        fake(makeMessage(guild, { content: 'b', author: null })),
      );
      expect(fieldOf(sentEmbed(mlog), 'Author')).toContain('<@old>');
    });

    it('cuts content longer than an embed field with an ellipsis', async () => {
      const long = 'x'.repeat(3000);
      await service.messageEdited(
        fake(makeMessage(guild, { content: long })),
        fake(makeMessage(guild, { content: 'short' })),
      );
      const before = fieldOf(sentEmbed(mlog), 'Before')!;
      expect(before).toHaveLength(1024);
      expect(before.endsWith('…')).toBe(true);
    });

    it('shows "Content unknown" for an edit to empty text', async () => {
      await service.messageEdited(
        fake(makeMessage(guild, { content: 'was text' })),
        fake(makeMessage(guild, { content: '' })),
      );
      expect(fieldOf(sentEmbed(mlog), 'After')).toBe('Content unknown');
    });
  });

  // ==========================================
  // Skip rules shared by message events
  // ==========================================

  describe('message skip rules', () => {
    const edit = (overrides: Record<string, unknown> = {}) =>
      service.messageEdited(
        fake(makeMessage(guild, { content: 'a', ...overrides })),
        fake(makeMessage(guild, { content: 'b', ...overrides })),
      );

    it('does nothing when the message category has no channel', async () => {
      configure({ messageChannelId: null });
      await edit();
      expect(mlog.send).not.toHaveBeenCalled();
    });

    it('does nothing when the server has no settings row', async () => {
      repo.get.mockResolvedValue(null);
      await edit();
      expect(mlog.send).not.toHaveBeenCalled();
    });

    it('does nothing when the channel is gone from the server', async () => {
      configure({ messageChannelId: 'deleted-channel' });
      await edit();
      expect(mlog.send).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
    });

    it('does nothing when the channel cannot be sent to', async () => {
      const voiceOnly = makeLogChannel('mlog', false);
      guild = makeGuild([voiceOnly]);
      await edit();
      expect(voiceOnly.send).not.toHaveBeenCalled();
    });

    it('skips an ignored channel', async () => {
      configure({ ignoredChannelIds: ['c1'] });
      await edit();
      expect(mlog.send).not.toHaveBeenCalled();
    });

    it('skips a thread of an ignored channel', async () => {
      configure({ ignoredChannelIds: ['parent'] });
      await edit({ channelId: 't1', channel: makeThreadChannel('t1', 'parent') });
      expect(mlog.send).not.toHaveBeenCalled();
    });

    it('logs a thread of a channel that is not ignored', async () => {
      configure({ ignoredChannelIds: ['other'] });
      await edit({ channelId: 't1', channel: makeThreadChannel('t1', 'parent') });
      expect(mlog.send).toHaveBeenCalledTimes(1);
    });

    it('logs a message whose channel is not cached', async () => {
      await edit({ channel: null });
      expect(mlog.send).toHaveBeenCalledTimes(1);
    });

    it('skips a bot author while ignoreBots is on, and logs it when off', async () => {
      await edit({ author: makeUser('bot', { bot: true }) });
      expect(mlog.send).not.toHaveBeenCalled();

      service.invalidate(GUILD);
      configure({ ignoreBots: false });
      await edit({ author: makeUser('bot', { bot: true }) });
      expect(mlog.send).toHaveBeenCalledTimes(1);
    });

    it('skips messages in the log channel itself', async () => {
      await edit({ channelId: 'mlog', channel: makeTextChannel('mlog') });
      expect(mlog.send).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // Message deletes
  // ==========================================

  describe('messageDeleted', () => {
    it('posts the content and attachment names', async () => {
      await service.messageDeleted(
        fake(
          makeMessage(guild, {
            content: 'gone',
            attachments: new Map([
              ['a', { name: 'cat.png' }],
              ['b', { name: 'dog.png' }],
            ]),
          }),
        ),
      );
      const embed = sentEmbed(mlog);
      expect(embed.title).toBe('Message deleted');
      expect(embed.color).toBe(EVENT_LOG_COLORS.red);
      expect(fieldOf(embed, 'Content')).toBe('gone');
      expect(fieldOf(embed, 'Attachments')).toBe('cat.png, dog.png');
      expect(fieldOf(embed, 'Channel')).toBe('<#c1> (c1)');
    });

    it('shows "Content unknown" for a partial message with no author', async () => {
      await service.messageDeleted(
        fake(makeMessage(guild, { content: null, author: null, partial: true })),
      );
      const embed = sentEmbed(mlog);
      expect(fieldOf(embed, 'Content')).toBe('Content unknown');
      expect(fieldOf(embed, 'Author')).toBe('Unknown');
      expect(fieldOf(embed, 'Attachments')).toBeUndefined();
    });

    it('says so when only attachments were sent', async () => {
      await service.messageDeleted(fake(makeMessage(guild, { content: '' })));
      expect(fieldOf(sentEmbed(mlog), 'Content')).toBe('No text (attachments only)');
    });

    it('skips DMs, ignored channels and bots', async () => {
      await service.messageDeleted(fake(makeMessage(null)));
      configure({ ignoredChannelIds: ['c1'] });
      await service.messageDeleted(fake(makeMessage(guild)));
      service.invalidate();
      configure();
      await service.messageDeleted(
        fake(makeMessage(guild, { author: makeUser('b', { bot: true }) })),
      );
      expect(mlog.send).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // Bulk deletes
  // ==========================================

  describe('messagesBulkDeleted', () => {
    const channel = () => ({
      id: 'c1',
      name: 'general',
      guild,
      parentId: null,
      isThread: () => false,
    });

    it('posts the count and a .txt file of cached messages, oldest first', async () => {
      const newer = makeMessage(guild, {
        id: 'm2',
        content: 'second',
        createdTimestamp: NOW - 1000,
      });
      const older = makeMessage(guild, {
        id: 'm1',
        content: 'first\nline two',
        createdTimestamp: NOW - 5000,
        attachments: new Map([['a', { name: 'x.png' }]]),
        author: null,
      });
      const uncached = makeMessage(guild, { id: 'm3', content: null, partial: true, author: null });
      await service.messagesBulkDeleted(
        fake(
          new Map([
            ['m2', newer],
            ['m1', older],
            ['m3', uncached],
          ]),
        ),
        fake(channel()),
      );

      const call = mlog.send.mock.calls[0]![0];
      const embed = sentEmbed(mlog);
      expect(embed.title).toBe('Messages bulk deleted');
      expect(fieldOf(embed, 'Messages deleted')).toBe('3');
      expect(fieldOf(embed, 'Content')).toContain('2 message(s)');
      expect(call.files).toHaveLength(1);
      expect(call.files[0].name).toBe('bulk-delete-c1.txt');

      const text = (call.files[0].attachment as Buffer).toString('utf8');
      expect(text).toContain('Test Server (g1)');
      expect(text).toContain('#general (c1)');
      expect(text.indexOf('first')).toBeLessThan(text.indexOf('second'));
      expect(text).toContain('Unknown author');
      expect(text).toContain('  line two');
      expect(text).toContain('[attachment] x.png');
      expect(text).toContain('u1#0 (u1)');
    });

    it('attaches no file when nothing was cached', async () => {
      const uncached = makeMessage(guild, { content: null, partial: true, author: null });
      await service.messagesBulkDeleted(fake(new Map([['m1', uncached]])), fake(channel()));
      const call = mlog.send.mock.calls[0]![0];
      expect(call.files).toBeUndefined();
      expect(fieldOf(sentEmbed(mlog), 'Content')).toBe('No message content was cached.');
    });

    it('leaves bot messages out while ignoreBots is on', async () => {
      const human = makeMessage(guild, { id: 'm1' });
      const bot = makeMessage(guild, { id: 'm2', author: makeUser('b', { bot: true }) });
      await service.messagesBulkDeleted(
        fake(
          new Map([
            ['m1', human],
            ['m2', bot],
          ]),
        ),
        fake(channel()),
      );
      expect(fieldOf(sentEmbed(mlog), 'Messages deleted')).toBe('1');
    });

    it('skips a bulk delete of only bot messages', async () => {
      const bot = makeMessage(guild, { author: makeUser('b', { bot: true }) });
      await service.messagesBulkDeleted(fake(new Map([['m1', bot]])), fake(channel()));
      expect(mlog.send).not.toHaveBeenCalled();
    });

    it('skips an ignored channel and the category is off', async () => {
      configure({ ignoredChannelIds: ['c1'] });
      await service.messagesBulkDeleted(
        fake(new Map([['m1', makeMessage(guild)]])),
        fake(channel()),
      );
      expect(mlog.send).not.toHaveBeenCalled();

      service.invalidate();
      configure({ messageChannelId: null });
      await service.messagesBulkDeleted(
        fake(new Map([['m1', makeMessage(guild)]])),
        fake(channel()),
      );
      expect(mlog.send).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // Members
  // ==========================================

  describe('member log', () => {
    it('logs a join with the account age and member count', async () => {
      await service.memberJoined(fake(makeMember(guild)));
      const embed = sentEmbed(plog);
      expect(embed.title).toBe('Member joined');
      expect(embed.color).toBe(EVENT_LOG_COLORS.green);
      expect(fieldOf(embed, 'Member')).toBe('<@u1> u1#0 (u1)');
      expect(fieldOf(embed, 'Account created')).toMatch(/^<t:\d+:F> \(<t:\d+:R>\)$/);
      expect(fieldOf(embed, 'Member count')).toBe('42');
    });

    it('always logs member events for bots, whatever ignoreBots says', async () => {
      const bot = makeUser('bot', { bot: true });
      for (const ignoreBots of [true, false]) {
        service.invalidate();
        configure({ ignoreBots });
        plog.send.mockClear();
        await service.memberJoined(fake(makeMember(guild, { user: bot })));
        await service.memberLeft(fake(makeMember(guild, { user: bot })));
        await service.memberBanned(fake(makeBan(guild, { user: bot })));
        await service.memberUnbanned(fake(makeBan(guild, { user: bot })));
        await service.memberUpdated(
          fake(makeMember(guild, { user: bot, nickname: 'a' })),
          fake(makeMember(guild, { user: bot, nickname: 'b' })),
        );
        expect(plog.send).toHaveBeenCalledTimes(5);
      }
    });

    it('logs a leave with the join date and roles', async () => {
      await service.memberLeft(fake(makeMember(guild, { roles: roleCache(['g1', 'r1', 'r2']) })));
      const embed = sentEmbed(plog);
      expect(embed.title).toBe('Member left');
      expect(embed.color).toBe(EVENT_LOG_COLORS.red);
      expect(fieldOf(embed, 'Roles')).toBe('<@&r1> <@&r2>');
      expect(fieldOf(embed, 'Joined')).toMatch(/^<t:\d+:F>/);
    });

    it('logs a leave of a partial member with only what is known', async () => {
      await service.memberLeft(
        fake(
          makeMember(guild, {
            partial: true,
            joinedTimestamp: null,
            user: makeUser('u1', { tag: null }),
          }),
        ),
      );
      const embed = sentEmbed(plog);
      expect(fieldOf(embed, 'Member')).toBe('<@u1> (u1)');
      expect(fieldOf(embed, 'Joined')).toBeUndefined();
      expect(fieldOf(embed, 'Roles')).toBeUndefined();
    });

    it('logs a nickname change', async () => {
      await service.memberUpdated(
        fake(makeMember(guild, { nickname: null })),
        fake(makeMember(guild, { nickname: 'Ririko' })),
      );
      const embed = sentEmbed(plog);
      expect(embed.title).toBe('Nickname changed');
      expect(fieldOf(embed, 'Before')).toBe('None');
      expect(fieldOf(embed, 'After')).toBe('Ririko');
    });

    it('logs roles added and removed, colour by what happened', async () => {
      const update = async (before: string[], after: string[]) => {
        plog.send.mockClear();
        await service.memberUpdated(
          fake(makeMember(guild, { roles: roleCache(before) })),
          fake(makeMember(guild, { roles: roleCache(after) })),
        );
        return sentEmbed(plog);
      };

      const added = await update(['g1'], ['g1', 'r1']);
      expect(added.title).toBe('Member roles changed');
      expect(added.color).toBe(EVENT_LOG_COLORS.green);
      expect(fieldOf(added, 'Roles added')).toBe('<@&r1>');
      expect(fieldOf(added, 'Roles removed')).toBeUndefined();

      const removed = await update(['g1', 'r1'], ['g1']);
      expect(removed.color).toBe(EVENT_LOG_COLORS.red);
      expect(fieldOf(removed, 'Roles removed')).toBe('<@&r1>');

      const both = await update(['g1', 'r1'], ['g1', 'r2']);
      expect(both.color).toBe(EVENT_LOG_COLORS.amber);
      expect(fieldOf(both, 'Roles added')).toBe('<@&r2>');
      expect(fieldOf(both, 'Roles removed')).toBe('<@&r1>');
    });

    it('logs a timeout set and a timeout lifted', async () => {
      const until = NOW + 3_600_000;
      await service.memberUpdated(
        fake(makeMember(guild)),
        fake(makeMember(guild, { communicationDisabledUntilTimestamp: until })),
      );
      const set = sentEmbed(plog);
      expect(set.title).toBe('Member timed out');
      expect(fieldOf(set, 'Until')).toContain(`<t:${Math.floor(until / 1000)}:F>`);

      plog.send.mockClear();
      await service.memberUpdated(
        fake(makeMember(guild, { communicationDisabledUntilTimestamp: until })),
        fake(makeMember(guild)),
      );
      const lifted = sentEmbed(plog);
      expect(lifted.title).toBe('Timeout lifted');
      expect(lifted.color).toBe(EVENT_LOG_COLORS.green);
      expect(fieldOf(lifted, 'Until')).toBeUndefined();
    });

    it('ignores a timeout that was already over or did not change', async () => {
      const past = NOW - 1000;
      const future = NOW + 3_600_000;
      await service.memberUpdated(
        fake(makeMember(guild, { communicationDisabledUntilTimestamp: past })),
        fake(makeMember(guild)),
      );
      await service.memberUpdated(
        fake(makeMember(guild, { communicationDisabledUntilTimestamp: future })),
        fake(makeMember(guild, { communicationDisabledUntilTimestamp: future })),
      );
      await service.memberUpdated(fake(makeMember(guild)), fake(makeMember(guild)));
      expect(plog.send).not.toHaveBeenCalled();
    });

    it('sends one message with an embed per kind of change', async () => {
      await service.memberUpdated(
        fake(makeMember(guild)),
        fake(
          makeMember(guild, {
            nickname: 'New',
            roles: roleCache(['g1', 'r1']),
            communicationDisabledUntilTimestamp: NOW + 1000,
          }),
        ),
      );
      expect(plog.send).toHaveBeenCalledTimes(1);
      expect(plog.send.mock.calls[0]![0].embeds).toHaveLength(3);
    });

    it('skips an update whose old member is partial', async () => {
      await service.memberUpdated(
        fake(makeMember(guild, { partial: true })),
        fake(makeMember(guild, { nickname: 'New' })),
      );
      expect(plog.send).not.toHaveBeenCalled();
      expect(repo.get).not.toHaveBeenCalled();
    });

    it('logs a ban with its reason and an unban', async () => {
      await service.memberBanned(fake(makeBan(guild)));
      const ban = sentEmbed(plog);
      expect(ban.title).toBe('Member banned');
      expect(ban.color).toBe(EVENT_LOG_COLORS.red);
      expect(fieldOf(ban, 'User')).toBe('<@u2> u2#0 (u2)');
      expect(fieldOf(ban, 'Reason')).toBe('spamming');

      plog.send.mockClear();
      await service.memberUnbanned(fake(makeBan(guild, { reason: null })));
      const unban = sentEmbed(plog);
      expect(unban.title).toBe('Member unbanned');
      expect(unban.color).toBe(EVENT_LOG_COLORS.green);
      expect(fieldOf(unban, 'Reason')).toBe('No reason given');
    });

    it('does nothing when the member category is off', async () => {
      configure({ memberChannelId: null });
      await service.memberJoined(fake(makeMember(guild)));
      expect(plog.send).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // Server log
  // ==========================================

  describe('server log', () => {
    it('logs a created channel with its type and category', async () => {
      await service.channelCreated(fake(makeGuildChannel(guild, { parentId: 'cat1' })));
      const embed = sentEmbed(slog);
      expect(embed.title).toBe('Channel created');
      expect(embed.color).toBe(EVENT_LOG_COLORS.green);
      expect(fieldOf(embed, 'Channel')).toBe('<#ch1> (ch1)');
      expect(fieldOf(embed, 'Type')).toBe('GuildText');
      expect(fieldOf(embed, 'Category')).toBe('<#cat1> (cat1)');
    });

    it('logs a created channel without a category', async () => {
      await service.channelCreated(fake(makeGuildChannel(guild)));
      expect(fieldOf(sentEmbed(slog), 'Category')).toBeUndefined();
    });

    it('names a deleted channel, since a mention would not resolve', async () => {
      await service.channelDeleted(fake(makeGuildChannel(guild)));
      const embed = sentEmbed(slog);
      expect(embed.title).toBe('Channel deleted');
      expect(embed.color).toBe(EVENT_LOG_COLORS.red);
      expect(fieldOf(embed, 'Channel')).toBe('#general (ch1)');
    });

    it('logs only a channel rename', async () => {
      await service.channelUpdated(
        fake(makeGuildChannel(guild)),
        fake(makeGuildChannel(guild, { name: 'chat' })),
      );
      const embed = sentEmbed(slog);
      expect(embed.title).toBe('Channel renamed');
      expect(embed.color).toBe(EVENT_LOG_COLORS.amber);
      expect(fieldOf(embed, 'Before')).toBe('general');
      expect(fieldOf(embed, 'After')).toBe('chat');

      slog.send.mockClear();
      await service.channelUpdated(
        fake(makeGuildChannel(guild)),
        fake(makeGuildChannel(guild, { parentId: 'moved' })),
      );
      expect(slog.send).not.toHaveBeenCalled();
    });

    it('ignores DM channels', async () => {
      const dm = { id: 'd', isDMBased: () => true };
      await service.channelCreated(fake(dm));
      await service.channelDeleted(fake(dm));
      await service.channelUpdated(fake(dm), fake(makeGuildChannel(guild)));
      await service.channelUpdated(fake(makeGuildChannel(guild)), fake(dm));
      expect(slog.send).not.toHaveBeenCalled();
    });

    it('logs role created, deleted and renamed', async () => {
      await service.roleCreated(fake(makeRole(guild)));
      const created = sentEmbed(slog);
      expect(created.title).toBe('Role created');
      expect(fieldOf(created, 'Role')).toBe('<@&r1> (r1)');
      expect(fieldOf(created, 'Colour')).toBe('#ff0000');

      slog.send.mockClear();
      await service.roleDeleted(fake(makeRole(guild)));
      const deleted = sentEmbed(slog);
      expect(deleted.title).toBe('Role deleted');
      expect(deleted.color).toBe(EVENT_LOG_COLORS.red);
      expect(fieldOf(deleted, 'Role')).toBe('Mods (r1)');

      slog.send.mockClear();
      await service.roleUpdated(fake(makeRole(guild)), fake(makeRole(guild, { name: 'Admins' })));
      const renamed = sentEmbed(slog);
      expect(renamed.title).toBe('Role renamed');
      expect(fieldOf(renamed, 'Before')).toBe('Mods');
      expect(fieldOf(renamed, 'After')).toBe('Admins');
    });

    it('ignores a role change that is not a rename', async () => {
      await service.roleUpdated(
        fake(makeRole(guild)),
        fake(makeRole(guild, { hexColor: '#00ff00' })),
      );
      expect(slog.send).not.toHaveBeenCalled();
    });

    it('does nothing when the server category is off', async () => {
      configure({ serverChannelId: null });
      await service.roleCreated(fake(makeRole(guild)));
      expect(slog.send).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // Voice log
  // ==========================================

  describe('voiceStateChanged', () => {
    const member = () => makeMember(guild);

    it('logs a join, a leave and a move', async () => {
      await service.voiceStateChanged(
        fake(makeVoiceState(guild, null, null)),
        fake(makeVoiceState(guild, 'v1', member())),
      );
      const join = sentEmbed(vlog);
      expect(join.title).toBe('Joined voice channel');
      expect(join.color).toBe(EVENT_LOG_COLORS.green);
      expect(fieldOf(join, 'Channel')).toBe('<#v1> (v1)');

      vlog.send.mockClear();
      await service.voiceStateChanged(
        fake(makeVoiceState(guild, 'v1', member())),
        fake(makeVoiceState(guild, null, member())),
      );
      const leave = sentEmbed(vlog);
      expect(leave.title).toBe('Left voice channel');
      expect(leave.color).toBe(EVENT_LOG_COLORS.red);

      vlog.send.mockClear();
      await service.voiceStateChanged(
        fake(makeVoiceState(guild, 'v1', member())),
        fake(makeVoiceState(guild, 'v2', member())),
      );
      const move = sentEmbed(vlog);
      expect(move.title).toBe('Moved voice channel');
      expect(move.color).toBe(EVENT_LOG_COLORS.amber);
      expect(fieldOf(move, 'From')).toBe('<#v1> (v1)');
      expect(fieldOf(move, 'To')).toBe('<#v2> (v2)');
    });

    it('ignores mute, deafen and stream changes in the same channel', async () => {
      await service.voiceStateChanged(
        fake(makeVoiceState(guild, 'v1', member(), { selfMute: false })),
        fake(makeVoiceState(guild, 'v1', member(), { selfMute: true })),
      );
      await service.voiceStateChanged(
        fake(makeVoiceState(guild, null, null)),
        fake(makeVoiceState(guild, null, null)),
      );
      expect(vlog.send).not.toHaveBeenCalled();
      expect(repo.get).not.toHaveBeenCalled();
    });

    it('skips a state with no member, a bot, and a category that is off', async () => {
      await service.voiceStateChanged(
        fake(makeVoiceState(guild, null, null)),
        fake(makeVoiceState(guild, 'v1', null)),
      );
      const bot = makeMember(guild, { user: makeUser('b', { bot: true }) });
      await service.voiceStateChanged(
        fake(makeVoiceState(guild, null, null)),
        fake(makeVoiceState(guild, 'v1', bot)),
      );
      expect(vlog.send).not.toHaveBeenCalled();

      configure({ voiceChannelId: null });
      service.invalidate();
      await service.voiceStateChanged(
        fake(makeVoiceState(guild, null, null)),
        fake(makeVoiceState(guild, 'v1', member())),
      );
      expect(vlog.send).not.toHaveBeenCalled();
    });

    it('uses the old state member when the new one has none', async () => {
      await service.voiceStateChanged(
        fake(makeVoiceState(guild, 'v1', member())),
        fake(makeVoiceState(guild, null, null)),
      );
      expect(sentEmbed(vlog).title).toBe('Left voice channel');
    });
  });

  // ==========================================
  // Cache and failures
  // ==========================================

  describe('settings cache', () => {
    const edit = () =>
      service.messageEdited(
        fake(makeMessage(guild, { content: 'a' })),
        fake(makeMessage(guild, { content: 'b' })),
      );

    it('reads a server once within the TTL and again after it', async () => {
      await edit();
      await edit();
      expect(repo.get).toHaveBeenCalledTimes(1);
      expect(repo.get).toHaveBeenCalledWith('g1');

      clock += 1001;
      await edit();
      expect(repo.get).toHaveBeenCalledTimes(2);
    });

    it('caches a server without a settings row too', async () => {
      repo.get.mockResolvedValue(null);
      await edit();
      await edit();
      expect(repo.get).toHaveBeenCalledTimes(1);
    });

    it('invalidate(guildId) drops one server, so new settings apply at once', async () => {
      await edit();
      expect(mlog.send).toHaveBeenCalledTimes(1);

      // Still the cached settings: the change is not seen until the cache is dropped.
      configure({ messageChannelId: null });
      await edit();
      expect(mlog.send).toHaveBeenCalledTimes(2);

      service.invalidate(GUILD);
      await edit();
      expect(repo.get).toHaveBeenCalledTimes(2);
      expect(mlog.send).toHaveBeenCalledTimes(2);
    });

    it('invalidate() with no argument drops every server', async () => {
      await edit();
      service.invalidate();
      await edit();
      expect(repo.get).toHaveBeenCalledTimes(2);
    });

    it('uses a 5 minute TTL and Date.now by default', async () => {
      const defaults = new EventLogService({ repo });
      const message = (content: string) => fake<Message>(makeMessage(guild, { content }));
      await defaults.messageEdited(message('a'), message('b'));
      await defaults.messageEdited(message('a'), message('b'));
      expect(repo.get).toHaveBeenCalledTimes(1);
    });

    it('logs a read error and skips the event without throwing, then retries', async () => {
      repo.get.mockRejectedValueOnce(new Error('db down'));
      await expect(edit()).resolves.toBeUndefined();
      expect(mlog.send).not.toHaveBeenCalled();
      expect(errors).toHaveBeenCalledWith(expect.stringContaining('guild g1'), 'db down');

      await edit();
      expect(mlog.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('failures never reach the gateway', () => {
    it('logs a failed send with the guild and channel IDs only', async () => {
      mlog.send.mockRejectedValue(new Error('Missing Permissions'));
      await expect(
        service.messageDeleted(fake(makeMessage(guild, { content: 'secret words' }))),
      ).resolves.toBeUndefined();

      expect(errors).toHaveBeenCalledTimes(1);
      const logged = JSON.stringify(errors.mock.calls);
      expect(logged).toContain('mlog');
      expect(logged).toContain('g1');
      expect(logged).toContain('Missing Permissions');
      expect(logged).not.toContain('secret words');
    });

    it('logs a send that fails with something that is not an Error', async () => {
      slog.send.mockRejectedValue('boom');
      await service.roleCreated(fake(makeRole(guild)));
      expect(errors).toHaveBeenCalledWith(expect.any(String), 'boom');
    });

    it('catches an unexpected error while building the embed', async () => {
      const broken = makeMessage(guild, { attachments: undefined });
      await expect(service.messageDeleted(fake(broken))).resolves.toBeUndefined();
      expect(errors).toHaveBeenCalledWith(
        expect.stringContaining('messageDeleted'),
        expect.any(String),
      );
      expect(mlog.send).not.toHaveBeenCalled();
    });
  });
});

const GUILD = 'g1';
