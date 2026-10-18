import { expect, it } from 'vitest';
import { describeDialects } from '../testing/dialects.js';
import { ECONOMY_CONFIG_ROW_ID, EconomyConfigRepository } from './economy-config.repository.js';

const values = {
  dailyBaseReward: 300,
  dailyStreakBonusPercent: 10,
  dailyMaxStreakBonusPercent: 200,
  bankBaseCapacity: 20_000,
  bankCapacityPerLevel: 1_000,
};

describeDialects('EconomyConfigRepository', (db) => {
  it('has no row until an owner saves the values', async () => {
    const repo = new EconomyConfigRepository(db.client);

    expect(await repo.get()).toBeNull();
  });

  it('creates the single row on the first save', async () => {
    const repo = new EconomyConfigRepository(db.client);
    const now = new Date('2026-06-01T08:00:00Z');

    await repo.save(values, 'owner-1', now);

    const row = await repo.get();
    expect(row?.id).toBe(ECONOMY_CONFIG_ROW_ID);
    expect(row).toMatchObject({ ...values, updatedBy: 'owner-1' });
    expect(row?.updatedAt.getTime()).toBe(now.getTime());
  });

  it('overwrites every value and the editor on a later save', async () => {
    const repo = new EconomyConfigRepository(db.client);
    await repo.save(values, 'owner-1', new Date('2026-06-01T08:00:00Z'));
    const later = new Date('2026-06-02T09:30:00Z');

    await repo.save({ ...values, dailyBaseReward: 999, bankBaseCapacity: 1 }, 'owner-2', later);

    const row = await repo.get();
    expect(row?.dailyBaseReward).toBe(999);
    expect(row?.bankBaseCapacity).toBe(1);
    expect(row?.dailyStreakBonusPercent).toBe(10);
    expect(row?.updatedBy).toBe('owner-2');
    expect(row?.updatedAt.getTime()).toBe(later.getTime());
  });
});
