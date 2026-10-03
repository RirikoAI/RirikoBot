import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { describeDialects } from '../testing/dialects.js';
import { AutoRoleRepository } from './autorole.repository.js';

const NOW = new Date('2026-10-01T12:00:00Z');
const HOUR = 3_600_000;
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR);

const temp = (guildId: string, userId: string, roleId: string, hours: number) => ({
  guildId,
  userId,
  roleId,
  expiresAt: at(hours),
  assignedBy: 'mod',
});

describeDialects('AutoRoleRepository behaviour', (db) => {
  it('creates a guild config with defaults and reads it back', async () => {
    const repo = new AutoRoleRepository(db.client);
    expect(await repo.getGuildAutoRoles('g1')).toBeNull();
    expect(await repo.findById('g1')).toBeNull();
    expect(await repo.exists('g1')).toBe(false);
    expect(await repo.count()).toBe(0);

    const created = await repo.create({ guildId: 'g1' });
    expect(created.humanRoleIds).toEqual([]);
    expect(created.botRoleIds).toEqual([]);
    expect(created.verificationRoleId).toBeNull();
    expect(created.isEnabled).toBe(true);
    expect(created.updatedAt).toBeInstanceOf(Date);

    expect((await repo.findById('g1'))?.guildId).toBe('g1');
    expect(await repo.exists('g1')).toBe(true);
    expect(await repo.count()).toBe(1);
  });

  it('sets human and bot roles independently, keeping the rest', async () => {
    const repo = new AutoRoleRepository(db.client);

    const humans = await repo.setHumanRoleIds('g1', ['r1', 'r2']);
    expect(humans.humanRoleIds).toEqual(['r1', 'r2']);
    expect(humans.botRoleIds).toEqual([]);

    const bots = await repo.setBotRoleIds('g1', ['bot-role']);
    expect(bots.botRoleIds).toEqual(['bot-role']);
    expect(bots.humanRoleIds).toEqual(['r1', 'r2']);
    expect(await repo.count()).toBe(1);
  });

  it('sets and clears the verification role', async () => {
    const repo = new AutoRoleRepository(db.client);

    const set = await repo.setVerificationRole('g1', 'verified', 'channel', 'message');
    expect(set.verificationRoleId).toBe('verified');
    expect(set.verificationChannelId).toBe('channel');
    expect(set.verificationMessageId).toBe('message');

    const cleared = await repo.setVerificationRole('g1', null, null, null);
    expect(cleared.verificationRoleId).toBeNull();
    expect(cleared.verificationChannelId).toBeNull();
    expect(cleared.verificationMessageId).toBeNull();

    const roleOnly = await repo.setVerificationRole('g1', 'again');
    expect(roleOnly.verificationRoleId).toBe('again');
  });

  it('updates a config through the generic update', async () => {
    const repo = new AutoRoleRepository(db.client);
    await repo.create({ guildId: 'g1', humanRoleIds: ['r1'] });

    const updated = await repo.update('g1', { isEnabled: false });
    expect(updated.isEnabled).toBe(false);
    expect(updated.humanRoleIds).toEqual(['r1']);
  });

  it('deletes a config once', async () => {
    const repo = new AutoRoleRepository(db.client);
    await repo.create({ guildId: 'g1' });

    expect(await repo.delete('g1')).toBe(true);
    expect(await repo.delete('g1')).toBe(false);
    expect(await repo.count()).toBe(0);
  });

  it('records a temporary role and finds it by guild, user and role', async () => {
    const repo = new AutoRoleRepository(db.client);
    expect(await repo.findTemporaryRole('g1', 'u1', 'r1')).toBeNull();

    const created = await repo.addTemporaryRole({ ...temp('g1', 'u1', 'r1', 5), reason: 'Event' });
    expect(created.reason).toBe('Event');
    expect(created.expiresAt.getTime()).toBe(at(5).getTime());
    const explicit = randomUUID();
    const withId = await repo.addTemporaryRole({ id: explicit, ...temp('g1', 'u1', 'r2', 6) });
    expect(withId.id).toBe(explicit);
    expect(withId.reason).toBeNull();
    await repo.addTemporaryRole(temp('g1', 'u2', 'r1', 7));
    await repo.addTemporaryRole(temp('g2', 'u1', 'r1', 8));

    expect((await repo.findTemporaryRole('g1', 'u1', 'r1'))?.id).toBe(created.id);
    expect(await repo.findTemporaryRole('g1', 'u1', 'r9')).toBeNull();
    expect((await repo.findTemporaryRolesByUser('g1', 'u1')).map((r) => r.roleId).sort()).toEqual([
      'r1',
      'r2',
    ]);
    expect(await repo.findTemporaryRolesByUser('g1', 'nobody')).toEqual([]);
    expect(await repo.listTemporaryRoles('g1')).toHaveLength(3);
    expect(await repo.listTemporaryRoles('g3')).toEqual([]);
  });

  it('finds the temporary roles that expired before a moment, and removes one', async () => {
    const repo = new AutoRoleRepository(db.client);
    const soon = await repo.addTemporaryRole(temp('g1', 'u1', 'r1', 1));
    const exact = await repo.addTemporaryRole(temp('g1', 'u2', 'r1', 2));
    await repo.addTemporaryRole(temp('g1', 'u3', 'r1', 9));

    expect((await repo.findExpiredTemporaryRoles(at(2))).map((r) => r.id).sort()).toEqual(
      [soon.id, exact.id].sort(),
    );
    expect(await repo.findExpiredTemporaryRoles(at(0))).toEqual([]);
    expect(Array.isArray(await repo.findExpiredTemporaryRoles())).toBe(true);

    expect(await repo.removeTemporaryRole(soon.id)).toBe(true);
    expect(await repo.removeTemporaryRole(soon.id)).toBe(false);
    expect(await repo.listTemporaryRoles('g1')).toHaveLength(2);
  });
});
