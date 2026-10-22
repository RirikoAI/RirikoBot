import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RESTJSONErrorCodes, type Guild, type Message } from 'discord.js';
import { StarboardService } from '../starboard.service.js';
import {
  GUILD_ID,
  STAR_CHANNEL_ID,
  fake,
  makeGuild,
  makePost,
  makeReaction,
  makeMessage,
  makeRepo,
  makeSettings,
  makeStarChannel,
  makeTextChannel,
  makeThreadChannel,
  makeUser,
  type FakeStarChannel,
} from './fixtures.js';

const CUSTOM_ID = '123456789012345678';

function unknownMessageError() {
  return Object.assign(new Error('Unknown Message'), { code: RESTJSONErrorCodes.UnknownMessage });
}

describe('StarboardService (TASK-2013)', () => {
  let clock: number;
  let fakeRepo: ReturnType<typeof makeRepo>;
  let channel: FakeStarChannel;
  let guild: ReturnType<typeof makeGuild>;
  let guilds: Map<string, unknown>;
  let service: StarboardService;
  let errors: ReturnType<typeof vi.spyOn>;

  function build(): void {
    channel = makeStarChannel();
    guild = makeGuild([channel]);
    guilds = new Map([[GUILD_ID, guild]]);
    service = new StarboardService({
      repo: fakeRepo.repo,
      guilds: { cache: fake<{ get(id: string): Guild | undefined }>(guilds) },
      now: () => clock,
    });
  }

  /** A message with `count` stars and no one else of note. */
  function starred(count: number, overrides: Record<string, unknown> = {}) {
    return makeMessage(guild, [makeReaction(count)], overrides);
  }

  function react(message: ReturnType<typeof makeMessage>): Promise<void> {
    return service.reactionChanged(fake<Message>(message));
  }

  beforeEach(() => {
    clock = 1_000_000;
    fakeRepo = makeRepo();
    errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    build();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('settings cache', () => {
    it('reads a server once for five minutes, then again', async () => {
      await react(starred(1));
      await react(starred(1));
      expect(fakeRepo.repo.getSettings).toHaveBeenCalledTimes(1);

      clock += 5 * 60 * 1000 - 1;
      await react(starred(1));
      expect(fakeRepo.repo.getSettings).toHaveBeenCalledTimes(1);

      clock += 1;
      await react(starred(1));
      expect(fakeRepo.repo.getSettings).toHaveBeenCalledTimes(2);
    });

    it('reads again after invalidate for one server or for all', async () => {
      await react(starred(1));
      service.invalidate(GUILD_ID);
      await react(starred(1));
      expect(fakeRepo.repo.getSettings).toHaveBeenCalledTimes(2);

      service.invalidate();
      await react(starred(1));
      expect(fakeRepo.repo.getSettings).toHaveBeenCalledTimes(3);
    });

    it('picks up new settings after invalidate', async () => {
      fakeRepo.settings.row = makeSettings({ threshold: 5 });
      await react(starred(3));
      expect(channel.send).not.toHaveBeenCalled();

      fakeRepo.settings.row = makeSettings({ threshold: 2 });
      service.invalidate(GUILD_ID);
      await react(starred(3));
      expect(channel.send).toHaveBeenCalledTimes(1);
    });

    it('caches a server that has no settings', async () => {
      fakeRepo.settings.row = null;
      await react(starred(5));
      await react(starred(5));
      expect(fakeRepo.repo.getSettings).toHaveBeenCalledTimes(1);
      expect(channel.send).not.toHaveBeenCalled();
    });

    it('logs a failed read, skips the message and tries again next time', async () => {
      fakeRepo.repo.getSettings.mockRejectedValueOnce(new Error('db down'));
      await expect(react(starred(5))).resolves.toBeUndefined();
      expect(channel.send).not.toHaveBeenCalled();
      expect(errors).toHaveBeenCalledWith(expect.stringContaining('guild g1'), 'db down');

      await react(starred(5));
      expect(channel.send).toHaveBeenCalledTimes(1);
    });

    it('logs a non-error failure as text', async () => {
      fakeRepo.repo.getSettings.mockRejectedValueOnce('plain failure');
      await react(starred(5));
      expect(errors).toHaveBeenCalledWith(expect.any(String), 'plain failure');
    });
  });

  describe('counting', () => {
    it('posts at the threshold and not below it', async () => {
      await react(starred(2));
      expect(channel.send).not.toHaveBeenCalled();
      await react(starred(3));
      expect(channel.send).toHaveBeenCalledTimes(1);
    });

    it("does not count the bot's own reaction", async () => {
      const reaction = makeReaction(3, { me: true });
      await react(makeMessage(guild, [reaction]));
      expect(channel.send).not.toHaveBeenCalled();
      expect(reaction.users.fetch).not.toHaveBeenCalled();
    });

    it('does not read the reactors while the count cannot reach the threshold', async () => {
      const reaction = makeReaction(2);
      await react(makeMessage(guild, [reaction]));
      expect(reaction.users.fetch).not.toHaveBeenCalled();
    });

    it("takes off the author's own star when self-stars are off", async () => {
      const reaction = makeReaction(3, {
        reactors: [makeUser('a'), makeUser('author'), makeUser('b')],
      });
      await react(makeMessage(guild, [reaction]));
      expect(reaction.users.fetch).toHaveBeenCalled();
      expect(channel.send).not.toHaveBeenCalled();

      const four = makeReaction(4, {
        reactors: [makeUser('a'), makeUser('author'), makeUser('b'), makeUser('c')],
      });
      await react(makeMessage(guild, [four]));
      expect(channel.send.mock.calls[0]?.[0].content).toBe('⭐ 3 | <#c1>');
    });

    it("counts the author's own star when self-stars are allowed", async () => {
      fakeRepo.settings.row = makeSettings({ allowSelfStar: true });
      const reaction = makeReaction(3, {
        reactors: [makeUser('a'), makeUser('author'), makeUser('b')],
      });
      await react(makeMessage(guild, [reaction]));
      expect(channel.send.mock.calls[0]?.[0].content).toBe('⭐ 3 | <#c1>');
    });

    it('does not count bots', async () => {
      const reaction = makeReaction(4, {
        me: true,
        reactors: [
          makeUser('a'),
          makeUser('ririko', true),
          makeUser('other-bot', true),
          makeUser('b'),
        ],
      });
      await react(makeMessage(guild, [reaction]));
      expect(channel.send).not.toHaveBeenCalled();

      const five = makeReaction(5, {
        me: true,
        reactors: [
          makeUser('a'),
          makeUser('ririko', true),
          makeUser('other-bot', true),
          makeUser('b'),
          makeUser('c'),
        ],
      });
      await react(makeMessage(guild, [five]));
      expect(channel.send.mock.calls[0]?.[0].content).toBe('⭐ 3 | <#c1>');
    });

    it('reads the reactors a page at a time', async () => {
      const reactors = Array.from({ length: 150 }, (_, index) => makeUser(`u${index}`));
      const reaction = makeReaction(150, { reactors });
      await react(makeMessage(guild, [reaction]));
      expect(reaction.users.fetch).toHaveBeenCalledTimes(2);
      expect(reaction.users.fetch).toHaveBeenNthCalledWith(1, { limit: 100 });
      expect(reaction.users.fetch).toHaveBeenNthCalledWith(2, { limit: 100, after: 'u99' });
      expect(channel.send.mock.calls[0]?.[0].content).toBe('⭐ 150 | <#c1>');
    });

    it('stops reading reactors after ten pages', async () => {
      const reactors = Array.from({ length: 1200 }, (_, index) => makeUser(`u${index}`));
      const reaction = makeReaction(1200, { reactors });
      await react(makeMessage(guild, [reaction]));
      expect(reaction.users.fetch).toHaveBeenCalledTimes(10);
    });

    it('changes nothing when the reactors cannot be read', async () => {
      fakeRepo.posts.set('m1', makePost({ starCount: 3 }));
      const reaction = makeReaction(5);
      reaction.users.fetch.mockRejectedValue(new Error('rate limited'));
      await expect(react(makeMessage(guild, [reaction]))).resolves.toBeUndefined();
      expect(channel.messages.edit).not.toHaveBeenCalled();
      expect(channel.messages.delete).not.toHaveBeenCalled();
      expect(fakeRepo.posts.has('m1')).toBe(true);
      expect(errors).toHaveBeenCalledWith(
        expect.stringContaining('message m1 in channel c1 of guild g1'),
        'rate limited',
      );
    });

    it('matches a Unicode emoji with or without the variation selector', async () => {
      fakeRepo.settings.row = makeSettings({ emoji: '⭐️' });
      const reaction = makeReaction(3, { emoji: { id: null, name: '⭐' } });
      await react(makeMessage(guild, [reaction]));
      expect(channel.send).toHaveBeenCalledTimes(1);

      channel.send.mockClear();
      fakeRepo.settings.row = makeSettings({ emoji: '⭐' });
      service.invalidate();
      const withSelector = makeReaction(3, { emoji: { id: null, name: '⭐️' } });
      await react(makeMessage(guild, [withSelector], { id: 'm2' }));
      expect(channel.send).toHaveBeenCalledTimes(1);
    });

    it('ignores other emoji and a reaction with no name', async () => {
      const other = makeReaction(9, { emoji: { id: null, name: '❤️' } });
      const nameless = makeReaction(9, { emoji: { id: null, name: null } });
      await react(makeMessage(guild, [other, nameless]));
      expect(channel.send).not.toHaveBeenCalled();
    });

    it('matches a custom emoji by id and shows it on the copy', async () => {
      const emoji = `<:heart:${CUSTOM_ID}>`;
      fakeRepo.settings.row = makeSettings({ emoji });
      const wrong = makeReaction(9, { emoji: { id: '999999999999999999', name: 'heart' } });
      const unicode = makeReaction(9, { emoji: { id: null, name: 'heart' } });
      const right = makeReaction(3, { emoji: { id: CUSTOM_ID, name: 'renamed' } });
      await react(makeMessage(guild, [wrong, unicode, right]));
      expect(channel.send.mock.calls[0]?.[0].content).toBe(`${emoji} 3 | <#c1>`);
    });

    it('counts zero once every star is gone', async () => {
      fakeRepo.posts.set('m1', makePost());
      await react(makeMessage(guild, []));
      expect(channel.messages.delete).toHaveBeenCalledWith('copy1');
      expect(fakeRepo.posts.size).toBe(0);
    });
  });

  describe('skip rules', () => {
    async function expectSkipped(message: object): Promise<void> {
      await react(message as ReturnType<typeof makeMessage>);
      expect(channel.send).not.toHaveBeenCalled();
      expect(fakeRepo.repo.insertPost).not.toHaveBeenCalled();
    }

    it('skips a message outside a server', async () => {
      await expectSkipped(starred(5, { guild: null, guildId: null }));
      expect(fakeRepo.repo.getSettings).not.toHaveBeenCalled();
    });

    it('skips a webhook message and a system message', async () => {
      await expectSkipped(starred(5, { webhookId: 'hook' }));
      await expectSkipped(starred(5, { system: true }));
    });

    it('skips every message while the starboard is off', async () => {
      fakeRepo.settings.row = makeSettings({ channelId: null });
      await expectSkipped(starred(5));
    });

    it('skips a message in the starboard channel itself', async () => {
      await expectSkipped(
        starred(5, { channelId: STAR_CHANNEL_ID, channel: makeTextChannel(STAR_CHANNEL_ID) }),
      );
    });

    it('skips an ignored channel and a thread of one', async () => {
      fakeRepo.settings.row = makeSettings({ ignoredChannelIds: ['c1', 'forum'] });
      await expectSkipped(starred(5));
      await expectSkipped(
        starred(5, { channelId: 't1', channel: makeThreadChannel('t1', 'forum') }),
      );
    });

    it('posts from a thread whose parent is not ignored', async () => {
      fakeRepo.settings.row = makeSettings({ ignoredChannelIds: ['other'] });
      await react(starred(5, { channelId: 't1', channel: makeThreadChannel('t1', 'forum') }));
      expect(channel.send).toHaveBeenCalledTimes(1);
    });

    it('skips when the starboard channel is gone or not a text channel', async () => {
      guild.channels.cache.clear();
      await expectSkipped(starred(5));

      guild.channels.cache.set(STAR_CHANNEL_ID, makeStarChannel({ isTextBased: () => false }));
      await expectSkipped(starred(5));
    });

    it('skips an NSFW channel unless the starboard channel is NSFW too', async () => {
      await expectSkipped(starred(5, { channel: makeTextChannel('c1', true) }));
      await expectSkipped(
        starred(5, { channelId: 't1', channel: makeThreadChannel('t1', 'c1', true) }),
      );

      channel.nsfw = true;
      await react(starred(5, { channel: makeTextChannel('c1', true) }));
      expect(channel.send).toHaveBeenCalledTimes(1);
    });

    it('posts from an NSFW channel to an NSFW starboard and a plain thread to either', async () => {
      await react(starred(5, { channelId: 't1', channel: makeThreadChannel('t1', 'c1', false) }));
      expect(channel.send).toHaveBeenCalledTimes(1);
    });

    it('treats a channel with no NSFW flag as safe', async () => {
      await react(starred(5, { channel: { id: 'c1', isThread: () => false } }));
      expect(channel.send).toHaveBeenCalledTimes(1);
    });

    it('treats a thread with no cached parent as safe', async () => {
      await react(
        starred(5, {
          channelId: 't1',
          channel: { id: 't1', parentId: 'c1', parent: null, isThread: () => true },
        }),
      );
      expect(channel.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('posting, editing and removing the copy', () => {
    it('posts the copy and saves the row', async () => {
      const message = starred(3, { content: 'hello <@123> @everyone' });
      await react(message);

      const sent = channel.send.mock.calls[0]?.[0];
      expect(sent.content).toBe('⭐ 3 | <#c1>');
      expect(sent.allowedMentions).toEqual({ parse: [] });
      expect(sent.embeds).toHaveLength(1);
      expect(sent.embeds[0].toJSON().description).toBe('hello <@123> @everyone');
      expect(fakeRepo.repo.insertPost).toHaveBeenCalledWith({
        messageId: 'm1',
        guildId: GUILD_ID,
        channelId: 'c1',
        authorId: 'author',
        starboardMessageId: 'copy1',
        starCount: 3,
      });
    });

    it('edits only the count when a post exists and the count changed', async () => {
      await react(starred(3));
      channel.send.mockClear();

      await react(starred(5));
      expect(channel.send).not.toHaveBeenCalled();
      expect(channel.messages.edit).toHaveBeenCalledWith('copy1', {
        content: '⭐ 5 | <#c1>',
        allowedMentions: { parse: [] },
      });
      expect(fakeRepo.posts.get('m1')?.starCount).toBe(5);
    });

    it('does not edit when the count is the same', async () => {
      await react(starred(3));
      await react(starred(3));
      expect(channel.messages.edit).not.toHaveBeenCalled();
    });

    it('still edits down while the count stays at the threshold or above', async () => {
      await react(starred(6));
      await react(starred(4));
      expect(channel.messages.edit).toHaveBeenCalledWith(
        'copy1',
        expect.objectContaining({ content: '⭐ 4 | <#c1>' }),
      );
      expect(fakeRepo.posts.get('m1')?.starCount).toBe(4);
    });

    it('deletes the copy and the row below the threshold', async () => {
      await react(starred(3));
      await react(starred(2));
      expect(channel.messages.delete).toHaveBeenCalledWith('copy1');
      expect(fakeRepo.posts.has('m1')).toBe(false);
    });

    it('does nothing below the threshold when there is no post', async () => {
      await react(starred(1));
      expect(channel.send).not.toHaveBeenCalled();
      expect(channel.messages.delete).not.toHaveBeenCalled();
      expect(fakeRepo.repo.deletePost).not.toHaveBeenCalled();
    });

    it('can post again after the copy was removed below the threshold', async () => {
      await react(starred(3));
      await react(starred(0));
      channel.send.mockResolvedValue({ id: 'copy2' });
      await react(starred(3));
      expect(fakeRepo.posts.get('m1')?.starboardMessageId).toBe('copy2');
    });

    it('never posts, edits or deletes for a row marked removed', async () => {
      fakeRepo.posts.set('m1', makePost({ removed: true }));
      await react(starred(9));
      await react(starred(0));
      expect(channel.send).not.toHaveBeenCalled();
      expect(channel.messages.edit).not.toHaveBeenCalled();
      expect(channel.messages.delete).not.toHaveBeenCalled();
      expect(fakeRepo.posts.get('m1')?.removed).toBe(true);
    });

    it('marks the row removed when the copy is gone on edit', async () => {
      fakeRepo.posts.set('m1', makePost({ starCount: 3 }));
      channel.messages.edit.mockRejectedValue(unknownMessageError());
      await react(starred(6));
      expect(fakeRepo.posts.get('m1')).toMatchObject({ removed: true, starCount: 3 });

      await react(starred(7));
      expect(channel.messages.edit).toHaveBeenCalledTimes(1);
    });

    it('logs a failed edit with IDs and keeps the row as it was', async () => {
      fakeRepo.posts.set('m1', makePost({ starCount: 3 }));
      channel.messages.edit.mockRejectedValue(new Error('Missing Permissions'));
      await react(starred(6));
      expect(fakeRepo.posts.get('m1')).toMatchObject({ removed: false, starCount: 3 });
      expect(errors).toHaveBeenCalledWith(
        expect.stringContaining(`copy1 in channel ${STAR_CHANNEL_ID} of guild ${GUILD_ID}`),
        'Missing Permissions',
      );
    });

    it('treats a copy that is already gone as deleted when removing', async () => {
      fakeRepo.posts.set('m1', makePost());
      channel.messages.delete.mockRejectedValue(unknownMessageError());
      await react(starred(0));
      expect(fakeRepo.posts.has('m1')).toBe(false);
    });

    it('keeps the row, to retry, when the copy cannot be deleted', async () => {
      fakeRepo.posts.set('m1', makePost());
      channel.messages.delete.mockRejectedValue(new Error('Missing Access'));
      await react(starred(0));
      expect(fakeRepo.posts.has('m1')).toBe(true);
      expect(errors).toHaveBeenCalled();
    });

    it('logs a failed send with IDs only and saves nothing', async () => {
      channel.send.mockRejectedValue(new Error('Missing Permissions'));
      await react(starred(3, { content: 'my private secret' }));
      expect(fakeRepo.posts.size).toBe(0);
      expect(errors).toHaveBeenCalledWith(
        expect.stringContaining(`m1 in channel ${STAR_CHANNEL_ID} of guild ${GUILD_ID}`),
        'Missing Permissions',
      );
      expect(JSON.stringify(errors.mock.calls)).not.toContain('my private secret');
    });

    it('deletes the copy when another process saved the row first', async () => {
      fakeRepo.repo.insertPost.mockResolvedValueOnce(false);
      await react(starred(3));
      expect(channel.messages.delete).toHaveBeenCalledWith('copy1');
    });

    it('deletes the copy and logs when the row cannot be saved', async () => {
      fakeRepo.repo.insertPost.mockRejectedValueOnce(new Error('db down'));
      await react(starred(3));
      expect(channel.messages.delete).toHaveBeenCalledWith('copy1');
      expect(errors).toHaveBeenCalledWith(expect.stringContaining('Could not save'), 'db down');
    });

    it('sends the copy again for a row that has none, and records it', async () => {
      fakeRepo.posts.set('m1', makePost({ starboardMessageId: null, starCount: 0 }));
      channel.send.mockResolvedValue({ id: 'copy9' });
      await react(starred(4));
      expect(channel.send.mock.calls[0]?.[0].content).toBe('⭐ 4 | <#c1>');
      expect(fakeRepo.posts.get('m1')).toMatchObject({ starboardMessageId: 'copy9', starCount: 4 });
    });

    it('does not record a resent copy when the row is gone or the send fails', async () => {
      fakeRepo.posts.set('m1', makePost({ starboardMessageId: null, starCount: 0 }));
      fakeRepo.repo.updatePost.mockResolvedValueOnce(null);
      await react(starred(4));
      expect(channel.messages.delete).toHaveBeenCalledWith('copy1');

      channel.send.mockRejectedValue(new Error('nope'));
      await react(starred(4));
      expect(fakeRepo.posts.get('m1')?.starboardMessageId).toBeNull();
    });

    it('never throws to the gateway', async () => {
      fakeRepo.repo.findByMessage.mockRejectedValue(new Error('db down'));
      await expect(react(starred(5))).resolves.toBeUndefined();
      expect(errors).toHaveBeenCalledWith(
        expect.stringContaining('reactionChanged failed in guild g1'),
        'db down',
      );
    });
  });

  describe('one message at a time', () => {
    it('posts once for a burst of reactions', async () => {
      let release: () => void = () => undefined;
      channel.send.mockImplementation(
        () =>
          new Promise((resolve) => {
            release = () => resolve({ id: 'copy1' });
          }),
      );

      const burst = [react(starred(3)), react(starred(4)), react(starred(5))];
      await vi.waitFor(() => expect(channel.send).toHaveBeenCalledTimes(1));
      release();
      await Promise.all(burst);

      expect(channel.send).toHaveBeenCalledTimes(1);
      expect(fakeRepo.repo.insertPost).toHaveBeenCalledTimes(1);
      expect(channel.messages.edit).toHaveBeenCalledTimes(2);
      expect(fakeRepo.posts.get('m1')?.starCount).toBe(5);
    });

    it('works on different messages side by side', async () => {
      const gates: Array<() => void> = [];
      channel.send.mockImplementation(() => {
        const id = `copy${gates.length + 1}`;
        return new Promise((resolve) => gates.push(() => resolve({ id })));
      });
      const first = react(starred(3));
      const second = react(starred(3, { id: 'm2' }));
      await vi.waitFor(() => expect(channel.send).toHaveBeenCalledTimes(2));
      gates.forEach((open) => open());
      await Promise.all([first, second]);
      expect(fakeRepo.posts.size).toBe(2);
    });

    it('keeps going after a step failed and leaves no queue behind', async () => {
      fakeRepo.repo.findByMessage.mockRejectedValueOnce(new Error('db down'));
      await react(starred(3));
      await react(starred(3));
      expect(channel.send).toHaveBeenCalledTimes(1);
      expect((service as unknown as { queues: Map<string, unknown> }).queues.size).toBe(0);
    });

    it('waits for a post in progress before it handles a delete of the original', async () => {
      let release: () => void = () => undefined;
      channel.send.mockImplementation(
        () =>
          new Promise((resolve) => {
            release = () => resolve({ id: 'copy1' });
          }),
      );
      const posting = react(starred(3));
      await vi.waitFor(() => expect(channel.send).toHaveBeenCalledTimes(1));
      const deleting = service.messageDeleted(GUILD_ID, 'm1');
      release();
      await Promise.all([posting, deleting]);

      expect(channel.messages.delete).toHaveBeenCalledWith('copy1');
      expect(fakeRepo.posts.size).toBe(0);
    });
  });

  describe('messageDeleted', () => {
    it('deletes the copy and the row when the original is deleted', async () => {
      fakeRepo.posts.set('m1', makePost());
      await service.messageDeleted(GUILD_ID, 'm1');
      expect(channel.messages.delete).toHaveBeenCalledWith('copy1');
      expect(fakeRepo.posts.size).toBe(0);
    });

    it('marks the row removed when the copy is deleted', async () => {
      fakeRepo.posts.set('m1', makePost());
      await service.messageDeleted(GUILD_ID, 'copy1');
      expect(fakeRepo.posts.get('m1')?.removed).toBe(true);
      expect(channel.messages.delete).not.toHaveBeenCalled();
    });

    it('leaves a row that is already marked removed alone when its copy is deleted', async () => {
      fakeRepo.posts.set('m1', makePost({ removed: true }));
      await service.messageDeleted(GUILD_ID, 'copy1');
      expect(fakeRepo.repo.updatePost).not.toHaveBeenCalled();
    });

    it('ignores a message that was never starred', async () => {
      await service.messageDeleted(GUILD_ID, 'other');
      expect(fakeRepo.repo.updatePost).not.toHaveBeenCalled();
      expect(fakeRepo.repo.deletePost).not.toHaveBeenCalled();
    });

    it('ignores a row of another server', async () => {
      fakeRepo.posts.set('m1', makePost({ guildId: 'other' }));
      await service.messageDeleted(GUILD_ID, 'm1');
      await service.messageDeleted(GUILD_ID, 'copy1');
      expect(fakeRepo.posts.get('m1')).toMatchObject({ removed: false });
      expect(channel.messages.delete).not.toHaveBeenCalled();
    });

    it('only deletes the row for an original whose copy was already removed', async () => {
      fakeRepo.posts.set('m1', makePost({ removed: true }));
      await service.messageDeleted(GUILD_ID, 'm1');
      expect(channel.messages.delete).not.toHaveBeenCalled();
      expect(fakeRepo.posts.size).toBe(0);
    });

    it('only deletes the row for a row that has no copy', async () => {
      fakeRepo.posts.set('m1', makePost({ starboardMessageId: null }));
      await service.messageDeleted(GUILD_ID, 'm1');
      expect(channel.messages.delete).not.toHaveBeenCalled();
      expect(fakeRepo.posts.size).toBe(0);
    });

    it('deletes the row when the starboard channel cannot be found any more', async () => {
      fakeRepo.posts.set('m1', makePost());
      guild.channels.cache.clear();
      await service.messageDeleted(GUILD_ID, 'm1');
      expect(fakeRepo.posts.size).toBe(0);
    });

    it('deletes the row when the starboard is off or the server is not cached', async () => {
      fakeRepo.posts.set('m1', makePost());
      fakeRepo.settings.row = null;
      await service.messageDeleted(GUILD_ID, 'm1');
      expect(fakeRepo.posts.size).toBe(0);

      fakeRepo.posts.set('m2', makePost({ messageId: 'm2', starboardMessageId: 'copy2' }));
      fakeRepo.settings.row = makeSettings();
      service.invalidate();
      guilds.clear();
      await service.messageDeleted(GUILD_ID, 'm2');
      expect(fakeRepo.posts.size).toBe(0);
      expect(channel.messages.delete).not.toHaveBeenCalled();
    });

    it('keeps the row when the copy cannot be deleted', async () => {
      fakeRepo.posts.set('m1', makePost());
      channel.messages.delete.mockRejectedValue(new Error('Missing Access'));
      await service.messageDeleted(GUILD_ID, 'm1');
      expect(fakeRepo.posts.has('m1')).toBe(true);
    });

    it('never throws', async () => {
      fakeRepo.repo.findByMessage.mockRejectedValue(new Error('db down'));
      await expect(service.messageDeleted(GUILD_ID, 'm1')).resolves.toBeUndefined();
      expect(errors).toHaveBeenCalledWith(
        expect.stringContaining('messageDeleted failed in guild g1'),
        'db down',
      );
    });
  });
});
