import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { SqliteDatabaseClient } from '../client/types.js';
import { ReactionRoleRepository } from './reaction-role.repository.js';
import { SQLITE_SCHEMA_DDL } from '../schema/sqlite/ddl.js';

describe('ReactionRoleRepository (TASK-1401)', () => {
  let client: SqliteDatabaseClient;
  let reactionRoleRepo: ReactionRoleRepository;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    client.raw.exec(SQLITE_SCHEMA_DDL);
    reactionRoleRepo = new ReactionRoleRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it('creates and finds a reaction role by id', async () => {
    const rr = await reactionRoleRepo.create({
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageId: 'msg-100',
      emojiOrComponentId: '⭐',
      roleId: 'role-star',
      type: 'EMOJI',
      mode: 'TOGGLE',
    });

    expect(rr.id).toBeDefined();
    expect(rr.guildId).toBe('guild-1');
    expect(rr.emojiOrComponentId).toBe('⭐');
    expect(rr.roleId).toBe('role-star');

    const found = await reactionRoleRepo.findById(rr.id);
    expect(found).toEqual(rr);
  });

  it('finds reaction role by messageId and emoji', async () => {
    await reactionRoleRepo.create({
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageId: 'msg-100',
      emojiOrComponentId: '🎮',
      roleId: 'role-gamer',
    });

    const found = await reactionRoleRepo.findByMessageAndEmoji('msg-100', '🎮');
    expect(found).not.toBeNull();
    expect(found?.roleId).toBe('role-gamer');

    const notFound = await reactionRoleRepo.findByMessageAndEmoji('msg-100', '🎨');
    expect(notFound).toBeNull();
  });

  it('finds all reaction roles for a message and for a guild', async () => {
    await reactionRoleRepo.create({
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageId: 'msg-100',
      emojiOrComponentId: '🎮',
      roleId: 'role-gamer',
    });
    await reactionRoleRepo.create({
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageId: 'msg-100',
      emojiOrComponentId: '🎨',
      roleId: 'role-artist',
    });
    await reactionRoleRepo.create({
      guildId: 'guild-1',
      channelId: 'channel-2',
      messageId: 'msg-200',
      emojiOrComponentId: '🎵',
      roleId: 'role-music',
    });

    const msgRoles = await reactionRoleRepo.findByMessageId('msg-100');
    expect(msgRoles).toHaveLength(2);

    const guildRoles = await reactionRoleRepo.findByGuildId('guild-1');
    expect(guildRoles).toHaveLength(3);
  });

  it('finds reaction roles by groupId for mutually exclusive radio groups', async () => {
    await reactionRoleRepo.create({
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageId: 'msg-100',
      emojiOrComponentId: 'btn-red',
      roleId: 'role-red',
      type: 'BUTTON',
      mode: 'UNIQUE',
      groupId: 'colors',
    });
    await reactionRoleRepo.create({
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageId: 'msg-100',
      emojiOrComponentId: 'btn-blue',
      roleId: 'role-blue',
      type: 'BUTTON',
      mode: 'UNIQUE',
      groupId: 'colors',
    });

    const groupRoles = await reactionRoleRepo.findByGroup('guild-1', 'colors');
    expect(groupRoles).toHaveLength(2);
    expect(groupRoles.map((r) => r.roleId)).toEqual(['role-red', 'role-blue']);
  });

  it('deletes reaction role by id and by messageId', async () => {
    const rr = await reactionRoleRepo.create({
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageId: 'msg-delete',
      emojiOrComponentId: '🔥',
      roleId: 'role-fire',
    });

    const deleted = await reactionRoleRepo.delete(rr.id);
    expect(deleted).toBe(true);

    const found = await reactionRoleRepo.findById(rr.id);
    expect(found).toBeNull();

    await reactionRoleRepo.create({
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageId: 'msg-bulk',
      emojiOrComponentId: '1️⃣',
      roleId: 'role-1',
    });
    await reactionRoleRepo.create({
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageId: 'msg-bulk',
      emojiOrComponentId: '2️⃣',
      roleId: 'role-2',
    });

    const deletedCount = await reactionRoleRepo.deleteByMessageId('msg-bulk');
    expect(deletedCount).toBe(2);
  });
});
