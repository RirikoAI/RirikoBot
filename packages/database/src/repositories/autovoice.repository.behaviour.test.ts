import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { AutoVoiceRepository } from './autovoice.repository.js';

const MISSING_UUID = '00000000-0000-4000-8000-000000000001';

const config = (
  guildId: string,
  parentChannelId: string,
  overrides: Record<string, unknown> = {},
) => ({
  guildId,
  parentChannelId,
  ...overrides,
});

describeDialects('AutoVoiceRepository behaviour', (db) => {
  it('creates a config with defaults and reads it back', async () => {
    const repo = new AutoVoiceRepository(db.client);
    expect(await repo.findById(MISSING_UUID)).toBeNull();
    expect(await repo.exists(MISSING_UUID)).toBe(false);
    expect(await repo.count()).toBe(0);

    const created = await repo.create(config('g1', 'p1'));
    expect(created.channelNameTemplate).toBe("{user}'s Room");
    expect(created.userLimit).toBe(0);
    expect(created.bitrate).toBe(64000);

    expect((await repo.findById(created.id))?.parentChannelId).toBe('p1');
    expect(await repo.exists(created.id)).toBe(true);
    expect((await repo.findByParentChannelId('g1', 'p1'))?.id).toBe(created.id);
    expect(await repo.findByParentChannelId('g1', 'p2')).toBeNull();
    expect(await repo.findByParentChannelId('g2', 'p1')).toBeNull();
    expect(await repo.count()).toBe(1);
  });

  it('keeps explicit values and ids', async () => {
    const repo = new AutoVoiceRepository(db.client);
    const id = randomUUID();

    const created = await repo.create(
      config('g1', 'p1', {
        id,
        channelNameTemplate: '{user} lounge',
        userLimit: 5,
        bitrate: 96000,
      }),
    );

    expect(created.id).toBe(id);
    expect(created.channelNameTemplate).toBe('{user} lounge');
    expect(created.userLimit).toBe(5);
    expect(created.bitrate).toBe(96000);
  });

  it('lists the configs of one guild', async () => {
    const repo = new AutoVoiceRepository(db.client);
    await repo.create(config('g1', 'p1'));
    await repo.create(config('g1', 'p2'));
    await repo.create(config('g2', 'p3'));

    expect((await repo.listByGuildId('g1')).map((c) => c.parentChannelId).sort()).toEqual([
      'p1',
      'p2',
    ]);
    expect(await repo.listByGuildId('g9')).toEqual([]);
  });

  it('updates a config and throws for a missing one', async () => {
    const repo = new AutoVoiceRepository(db.client);
    const created = await repo.create(config('g1', 'p1'));

    const updated = await repo.update(created.id, { userLimit: 8, bitrate: 128000 });
    expect(updated.userLimit).toBe(8);
    expect(updated.bitrate).toBe(128000);
    expect(updated.channelNameTemplate).toBe("{user}'s Room");

    await expect(repo.update(MISSING_UUID, { userLimit: 1 })).rejects.toThrow(DatabaseError);
  });

  it('upserts by parent channel, updating the settings of an existing config', async () => {
    const repo = new AutoVoiceRepository(db.client);

    const first = await repo.upsert(config('g1', 'p1', { userLimit: 2 }));
    expect(first.userLimit).toBe(2);

    const second = await repo.upsert(
      config('g1', 'p1', { channelNameTemplate: 'Room {n}', userLimit: 6, bitrate: 80000 }),
    );
    expect(second.id).toBe(first.id);
    expect(second.channelNameTemplate).toBe('Room {n}');
    expect(second.userLimit).toBe(6);
    expect(second.bitrate).toBe(80000);
    expect(await repo.count()).toBe(1);
  });

  it('deletes a config by id or by parent channel, once', async () => {
    const repo = new AutoVoiceRepository(db.client);
    const byId = await repo.create(config('g1', 'p1'));
    await repo.create(config('g1', 'p2'));

    expect(await repo.delete(byId.id)).toBe(true);
    expect(await repo.delete(byId.id)).toBe(false);
    expect(await repo.deleteByParentChannelId('g1', 'p2')).toBe(true);
    expect(await repo.deleteByParentChannelId('g1', 'p2')).toBe(false);
    expect(await repo.count()).toBe(0);
  });
});
