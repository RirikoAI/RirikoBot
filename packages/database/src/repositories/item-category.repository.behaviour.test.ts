import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { ItemCategoryRepository } from './item-category.repository.js';
import { ItemRepository } from './item.repository.js';

const MISSING_UUID = '00000000-0000-4000-8000-000000000001';

/** SQLite has no column default for the id, so every category gets one up front. */
const category = (fields: { code?: string; name: string; description?: string }) => ({
  id: randomUUID(),
  ...fields,
});

describeDialects('ItemCategoryRepository', (db) => {
  it('creates categories and lists them by name', async () => {
    const repo = new ItemCategoryRepository(db.client);
    expect(await repo.findAll()).toEqual([]);

    await repo.create(category({ code: 'weapons', name: 'Weapons' }));
    await repo.create(category({ code: 'armor', name: 'Armor', description: 'Things to wear' }));
    await repo.create(category({ name: 'Misc' }));

    const all = await repo.findAll();
    expect(all.map((c) => c.name)).toEqual(['Armor', 'Misc', 'Weapons']);
    expect(all[0]?.description).toBe('Things to wear');
    expect(all[1]?.code).toBeNull();
  });

  it('finds a category by id and by code', async () => {
    const repo = new ItemCategoryRepository(db.client);
    const created = await repo.create(category({ code: 'armor', name: 'Armor' }));

    expect((await repo.findById(created.id))?.code).toBe('armor');
    expect((await repo.findByCode('armor'))?.id).toBe(created.id);
    expect(await repo.findById(MISSING_UUID)).toBeNull();
    expect(await repo.findById('not-a-uuid')).toBeNull();
    expect(await repo.findByCode('nope')).toBeNull();
  });

  it('rejects a duplicate code', async () => {
    const repo = new ItemCategoryRepository(db.client);
    await repo.create(category({ code: 'armor', name: 'Armor' }));

    await expect(repo.create(category({ code: 'armor', name: 'Other' }))).rejects.toThrow();
  });

  it('updates a category and throws for a missing one', async () => {
    const repo = new ItemCategoryRepository(db.client);
    const created = await repo.create(category({ code: 'armor', name: 'Armor' }));

    const updated = await repo.update(created.id, { name: 'Heavy armor', description: 'Plate' });
    expect(updated.name).toBe('Heavy armor');
    expect(updated.description).toBe('Plate');
    expect(updated.code).toBe('armor');

    await expect(repo.update(MISSING_UUID, { name: 'x' })).rejects.toThrow(DatabaseError);
  });

  it('deletes a category once', async () => {
    const repo = new ItemCategoryRepository(db.client);
    const created = await repo.create(category({ code: 'armor', name: 'Armor' }));

    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.delete(created.id)).toBe(false);
    expect(await repo.findAll()).toEqual([]);
  });

  it('counts the items filed under a category', async () => {
    const repo = new ItemCategoryRepository(db.client);
    const items = new ItemRepository(db.client);
    const armor = await repo.create(category({ code: 'armor', name: 'Armor' }));
    const weapons = await repo.create(category({ code: 'weapons', name: 'Weapons' }));
    await items.create({
      id: randomUUID(),
      name: 'Helm',
      description: 'h',
      price: 10,
      categoryId: armor.id,
    });
    await items.create({
      id: randomUUID(),
      name: 'Plate',
      description: 'p',
      price: 20,
      categoryId: armor.id,
    });
    await items.create({
      id: randomUUID(),
      name: 'Sword',
      description: 's',
      price: 30,
      categoryId: weapons.id,
    });

    expect(await repo.countItems(armor.id)).toBe(2);
    expect(await repo.countItems(weapons.id)).toBe(1);
    expect(await repo.countItems(MISSING_UUID)).toBe(0);
  });
});
