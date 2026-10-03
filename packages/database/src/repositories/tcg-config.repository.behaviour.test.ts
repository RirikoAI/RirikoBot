import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { TcgConfigRepository } from './tcg-config.repository.js';

describeDialects('TcgConfigRepository behaviour', (db) => {
  it('stores scalar values wrapped, and objects as they are', async () => {
    const repo = new TcgConfigRepository(db.client);
    expect(await repo.getConfig('energy_cap')).toBeNull();
    expect(await repo.findById('energy_cap')).toBeNull();
    expect(await repo.exists('energy_cap')).toBe(false);
    expect(await repo.count()).toBe(0);

    const scalar = await repo.setConfig('energy_cap', 350, 'admin-1');
    expect(scalar.value).toEqual({ val: 350 });
    expect(scalar.updatedBy).toBe('admin-1');
    expect(scalar.updatedAt).toBeInstanceOf(Date);

    const object = await repo.setConfig('drop_table', { common: 70, rare: 30 }, 'admin-1');
    expect(object.value).toEqual({ common: 70, rare: 30 });

    expect(await repo.getConfig<number>('energy_cap')).toBe(350);
    expect(await repo.getConfig('drop_table')).toEqual({ common: 70, rare: 30 });
    expect(await repo.getConfig<string>('model')).toBeNull();
    expect(await repo.exists('energy_cap')).toBe(true);
    expect((await repo.findById('energy_cap'))?.updatedBy).toBe('admin-1');
    expect(await repo.count()).toBe(2);
  });

  it('overwrites a key and records who changed it last', async () => {
    const repo = new TcgConfigRepository(db.client);
    await repo.setConfig('energy_cap', 350, 'admin-1');

    const changed = await repo.setConfig('energy_cap', 400, 'admin-2');

    expect(changed.updatedBy).toBe('admin-2');
    expect(await repo.getConfig<number>('energy_cap')).toBe(400);
    expect(await repo.count()).toBe(1);
  });

  it('reads falsy scalar values back as stored', async () => {
    const repo = new TcgConfigRepository(db.client);
    await repo.setConfig('enabled', false, 'admin-1');
    await repo.setConfig('zero', 0, 'admin-1');
    await repo.setConfig('empty', '', 'admin-1');

    expect(await repo.getConfig<boolean>('enabled')).toBe(false);
    expect(await repo.getConfig<number>('zero')).toBe(0);
    expect(await repo.getConfig<string>('empty')).toBe('');
  });

  it('lists every config with scalars unwrapped', async () => {
    const repo = new TcgConfigRepository(db.client);
    expect(await repo.getAllConfigs()).toEqual({});

    await repo.setConfig('energy_cap', 350, 'admin-1');
    await repo.setConfig('model', 'EXPONENTIAL', 'admin-1');
    await repo.setConfig('drop_table', { common: 70 }, 'admin-1');

    expect(await repo.getAllConfigs()).toEqual({
      energy_cap: 350,
      model: 'EXPONENTIAL',
      drop_table: { common: 70 },
    });
  });

  it('creates and updates through the generic methods, requiring a value and an editor', async () => {
    const repo = new TcgConfigRepository(db.client);

    const created = await repo.create({
      key: 'drop_table',
      value: { common: 60 },
      updatedBy: 'admin-1',
    });
    expect(created.key).toBe('drop_table');

    const updated = await repo.update('drop_table', {
      value: { common: 50 },
      updatedBy: 'admin-2',
    });
    expect(updated.value).toEqual({ common: 50 });
    expect(updated.updatedBy).toBe('admin-2');

    await expect(repo.update('drop_table', { updatedBy: 'admin-3' })).rejects.toThrow(
      DatabaseError,
    );
    await expect(repo.update('drop_table', { value: { common: 1 } })).rejects.toThrow(
      /Value and updatedBy are required/,
    );
  });

  it('deletes a key once', async () => {
    const repo = new TcgConfigRepository(db.client);
    await repo.setConfig('energy_cap', 350, 'admin-1');

    expect(await repo.delete('energy_cap')).toBe(true);
    expect(await repo.delete('energy_cap')).toBe(false);
    expect(await repo.count()).toBe(0);
  });
});
