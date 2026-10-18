import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { ModerationRepository } from './moderation.repository.js';

const MISSING_UUID = '00000000-0000-4000-8000-000000000001';

const modCase = (guildId: string, overrides: Record<string, unknown> = {}) => ({
  guildId,
  type: 'WARN',
  targetUserId: 'target',
  moderatorUserId: 'mod',
  ...overrides,
});

describeDialects('ModerationRepository behaviour', (db) => {
  it('creates a case with defaults and finds it by id and by number', async () => {
    const repo = new ModerationRepository(db.client);
    expect(await repo.findById(MISSING_UUID)).toBeNull();
    expect(await repo.exists(MISSING_UUID)).toBe(false);
    expect(await repo.count()).toBe(0);

    const created = await repo.create(modCase('g1'));
    expect(created.caseNumber).toBe(1);
    expect(created.reason).toBe('No reason provided');
    expect(created.durationSeconds).toBeNull();
    expect(created.metadata).toEqual({});

    expect((await repo.findById(created.id))?.targetUserId).toBe('target');
    expect(await repo.exists(created.id)).toBe(true);
    expect((await repo.getCaseByNumber('g1', 1))?.id).toBe(created.id);
    expect(await repo.getCaseByNumber('g1', 2)).toBeNull();
    expect(await repo.getCaseByNumber('g2', 1)).toBeNull();
    expect(await repo.count()).toBe(1);
  });

  it('numbers cases per guild and honours an explicit number', async () => {
    const repo = new ModerationRepository(db.client);
    expect(await repo.getNextCaseNumber('g1')).toBe(1);
    await repo.createCase(modCase('g1'));
    await repo.createCase(modCase('g1'));
    await repo.createCase(modCase('g2'));
    const explicit = await repo.createCase(
      modCase('g1', { caseNumber: 10, reason: 'Spam', durationSeconds: 600, metadata: { a: 1 } }),
    );

    expect(explicit.caseNumber).toBe(10);
    expect(explicit.reason).toBe('Spam');
    expect(explicit.durationSeconds).toBe(600);
    expect(explicit.metadata).toEqual({ a: 1 });
    expect(await repo.getNextCaseNumber('g1')).toBe(11);
    expect(await repo.getNextCaseNumber('g2')).toBe(2);
  });

  it('updates a case and throws for a missing one', async () => {
    const repo = new ModerationRepository(db.client);
    const created = await repo.create(modCase('g1'));

    const updated = await repo.update(created.id, { reason: 'Edited', metadata: { note: 'x' } });
    expect(updated.reason).toBe('Edited');
    expect(updated.metadata).toEqual({ note: 'x' });
    expect(updated.caseNumber).toBe(1);

    await expect(repo.update(MISSING_UUID, { reason: 'x' })).rejects.toThrow(DatabaseError);
  });

  it('deletes a case once', async () => {
    const repo = new ModerationRepository(db.client);
    const created = await repo.create(modCase('g1'));

    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.delete(created.id)).toBe(false);
    expect(await repo.count()).toBe(0);
  });

  it('lists cases newest first with filters, paging and clamped limits', async () => {
    const repo = new ModerationRepository(db.client);
    const at = (day: number) => new Date(Date.UTC(2026, 0, day));
    await repo.create(modCase('g1', { type: 'WARN', targetUserId: 'a', createdAt: at(1) }));
    await repo.create(
      modCase('g1', { type: 'BAN', targetUserId: 'b', moderatorUserId: 'mod2', createdAt: at(2) }),
    );
    await repo.create(modCase('g1', { type: 'WARN', targetUserId: 'a', createdAt: at(3) }));
    await repo.create(modCase('g2', { type: 'KICK' }));

    const numbers = async (options?: Parameters<ModerationRepository['listCases']>[1]) =>
      (await repo.listCases('g1', options)).items.map((c) => c.caseNumber);

    expect(await numbers()).toEqual([3, 2, 1]);
    expect(await numbers({ targetUserId: 'a' })).toEqual([3, 1]);
    expect(await numbers({ moderatorUserId: 'mod2' })).toEqual([2]);
    expect(await numbers({ type: 'WARN' })).toEqual([3, 1]);
    expect(await numbers({ createdFrom: at(2) })).toEqual([3, 2]);
    expect(await numbers({ createdBefore: at(3) })).toEqual([2, 1]);
    expect(await numbers({ limit: 1, offset: 1 })).toEqual([2]);
    expect(await numbers({ beforeCaseNumber: 3 })).toEqual([2, 1]);

    const clamped = await repo.listCases('g1', { limit: 0, offset: -5 });
    expect(clamped.limit).toBe(1);
    expect(clamped.offset).toBe(0);
    expect(clamped.total).toBe(3);
    expect((await repo.listCases('g1', { limit: 5000 })).limit).toBe(100);
    expect((await repo.listCases('g1', { beforeCaseNumber: 2 })).total).toBe(3);
    expect(await repo.listCaseTypes('g1')).toEqual(['BAN', 'WARN']);
    expect(await repo.listCaseTypes('nowhere')).toEqual([]);
  });

  it('creates warnings with defaults and lists the active, unexpired ones', async () => {
    const repo = new ModerationRepository(db.client);
    const hour = 3_600_000;
    const defaulted = await repo.createWarning({
      guildId: 'g1',
      userId: 'u1',
      moderatorId: 'mod',
      reason: 'Spam',
    });
    expect(defaulted.severity).toBe(1);
    expect(defaulted.isActive).toBe(true);
    expect(defaulted.expiresAt).toBeNull();

    const live = await repo.createWarning({
      guildId: 'g1',
      userId: 'u1',
      moderatorId: 'mod',
      reason: 'Rude',
      severity: 3,
      expiresAt: new Date(Date.now() + hour),
    });
    await repo.createWarning({
      guildId: 'g1',
      userId: 'u1',
      moderatorId: 'mod',
      reason: 'Old',
      expiresAt: new Date(Date.now() - hour),
    });
    await repo.createWarning({
      guildId: 'g1',
      userId: 'u1',
      moderatorId: 'mod',
      reason: 'Dismissed',
      isActive: false,
    });
    await repo.createWarning({ guildId: 'g2', userId: 'u1', moderatorId: 'mod', reason: 'Other' });

    const active = await repo.getActiveWarnings('g1', 'u1');
    expect(active.map((w) => w.reason).sort()).toEqual(['Rude', 'Spam']);
    expect(active.find((w) => w.id === live.id)?.severity).toBe(3);
    expect(await repo.listWarnings('g1', 'u1')).toHaveLength(4);
    expect(await repo.listWarnings('g1', 'nobody')).toEqual([]);
  });

  it('deactivates one warning or all of a user, counting what changed', async () => {
    const repo = new ModerationRepository(db.client);
    const warn = (reason: string, userId = 'u1') =>
      repo.createWarning({ guildId: 'g1', userId, moderatorId: 'mod', reason });
    const first = await warn('one');
    await warn('two');
    await warn('three');
    await warn('other user', 'u2');

    expect(await repo.deactivateWarning(first.id)).toBe(true);
    expect(await repo.deactivateWarning(MISSING_UUID)).toBe(false);
    expect(await repo.getActiveWarnings('g1', 'u1')).toHaveLength(2);

    expect(await repo.clearUserWarnings('g1', 'u1')).toBe(2);
    expect(await repo.clearUserWarnings('g1', 'u1')).toBe(0);
    expect(await repo.getActiveWarnings('g1', 'u1')).toEqual([]);
    expect(await repo.getActiveWarnings('g1', 'u2')).toHaveLength(1);
  });

  it('stores staff notes per member, newest first, and deletes them', async () => {
    const repo = new ModerationRepository(db.client);
    const at = (day: number) => new Date(Date.UTC(2026, 0, day));
    const older = await repo.createNote({
      guildId: 'g1',
      targetUserId: 'u1',
      authorUserId: 'mod',
      content: 'first',
      createdAt: at(1),
    });
    const newer = await repo.createNote({
      guildId: 'g1',
      targetUserId: 'u1',
      authorUserId: 'mod',
      content: 'second',
      createdAt: at(2),
      updatedAt: at(2),
    });
    await repo.createNote({
      guildId: 'g1',
      targetUserId: 'u2',
      authorUserId: 'mod',
      content: 'elsewhere',
    });
    expect(older.updatedAt).toBeInstanceOf(Date);

    expect((await repo.getNotesByUser('g1', 'u1')).map((n) => n.content)).toEqual([
      'second',
      'first',
    ]);
    expect(await repo.getNotesByUser('g1', 'nobody')).toEqual([]);

    expect(await repo.deleteNote(newer.id)).toBe(true);
    expect(await repo.deleteNote(newer.id)).toBe(false);
    expect((await repo.getNotesByUser('g1', 'u1')).map((n) => n.content)).toEqual(['first']);
  });

  it('upserts automod rules by guild and type, keeping unspecified fields', async () => {
    const repo = new ModerationRepository(db.client);
    expect(await repo.getRules('g1')).toEqual([]);
    expect(await repo.getRuleByType('g1', 'SPAM')).toBeNull();

    const created = await repo.upsertRule({ guildId: 'g1', ruleType: 'SPAM' } as never);
    expect(created.action).toBe('WARN');
    expect(created.threshold).toBe(3);
    expect(created.isEnabled).toBe(true);
    expect(created.exemptRoles).toEqual([]);
    expect(created.exemptChannels).toEqual([]);

    const changed = await repo.upsertRule({
      guildId: 'g1',
      ruleType: 'SPAM',
      action: 'MUTE',
      threshold: 5,
      isEnabled: false,
      exemptRoles: ['r1'],
      exemptChannels: ['c1'],
    });
    expect(changed.id).toBe(created.id);
    expect(changed.action).toBe('MUTE');
    expect(changed.threshold).toBe(5);
    expect(changed.isEnabled).toBe(false);
    expect(changed.exemptRoles).toEqual(['r1']);
    expect(changed.exemptChannels).toEqual(['c1']);

    const kept = await repo.upsertRule({ guildId: 'g1', ruleType: 'SPAM' } as never);
    expect(kept.action).toBe('MUTE');
    expect(kept.threshold).toBe(5);
    expect(kept.isEnabled).toBe(false);
    expect(kept.exemptRoles).toEqual(['r1']);

    await repo.upsertRule({ guildId: 'g1', ruleType: 'LINKS', isEnabled: true } as never);
    await repo.upsertRule({ guildId: 'g2', ruleType: 'SPAM' } as never);
    expect((await repo.getRules('g1')).map((r) => r.ruleType).sort()).toEqual(['LINKS', 'SPAM']);
    expect((await repo.getRuleByType('g1', 'LINKS'))?.isEnabled).toBe(true);
  });
});
