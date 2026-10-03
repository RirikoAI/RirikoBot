import { expect, it } from 'vitest';
import { describeDialects } from '../testing/dialects.js';
import { AuditLogRepository } from './audit-log.repository.js';

const T0 = new Date('2026-09-25T00:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

const entry = (guildId: string | null, action: string) => ({
  guildId,
  actorUserId: 'actor',
  action,
});

describeDialects('AuditLogRepository behaviour', (db) => {
  it('appends an entry with a generated id and the given time', async () => {
    const repo = new AuditLogRepository(db.client);

    const written = await repo.create(
      { ...entry('g1', 'settings.update'), details: { field: 'prefix' }, ipAddress: '203.0.113.7' },
      at(0),
    );

    expect(written.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(written.createdAt.getTime()).toBe(at(0).getTime());
    expect(written.details).toEqual({ field: 'prefix' });
    expect(written.ipAddress).toBe('203.0.113.7');
    expect(written.userAgent).toBeNull();
  });

  it('lists a guild entries newest first with a limit', async () => {
    const repo = new AuditLogRepository(db.client);
    await repo.create(entry('g1', 'first'), at(1));
    await repo.create(entry('g1', 'second'), at(2));
    await repo.create(entry('g1', 'third'), at(3));
    await repo.create(entry('g2', 'elsewhere'), at(4));
    await repo.create(entry(null, 'global'), at(5));

    expect((await repo.listByGuild('g1', { limit: 10 })).map((e) => e.action)).toEqual([
      'third',
      'second',
      'first',
    ]);
    expect((await repo.listByGuild('g1', { limit: 2 })).map((e) => e.action)).toEqual([
      'third',
      'second',
    ]);
    expect(await repo.listByGuild('nowhere', { limit: 10 })).toEqual([]);
  });

  it('pages with a cursor, breaking time ties by id', async () => {
    const repo = new AuditLogRepository(db.client);
    await repo.create(entry('g1', 'old'), at(1));
    await repo.create(entry('g1', 'tie-a'), at(2));
    await repo.create(entry('g1', 'tie-b'), at(2));
    await repo.create(entry('g1', 'new'), at(3));

    const firstPage = await repo.listByGuild('g1', { limit: 2 });
    expect(firstPage[0]?.action).toBe('new');
    const cursor = { createdAt: firstPage[1]!.createdAt, id: firstPage[1]!.id };
    const rest = await repo.listByGuild('g1', { limit: 10, before: cursor });

    const seen = [...firstPage, ...rest].map((e) => e.action);
    expect(new Set(seen).size).toBe(4);
    expect(seen[0]).toBe('new');
    expect(seen[3]).toBe('old');
  });
});
