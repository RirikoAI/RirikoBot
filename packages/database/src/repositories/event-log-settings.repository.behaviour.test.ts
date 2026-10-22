import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { EventLogSettingsRepository } from './event-log-settings.repository.js';

describeDialects('EventLogSettingsRepository behaviour', (db) => {
  it('reads null for a server with no settings', async () => {
    const repo = new EventLogSettingsRepository(db.client);
    expect(await repo.get('g1')).toBeNull();
    expect(await repo.exists('g1')).toBe(false);
    expect(await repo.findById('g1')).toBeNull();
    expect(await repo.count()).toBe(0);
  });

  it('creates the row on first upsert, with the defaults for what was not given', async () => {
    const repo = new EventLogSettingsRepository(db.client);
    const created = await repo.upsert('g1', { messageChannelId: 'logs-msg' });
    expect(created).toMatchObject({
      guildId: 'g1',
      messageChannelId: 'logs-msg',
      memberChannelId: null,
      serverChannelId: null,
      voiceChannelId: null,
      ignoredChannelIds: [],
      ignoreBots: true,
    });
    expect(created.updatedAt).toBeInstanceOf(Date);
    expect(await repo.get('g1')).toMatchObject({ guildId: 'g1', messageChannelId: 'logs-msg' });
    expect(await repo.get('g2')).toBeNull();
  });

  it('changes only the given fields and keeps the others', async () => {
    const repo = new EventLogSettingsRepository(db.client);
    await repo.upsert('g1', {
      messageChannelId: 'm',
      memberChannelId: 'mem',
      voiceChannelId: 'v',
      ignoredChannelIds: ['staff'],
    });

    const patched = await repo.upsert('g1', { serverChannelId: 's', ignoreBots: false });
    expect(patched).toMatchObject({
      messageChannelId: 'm',
      memberChannelId: 'mem',
      serverChannelId: 's',
      voiceChannelId: 'v',
      ignoredChannelIds: ['staff'],
      ignoreBots: false,
    });

    const cleared = await repo.upsert('g1', { memberChannelId: null });
    expect(cleared.memberChannelId).toBeNull();
    expect(cleared.messageChannelId).toBe('m');
    expect(cleared.ignoreBots).toBe(false);
    expect(await repo.count()).toBe(1);
  });

  it('stores the ignored channel list as a JSON array and replaces it whole', async () => {
    const repo = new EventLogSettingsRepository(db.client);
    await repo.upsert('g1', { ignoredChannelIds: ['a', 'b', 'c'] });
    expect((await repo.get('g1'))?.ignoredChannelIds).toEqual(['a', 'b', 'c']);

    await repo.upsert('g1', { ignoredChannelIds: ['b'] });
    expect((await repo.get('g1'))?.ignoredChannelIds).toEqual(['b']);

    await repo.upsert('g1', { ignoredChannelIds: [] });
    expect((await repo.get('g1'))?.ignoredChannelIds).toEqual([]);
  });

  it('keeps each server separate and moves the updated time forward', async () => {
    const repo = new EventLogSettingsRepository(db.client);
    const first = await repo.upsert('g1', { voiceChannelId: 'v1' });
    await repo.upsert('g2', { voiceChannelId: 'v2' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await repo.upsert('g1', { ignoreBots: false });

    expect((await repo.get('g2'))?.voiceChannelId).toBe('v2');
    expect(second.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime());
  });

  it('supports the base repository contract: create, update, delete', async () => {
    const repo = new EventLogSettingsRepository(db.client);
    const created = await repo.create({ guildId: 'g1', serverChannelId: 's' });
    expect(created).toMatchObject({ guildId: 'g1', serverChannelId: 's', ignoreBots: true });
    expect(await repo.exists('g1')).toBe(true);

    const updated = await repo.update('g1', { voiceChannelId: 'v' });
    expect(updated).toMatchObject({ serverChannelId: 's', voiceChannelId: 'v' });
    await expect(repo.update('missing', { voiceChannelId: 'v' })).rejects.toBeInstanceOf(
      DatabaseError,
    );

    expect(await repo.delete('g1')).toBe(true);
    expect(await repo.delete('g1')).toBe(false);
    expect(await repo.get('g1')).toBeNull();
  });
});
