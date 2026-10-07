import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { WaifuCardRepository } from './waifu-card.repository.js';

const MISSING_UUID = '00000000-0000-4000-8000-000000000001';

const cardInput = (n: number, overrides: Record<string, unknown> = {}) => ({
  assetId: randomUUID(),
  name: `Card ${n}`,
  rarity: 'RARE',
  element: 'FIRE',
  attack: 100 * n,
  defense: 50,
  speed: 10,
  health: 1000,
  collectionNumber: n,
  ...overrides,
});

describeDialects('WaifuCardRepository behaviour', (db) => {
  it('creates cards with defaults, then checks existence, counts and deletes', async () => {
    const repo = new WaifuCardRepository(db.client);
    const created = await repo.create(cardInput(1));

    expect(created.critRate).toBeCloseTo(0.05);
    expect(created.isActive).toBe(true);
    expect(created.skillName).toBeNull();
    expect(created.passiveDescription).toBeNull();

    expect(await repo.exists(created.id)).toBe(true);
    expect(await repo.exists(MISSING_UUID)).toBe(false);
    expect(await repo.findById(MISSING_UUID)).toBeNull();
    expect(await repo.findByAssetId(randomUUID())).toBeNull();
    expect(await repo.count()).toBe(1);

    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.delete(created.id)).toBe(false);
    expect(await repo.count()).toBe(0);
  });

  it('wraps a duplicate card id in a DatabaseError', async () => {
    const repo = new WaifuCardRepository(db.client);
    const created = await repo.create(cardInput(1));

    await expect(repo.create(cardInput(2, { id: created.id }))).rejects.toThrow(
      /Failed to create waifu card/,
    );
  });

  it('updates a card and throws for a missing one', async () => {
    const repo = new WaifuCardRepository(db.client);
    const created = await repo.create(cardInput(1));

    const updated = await repo.update(created.id, { name: 'Renamed', isActive: false });
    expect(updated.name).toBe('Renamed');
    expect(updated.isActive).toBe(false);

    await expect(repo.update(MISSING_UUID, { name: 'x' })).rejects.toThrow(DatabaseError);
  });

  it('pages and filters the card list, including inactive cards', async () => {
    const repo = new WaifuCardRepository(db.client);
    const ids: string[] = [];
    for (let n = 1; n <= 5; n++) {
      const card = await repo.create(
        cardInput(n, { rarity: n % 2 ? 'RARE' : 'EPIC', isActive: n !== 3 }),
      );
      ids.push(card.id);
    }

    const sorted = [...ids].sort();
    expect((await repo.listCards()).map((c) => c.id)).toEqual(sorted);
    expect((await repo.listCards({ limit: 2 })).map((c) => c.id)).toEqual(sorted.slice(0, 2));
    expect((await repo.listCards({ limit: 2, offset: 2 })).map((c) => c.id)).toEqual(
      sorted.slice(2, 4),
    );
    expect(await repo.listCards({ isActive: false })).toHaveLength(1);
    expect(await repo.listCards({ isActive: true })).toHaveLength(4);
    expect(await repo.listCards({ rarity: 'EPIC', isActive: true })).toHaveLength(2);
    expect(await repo.countCards({ rarity: 'RARE' })).toBe(3);
    expect(await repo.countCards({ element: 'ICE' })).toBe(0);
  });

  it('reserves serial numbers in sequence and refuses unknown cards', async () => {
    const repo = new WaifuCardRepository(db.client);
    const card = await repo.create(cardInput(1));
    const other = await repo.create(cardInput(2));

    expect(await repo.reserveSerialNumber(card.id)).toBe(1);
    expect(await repo.reserveSerialNumber(card.id)).toBe(2);
    expect(await repo.reserveSerialNumber(other.id)).toBe(1);

    await expect(repo.reserveSerialNumber(MISSING_UUID)).rejects.toThrow(/Unknown card/);
  });

  it('reserves above serials that were already minted without a counter', async () => {
    const repo = new WaifuCardRepository(db.client);
    const card = await repo.create(cardInput(1));
    await repo.createUserCard({ userId: 'u1', cardId: card.id, serialNumber: 7 });

    expect(await repo.reserveSerialNumber(card.id)).toBe(8);
  });

  it('refuses to reserve a serial once the integer range is used up', async () => {
    const repo = new WaifuCardRepository(db.client);
    const card = await repo.create(cardInput(1));
    await repo.createUserCard({ userId: 'u1', cardId: card.id, serialNumber: 2_147_483_646 });

    await expect(repo.reserveSerialNumber(card.id)).rejects.toThrow('Card serial range exhausted');
    await expect(repo.mintUserCard({ userId: 'u2', cardId: card.id })).rejects.toThrow(
      'Card serial range exhausted',
    );
    expect(await repo.countUserCards('u2')).toBe(0);
  });

  it('mints user cards with consecutive serials and rolls back when the card is unknown', async () => {
    const repo = new WaifuCardRepository(db.client);
    const card = await repo.create(cardInput(1));

    const first = await repo.mintUserCard({ userId: 'u1', cardId: card.id });
    const second = await repo.mintUserCard({ userId: 'u2', cardId: card.id, level: 3 });
    expect(first.serialNumber).toBe(1);
    expect(second.serialNumber).toBe(2);
    expect(second.level).toBe(3);
    expect(await repo.getHighestSerialNumber(card.id)).toBe(2);
    expect(await repo.getHighestSerialNumber(MISSING_UUID)).toBe(0);

    await expect(repo.mintUserCard({ userId: 'u1', cardId: MISSING_UUID })).rejects.toThrow(
      /Unknown card/,
    );
  });

  it('keeps slug card and asset ids as text and lets members own that card', async () => {
    const repo = new WaifuCardRepository(db.client);
    const card = await repo.create(
      cardInput(1, { id: 'card_fire_001', assetId: 'asset_card_bulk_fire_001' }),
    );

    expect(card.id).toBe('card_fire_001');
    expect(card.assetId).toBe('asset_card_bulk_fire_001');
    expect((await repo.findById('card_fire_001'))?.assetId).toBe('asset_card_bulk_fire_001');
    expect((await repo.findByAssetId('asset_card_bulk_fire_001'))?.id).toBe('card_fire_001');

    const owned = await repo.mintUserCard({ userId: 'u1', cardId: 'card_fire_001' });
    expect(owned.cardId).toBe('card_fire_001');
    expect(owned.serialNumber).toBe(1);
    expect((await repo.listUserCards('u1')).map((entry) => entry.cardId)).toEqual([
      'card_fire_001',
    ]);
    expect(await repo.getHighestSerialNumber('card_fire_001')).toBe(1);
  });

  it('creates user cards with defaults and wraps a duplicate id', async () => {
    const repo = new WaifuCardRepository(db.client);
    const card = await repo.create(cardInput(1));

    const owned = await repo.createUserCard({ userId: 'u1', cardId: card.id, serialNumber: 1 });
    expect(owned.level).toBe(1);
    expect(owned.exp).toBe(0);
    expect(owned.state).toBe('IDLE');
    expect(owned.isFavorite).toBe(false);
    expect(owned.obtainedAt).toBeInstanceOf(Date);
    expect((await repo.findUserCardById(owned.id))?.userId).toBe('u1');
    expect(await repo.findUserCardById(MISSING_UUID)).toBeNull();

    await expect(
      repo.createUserCard({ id: owned.id, userId: 'u2', cardId: card.id, serialNumber: 2 }),
    ).rejects.toThrow(/Failed to create user card/);
  });

  it('runs user card work under a lock, with or without a surrounding transaction', async () => {
    const repo = new WaifuCardRepository(db.client);
    const card = await repo.create(cardInput(1));
    const owned = await repo.createUserCard({ userId: 'u1', cardId: card.id, serialNumber: 1 });

    const seen = await repo.withUserCardLock(owned.id, async (locked, tx) => {
      await repo.updateUserCardLevelAndExp(owned.id, 4, 90, tx);
      return locked?.level;
    });
    expect(seen).toBe(1);
    expect((await repo.findUserCardById(owned.id))?.level).toBe(4);

    const missing = await repo.withUserCardLock(MISSING_UUID, async (locked) => locked);
    expect(missing).toBeNull();

    const viaTx = await repo.withUserCardLock(owned.id, async (locked) => locked?.exp, db.client);
    expect(viaTx).toBe(90);
  });

  it('lists a user cards newest first with state and favorite filters and paging', async () => {
    const repo = new WaifuCardRepository(db.client);
    const card = await repo.create(cardInput(1));
    const at = (day: number) => new Date(Date.UTC(2026, 0, day));
    const a = await repo.createUserCard({
      userId: 'u1',
      cardId: card.id,
      serialNumber: 1,
      obtainedAt: at(1),
    });
    const b = await repo.createUserCard({
      userId: 'u1',
      cardId: card.id,
      serialNumber: 2,
      obtainedAt: at(2),
      state: 'IN_TRADE',
      isFavorite: true,
    });
    const c = await repo.createUserCard({
      userId: 'u1',
      cardId: card.id,
      serialNumber: 3,
      obtainedAt: at(3),
    });
    await repo.createUserCard({ userId: 'u2', cardId: card.id, serialNumber: 4 });

    expect((await repo.listUserCards('u1')).map((x) => x.id)).toEqual([c.id, b.id, a.id]);
    expect((await repo.listUserCards('u1', { limit: 1, offset: 1 })).map((x) => x.id)).toEqual([
      b.id,
    ]);
    expect((await repo.listUserCards('u1', { state: 'IN_TRADE' })).map((x) => x.id)).toEqual([
      b.id,
    ]);
    expect((await repo.listUserCards('u1', { isFavorite: false })).map((x) => x.id)).toEqual([
      c.id,
      a.id,
    ]);
    expect(await repo.countUserCards('u1')).toBe(3);
    expect(await repo.countUserCards('u1', { state: 'IN_TRADE' })).toBe(1);
    expect(await repo.countUserCards('nobody')).toBe(0);
  });

  it('transfers a card to a new owner and state, and reports missing cards as null', async () => {
    const repo = new WaifuCardRepository(db.client);
    const card = await repo.create(cardInput(1));
    const owned = await repo.createUserCard({
      userId: 'u1',
      cardId: card.id,
      serialNumber: 1,
      state: 'IN_TRADE',
    });

    const reset = await repo.updateUserCardOwner(owned.id, 'u2');
    expect(reset?.userId).toBe('u2');
    expect(reset?.state).toBe('IDLE');

    const parked = await repo.updateUserCardOwner(owned.id, 'u3', 'LISTED');
    expect(parked?.userId).toBe('u3');
    expect(parked?.state).toBe('LISTED');

    expect(await repo.updateUserCardOwner(MISSING_UUID, 'u2')).toBeNull();
    expect(await repo.updateUserCardState(MISSING_UUID, 'IDLE')).toBeNull();
    expect(await repo.updateUserCardLevelAndExp(MISSING_UUID, 2, 2)).toBeNull();
    expect(await repo.toggleUserCardFavorite(MISSING_UUID, true)).toBeNull();
    expect(await repo.incrementUserCardBattlesWon(MISSING_UUID)).toBeNull();
    expect(await repo.deleteUserCard(MISSING_UUID)).toBe(false);
  });

  it('defaults a battle win increment to one', async () => {
    const repo = new WaifuCardRepository(db.client);
    const card = await repo.create(cardInput(1));
    const owned = await repo.createUserCard({ userId: 'u1', cardId: card.id, serialNumber: 1 });

    expect((await repo.incrementUserCardBattlesWon(owned.id))?.battlesWon).toBe(1);
    expect((await repo.incrementUserCardBattlesWon(owned.id))?.battlesWon).toBe(2);
  });
});
