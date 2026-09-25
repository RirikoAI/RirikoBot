import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { SqliteDatabaseClient } from '../client/types.js';
import { AuditLogRepository } from './audit-log.repository.js';
import { ModerationRepository } from './moderation.repository.js';

const at = (day: number, hour = 0) => new Date(Date.UTC(2026, 8, day, hour));

describe('Case log and audit log queries (TASK-1132)', () => {
  let client: SqliteDatabaseClient;
  let moderation: ModerationRepository;
  let audit: AuditLogRepository;

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = raw;
    moderation = new ModerationRepository(client);
    audit = new AuditLogRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  async function seedCases() {
    const cases = [
      { type: 'WARN', target: 'u1', moderator: 'm1', createdAt: at(1) },
      { type: 'TIMEOUT', target: 'u1', moderator: 'm2', createdAt: at(2) },
      { type: 'BAN', target: 'u2', moderator: 'm1', createdAt: at(3) },
      { type: 'WARN', target: 'u2', moderator: 'm1', createdAt: at(4) },
      { type: 'KICK', target: 'u3', moderator: 'm2', createdAt: at(5) },
    ];
    for (const c of cases) {
      await moderation.createCase({
        guildId: 'g1',
        type: c.type,
        targetUserId: c.target,
        moderatorUserId: c.moderator,
        reason: 'test',
        createdAt: c.createdAt,
      });
    }
    await moderation.createCase({
      guildId: 'g2',
      type: 'MUTE',
      targetUserId: 'u1',
      moderatorUserId: 'm1',
      reason: 'other guild',
    });
  }

  it('pages cases newest first with a case number cursor and keeps the filtered total', async () => {
    await seedCases();

    const first = await moderation.listCases('g1', { limit: 2 });
    expect(first.items.map((c) => c.caseNumber)).toEqual([5, 4]);
    expect(first.total).toBe(5);

    const second = await moderation.listCases('g1', { limit: 2, beforeCaseNumber: 4 });
    expect(second.items.map((c) => c.caseNumber)).toEqual([3, 2]);
    expect(second.total).toBe(5);
  });

  it('filters cases by moderator, type and creation time', async () => {
    await seedCases();

    const result = await moderation.listCases('g1', {
      moderatorUserId: 'm1',
      createdFrom: at(2),
      createdBefore: at(4, 1),
    });
    expect(result.items.map((c) => [c.caseNumber, c.type])).toEqual([
      [4, 'WARN'],
      [3, 'BAN'],
    ]);

    const warns = await moderation.listCases('g1', { type: 'WARN', targetUserId: 'u2' });
    expect(warns.items.map((c) => c.caseNumber)).toEqual([4]);
  });

  it('lists the case types a guild has used', async () => {
    await seedCases();
    expect(await moderation.listCaseTypes('g1')).toEqual(['BAN', 'KICK', 'TIMEOUT', 'WARN']);
  });

  it('lists every warning of a user, including inactive ones', async () => {
    const old = await moderation.createWarning({
      guildId: 'g1',
      userId: 'u1',
      moderatorId: 'm1',
      reason: 'old',
      createdAt: at(1),
    });
    await moderation.deactivateWarning(old.id);
    await moderation.createWarning({
      guildId: 'g1',
      userId: 'u1',
      moderatorId: 'm1',
      reason: 'new',
      createdAt: at(2),
    });

    const warnings = await moderation.listWarnings('g1', 'u1');
    expect(warnings.map((w) => [w.reason, w.isActive])).toEqual([
      ['new', true],
      ['old', false],
    ]);
  });

  it('pages a guild audit log newest first, breaking time ties by id', async () => {
    const write = (guildId: string | null, action: string, createdAt: Date) =>
      audit.create({ guildId, actorUserId: 'a1', action, details: {} }, createdAt);
    await write('g1', 'one', at(1));
    const tieA = await write('g1', 'tie-a', at(2));
    const tieB = await write('g1', 'tie-b', at(2));
    await write('g1', 'three', at(3));
    await write('g2', 'other guild', at(4));
    await write(null, 'account', at(4));

    const first = await audit.listByGuild('g1', { limit: 2 });
    const [newerTie, olderTie] = tieA.id > tieB.id ? [tieA, tieB] : [tieB, tieA];
    expect(first.map((e) => e.action)).toEqual(['three', newerTie.action]);

    const last = first.at(-1)!;
    const rest = await audit.listByGuild('g1', {
      limit: 10,
      before: { createdAt: last.createdAt, id: last.id },
    });
    expect(rest.map((e) => e.action)).toEqual([olderTie.action, 'one']);
  });
});
