import { expect, it } from 'vitest';
import { describeDialects } from '../testing/dialects.js';
import { withTransaction } from '../transactions/index.js';
import { GuildConfigVersionRepository } from './guild-config-version.repository.js';

const at = (seconds: number) => new Date(Date.UTC(2026, 8, 25, 0, 0, seconds));

describeDialects('GuildConfigVersionRepository behaviour', (db) => {
  it('starts each guild module at version 1 and increments on every bump', async () => {
    const repo = new GuildConfigVersionRepository(db.client);

    expect(await repo.bump('g1', 'general', at(1))).toBe(1);
    expect(await repo.bump('g1', 'general', at(2))).toBe(2);
    expect(await repo.bump('g1', 'music', at(3))).toBe(1);
    expect(await repo.bump('g2', 'general', at(4))).toBe(1);
  });

  it('lists rows changed strictly after a point in time, oldest first', async () => {
    const repo = new GuildConfigVersionRepository(db.client);
    await repo.bump('g1', 'general', at(1));
    await repo.bump('g2', 'general', at(3));
    await repo.bump('g1', 'general', at(5));

    const changed = await repo.listChangedSince(at(1));

    expect(changed.map((row) => [row.guildId, row.version, row.updatedAt.getTime()])).toEqual([
      ['g2', 1, at(3).getTime()],
      ['g1', 2, at(5).getTime()],
    ]);
    expect(await repo.listChangedSince(at(5))).toEqual([]);
  });

  it('rolls a bump back with the surrounding transaction', async () => {
    const repo = new GuildConfigVersionRepository(db.client);

    await expect(
      withTransaction(db.client, async (tx) => {
        await repo.bump('g1', 'general', at(1), tx);
        throw new Error('settings write failed');
      }),
    ).rejects.toThrow('settings write failed');

    expect(await repo.listChangedSince(at(0))).toEqual([]);
  });
});
