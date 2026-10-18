import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { SqliteDatabaseClient } from '../client/types.js';
import { AutoVoiceRepository } from './autovoice.repository.js';

describe('AutoVoiceRepository (TASK-0911)', () => {
  let client: SqliteDatabaseClient;
  let autoVoiceRepo: AutoVoiceRepository;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    client.raw.exec(`
      CREATE TABLE auto_voice_configs (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        parent_channel_id TEXT NOT NULL,
        channel_name_template TEXT NOT NULL DEFAULT '{user}''s Room',
        user_limit INTEGER NOT NULL DEFAULT 0,
        bitrate INTEGER NOT NULL DEFAULT 64000
      );
    `);

    autoVoiceRepo = new AutoVoiceRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  describe('Configuration Management', () => {
    it('creates and finds an auto-voice config by id', async () => {
      const config = await autoVoiceRepo.create({
        guildId: 'guild-123',
        parentChannelId: 'parent-vc-456',
        channelNameTemplate: '🔊 {user} Lounge',
        userLimit: 5,
        bitrate: 96000,
      });

      expect(config.id).toBeDefined();
      expect(config.guildId).toBe('guild-123');
      expect(config.parentChannelId).toBe('parent-vc-456');
      expect(config.channelNameTemplate).toBe('🔊 {user} Lounge');
      expect(config.userLimit).toBe(5);
      expect(config.bitrate).toBe(96000);

      const found = await autoVoiceRepo.findById(config.id);
      expect(found).toEqual(config);
    });

    it('finds an auto-voice config by parent channel ID and guild', async () => {
      await autoVoiceRepo.create({
        guildId: 'guild-1',
        parentChannelId: 'parent-vc-1',
        channelNameTemplate: "{user}'s Room",
      });

      const found = await autoVoiceRepo.findByParentChannelId('guild-1', 'parent-vc-1');
      expect(found).not.toBeNull();
      expect(found?.guildId).toBe('guild-1');
      expect(found?.parentChannelId).toBe('parent-vc-1');

      const notFound = await autoVoiceRepo.findByParentChannelId('guild-1', 'nonexistent');
      expect(notFound).toBeNull();
    });

    it('lists all auto-voice configs for a given guild', async () => {
      await autoVoiceRepo.create({
        guildId: 'guild-1',
        parentChannelId: 'parent-1',
      });
      await autoVoiceRepo.create({
        guildId: 'guild-1',
        parentChannelId: 'parent-2',
      });
      await autoVoiceRepo.create({
        guildId: 'guild-2',
        parentChannelId: 'parent-3',
      });

      const guild1Configs = await autoVoiceRepo.listByGuildId('guild-1');
      expect(guild1Configs).toHaveLength(2);

      const guild2Configs = await autoVoiceRepo.listByGuildId('guild-2');
      expect(guild2Configs).toHaveLength(1);
    });

    it('updates an existing configuration', async () => {
      const created = await autoVoiceRepo.create({
        guildId: 'guild-1',
        parentChannelId: 'parent-1',
        userLimit: 2,
      });

      const updated = await autoVoiceRepo.update(created.id, {
        channelNameTemplate: '🎵 Chill with {user}',
        userLimit: 10,
      });

      expect(updated.channelNameTemplate).toBe('🎵 Chill with {user}');
      expect(updated.userLimit).toBe(10);
    });

    it('upserts a configuration: creates when new, updates when existing', async () => {
      const first = await autoVoiceRepo.upsert({
        guildId: 'guild-1',
        parentChannelId: 'parent-vc',
        channelNameTemplate: 'Room A',
        userLimit: 2,
      });
      expect(first.channelNameTemplate).toBe('Room A');

      const second = await autoVoiceRepo.upsert({
        guildId: 'guild-1',
        parentChannelId: 'parent-vc',
        channelNameTemplate: 'Room B',
        userLimit: 4,
      });
      expect(second.id).toBe(first.id);
      expect(second.channelNameTemplate).toBe('Room B');
      expect(second.userLimit).toBe(4);

      const all = await autoVoiceRepo.listByGuildId('guild-1');
      expect(all).toHaveLength(1);
    });

    it('deletes configuration by ID or parent channel ID', async () => {
      const c1 = await autoVoiceRepo.create({
        guildId: 'guild-1',
        parentChannelId: 'parent-vc-1',
      });
      const c2 = await autoVoiceRepo.create({
        guildId: 'guild-1',
        parentChannelId: 'parent-vc-2',
      });

      const deleted1 = await autoVoiceRepo.delete(c1.id);
      expect(deleted1).toBe(true);
      expect(await autoVoiceRepo.findById(c1.id)).toBeNull();

      const deleted2 = await autoVoiceRepo.deleteByParentChannelId('guild-1', 'parent-vc-2');
      expect(deleted2).toBe(true);
      expect(await autoVoiceRepo.findById(c2.id)).toBeNull();
    });

    it('correctly reports existence with exists()', async () => {
      const config = await autoVoiceRepo.create({
        guildId: 'guild-1',
        parentChannelId: 'parent-vc',
      });

      expect(await autoVoiceRepo.exists(config.id)).toBe(true);
      expect(await autoVoiceRepo.exists('nonexistent-id')).toBe(false);
    });
  });
});
