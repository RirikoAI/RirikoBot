import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { SqliteDatabaseClient } from '../client/types.js';
import { AutoRoleRepository } from './autorole.repository.js';
import { SQLITE_SCHEMA_DDL } from '../schema/sqlite/ddl.js';

describe('AutoRoleRepository (TASK-1401)', () => {
  let client: SqliteDatabaseClient;
  let autoRoleRepo: AutoRoleRepository;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    client.raw.exec(SQLITE_SCHEMA_DDL);
    autoRoleRepo = new AutoRoleRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  describe('Guild AutoRoles Configuration', () => {
    it('returns null when no auto-role config exists', async () => {
      const config = await autoRoleRepo.getGuildAutoRoles('nonexistent-guild');
      expect(config).toBeNull();
    });

    it('upserts and retrieves guild auto-roles', async () => {
      const created = await autoRoleRepo.upsertGuildAutoRoles({
        guildId: 'guild-1',
        humanRoleIds: ['role-member', 'role-verified'],
        botRoleIds: ['role-bot'],
        isEnabled: true,
      });

      expect(created.guildId).toBe('guild-1');
      expect(created.humanRoleIds).toEqual(['role-member', 'role-verified']);
      expect(created.botRoleIds).toEqual(['role-bot']);

      const found = await autoRoleRepo.getGuildAutoRoles('guild-1');
      expect(found).not.toBeNull();
      expect(found?.humanRoleIds).toEqual(['role-member', 'role-verified']);
      expect(found?.botRoleIds).toEqual(['role-bot']);
    });

    it('sets human and bot roles individually', async () => {
      await autoRoleRepo.setHumanRoleIds('guild-1', ['role-h1', 'role-h2']);
      let config = await autoRoleRepo.getGuildAutoRoles('guild-1');
      expect(config?.humanRoleIds).toEqual(['role-h1', 'role-h2']);

      await autoRoleRepo.setBotRoleIds('guild-1', ['role-b1']);
      config = await autoRoleRepo.getGuildAutoRoles('guild-1');
      expect(config?.botRoleIds).toEqual(['role-b1']);
    });

    it('sets verification role and channel configuration', async () => {
      await autoRoleRepo.setVerificationRole(
        'guild-1',
        'role-verified',
        'channel-rules',
        'msg-verify',
      );

      const config = await autoRoleRepo.getGuildAutoRoles('guild-1');
      expect(config?.verificationRoleId).toBe('role-verified');
      expect(config?.verificationChannelId).toBe('channel-rules');
      expect(config?.verificationMessageId).toBe('msg-verify');
    });
  });

  describe('Temporary Expiring Roles', () => {
    it('creates, finds and removes temporary roles', async () => {
      const futureDate = new Date(Date.now() + 3600_000);
      const tempRole = await autoRoleRepo.addTemporaryRole({
        guildId: 'guild-1',
        userId: 'user-1',
        roleId: 'role-temp-vip',
        expiresAt: futureDate,
        assignedBy: 'mod-1',
        reason: 'Event winner',
      });

      expect(tempRole.id).toBeDefined();
      expect(tempRole.guildId).toBe('guild-1');
      expect(tempRole.userId).toBe('user-1');
      expect(tempRole.roleId).toBe('role-temp-vip');

      const found = await autoRoleRepo.findTemporaryRole('guild-1', 'user-1', 'role-temp-vip');
      expect(found).not.toBeNull();
      expect(found?.id).toBe(tempRole.id);

      const userRoles = await autoRoleRepo.findTemporaryRolesByUser('guild-1', 'user-1');
      expect(userRoles).toHaveLength(1);

      const removed = await autoRoleRepo.removeTemporaryRole(tempRole.id);
      expect(removed).toBe(true);

      const notFound = await autoRoleRepo.findTemporaryRole('guild-1', 'user-1', 'role-temp-vip');
      expect(notFound).toBeNull();
    });

    it('finds expired temporary roles correctly', async () => {
      const pastDate = new Date(Date.now() - 60_000);
      const futureDate = new Date(Date.now() + 3600_000);

      await autoRoleRepo.addTemporaryRole({
        guildId: 'guild-1',
        userId: 'user-expired',
        roleId: 'role-expired',
        expiresAt: pastDate,
        assignedBy: 'mod-1',
      });

      await autoRoleRepo.addTemporaryRole({
        guildId: 'guild-1',
        userId: 'user-active',
        roleId: 'role-active',
        expiresAt: futureDate,
        assignedBy: 'mod-1',
      });

      const expired = await autoRoleRepo.findExpiredTemporaryRoles(new Date());
      expect(expired).toHaveLength(1);
      expect(expired[0]?.userId).toBe('user-expired');
    });
  });
});
