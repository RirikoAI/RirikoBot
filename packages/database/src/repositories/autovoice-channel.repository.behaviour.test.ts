import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { AutoVoiceChannelRepository } from './autovoice-channel.repository.js';

describeDialects('AutoVoiceChannelRepository', (db) => {
  it('records a temporary channel and reads it back', async () => {
    const repo = new AutoVoiceChannelRepository(db.client);
    expect(await repo.findById('c1')).toBeNull();
    expect(await repo.exists('c1')).toBe(false);
    expect(await repo.count()).toBe(0);

    const at = new Date('2026-04-01T12:00:00Z');
    const created = await repo.create({
      channelId: 'c1',
      guildId: 'g1',
      parentChannelId: 'p1',
      createdAt: at,
    });
    expect(created.channelId).toBe('c1');
    expect(created.parentChannelId).toBe('p1');
    expect(created.createdAt.getTime()).toBe(at.getTime());

    expect((await repo.findById('c1'))?.guildId).toBe('g1');
    expect(await repo.exists('c1')).toBe(true);
    expect(await repo.count()).toBe(1);
  });

  it('stamps the creation time when none is given', async () => {
    const repo = new AutoVoiceChannelRepository(db.client);
    const before = Date.now();

    const created = await repo.create({ channelId: 'c1', guildId: 'g1', parentChannelId: 'p1' });

    expect(created.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1);
  });

  it('rejects a second record for the same channel', async () => {
    const repo = new AutoVoiceChannelRepository(db.client);
    await repo.create({ channelId: 'c1', guildId: 'g1', parentChannelId: 'p1' });

    await expect(
      repo.create({ channelId: 'c1', guildId: 'g2', parentChannelId: 'p2' }),
    ).rejects.toThrow();
  });

  it('lists the channels of one guild', async () => {
    const repo = new AutoVoiceChannelRepository(db.client);
    await repo.create({ channelId: 'c1', guildId: 'g1', parentChannelId: 'p1' });
    await repo.create({ channelId: 'c2', guildId: 'g1', parentChannelId: 'p1' });
    await repo.create({ channelId: 'c3', guildId: 'g2', parentChannelId: 'p9' });

    expect((await repo.listByGuildId('g1')).map((c) => c.channelId).sort()).toEqual(['c1', 'c2']);
    expect(await repo.listByGuildId('g3')).toEqual([]);
  });

  it('updates a record and throws for an unknown channel', async () => {
    const repo = new AutoVoiceChannelRepository(db.client);
    await repo.create({ channelId: 'c1', guildId: 'g1', parentChannelId: 'p1' });

    const updated = await repo.update('c1', { parentChannelId: 'p2' });
    expect(updated.parentChannelId).toBe('p2');
    expect((await repo.findById('c1'))?.parentChannelId).toBe('p2');

    await expect(repo.update('ghost', { parentChannelId: 'p3' })).rejects.toThrow(DatabaseError);
  });

  it('deletes a record once', async () => {
    const repo = new AutoVoiceChannelRepository(db.client);
    await repo.create({ channelId: 'c1', guildId: 'g1', parentChannelId: 'p1' });

    expect(await repo.delete('c1')).toBe(true);
    expect(await repo.delete('c1')).toBe(false);
    expect(await repo.count()).toBe(0);
  });
});
