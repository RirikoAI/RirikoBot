import { expect, it } from 'vitest';
import type { GuildSettings } from '@ririko/core';
import type { DatabaseConnection } from '../src/index.js';

export interface AuditRecord {
  actorId: string;
  beforeRevision: number;
  afterRevision: number;
  beforeSettings: GuildSettings | null;
  afterSettings: GuildSettings;
}

export const initialSettings: GuildSettings = {
  guildId: '12345678901234567890', prefix: '!', modules: { music: false },
  commands: { ping: { enabled: true, allowedRoleIds: ['98765432109876543210'], channels: { '34567890123456789012': false } } },
  revision: 0,
};

/** Run identical persistence behavior checks on both real database drivers. */
export function settingsContract(connection: () => DatabaseConnection, audit: () => Promise<AuditRecord[]>): void {
  it('requires explicit migration and applies it idempotently', async () => {
    expect(await connection().migrationStatus()).toEqual({ current: 0, latest: 1 });
    await expect(connection().healthCheck()).rejects.toMatchObject({ code: 'MIGRATION_REQUIRED' });
    await expect(connection().settings.get(initialSettings.guildId)).rejects.toMatchObject({ code: 'MIGRATION_REQUIRED' });
    await connection().migrate();
    await connection().migrate();
    expect(await connection().migrationStatus()).toEqual({ current: 1, latest: 1 });
    await connection().healthCheck();
    expect(await connection().settings.get(initialSettings.guildId)).toBeUndefined();
  });

  it('round-trips nested settings and atomically records actor and snapshots', async () => {
    await connection().migrate();
    const first = await connection().settings.save(initialSettings, 0, '22');
    expect(first).toEqual({ ...initialSettings, revision: 1 });
    const second = await connection().settings.save({ ...first, prefix: '??' }, 1, '33');
    expect(await connection().settings.get(initialSettings.guildId)).toEqual(second);
    expect(await audit()).toEqual([
      { actorId: '22', beforeRevision: 0, afterRevision: 1, beforeSettings: null, afterSettings: first },
      { actorId: '33', beforeRevision: 1, afterRevision: 2, beforeSettings: first, afterSettings: second },
    ]);
    expect(initialSettings.revision).toBe(0);
  });

  it('allows only one concurrent creator and one audit record', async () => {
    await connection().migrate();
    const results = await Promise.allSettled([
      connection().settings.save(initialSettings, 0, '22'),
      connection().settings.save({ ...initialSettings, prefix: '?' }, 0, '33'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find((result) => result.status === 'rejected');
    expect(failure).toMatchObject({ status: 'rejected', reason: { code: 'CONFLICT' } });
    expect(await audit()).toHaveLength(1);
  });

  it('rejects stale updates without overwriting the winner', async () => {
    await connection().migrate();
    const saved = await connection().settings.save(initialSettings, 0, '22');
    const results = await Promise.allSettled([
      connection().settings.save({ ...saved, prefix: '?' }, 1, '22'),
      connection().settings.save({ ...saved, prefix: '$' }, 1, '33'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: 'CONFLICT' } });
    expect((await connection().settings.get(initialSettings.guildId))?.revision).toBe(2);
    expect(await audit()).toHaveLength(2);
  });

  it('validates settings, actor and revision before modifying data', async () => {
    await connection().migrate();
    await expect(connection().settings.save({ ...initialSettings, prefix: 'bad prefix' }, 0, '22')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(connection().settings.save(initialSettings, 0, 'operator')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(connection().settings.save(initialSettings, 1, '22')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await connection().settings.get(initialSettings.guildId)).toBeUndefined();
    expect(await audit()).toHaveLength(0);
  });
}
