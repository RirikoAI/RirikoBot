import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { ReactionRoleRepository } from './reaction-role.repository.js';

const MISSING_UUID = '00000000-0000-4000-8000-000000000001';

const binding = (messageId: string, emoji: string, overrides: Record<string, unknown> = {}) => ({
  guildId: 'g1',
  channelId: 'c1',
  messageId,
  emojiOrComponentId: emoji,
  roleId: `role-${emoji}`,
  ...overrides,
});

describeDialects('ReactionRoleRepository behaviour', (db) => {
  it('creates a binding with defaults and reads it back', async () => {
    const repo = new ReactionRoleRepository(db.client);
    expect(await repo.findById(MISSING_UUID)).toBeNull();
    expect(await repo.exists(MISSING_UUID)).toBe(false);
    expect(await repo.count()).toBe(0);

    const created = await repo.create(binding('m1', 'star'));
    expect(created.type).toBe('EMOJI');
    expect(created.mode).toBe('TOGGLE');
    expect(created.groupId).toBeNull();
    expect(created.label).toBeNull();

    expect(await repo.exists(created.id)).toBe(true);
    expect((await repo.findByMessageAndEmoji('m1', 'star'))?.id).toBe(created.id);
    expect(await repo.findByMessageAndEmoji('m1', 'moon')).toBeNull();
    expect(await repo.count()).toBe(1);
  });

  it('updates a binding and throws for a missing one', async () => {
    const repo = new ReactionRoleRepository(db.client);
    const created = await repo.create(binding('m1', 'star'));

    const updated = await repo.update(created.id, {
      roleId: 'role-new',
      mode: 'GIVE_ONLY',
      label: 'Star',
      description: 'Gets the star role',
      groupId: 'colors',
    });
    expect(updated.roleId).toBe('role-new');
    expect(updated.mode).toBe('GIVE_ONLY');
    expect(updated.label).toBe('Star');
    expect(updated.description).toBe('Gets the star role');
    expect(updated.groupId).toBe('colors');
    expect(updated.emojiOrComponentId).toBe('star');

    await expect(repo.update(MISSING_UUID, { roleId: 'x' })).rejects.toThrow(DatabaseError);
  });

  it('lists the bindings of a message, a guild and a group', async () => {
    const repo = new ReactionRoleRepository(db.client);
    await repo.create(binding('m1', 'a', { groupId: 'colors' }));
    await repo.create(binding('m1', 'b', { groupId: 'colors' }));
    await repo.create(binding('m2', 'c', { groupId: 'games' }));
    await repo.create(binding('m3', 'd', { guildId: 'g2', groupId: 'colors' }));

    const emojis = (rows: { emojiOrComponentId: string }[]) =>
      rows.map((r) => r.emojiOrComponentId).sort();
    expect(emojis(await repo.findByMessageId('m1'))).toEqual(['a', 'b']);
    expect(await repo.findByMessageId('nope')).toEqual([]);
    expect(emojis(await repo.findByGuildId('g1'))).toEqual(['a', 'b', 'c']);
    expect(emojis(await repo.findByGroup('g1', 'colors'))).toEqual(['a', 'b']);
    expect(await repo.findByGroup('g1', 'nope')).toEqual([]);
  });

  it('deletes by id, by message, and by message and emoji', async () => {
    const repo = new ReactionRoleRepository(db.client);
    const a = await repo.create(binding('m1', 'a'));
    await repo.create(binding('m1', 'b'));
    await repo.create(binding('m1', 'c'));
    await repo.create(binding('m2', 'd'));

    expect(await repo.delete(a.id)).toBe(true);
    expect(await repo.delete(a.id)).toBe(false);
    expect(await repo.deleteByMessageAndEmoji('m1', 'b')).toBe(true);
    expect(await repo.deleteByMessageAndEmoji('m1', 'b')).toBe(false);
    expect(await repo.deleteByMessageId('m1')).toBe(1);
    expect(await repo.deleteByMessageId('m1')).toBe(0);
    expect(await repo.count()).toBe(1);
  });

  it('replaces only the button and menu bindings of a message', async () => {
    const repo = new ReactionRoleRepository(db.client);
    await repo.create(binding('m1', 'emoji'));
    await repo.create(binding('m1', 'old-button', { type: 'BUTTON' }));
    await repo.create(binding('m1', 'old-menu', { type: 'SELECT_MENU' }));
    await repo.create(binding('m2', 'other-button', { type: 'BUTTON' }));

    await repo.replaceComponentBindings('m1', [
      { id: randomUUID(), ...binding('m1', 'new-button', { type: 'BUTTON' }) },
    ]);
    const after = await repo.findByMessageId('m1');
    expect(after.map((r) => r.emojiOrComponentId).sort()).toEqual(['emoji', 'new-button']);
    expect(await repo.findByMessageId('m2')).toHaveLength(1);

    await repo.replaceComponentBindings('m1', []);
    expect((await repo.findByMessageId('m1')).map((r) => r.emojiOrComponentId)).toEqual(['emoji']);
  });

  it('fills in the channel of migrated bindings on one message only', async () => {
    const repo = new ReactionRoleRepository(db.client);
    await repo.create(binding('m1', 'a', { channelId: 'g1' }));
    await repo.create(binding('m1', 'b', { channelId: 'g1' }));
    await repo.create(binding('m1', 'known', { channelId: 'c-real' }));
    await repo.create(binding('m2', 'c', { channelId: 'g1' }));

    expect(await repo.linkUnknownChannel('m1', 'c-found')).toBe(2);
    expect(await repo.linkUnknownChannel('m1', 'c-again')).toBe(0);
    const channels = (await repo.findByMessageId('m1')).map((r) => r.channelId).sort();
    expect(channels).toEqual(['c-found', 'c-found', 'c-real']);
    expect((await repo.findByMessageId('m2'))[0]?.channelId).toBe('g1');
  });
});
