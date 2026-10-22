import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { LevelRoleSettingsRepository } from './level-role-settings.repository.js';

describeDialects('LevelRoleSettingsRepository behaviour', (db) => {
  it('reads null for a server with no settings', async () => {
    const repo = new LevelRoleSettingsRepository(db.client);
    expect(await repo.get('g1')).toBeNull();
    expect(await repo.exists('g1')).toBe(false);
    expect(await repo.findById('g1')).toBeNull();
    expect(await repo.count()).toBe(0);
  });

  it('creates the row on first upsert, with the defaults for what was not given', async () => {
    const repo = new LevelRoleSettingsRepository(db.client);
    const created = await repo.upsert('g1', { rewards: [{ level: 5, roleId: 'regular' }] });
    expect(created).toMatchObject({
      guildId: 'g1',
      rewards: [{ level: 5, roleId: 'regular' }],
      keepPreviousRoles: true,
    });
    expect(created.updatedAt).toBeInstanceOf(Date);

    const defaults = await repo.upsert('g2', { keepPreviousRoles: false });
    expect(defaults).toMatchObject({ guildId: 'g2', rewards: [], keepPreviousRoles: false });
    expect(await repo.get('g1')).toMatchObject({ guildId: 'g1' });
    expect(await repo.get('g3')).toBeNull();
  });

  it('changes only the given fields and keeps the others', async () => {
    const repo = new LevelRoleSettingsRepository(db.client);
    await repo.upsert('g1', { rewards: [{ level: 5, roleId: 'regular' }] });

    const patched = await repo.upsert('g1', { keepPreviousRoles: false });
    expect(patched).toMatchObject({
      rewards: [{ level: 5, roleId: 'regular' }],
      keepPreviousRoles: false,
    });

    const rewardsOnly = await repo.upsert('g1', { rewards: [{ level: 20, roleId: 'veteran' }] });
    expect(rewardsOnly.rewards).toEqual([{ level: 20, roleId: 'veteran' }]);
    expect(rewardsOnly.keepPreviousRoles).toBe(false);
    expect(await repo.count()).toBe(1);
  });

  it('stores the reward list as a JSON array and replaces it whole', async () => {
    const repo = new LevelRoleSettingsRepository(db.client);
    const rewards = [
      { level: 5, roleId: 'a' },
      { level: 10, roleId: 'b' },
      { level: 20, roleId: 'c' },
    ];
    await repo.upsert('g1', { rewards });
    expect((await repo.get('g1'))?.rewards).toEqual(rewards);

    await repo.upsert('g1', { rewards: [{ level: 10, roleId: 'b' }] });
    expect((await repo.get('g1'))?.rewards).toEqual([{ level: 10, roleId: 'b' }]);

    await repo.upsert('g1', { rewards: [] });
    expect((await repo.get('g1'))?.rewards).toEqual([]);
  });

  it('keeps each server separate and moves the updated time forward', async () => {
    const repo = new LevelRoleSettingsRepository(db.client);
    const first = await repo.upsert('g1', { keepPreviousRoles: true });
    await repo.upsert('g2', { rewards: [{ level: 1, roleId: 'r2' }] });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await repo.upsert('g1', { keepPreviousRoles: false });

    expect((await repo.get('g2'))?.rewards).toEqual([{ level: 1, roleId: 'r2' }]);
    expect((await repo.get('g1'))?.rewards).toEqual([]);
    expect(second.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime());
  });

  it('supports the base repository contract: create, update, delete', async () => {
    const repo = new LevelRoleSettingsRepository(db.client);
    const created = await repo.create({ guildId: 'g1', keepPreviousRoles: false });
    expect(created).toMatchObject({ guildId: 'g1', keepPreviousRoles: false, rewards: [] });
    expect(await repo.exists('g1')).toBe(true);

    const updated = await repo.update('g1', { rewards: [{ level: 3, roleId: 'r' }] });
    expect(updated).toMatchObject({
      keepPreviousRoles: false,
      rewards: [{ level: 3, roleId: 'r' }],
    });
    await expect(repo.update('missing', { keepPreviousRoles: true })).rejects.toBeInstanceOf(
      DatabaseError,
    );

    expect(await repo.delete('g1')).toBe(true);
    expect(await repo.delete('g1')).toBe(false);
    expect(await repo.get('g1')).toBeNull();
  });
});
