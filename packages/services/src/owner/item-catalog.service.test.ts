import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ValidationError } from '@ririko/core';
import {
  AuditLogRepository,
  createDatabaseClient,
  InventoryRepository,
  ItemCategoryRepository,
  ItemRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import {
  GuildConfigValidationError,
  type GuildConfigActor,
} from '../guild/guild-config.service.js';
import { ItemCatalogService } from './item-catalog.service.js';

const owner: GuildConfigActor = { userId: 'owner-1', source: 'dashboard' };

const potion = {
  code: 'Big_Potion ',
  name: 'Big Potion',
  description: 'Restores a lot of energy.',
  price: '500',
  rarity: 'RARE',
  categoryId: '',
  iconUrl: '',
  isPurchasable: true,
  dailyPurchaseLimit: '',
  itemType: 'ENERGY_RESTORE',
  energyRestored: '80',
  dailyUsageCeiling: '',
  xpAwarded: '999',
  creditsAwarded: '',
};

describe('ItemCatalogService (TASK-1652)', () => {
  let db: SqliteDatabaseClient;
  let items: ItemRepository;
  let inventories: InventoryRepository;
  let categories: ItemCategoryRepository;
  let service: ItemCatalogService;

  const audit = () =>
    db.raw.prepare('SELECT guild_id, action, details FROM audit_logs ORDER BY rowid').all() as {
      guild_id: string | null;
      action: string;
      details: string;
    }[];

  const fieldErrorsOf = async (promise: Promise<unknown>) => {
    const error = await promise.catch((err: unknown) => err);
    expect(error).toBeInstanceOf(GuildConfigValidationError);
    return (error as GuildConfigValidationError).fieldErrors;
  };

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    db = raw;
    items = new ItemRepository(db);
    inventories = new InventoryRepository(db);
    categories = new ItemCategoryRepository(db);
    service = new ItemCatalogService({
      db,
      items,
      categories,
      inventories,
      audit: new AuditLogRepository(db),
    });
  });

  afterEach(async () => {
    await db.close();
  });

  it('creates an item with a uuid, a normalized code and only its effect amounts', async () => {
    const item = await service.createItem(potion, owner);
    expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(item).toMatchObject({ code: 'big_potion', price: 500, rarity: 'RARE' });
    expect(item.metadata).toEqual({
      itemType: 'ENERGY_RESTORE',
      energyRestored: 80,
      dailyUsageCeiling: 3,
    });
    expect(audit()).toEqual([
      expect.objectContaining({ guild_id: null, action: 'owner.shop_item.create' }),
    ]);
  });

  it('reports field errors: missing effect amount, taken code, unknown category', async () => {
    expect(
      await fieldErrorsOf(service.createItem({ ...potion, energyRestored: '' }, owner)),
    ).toEqual({ energyRestored: ['This effect needs an amount.'] });

    await service.createItem(potion, owner);
    const errors = await fieldErrorsOf(
      service.createItem({ ...potion, categoryId: 'missing' }, owner),
    );
    expect(errors).toEqual({
      code: ['Another item uses this code.'],
      categoryId: ['This category no longer exists.'],
    });
  });

  it('updates an item, keeps its code and unknown metadata, and skips unchanged saves', async () => {
    const created = await service.createItem(potion, owner);
    await items.update(created.id, {
      metadata: { ...created.metadata, seasonTag: 'summer' },
    });

    const { item, changed } = await service.updateItem(
      created.id,
      { ...potion, code: 'renamed', price: '750', itemType: 'CREDITS_GRANT', creditsAwarded: '40' },
      owner,
    );
    expect(changed).toBe(true);
    expect(item.code).toBe('big_potion');
    expect(item.price).toBe(750);
    expect(item.metadata).toEqual({
      seasonTag: 'summer',
      itemType: 'CREDITS_GRANT',
      creditsAwarded: 40,
    });

    const again = await service.updateItem(
      created.id,
      { ...potion, price: '750', itemType: 'CREDITS_GRANT', creditsAwarded: '40' },
      owner,
    );
    expect(again.changed).toBe(false);
    expect(audit().map((row) => row.action)).toEqual([
      'owner.shop_item.create',
      'owner.shop_item.update',
    ]);
  });

  it('retires and restores an item', async () => {
    const created = await service.createItem(potion, owner);
    expect((await service.setPurchasable(created.id, false, owner)).isPurchasable).toBe(false);
    expect((await service.setPurchasable(created.id, false, owner)).isPurchasable).toBe(false);
    expect((await service.setPurchasable(created.id, true, owner)).isPurchasable).toBe(true);
    expect(audit().map((row) => row.action)).toEqual([
      'owner.shop_item.create',
      'owner.shop_item.retire',
      'owner.shop_item.restore',
    ]);
  });

  it('deletes only retired items that nobody holds', async () => {
    const created = await service.createItem(potion, owner);
    await expect(service.deleteItem(created.id, owner)).rejects.toThrow(
      'Retire the item first, then delete it.',
    );

    await service.setPurchasable(created.id, false, owner);
    await inventories.addItem('member-1', created.id, 2);
    await expect(service.deleteItem(created.id, owner)).rejects.toThrow(
      '1 member holds this item, so it can only be retired.',
    );

    await inventories.removeItem('member-1', created.id, 2);
    await service.deleteItem(created.id, owner);
    expect(await items.findById(created.id)).toBeNull();
    expect(audit().at(-1)).toMatchObject({ action: 'owner.shop_item.delete' });
  });

  it('never deletes items from the default catalog', async () => {
    const seeded = await service.createItem(
      { ...potion, code: 'candy_minor', isPurchasable: false },
      owner,
    );
    const error = await service.deleteItem(seeded.id, owner).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as Error).message).toContain('retire them instead');
  });

  it('lists items with holders, categories and seeded flags', async () => {
    const category = await service.createCategory({ code: 'potions', name: 'Potions' }, owner);
    const created = await service.createItem({ ...potion, categoryId: category.id }, owner);
    await inventories.addItem('member-1', created.id, 1);
    await inventories.addItem('member-2', created.id, 4);

    expect(await service.listItems()).toEqual([
      expect.objectContaining({ categoryName: 'Potions', holders: 2, seeded: false }),
    ]);
    expect(await service.getItem(created.id)).toMatchObject({ holders: 2 });
    expect(await service.getItem('missing')).toBeNull();
    expect(await service.listCategories()).toEqual([
      expect.objectContaining({ items: 1, seeded: false }),
    ]);
  });

  it('manages categories: unique names, fixed codes, delete only when empty', async () => {
    const category = await service.createCategory(
      { code: 'potions', name: 'Potions', description: '' },
      owner,
    );
    expect(category.description).toBeNull();
    expect(
      await fieldErrorsOf(service.createCategory({ code: 'potions', name: 'POTIONS' }, owner)),
    ).toEqual({
      code: ['Another category uses this code.'],
      name: ['Another category has this name.'],
    });

    const { category: renamed } = await service.updateCategory(
      category.id,
      { code: 'other', name: 'Brews' },
      owner,
    );
    expect(renamed).toMatchObject({ code: 'potions', name: 'Brews' });

    const item = await service.createItem({ ...potion, categoryId: category.id }, owner);
    await expect(service.deleteCategory(category.id, owner)).rejects.toThrow(
      '1 item is still in this category. Move them first.',
    );
    await service.updateItem(item.id, { ...potion, categoryId: '' }, owner);
    await service.deleteCategory(category.id, owner);
    expect(await categories.findById(category.id)).toBeNull();
    expect(audit().map((row) => row.action)).toContain('owner.shop_category.delete');
  });
});
