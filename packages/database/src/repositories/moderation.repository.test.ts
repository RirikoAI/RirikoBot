import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { SqliteDatabaseClient } from '../client/types.js';
import { ModerationRepository } from './moderation.repository.js';

describe('ModerationRepository (TASK-0701)', () => {
  let client: SqliteDatabaseClient;
  let modRepo: ModerationRepository;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    client.raw.exec(`
      CREATE TABLE moderation_cases (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        case_number INTEGER NOT NULL,
        type TEXT NOT NULL,
        target_user_id TEXT NOT NULL,
        moderator_user_id TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT 'No reason provided',
        duration_seconds INTEGER,
        metadata TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL
      );

      CREATE TABLE moderation_warnings (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        moderator_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        severity INTEGER NOT NULL DEFAULT 1,
        is_active INTEGER NOT NULL DEFAULT 1,
        expires_at INTEGER,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE moderation_rules (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        rule_type TEXT NOT NULL,
        action TEXT NOT NULL DEFAULT 'WARN',
        threshold INTEGER NOT NULL DEFAULT 3,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        exempt_roles TEXT NOT NULL DEFAULT '[]',
        exempt_channels TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE moderation_notes (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        target_user_id TEXT NOT NULL,
        author_user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    modRepo = new ModerationRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  describe('Sequential Case Management', () => {
    it('generates sequential per-guild case numbers starting at 1', async () => {
      const next1 = await modRepo.getNextCaseNumber('guild_1');
      expect(next1).toBe(1);

      const case1 = await modRepo.createCase({
        guildId: 'guild_1',
        type: 'WARN',
        targetUserId: 'user_target',
        moderatorUserId: 'user_mod',
        reason: 'First warning',
      });
      expect(case1.caseNumber).toBe(1);
      expect(case1.guildId).toBe('guild_1');

      const next2 = await modRepo.getNextCaseNumber('guild_1');
      expect(next2).toBe(2);

      const case2 = await modRepo.createCase({
        guildId: 'guild_1',
        type: 'TIMEOUT',
        targetUserId: 'user_target',
        moderatorUserId: 'user_mod',
        durationSeconds: 300,
        reason: 'Timed out for 5m',
      });
      expect(case2.caseNumber).toBe(2);

      // Separate guild maintains independent sequential case numbering
      const nextGuild2 = await modRepo.getNextCaseNumber('guild_2');
      expect(nextGuild2).toBe(1);
    });

    it('finds cases by case number and lists with pagination', async () => {
      await modRepo.createCase({
        guildId: 'guild_1',
        type: 'WARN',
        targetUserId: 'user_1',
        moderatorUserId: 'mod_1',
      });
      await modRepo.createCase({
        guildId: 'guild_1',
        type: 'BAN',
        targetUserId: 'user_2',
        moderatorUserId: 'mod_1',
      });
      await modRepo.createCase({
        guildId: 'guild_1',
        type: 'KICK',
        targetUserId: 'user_1',
        moderatorUserId: 'mod_2',
      });

      const case1 = await modRepo.getCaseByNumber('guild_1', 1);
      expect(case1).not.toBeNull();
      expect(case1?.type).toBe('WARN');

      const user1Cases = await modRepo.listCases('guild_1', { targetUserId: 'user_1' });
      expect(user1Cases.total).toBe(2);
      expect(user1Cases.items).toHaveLength(2);
      expect(user1Cases.items[0]?.caseNumber).toBe(3); // sorted desc
      expect(user1Cases.items[1]?.caseNumber).toBe(1);

      const paginated = await modRepo.listCases('guild_1', { limit: 1, offset: 0 });
      expect(paginated.total).toBe(3);
      expect(paginated.items).toHaveLength(1);
      expect(paginated.items[0]?.caseNumber).toBe(3);
    });

    it('updates case reason and metadata', async () => {
      const created = await modRepo.createCase({
        guildId: 'guild_1',
        type: 'WARN',
        targetUserId: 'user_1',
        moderatorUserId: 'mod_1',
        reason: 'Initial reason',
      });

      const updated = await modRepo.update(created.id, {
        reason: 'Updated reason with additional proof',
        metadata: { appeals: 1 },
      });

      expect(updated.reason).toBe('Updated reason with additional proof');
      expect(updated.metadata).toEqual({ appeals: 1 });
    });
  });

  describe('Warning Management', () => {
    it('creates and retrieves active warnings, respecting expiration', async () => {
      const future = new Date(Date.now() + 86400000); // +1 day
      const past = new Date(Date.now() - 10000); // -10s

      await modRepo.createWarning({
        guildId: 'guild_1',
        userId: 'user_warned',
        moderatorId: 'mod_1',
        reason: 'Warning 1 active',
        expiresAt: future,
      });

      await modRepo.createWarning({
        guildId: 'guild_1',
        userId: 'user_warned',
        moderatorId: 'mod_1',
        reason: 'Warning 2 expired',
        expiresAt: past,
      });

      const active = await modRepo.getActiveWarnings('guild_1', 'user_warned');
      expect(active).toHaveLength(1);
      expect(active[0]?.reason).toBe('Warning 1 active');
    });

    it('deactivates warning and clears all user warnings', async () => {
      const w1 = await modRepo.createWarning({
        guildId: 'guild_1',
        userId: 'user_target',
        moderatorId: 'mod_1',
        reason: 'Warning A',
      });
      const w2 = await modRepo.createWarning({
        guildId: 'guild_1',
        userId: 'user_target',
        moderatorId: 'mod_1',
        reason: 'Warning B',
      });

      const deactivated = await modRepo.deactivateWarning(w1.id);
      expect(deactivated).toBe(true);

      let active = await modRepo.getActiveWarnings('guild_1', 'user_target');
      expect(active).toHaveLength(1);
      expect(active[0]?.id).toBe(w2.id);

      const cleared = await modRepo.clearUserWarnings('guild_1', 'user_target');
      expect(cleared).toBe(1);

      active = await modRepo.getActiveWarnings('guild_1', 'user_target');
      expect(active).toHaveLength(0);
    });
  });

  describe('Staff Notes', () => {
    it('adds, lists, and deletes staff notes', async () => {
      const note1 = await modRepo.createNote({
        guildId: 'guild_1',
        targetUserId: 'user_suspect',
        authorUserId: 'mod_1',
        content: 'Suspicious alternate account activity observed',
      });

      const note2 = await modRepo.createNote({
        guildId: 'guild_1',
        targetUserId: 'user_suspect',
        authorUserId: 'mod_2',
        content: 'Confirmed alt of banned user',
      });

      const notes = await modRepo.getNotesByUser('guild_1', 'user_suspect');
      expect(notes).toHaveLength(2);

      const deleted = await modRepo.deleteNote(note1.id);
      expect(deleted).toBe(true);

      const remaining = await modRepo.getNotesByUser('guild_1', 'user_suspect');
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.id).toBe(note2.id);
    });
  });

  describe('AutoMod Rules', () => {
    it('upserts and retrieves rules', async () => {
      const rule1 = await modRepo.upsertRule({
        guildId: 'guild_1',
        ruleType: 'INVITE_SPAM',
        action: 'DELETE',
        threshold: 2,
        isEnabled: true,
        exemptRoles: ['role_admin'],
      });
      expect(rule1.ruleType).toBe('INVITE_SPAM');
      expect(rule1.action).toBe('DELETE');

      const fetched = await modRepo.getRuleByType('guild_1', 'INVITE_SPAM');
      expect(fetched).not.toBeNull();
      expect(fetched?.threshold).toBe(2);

      // Upsert update
      const updated = await modRepo.upsertRule({
        guildId: 'guild_1',
        ruleType: 'INVITE_SPAM',
        action: 'TIMEOUT',
        threshold: 3,
        isEnabled: true,
      });
      expect(updated.action).toBe('TIMEOUT');
      expect(updated.threshold).toBe(3);

      const allRules = await modRepo.getRules('guild_1');
      expect(allRules).toHaveLength(1);
    });
  });
});
