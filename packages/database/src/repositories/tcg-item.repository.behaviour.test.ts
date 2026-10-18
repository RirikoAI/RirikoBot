import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { GameItemRepository, UserInventoryItemRepository } from './tcg-item.repository.js';

const MISSING_UUID = '00000000-0000-4000-8000-000000000001';
// Deterministic ids: Postgres stores these in uuid columns.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const item = (code: string, overrides: Record<string, unknown> = {}) => ({
  code,
  name: `Item ${code}`,
  description: `Description of ${code}`,
  type: 'EQUIPMENT',
  subtype: 'WEAPON',
  ...overrides,
});

describeDialects('GameItemRepository', (db) => {
  it('creates an item with defaults and reads it back by id and code', async () => {
    const repo = new GameItemRepository(db.client);
    const created = await repo.create(item('BLADE'));

    expect(created.rarity).toBe('COMMON');
    expect(created.shopPrice).toBe(100);
    expect(created.maxDailyPurchases).toBe(5);
    expect(created.isShopBuyable).toBe(true);
    expect(created.isTradeable).toBe(true);
    expect(created.ownerOverridden).toBe(false);
    expect(created.baseStats).toEqual({});
    expect(created.battlePerks).toEqual([]);

    expect((await repo.findById(created.id))?.code).toBe('BLADE');
    expect((await repo.findByCode('BLADE'))?.id).toBe(created.id);
    expect(await repo.exists(created.id)).toBe(true);
  });

  it('keeps explicit values and an explicit id', async () => {
    const repo = new GameItemRepository(db.client);
    const explicit = randomUUID();
    const created = await repo.create(
      item('RELIC', {
        id: explicit,
        rarity: 'SECRET_RARE',
        baseStats: { attack: 25 },
        battlePerks: ['LIFESTEAL'],
        consumableEffect: { heal: 10 },
        isShopBuyable: false,
        shopPrice: 900,
        maxDailyPurchases: 1,
        isTradeable: false,
        ownerOverridden: true,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      }),
    );

    expect(created.id).toBe(explicit);
    expect(created.rarity).toBe('SECRET_RARE');
    expect(created.baseStats).toEqual({ attack: 25 });
    expect(created.battlePerks).toEqual(['LIFESTEAL']);
    expect(created.shopPrice).toBe(900);
    expect(created.isShopBuyable).toBe(false);
    expect(created.isTradeable).toBe(false);
    expect(created.ownerOverridden).toBe(true);
    expect(created.createdAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('returns null for unknown ids and codes', async () => {
    const repo = new GameItemRepository(db.client);
    expect(await repo.findById(MISSING_UUID)).toBeNull();
    expect(await repo.findByCode('NOPE')).toBeNull();
    expect(await repo.exists(MISSING_UUID)).toBe(false);
  });

  it('filters by type, subtype, rarity and shop flag, combined', async () => {
    const repo = new GameItemRepository(db.client);
    await repo.create(item('SWORD', { subtype: 'WEAPON', rarity: 'RARE', isShopBuyable: true }));
    await repo.create(item('AXE', { subtype: 'WEAPON', rarity: 'COMMON', isShopBuyable: false }));
    await repo.create(item('HELM', { subtype: 'ARMOR', rarity: 'RARE', isShopBuyable: true }));
    await repo.create(item('POTION', { type: 'CONSUMABLE', subtype: 'HP_POTION' }));

    const codes = async (options?: Parameters<GameItemRepository['findAll']>[0]) =>
      (await repo.findAll(options)).map((i) => i.code).sort();

    expect(await codes()).toEqual(['AXE', 'HELM', 'POTION', 'SWORD']);
    expect(await codes({ type: 'CONSUMABLE' })).toEqual(['POTION']);
    expect(await codes({ subtype: 'WEAPON' })).toEqual(['AXE', 'SWORD']);
    expect(await codes({ rarity: 'RARE' })).toEqual(['HELM', 'SWORD']);
    expect(await codes({ isShopBuyable: false })).toEqual(['AXE']);
    expect(await codes({ type: 'EQUIPMENT', subtype: 'WEAPON', rarity: 'RARE' })).toEqual([
      'SWORD',
    ]);
    expect(await codes({ rarity: 'MYTHIC' })).toEqual([]);
    expect(await repo.count()).toBe(4);
  });

  it('updates fields, coerces the shop price and rejects unknown ids', async () => {
    const repo = new GameItemRepository(db.client);
    const created = await repo.create(item('BLADE'));

    const updated = await repo.update(created.id, { name: 'Renamed', shopPrice: 250 });
    expect(updated.name).toBe('Renamed');
    expect(updated.shopPrice).toBe(250);
    expect((await repo.findById(created.id))?.shopPrice).toBe(250);

    const untouched = await repo.update(created.id, { description: 'New text' });
    expect(untouched.shopPrice).toBe(250);

    await expect(repo.update(MISSING_UUID, { name: 'x' })).rejects.toThrow(DatabaseError);
  });

  it('wraps constraint failures in a DatabaseError', async () => {
    const repo = new GameItemRepository(db.client);
    await repo.create(item('DUP'));

    await expect(repo.create(item('DUP'))).rejects.toThrow(/Failed to create GameItem/);

    const other = await repo.create(item('OTHER'));
    await expect(repo.update(other.id, { code: 'DUP' })).rejects.toThrow(
      /Failed to update GameItem/,
    );
  });

  it('deletes an item once', async () => {
    const repo = new GameItemRepository(db.client);
    const created = await repo.create(item('BLADE'));

    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.delete(created.id)).toBe(false);
    expect(await repo.count()).toBe(0);
  });
});

describeDialects('UserInventoryItemRepository', (db) => {
  const stack = (userId: string, itemId: string, overrides: Record<string, unknown> = {}) => ({
    userId,
    itemId,
    ...overrides,
  });

  it('creates a row with defaults and reads it back', async () => {
    const repo = new UserInventoryItemRepository(db.client);
    const created = await repo.create(stack('u1', id(1)));

    expect(created.quantity).toBe(1);
    expect(created.enhancementLevel).toBe(0);
    expect(created.equippedToCardId).toBeNull();
    expect(created.slot).toBe('NONE');
    expect(created.state).toBe('IDLE');
    expect(created.obtainedFrom).toBe('SHOP');

    expect((await repo.findById(created.id))?.userId).toBe('u1');
    expect(await repo.exists(created.id)).toBe(true);
    expect(await repo.findById(MISSING_UUID)).toBeNull();
    expect(await repo.exists(MISSING_UUID)).toBe(false);
    expect(await repo.count()).toBe(1);
  });

  it('keeps explicit values', async () => {
    const repo = new UserInventoryItemRepository(db.client);
    const at = new Date('2026-02-02T00:00:00Z');
    const created = await repo.create(
      stack('u1', id(1), {
        id: randomUUID(),
        quantity: 3,
        enhancementLevel: 4,
        equippedToCardId: id(9),
        slot: 'WEAPON',
        state: 'EQUIPPED',
        obtainedFrom: 'DROP',
        createdAt: at,
        updatedAt: at,
      }),
    );

    expect(created.quantity).toBe(3);
    expect(created.enhancementLevel).toBe(4);
    expect(created.equippedToCardId).toBe(id(9));
    expect(created.slot).toBe('WEAPON');
    expect(created.state).toBe('EQUIPPED');
    expect(created.obtainedFrom).toBe('DROP');
    expect(created.createdAt.getTime()).toBe(at.getTime());
  });

  it('lists a user rows newest first and filters by slot, state and card', async () => {
    const repo = new UserInventoryItemRepository(db.client);
    const t = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 0, minutes));
    const a = await repo.create(stack('u1', id(1), { createdAt: t(1) }));
    const b = await repo.create(
      stack('u1', id(2), {
        slot: 'WEAPON',
        state: 'EQUIPPED',
        equippedToCardId: id(9),
        createdAt: t(2),
      }),
    );
    const c = await repo.create(stack('u1', id(3), { slot: 'ARMOR', createdAt: t(3) }));
    await repo.create(stack('u2', id(1), { createdAt: t(4) }));

    expect((await repo.findByUser('u1')).map((r) => r.id)).toEqual([c.id, b.id, a.id]);
    expect((await repo.findByUser('u1', { slot: 'WEAPON' })).map((r) => r.id)).toEqual([b.id]);
    expect((await repo.findByUser('u1', { state: 'EQUIPPED' })).map((r) => r.id)).toEqual([b.id]);
    expect((await repo.findByUser('u1', { equippedToCardId: id(9) })).map((r) => r.id)).toEqual([
      b.id,
    ]);
    expect((await repo.findByUser('u1', { equippedToCardId: null })).map((r) => r.id)).toEqual([
      c.id,
      a.id,
    ]);
    expect(await repo.findByUser('nobody')).toEqual([]);
  });

  it('finds the equipped pieces of a card and its occupant of a slot', async () => {
    const repo = new UserInventoryItemRepository(db.client);
    const weapon = await repo.create(
      stack('u1', id(1), { slot: 'WEAPON', state: 'EQUIPPED', equippedToCardId: id(9) }),
    );
    await repo.create(
      stack('u1', id(2), { slot: 'ARMOR', state: 'IDLE', equippedToCardId: id(9) }),
    );

    expect((await repo.findEquippedByCard(id(9))).map((r) => r.id)).toEqual([weapon.id]);
    expect(await repo.findEquippedByCard(id(8))).toEqual([]);
    expect((await repo.findCardSlot(id(9), 'WEAPON'))?.id).toBe(weapon.id);
    expect(await repo.findCardSlot(id(9), 'ARMOR')).toBeNull();
  });

  it('wraps a duplicate id or a null column in a DatabaseError', async () => {
    const repo = new UserInventoryItemRepository(db.client);
    const created = await repo.create(stack('u1', id(1)));

    await expect(repo.create(stack('u2', id(2), { id: created.id }))).rejects.toThrow(
      /Failed to create UserInventoryItem/,
    );
    await expect(repo.update(created.id, { itemId: null as never })).rejects.toThrow(
      /Failed to update UserInventoryItem/,
    );
    expect((await repo.findById(created.id))?.itemId).toBe(id(1));
  });

  it('updates a row and rejects unknown ids', async () => {
    const repo = new UserInventoryItemRepository(db.client);
    const created = await repo.create(stack('u1', id(1)));

    const updated = await repo.update(created.id, { quantity: 5, enhancementLevel: 2 });
    expect(updated.quantity).toBe(5);
    expect(updated.enhancementLevel).toBe(2);
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());

    await expect(repo.update(MISSING_UUID, { quantity: 1 })).rejects.toThrow(DatabaseError);
  });

  it('deletes a row once', async () => {
    const repo = new UserInventoryItemRepository(db.client);
    const created = await repo.create(stack('u1', id(1)));

    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.delete(created.id)).toBe(false);
    expect(await repo.count()).toBe(0);
  });

  it('counts holders per item and for one item', async () => {
    const repo = new UserInventoryItemRepository(db.client);
    await repo.create(stack('u1', id(1)));
    await repo.create(stack('u1', id(1)));
    await repo.create(stack('u2', id(1)));
    await repo.create(stack('u2', id(2)));

    const counts = await repo.holderCountsByItem();
    expect(counts.get(id(1))).toBe(2);
    expect(counts.get(id(2))).toBe(1);
    expect(counts.has(id(3))).toBe(false);
    expect(await repo.countHolders(id(1))).toBe(2);
    expect(await repo.countHolders(id(3))).toBe(0);
  });

  it('remaps one item id to another and resets slots', async () => {
    const repo = new UserInventoryItemRepository(db.client);
    const moved = await repo.create(stack('u1', id(1), { slot: 'WEAPON' }));
    const kept = await repo.create(stack('u2', id(2), { slot: 'ARMOR' }));

    expect(await repo.remapItemId(id(1), id(3))).toBe(1);
    expect(await repo.remapItemId(id(1), id(3))).toBe(0);

    const after = await repo.findById(moved.id);
    expect(after?.itemId).toBe(id(3));
    expect(after?.slot).toBe('NONE');
    expect((await repo.findById(kept.id))?.itemId).toBe(id(2));
  });

  it('equips an item, swapping out the previous occupant of the slot', async () => {
    const repo = new UserInventoryItemRepository(db.client);
    const first = await repo.create(stack('u1', id(1)));
    const second = await repo.create(stack('u1', id(2)));

    const one = await repo.equipToCard('u1', first.id, id(9), 'WEAPON');
    expect(one.equippedItem.state).toBe('EQUIPPED');
    expect(one.unequippedItem).toBeUndefined();

    const two = await repo.equipToCard('u1', second.id, id(9), 'WEAPON');
    expect(two.equippedItem.id).toBe(second.id);
    expect(two.unequippedItem?.id).toBe(first.id);
    expect((await repo.findById(first.id))?.state).toBe('IDLE');
    expect((await repo.findEquippedByCard(id(9))).map((r) => r.id)).toEqual([second.id]);
  });

  it('refuses to equip someone else item or a missing one, leaving rows untouched', async () => {
    const repo = new UserInventoryItemRepository(db.client);
    const theirs = await repo.create(stack('u2', id(1)));

    await expect(repo.equipToCard('u1', theirs.id, id(9), 'WEAPON')).rejects.toThrow(
      /does not belong/,
    );
    await expect(repo.equipToCard('u1', MISSING_UUID, id(9), 'WEAPON')).rejects.toThrow(
      DatabaseError,
    );
    expect((await repo.findById(theirs.id))?.state).toBe('IDLE');
  });

  it('unequips an equipped item and validates ownership and state', async () => {
    const repo = new UserInventoryItemRepository(db.client);
    const created = await repo.create(stack('u1', id(1)));
    await repo.equipToCard('u1', created.id, id(9), 'WEAPON');

    await expect(repo.unequipFromCard('u2', created.id)).rejects.toThrow(/does not belong/);
    await expect(repo.unequipFromCard('u1', MISSING_UUID)).rejects.toThrow(DatabaseError);

    const back = await repo.unequipFromCard('u1', created.id);
    expect(back.state).toBe('IDLE');
    expect(back.slot).toBe('NONE');
    expect(back.equippedToCardId).toBeNull();

    await expect(repo.unequipFromCard('u1', created.id)).rejects.toThrow(/not currently equipped/);
  });

  it('unequips all gear of a user, on one card or on every card', async () => {
    const repo = new UserInventoryItemRepository(db.client);
    const gear = async (userId: string, itemId: string, cardId: string, slot: string) =>
      repo.create(stack(userId, itemId, { slot, state: 'EQUIPPED', equippedToCardId: cardId }));
    const a = await gear('u1', id(1), id(9), 'WEAPON');
    const b = await gear('u1', id(2), id(9), 'ARMOR');
    const c = await gear('u1', id(3), id(8), 'WEAPON');
    const other = await gear('u2', id(4), id(9), 'WEAPON');

    const oneCard = await repo.unequipAllForUser('u1', id(9));
    expect(oneCard.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
    expect((await repo.findById(c.id))?.state).toBe('EQUIPPED');

    const rest = await repo.unequipAllForUser('u1');
    expect(rest.map((r) => r.id)).toEqual([c.id]);
    expect(rest[0]?.equippedToCardId).toBeNull();
    expect(rest[0]?.slot).toBe('NONE');

    expect(await repo.unequipAllForUser('u1')).toEqual([]);
    expect((await repo.findById(other.id))?.state).toBe('EQUIPPED');
  });

  it('runs work inside a user transaction and rolls back on failure', async () => {
    const repo = new UserInventoryItemRepository(db.client);

    const created = await repo.inUserTransaction('u1', (tx) => repo.create(stack('u1', id(1)), tx));
    expect(await repo.exists(created.id)).toBe(true);

    await expect(
      repo.inUserTransaction('u1', async (tx) => {
        await repo.create(stack('u1', id(2)), tx);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await repo.count()).toBe(1);
  });
});
