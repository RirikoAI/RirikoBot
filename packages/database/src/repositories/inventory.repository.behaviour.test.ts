import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { InventoryRepository } from './inventory.repository.js';

/** The id is optional at runtime (generated when omitted), though the row type requires it. */
type NewSlot = Parameters<InventoryRepository['create']>[0];
const slot = (fields: Omit<NewSlot, 'id'>): NewSlot => ({ id: randomUUID(), ...fields });
import { ItemRepository } from './item.repository.js';

const MISSING_UUID = '00000000-0000-4000-8000-000000000001';
const T0 = new Date('2026-02-01T00:00:00Z');
const at = (hours: number) => new Date(T0.getTime() + hours * 3_600_000);

describeDialects('InventoryRepository behaviour', (db) => {
  async function newItem(name: string, price = 100): Promise<string> {
    const created = await new ItemRepository(db.client).create({
      id: randomUUID(),
      name,
      description: `About ${name}`,
      price,
    });
    return created.id;
  }

  it('creates a slot with defaults and reads it back', async () => {
    const repo = new InventoryRepository(db.client);
    const itemId = await newItem('Candy');
    expect(await repo.findById(MISSING_UUID)).toBeNull();
    expect(await repo.exists(MISSING_UUID)).toBe(false);
    expect(await repo.count()).toBe(0);

    const created = await repo.create(slot({ userId: 'u1', itemId }));
    expect(created.quantity).toBe(1);
    expect(created.acquiredAt).toBeInstanceOf(Date);

    expect((await repo.findById(created.id))?.itemId).toBe(itemId);
    expect(await repo.exists(created.id)).toBe(true);
    expect((await repo.getItemSlot('u1', itemId))?.id).toBe(created.id);
    expect(await repo.getItemSlot('u2', itemId)).toBeNull();
    expect(await repo.getItemQuantity('u1', itemId)).toBe(1);
    expect(await repo.getItemQuantity('u2', itemId)).toBe(0);
    expect(await repo.count()).toBe(1);
  });

  it('updates a slot and throws for a missing one', async () => {
    const repo = new InventoryRepository(db.client);
    const itemId = await newItem('Candy');
    const created = await repo.create(slot({ userId: 'u1', itemId }));

    expect((await repo.update(created.id, { quantity: 9 })).quantity).toBe(9);
    await expect(repo.update(MISSING_UUID, { quantity: 1 })).rejects.toThrow(DatabaseError);
  });

  it('deletes a slot once', async () => {
    const repo = new InventoryRepository(db.client);
    const itemId = await newItem('Candy');
    const created = await repo.create(slot({ userId: 'u1', itemId }));

    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.delete(created.id)).toBe(false);
    expect(await repo.count()).toBe(0);
  });

  it('lists a user inventory newest first, with item definitions where known', async () => {
    const repo = new InventoryRepository(db.client);
    const candy = await newItem('Candy', 100);
    const potion = await newItem('Potion', 250);
    const orphan = randomUUID();
    const first = await repo.create(slot({ userId: 'u1', itemId: candy, acquiredAt: at(1) }));
    const second = await repo.create(
      slot({
        userId: 'u1',
        itemId: potion,
        quantity: 2,
        acquiredAt: at(2),
      }),
    );
    const third = await repo.create(slot({ userId: 'u1', itemId: orphan, acquiredAt: at(3) }));
    await repo.create(slot({ userId: 'u2', itemId: candy, acquiredAt: at(4) }));

    expect((await repo.getUserInventory('u1')).map((s) => s.id)).toEqual([
      third.id,
      second.id,
      first.id,
    ]);
    expect(await repo.getUserInventory('nobody')).toEqual([]);

    const withItems = await repo.getUserInventoryWithItems('u1');
    expect(withItems.map((entry) => entry.inventory.id)).toEqual([third.id, second.id, first.id]);
    expect(withItems[0]?.item).toBeNull();
    expect(withItems[1]?.item?.name).toBe('Potion');
    expect(withItems[1]?.item?.price).toBe(250);
    expect(withItems[2]?.item?.name).toBe('Candy');
    expect(await repo.getUserInventoryWithItems('nobody')).toEqual([]);
  });

  it('counts holders of an item and of every item', async () => {
    const repo = new InventoryRepository(db.client);
    const candy = await newItem('Candy');
    const potion = await newItem('Potion');
    await repo.create(slot({ userId: 'u1', itemId: candy }));
    await repo.create(slot({ userId: 'u2', itemId: candy }));
    await repo.create(slot({ userId: 'u2', itemId: potion }));

    expect(await repo.countHolders(candy)).toBe(2);
    expect(await repo.countHolders(potion)).toBe(1);
    expect(await repo.countHolders(MISSING_UUID)).toBe(0);
    const counts = await repo.holderCountsByItem();
    expect(counts.get(candy)).toBe(2);
    expect(counts.get(potion)).toBe(1);
    expect(counts.size).toBe(2);
  });

  it('stacks added items in one slot and rejects a non-positive quantity', async () => {
    const repo = new InventoryRepository(db.client);
    const itemId = await newItem('Candy');

    const first = await repo.addItem('u1', itemId);
    expect(first.quantity).toBe(1);
    const second = await repo.addItem('u1', itemId, 4);
    expect(second.id).toBe(first.id);
    expect(second.quantity).toBe(5);
    expect(await repo.count()).toBe(1);

    await expect(repo.addItem('u1', itemId, 0)).rejects.toThrow(/greater than zero/);
    await expect(repo.addItem('u1', itemId, -2)).rejects.toThrow(/greater than zero/);
  });

  it('removes items, deleting the slot when it reaches zero', async () => {
    const repo = new InventoryRepository(db.client);
    const itemId = await newItem('Candy');
    await repo.addItem('u1', itemId, 5);

    const left = await repo.removeItem('u1', itemId, 2);
    expect(left?.quantity).toBe(3);

    expect(await repo.removeItem('u1', itemId, 3)).toBeNull();
    expect(await repo.getItemSlot('u1', itemId)).toBeNull();
    expect(await repo.count()).toBe(0);
  });

  it('refuses to remove more than is held, leaving the slot untouched', async () => {
    const repo = new InventoryRepository(db.client);
    const itemId = await newItem('Candy');
    await repo.addItem('u1', itemId, 2);

    await expect(repo.removeItem('u1', itemId, 3)).rejects.toThrow(/Insufficient item quantity/);
    await expect(repo.removeItem('u1', MISSING_UUID, 1)).rejects.toThrow(/have 0, needed 1/);
    await expect(repo.removeItem('u1', itemId, 0)).rejects.toThrow(/greater than zero/);
    expect(await repo.getItemQuantity('u1', itemId)).toBe(2);
  });
});
