import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { UserRepository } from './user.repository.js';

describeDialects('UserRepository behaviour', (db) => {
  it('creates a user with defaults and reads it back', async () => {
    const repo = new UserRepository(db.client);
    expect(await repo.findById('u1')).toBeNull();
    expect(await repo.exists('u1')).toBe(false);
    expect(await repo.count()).toBe(0);

    const created = await repo.create({ id: 'u1', username: 'ririko' });
    expect(created.displayName).toBeNull();
    expect(created.avatarUrl).toBeNull();
    expect(created.isBlacklisted).toBe(false);
    expect(created.warnCount).toBe(0);
    expect(created.notifyLevelUp).toBe(true);

    expect((await repo.findById('u1'))?.username).toBe('ririko');
    expect(await repo.exists('u1')).toBe(true);
    expect(await repo.count()).toBe(1);
    await expect(repo.create({ id: 'u1', username: 'again' })).rejects.toThrow();
  });

  it('updates a user, stamping the change, and throws for a missing one', async () => {
    const repo = new UserRepository(db.client);
    const created = await repo.create({ id: 'u1', username: 'ririko' });

    const updated = await repo.update('u1', { displayName: 'Ririko', notifyLevelUp: false });
    expect(updated.displayName).toBe('Ririko');
    expect(updated.notifyLevelUp).toBe(false);
    expect(updated.username).toBe('ririko');
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());

    await expect(repo.update('ghost', { displayName: 'x' })).rejects.toThrow(DatabaseError);
  });

  it('upserts a user, updating the profile of an existing one', async () => {
    const repo = new UserRepository(db.client);

    const first = await repo.upsert({ id: 'u1', username: 'old', avatarUrl: 'https://a/1.png' });
    expect(first.username).toBe('old');

    const second = await repo.upsert({ id: 'u1', username: 'new', avatarUrl: 'https://a/2.png' });
    expect(second.username).toBe('new');
    expect(second.avatarUrl).toBe('https://a/2.png');
    expect(await repo.count()).toBe(1);
  });

  it('gets or creates a user with generated and supplied defaults', async () => {
    const repo = new UserRepository(db.client);

    const generated = await repo.getOrCreate('u1');
    expect(generated.username).toBe('user_u1');
    expect(generated.warnCount).toBe(0);
    expect(generated.isBlacklisted).toBe(false);

    const supplied = await repo.getOrCreate('u2', {
      username: 'custom',
      displayName: 'Custom',
      profileBackgroundUrl: 'https://bg/1.png',
      notifyLevelUp: false,
    });
    expect(supplied.username).toBe('custom');
    expect(supplied.displayName).toBe('Custom');
    expect(supplied.profileBackgroundUrl).toBe('https://bg/1.png');
    expect(supplied.notifyLevelUp).toBe(false);

    expect((await repo.getOrCreate('u2', { username: 'ignored' })).username).toBe('custom');
    expect(await repo.count()).toBe(2);
  });

  it('blacklists and un-blacklists a user', async () => {
    const repo = new UserRepository(db.client);
    await repo.create({ id: 'u1', username: 'ririko' });

    expect((await repo.setBlacklist('u1', true, 'spam')).isBlacklisted).toBe(true);
    expect((await repo.findById('u1'))?.isBlacklisted).toBe(true);
    expect((await repo.setBlacklist('u1', false)).isBlacklisted).toBe(false);
    await expect(repo.setBlacklist('ghost', true)).rejects.toThrow(DatabaseError);
  });

  it('counts warnings one at a time and rejects an unknown user', async () => {
    const repo = new UserRepository(db.client);
    await repo.create({ id: 'u1', username: 'ririko' });

    expect(await repo.incrementWarnCount('u1')).toBe(1);
    expect(await repo.incrementWarnCount('u1')).toBe(2);
    expect((await repo.findById('u1'))?.warnCount).toBe(2);
    await expect(repo.incrementWarnCount('ghost')).rejects.toThrow(/not found/);
  });

  it('deletes a user once', async () => {
    const repo = new UserRepository(db.client);
    await repo.create({ id: 'u1', username: 'ririko' });

    expect(await repo.delete('u1')).toBe(true);
    expect(await repo.delete('u1')).toBe(false);
    expect(await repo.count()).toBe(0);
  });
});
