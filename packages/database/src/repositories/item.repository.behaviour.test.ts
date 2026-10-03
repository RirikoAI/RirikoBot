import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { ItemCategoryRepository } from './item-category.repository.js';
import {
  DEFAULT_ITEM_CATEGORY_CODES,
  DEFAULT_SHOP_ITEM_CODES,
  ItemRepository,
} from './item.repository.js';

const MISSING_UUID = '00000000-0000-4000-8000-000000000001';

const item = (name: string, price: number, overrides: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  name,
  description: `About ${name}`,
  price,
  ...overrides,
});

describeDialects('ItemRepository behaviour', (db) => {
  it('creates an item with defaults and reads it back by id and code', async () => {
    const repo = new ItemRepository(db.client);
    const created = await repo.create(item('Candy', 100, { code: 'candy' }));

    expect(created.price).toBe(100);
    expect(created.rarity).toBe('COMMON');
    expect(created.isPurchasable).toBe(true);
    expect(created.categoryId).toBeNull();

    expect((await repo.findById(created.id))?.name).toBe('Candy');
    expect((await repo.findByCode('candy'))?.id).toBe(created.id);
    expect(await repo.exists(created.id)).toBe(true);
    expect(await repo.exists(MISSING_UUID)).toBe(false);
    expect(await repo.findById(MISSING_UUID)).toBeNull();
    expect(await repo.findById('not-a-uuid')).toBeNull();
    expect(await repo.findByCode('nope')).toBeNull();
    expect(await repo.count()).toBe(1);
  });

  it('lists items cheapest first and filters by category and purchasability', async () => {
    const repo = new ItemRepository(db.client);
    const categories = new ItemCategoryRepository(db.client);
    const food = await categories.create({ id: randomUUID(), code: 'food', name: 'Food' });
    await repo.create(item('Steak', 300, { categoryId: food.id }));
    await repo.create(item('Candy', 100, { categoryId: food.id }));
    await repo.create(item('Relic', 900, { isPurchasable: false }));
    await repo.create(item('Hat', 200));

    const names = async (options?: Parameters<ItemRepository['findAll']>[0]) =>
      (await repo.findAll(options)).map((i) => i.name);

    expect(await names()).toEqual(['Candy', 'Hat', 'Steak', 'Relic']);
    expect(await names({ categoryId: food.id })).toEqual(['Candy', 'Steak']);
    expect(await names({ isPurchasable: false })).toEqual(['Relic']);
    expect(await names({ categoryId: food.id, isPurchasable: true })).toEqual(['Candy', 'Steak']);
    expect((await repo.findPurchasable()).map((i) => i.name)).toEqual(['Candy', 'Hat', 'Steak']);
  });

  it('updates an item and throws for a missing one', async () => {
    const repo = new ItemRepository(db.client);
    const created = await repo.create(item('Candy', 100));

    const updated = await repo.update(created.id, { price: 150, rarity: 'RARE' });
    expect(updated.price).toBe(150);
    expect(updated.rarity).toBe('RARE');
    expect((await repo.update(created.id, { name: 'Sweet candy' })).price).toBe(150);

    await expect(repo.update(MISSING_UUID, { price: 1 })).rejects.toThrow(DatabaseError);
  });

  it('deletes an item once', async () => {
    const repo = new ItemRepository(db.client);
    const created = await repo.create(item('Candy', 100));

    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.delete(created.id)).toBe(false);
    expect(await repo.count()).toBe(0);
  });

  it('rejects a duplicate item code', async () => {
    const repo = new ItemRepository(db.client);
    await repo.create(item('Candy', 100, { code: 'candy' }));

    await expect(repo.create(item('Other', 5, { code: 'candy' }))).rejects.toThrow();
  });

  it('seeds the default catalog once and never touches existing rows', async () => {
    const repo = new ItemRepository(db.client);
    const categories = new ItemCategoryRepository(db.client);

    expect(await repo.seedDefaultCatalog()).toBe(DEFAULT_SHOP_ITEM_CODES.length);
    expect(await repo.count()).toBe(DEFAULT_SHOP_ITEM_CODES.length);
    expect((await categories.findAll()).map((c) => c.code).sort()).toEqual(
      [...DEFAULT_ITEM_CATEGORY_CODES].sort(),
    );
    for (const code of DEFAULT_SHOP_ITEM_CODES) expect(await repo.findByCode(code)).not.toBeNull();

    const candy = (await repo.findByCode('candy_minor'))!;
    const consumable = (await categories.findByCode('consumable'))!;
    expect(candy.categoryId).toBe(consumable.id);
    await repo.update(candy.id, { price: 7 });

    expect(await repo.seedDefaultCatalog()).toBe(0);
    expect((await repo.findByCode('candy_minor'))?.price).toBe(7);
    expect(await repo.count()).toBe(DEFAULT_SHOP_ITEM_CODES.length);
  });

  it('only adds the default items that are missing', async () => {
    const repo = new ItemRepository(db.client);
    await repo.seedDefaultCatalog();
    const stamina = (await repo.findByCode('stamina_potion'))!;
    await repo.delete(stamina.id);

    expect(await repo.seedDefaultCatalog()).toBe(1);
    expect(await repo.findByCode('stamina_potion')).not.toBeNull();
  });

  it('files legacy items, stored with their code as the id, under their code and category', async (ctx) => {
    if (db.dialect !== 'sqlite') return ctx.skip();
    const repo = new ItemRepository(db.client);
    await repo.create(
      item('Minor Energy Candy', 100, { id: 'candy_minor', categoryId: 'consumable' }),
    );

    const inserted = await repo.seedDefaultCatalog();

    expect(inserted).toBe(DEFAULT_SHOP_ITEM_CODES.length - 1);
    const legacy = (await repo.findById('candy_minor'))!;
    const consumable = (await new ItemCategoryRepository(db.client).findByCode('consumable'))!;
    expect(legacy.code).toBe('candy_minor');
    expect(legacy.categoryId).toBe(consumable.id);
    expect(await repo.count()).toBe(DEFAULT_SHOP_ITEM_CODES.length);
  });
});
