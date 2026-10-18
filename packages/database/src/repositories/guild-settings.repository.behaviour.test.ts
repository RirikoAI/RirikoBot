import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { GuildSettingsRepository } from './guild-settings.repository.js';

describeDialects('GuildSettingsRepository behaviour', (db) => {
  it('creates settings with defaults and reads them back', async () => {
    const repo = new GuildSettingsRepository(db.client);
    expect(await repo.findById('g1')).toBeNull();
    expect(await repo.getByGuildId('g1')).toBeNull();
    expect(await repo.exists('g1')).toBe(false);
    expect(await repo.count()).toBe(0);

    const created = await repo.create({ guildId: 'g1' });
    expect(created.prefix).toBe('!');
    expect(created.locale).toBe('en-US');
    expect(created.timezone).toBe('UTC');

    expect((await repo.findById('g1'))?.guildId).toBe('g1');
    expect((await repo.getByGuildId('g1'))?.prefix).toBe('!');
    expect(await repo.exists('g1')).toBe(true);
    expect(await repo.count()).toBe(1);
    await expect(repo.create({ guildId: 'g1' })).rejects.toThrow();
  });

  it('updates settings, stamping the change, and throws for a missing guild', async () => {
    const repo = new GuildSettingsRepository(db.client);
    const created = await repo.create({ guildId: 'g1' });

    const updated = await repo.update('g1', { prefix: '?', locale: 'ja' });
    expect(updated.prefix).toBe('?');
    expect(updated.locale).toBe('ja');
    expect(updated.timezone).toBe('UTC');
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());

    await expect(repo.update('ghost', { prefix: '?' })).rejects.toThrow(DatabaseError);
  });

  it('upserts settings, creating the row first and updating it after', async () => {
    const repo = new GuildSettingsRepository(db.client);

    const first = await repo.upsert({ guildId: 'g1', prefix: '$' });
    expect(first.prefix).toBe('$');

    const second = await repo.upsert({ guildId: 'g1', prefix: '%', timezone: 'Asia/Tokyo' });
    expect(second.prefix).toBe('%');
    expect(second.timezone).toBe('Asia/Tokyo');
    expect(await repo.count()).toBe(1);
  });

  it('changes the prefix through setPrefix', async () => {
    const repo = new GuildSettingsRepository(db.client);
    await repo.create({ guildId: 'g1', locale: 'ja' });

    const changed = await repo.setPrefix('g1', '~');

    expect(changed.prefix).toBe('~');
    expect(changed.locale).toBe('ja');
    expect((await repo.setPrefix('g2', '.')).prefix).toBe('.');
  });

  it('gets or creates settings with the given defaults', async () => {
    const repo = new GuildSettingsRepository(db.client);

    const plain = await repo.getOrCreate('g1');
    expect(plain.prefix).toBe('!');
    expect(plain.locale).toBe('en-US');

    const custom = await repo.getOrCreate('g2', { prefix: '>', timezone: 'Europe/Paris' });
    expect(custom.prefix).toBe('>');
    expect(custom.timezone).toBe('Europe/Paris');

    const again = await repo.getOrCreate('g2', { prefix: 'ignored' });
    expect(again.prefix).toBe('>');
    expect(await repo.count()).toBe(2);
  });

  it('deletes settings once', async () => {
    const repo = new GuildSettingsRepository(db.client);
    await repo.create({ guildId: 'g1' });

    expect(await repo.delete('g1')).toBe(true);
    expect(await repo.delete('g1')).toBe(false);
    expect(await repo.count()).toBe(0);
  });
});
