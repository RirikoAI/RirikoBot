import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { withTransaction } from '../transactions/index.js';
import { StarboardRepository } from './starboard.repository.js';

const post = (messageId: string, overrides: Record<string, unknown> = {}) => ({
  messageId,
  guildId: 'g1',
  channelId: 'general',
  authorId: 'author',
  starCount: 3,
  ...overrides,
});

describeDialects('StarboardRepository behaviour', (db) => {
  it('reads no settings for a new server and saves them with their defaults', async () => {
    const repo = new StarboardRepository(db.client);
    expect(await repo.getSettings('g1')).toBeNull();

    const created = await repo.upsertSettings('g1', { channelId: 'stars' });
    expect(created).toMatchObject({
      guildId: 'g1',
      channelId: 'stars',
      emoji: '⭐',
      threshold: 3,
      allowSelfStar: false,
      ignoredChannelIds: [],
    });
    expect(created.updatedAt).toBeInstanceOf(Date);

    const off = await repo.upsertSettings('g2', {});
    expect(off.channelId).toBeNull();
    expect(await repo.getSettings('g1')).toMatchObject({ channelId: 'stars' });
    expect(await repo.getSettings('g3')).toBeNull();
  });

  it('changes only the given settings and keeps the others', async () => {
    const repo = new StarboardRepository(db.client);
    await repo.upsertSettings('g1', { channelId: 'stars', threshold: 5, emoji: '123456789' });

    const patched = await repo.upsertSettings('g1', {
      allowSelfStar: true,
      ignoredChannelIds: ['spam', 'bots'],
    });
    expect(patched).toMatchObject({
      channelId: 'stars',
      threshold: 5,
      emoji: '123456789',
      allowSelfStar: true,
      ignoredChannelIds: ['spam', 'bots'],
    });

    const cleared = await repo.upsertSettings('g1', { channelId: null, ignoredChannelIds: [] });
    expect(cleared.channelId).toBeNull();
    expect(cleared.ignoredChannelIds).toEqual([]);
    expect(cleared.threshold).toBe(5);
  });

  it('inserts a post and finds it by the original message and by its copy', async () => {
    const repo = new StarboardRepository(db.client);
    expect(await repo.findByMessage('m1')).toBeNull();
    expect(await repo.findByStarboardMessage('s1')).toBeNull();

    expect(await repo.insertPost(post('m1', { starboardMessageId: 's1' }))).toBe(true);

    const byMessage = await repo.findByMessage('m1');
    expect(byMessage).toMatchObject({
      messageId: 'm1',
      guildId: 'g1',
      channelId: 'general',
      authorId: 'author',
      starboardMessageId: 's1',
      starCount: 3,
      removed: false,
    });
    expect(byMessage?.createdAt).toBeInstanceOf(Date);
    expect(byMessage?.updatedAt).toBeInstanceOf(Date);
    expect(await repo.findByStarboardMessage('s1')).toMatchObject({ messageId: 'm1' });
    expect(await repo.findByStarboardMessage('other')).toBeNull();
  });

  it('returns false for a duplicate message and keeps the first record', async () => {
    const repo = new StarboardRepository(db.client);
    expect(await repo.insertPost(post('m1', { starCount: 3 }))).toBe(true);
    expect(await repo.insertPost(post('m1', { starCount: 9, authorId: 'someone-else' }))).toBe(
      false,
    );

    expect(await repo.findByMessage('m1')).toMatchObject({ starCount: 3, authorId: 'author' });
    expect(await repo.count()).toBe(1);
  });

  it('returns false when a second message claims the same starboard copy', async () => {
    const repo = new StarboardRepository(db.client);
    expect(await repo.insertPost(post('m1', { starboardMessageId: 's1' }))).toBe(true);
    expect(await repo.insertPost(post('m2', { starboardMessageId: 's1' }))).toBe(false);
    expect(await repo.findByMessage('m2')).toBeNull();

    // Several posts may wait for their copy: a null starboard message id is not a duplicate.
    expect(await repo.insertPost(post('m3'))).toBe(true);
    expect(await repo.insertPost(post('m4'))).toBe(true);
    expect(await repo.count()).toBe(3);
  });

  it('updates the given fields of a post and refreshes updatedAt', async () => {
    const repo = new StarboardRepository(db.client);
    await repo.insertPost(post('m1'));
    const before = await repo.findByMessage('m1');

    const linked = await repo.updatePost('m1', { starboardMessageId: 's1', starCount: 7 });
    expect(linked).toMatchObject({ messageId: 'm1', starboardMessageId: 's1', starCount: 7 });
    expect(linked?.removed).toBe(false);
    expect(linked?.createdAt).toEqual(before?.createdAt);
    expect(linked?.updatedAt.getTime()).toBeGreaterThanOrEqual(before?.updatedAt.getTime() ?? 0);

    const removed = await repo.updatePost('m1', { removed: true, starboardMessageId: null });
    expect(removed).toMatchObject({ removed: true, starboardMessageId: null, starCount: 7 });
    expect(await repo.findByStarboardMessage('s1')).toBeNull();
    expect(await repo.updatePost('missing', { starCount: 1 })).toBeNull();
  });

  it('deletes a post and says whether there was one', async () => {
    const repo = new StarboardRepository(db.client);
    await repo.insertPost(post('m1'));
    await repo.insertPost(post('m2'));

    expect(await repo.deletePost('m1')).toBe(true);
    expect(await repo.deletePost('m1')).toBe(false);
    expect(await repo.findByMessage('m1')).toBeNull();
    expect(await repo.findByMessage('m2')).not.toBeNull();
  });

  it('implements the base repository contract over the posts', async () => {
    const repo = new StarboardRepository(db.client);
    expect(await repo.exists('m1')).toBe(false);
    expect(await repo.findById('m1')).toBeNull();

    const created = await repo.create(post('m1'));
    expect(created).toMatchObject({ messageId: 'm1', starCount: 3 });
    expect(await repo.exists('m1')).toBe(true);
    expect(await repo.findById('m1')).toMatchObject({ messageId: 'm1' });
    await expect(repo.create(post('m1'))).rejects.toThrow();

    expect(await repo.update('m1', { starCount: 4 })).toMatchObject({ starCount: 4 });
    await expect(repo.update('missing', { starCount: 1 })).rejects.toThrow(DatabaseError);

    expect(await repo.count()).toBe(1);
    expect(await repo.delete('m1')).toBe(true);
    expect(await repo.delete('m1')).toBe(false);
    expect(await repo.count()).toBe(0);
  });

  it('uses the transaction it is given and rolls its writes back with it', async () => {
    const repo = new StarboardRepository(db.client);
    await expect(
      withTransaction(db.client, async (tx) => {
        await repo.upsertSettings('g1', { channelId: 'stars' }, tx);
        expect(await repo.insertPost(post('m1'), tx)).toBe(true);
        expect(await repo.findByMessage('m1', tx)).not.toBeNull();
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    expect(await repo.getSettings('g1')).toBeNull();
    expect(await repo.findByMessage('m1')).toBeNull();
  });
});
