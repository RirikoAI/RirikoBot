import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { PlayerEnergyRepository } from './player-energy.repository.js';

/** `lastResetDate` is optional at runtime (defaults to today), though the row type requires it. */
type NewEnergy = Parameters<PlayerEnergyRepository['create']>[0];
const energy = (fields: Omit<NewEnergy, 'lastResetDate'> & { lastResetDate?: string }) =>
  fields as NewEnergy;

describeDialects('PlayerEnergyRepository behaviour', (db) => {
  it('creates an energy record with defaults and reads it back', async () => {
    const repo = new PlayerEnergyRepository(db.client);
    expect(await repo.findById('u1')).toBeNull();
    expect(await repo.exists('u1')).toBe(false);
    expect(await repo.count()).toBe(0);

    const created = await repo.create(energy({ userId: 'u1' }));
    expect(created.currentEnergy).toBe(100);
    expect(created.maxEnergy).toBe(100);
    expect(created.bonusEnergy).toBe(0);
    expect(created.dailyEnergyPotsUsed).toBe(0);
    expect(created.lastReplenishedAt).toBeInstanceOf(Date);
    expect(created.lastResetDate).toMatch(/^\d{4}-\d{2}-\d{2}/);

    expect((await repo.findById('u1'))?.userId).toBe('u1');
    expect(await repo.exists('u1')).toBe(true);
    expect(await repo.count()).toBe(1);
    await expect(repo.create(energy({ userId: 'u1' }))).rejects.toThrow();
  });

  it('keeps explicit values on creation', async () => {
    const repo = new PlayerEnergyRepository(db.client);

    const created = await repo.create({
      userId: 'u1',
      currentEnergy: 40,
      maxEnergy: 150,
      bonusEnergy: 25,
      dailyEnergyPotsUsed: 2,
      lastResetDate: '2026-01-01',
    });

    expect(created.currentEnergy).toBe(40);
    expect(created.maxEnergy).toBe(150);
    expect(created.bonusEnergy).toBe(25);
    expect(created.dailyEnergyPotsUsed).toBe(2);
    expect(created.lastResetDate).toBe('2026-01-01');
  });

  it('gets or creates a full tank without disturbing an existing one', async () => {
    const repo = new PlayerEnergyRepository(db.client);

    const fresh = await repo.getOrCreate('u1');
    expect(fresh.currentEnergy).toBe(100);
    await repo.update('u1', { currentEnergy: 12 });
    expect((await repo.getOrCreate('u1')).currentEnergy).toBe(12);
    expect(await repo.count()).toBe(1);
  });

  it('updates a record and throws for a missing one', async () => {
    const repo = new PlayerEnergyRepository(db.client);
    await repo.create(energy({ userId: 'u1' }));

    const updated = await repo.update('u1', { maxEnergy: 180, bonusEnergy: 10 });
    expect(updated.maxEnergy).toBe(180);
    expect(updated.bonusEnergy).toBe(10);
    expect(updated.currentEnergy).toBe(100);

    await expect(repo.update('ghost', { maxEnergy: 1 })).rejects.toThrow(DatabaseError);
  });

  it('deletes a record once', async () => {
    const repo = new PlayerEnergyRepository(db.client);
    await repo.create(energy({ userId: 'u1' }));

    expect(await repo.delete('u1')).toBe(true);
    expect(await repo.delete('u1')).toBe(false);
    expect(await repo.count()).toBe(0);
  });

  it('spends energy only while enough is left', async () => {
    const repo = new PlayerEnergyRepository(db.client);

    const first = await repo.consumeEnergy('u1', 30);
    expect(first).toEqual({ success: true, currentEnergy: 70 });
    expect((await repo.findById('u1'))?.currentEnergy).toBe(70);

    const refused = await repo.consumeEnergy('u1', 71);
    expect(refused.success).toBe(false);
    expect(refused.currentEnergy).toBe(70);
    expect(refused.reason).toMatch(/Insufficient energy.*Required: 71.*only have 70/);

    expect(await repo.consumeEnergy('u1', 70)).toEqual({ success: true, currentEnergy: 0 });
    expect((await repo.consumeEnergy('u1', 0)).success).toBe(true);
    expect((await repo.consumeEnergy('u1', 1)).success).toBe(false);
  });

  it('rejects invalid energy amounts', async () => {
    const repo = new PlayerEnergyRepository(db.client);

    await expect(repo.consumeEnergy('u1', -1)).rejects.toThrow('Invalid energy amount');
    await expect(repo.consumeEnergy('u1', 1.5)).rejects.toThrow('Invalid energy amount');
    expect(await repo.count()).toBe(0);
  });

  it('restores energy from a potion up to the cap and counts the potion', async () => {
    const repo = new PlayerEnergyRepository(db.client);
    await repo.create(energy({ userId: 'u1', currentEnergy: 30, maxEnergy: 100, bonusEnergy: 10 }));

    const first = await repo.consumeEnergyPotion('u1', 50);
    expect(first.success).toBe(true);
    expect(first.energyRestored).toBe(50);
    expect(first.energy.currentEnergy).toBe(80);
    expect(first.potsUsedToday).toBe(1);

    const capped = await repo.consumeEnergyPotion('u1', 50);
    expect(capped.success).toBe(true);
    expect(capped.energyRestored).toBe(30);
    expect(capped.energy.currentEnergy).toBe(110);
    expect(capped.potsUsedToday).toBe(2);
  });

  it('enforces the daily potion ceiling, counting potions rather than batches', async () => {
    const repo = new PlayerEnergyRepository(db.client);
    await repo.create(energy({ userId: 'u1', currentEnergy: 0, maxEnergy: 200 }));

    const batch = await repo.consumeEnergyPotion('u1', 100, 3, undefined, 2);
    expect(batch.success).toBe(true);
    expect(batch.potsUsedToday).toBe(2);

    const tooMany = await repo.consumeEnergyPotion('u1', 100, 3, undefined, 2);
    expect(tooMany.success).toBe(false);
    expect(tooMany.reason).toMatch(/ceiling reached.*1 remaining, requested 2/);
    expect(tooMany.energyRestored).toBe(0);
    expect(tooMany.potsUsedToday).toBe(2);
    expect((await repo.findById('u1'))?.currentEnergy).toBe(100);

    expect((await repo.consumeEnergyPotion('u1', 50)).success).toBe(true);
    const exhausted = await repo.consumeEnergyPotion('u1', 50);
    expect(exhausted.success).toBe(false);
    expect(exhausted.reason).toMatch(/0 remaining/);
  });

  it('resets the potion count when the reset day has changed', async () => {
    const repo = new PlayerEnergyRepository(db.client);
    await repo.create({
      userId: 'u1',
      currentEnergy: 0,
      dailyEnergyPotsUsed: 3,
      lastResetDate: '2000-01-01',
    });

    const result = await repo.consumeEnergyPotion('u1', 50);

    expect(result.success).toBe(true);
    expect(result.potsUsedToday).toBe(1);
    expect(result.energy.lastResetDate).not.toBe('2000-01-01');
  });

  it('rejects a potion quantity that is not a positive integer', async () => {
    const repo = new PlayerEnergyRepository(db.client);

    await expect(repo.consumeEnergyPotion('u1', 50, 3, undefined, 0)).rejects.toThrow(
      'Potion quantity must be a positive safe integer',
    );
    await expect(repo.consumeEnergyPotion('u1', 50, 3, undefined, 1.5)).rejects.toThrow(
      'Potion quantity must be a positive safe integer',
    );
  });

  it('reads a locked record inside a transaction, creating it when missing', async () => {
    const repo = new PlayerEnergyRepository(db.client);

    const energy = await repo.getForUpdate('u1', db.client);

    expect(energy.userId).toBe('u1');
    expect(energy.currentEnergy).toBe(100);
    expect(await repo.count()).toBe(1);
  });
});
