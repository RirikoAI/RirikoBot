import { expect, it } from 'vitest';
import { describeDialects } from '../testing/dialects.js';
import { GuildRepository, type GuildRegistration } from './guild.repository.js';

const at = (day: number) => new Date(Date.UTC(2026, 9, day, 12, 0, 0));

const guild = (id: string, overrides: Partial<GuildRegistration> = {}): GuildRegistration => ({
  id,
  name: `Server ${id}`,
  iconUrl: null,
  ownerId: '100000000000000001',
  joinedAt: at(1),
  ...overrides,
});

describeDialects('GuildRepository behaviour', (db) => {
  it('records a server as active and lists it', async () => {
    const repo = new GuildRepository(db.client);
    expect(await repo.listAll()).toEqual([]);
    expect(await repo.findById('g1')).toBeNull();

    await repo.upsert(guild('g1', { iconUrl: 'https://cdn.example/icon.png' }));

    const row = await repo.findById('g1');
    expect(row).toMatchObject({
      id: 'g1',
      name: 'Server g1',
      iconUrl: 'https://cdn.example/icon.png',
      ownerId: '100000000000000001',
      invitedById: null,
      invitedVia: null,
      joinedAt: at(1),
      isActive: true,
    });
    expect(await repo.listAll()).toHaveLength(1);
  });

  it('refreshes name, icon and owner but keeps the join time and the inviter', async () => {
    const repo = new GuildRepository(db.client);
    await repo.upsert(guild('g1'));
    await repo.setInviterIfMissing('g1', 'u1', 'audit_log');

    await repo.upsert(
      guild('g1', {
        name: 'Renamed',
        iconUrl: 'https://cdn.example/new.png',
        ownerId: '100000000000000002',
        joinedAt: at(9),
      }),
    );

    expect(await repo.findById('g1')).toMatchObject({
      name: 'Renamed',
      iconUrl: 'https://cdn.example/new.png',
      ownerId: '100000000000000002',
      invitedById: 'u1',
      invitedVia: 'audit_log',
      joinedAt: at(1),
      isActive: true,
    });
  });

  it('starts over when a server the bot left adds it again', async () => {
    const repo = new GuildRepository(db.client);
    await repo.upsert(guild('g1'));
    await repo.setInviterIfMissing('g1', 'u1', 'audit_log');
    await repo.markInactive(['g1']);

    await repo.upsert(guild('g1', { joinedAt: at(20) }));

    expect(await repo.findById('g1')).toMatchObject({
      isActive: true,
      joinedAt: at(20),
      invitedById: null,
      invitedVia: null,
    });
  });

  it('sets the inviter only while it is unknown', async () => {
    const repo = new GuildRepository(db.client);
    await repo.upsert(guild('g1'));

    expect(await repo.setInviterIfMissing('g1', 'u1', 'audit_log')).toBe(true);
    expect(await repo.setInviterIfMissing('g1', 'u2', 'integration')).toBe(false);
    expect(await repo.setInviterIfMissing('nowhere', 'u2', 'audit_log')).toBe(false);

    expect(await repo.findById('g1')).toMatchObject({ invitedById: 'u1', invitedVia: 'audit_log' });
  });

  it('records an invite from the dashboard as an active server with an oauth inviter', async () => {
    const repo = new GuildRepository(db.client);

    await repo.recordInvite(guild('g1', { joinedAt: at(3) }), 'u1');

    expect(await repo.findById('g1')).toMatchObject({
      id: 'g1',
      isActive: true,
      joinedAt: at(3),
      invitedById: 'u1',
      invitedVia: 'oauth',
    });
  });

  it('lets the invite flow replace an inviter the bot found earlier', async () => {
    const repo = new GuildRepository(db.client);
    await repo.upsert(guild('g1'));
    await repo.setInviterIfMissing('g1', 'u-audit', 'audit_log');

    await repo.recordInvite(guild('g1'), 'u-oauth');

    expect(await repo.findById('g1')).toMatchObject({
      invitedById: 'u-oauth',
      invitedVia: 'oauth',
      joinedAt: at(1),
    });
  });

  it('keeps the oauth inviter when the bot records the server afterwards, and vice versa', async () => {
    const repo = new GuildRepository(db.client);
    await repo.recordInvite(guild('g1'), 'u1');
    await repo.upsert(guild('g1', { name: 'Renamed' }));
    expect(await repo.setInviterIfMissing('g1', 'u2', 'integration')).toBe(false);
    expect(await repo.findById('g1')).toMatchObject({
      name: 'Renamed',
      invitedById: 'u1',
      invitedVia: 'oauth',
    });

    await repo.upsert(guild('g2'));
    await repo.setInviterIfMissing('g2', 'u3', 'integration');
    await repo.recordInvite(guild('g2'), 'u4');
    expect(await repo.findById('g2')).toMatchObject({ invitedById: 'u4', invitedVia: 'oauth' });
  });

  it('starts a server the bot left over when the invite flow records it again', async () => {
    const repo = new GuildRepository(db.client);
    await repo.upsert(guild('g1'));
    await repo.setInviterIfMissing('g1', 'u1', 'audit_log');
    await repo.markInactive(['g1']);

    await repo.recordInvite(guild('g1', { joinedAt: at(7) }), 'u2');

    expect(await repo.findById('g1')).toMatchObject({
      isActive: true,
      joinedAt: at(7),
      invitedById: 'u2',
      invitedVia: 'oauth',
    });
  });

  it('marks servers inactive and keeps their rows', async () => {
    const repo = new GuildRepository(db.client);
    await repo.upsert(guild('g1'));
    await repo.upsert(guild('g2'));
    await repo.markInactive([]);

    await repo.markInactive(['g1', 'unknown']);

    expect((await repo.findById('g1'))?.isActive).toBe(false);
    expect((await repo.findById('g2'))?.isActive).toBe(true);
    expect(await repo.listAll()).toHaveLength(2);
  });

  it('marks every active server missing from the list inactive', async () => {
    const repo = new GuildRepository(db.client);
    await repo.upsert(guild('g1'));
    await repo.upsert(guild('g2'));
    await repo.upsert(guild('g3'));
    await repo.markInactive(['g3']);

    expect(await repo.markInactiveExcept(['g1', 'unknown'])).toEqual(['g2']);

    expect((await repo.findById('g1'))?.isActive).toBe(true);
    expect((await repo.findById('g2'))?.isActive).toBe(false);
    expect((await repo.findById('g3'))?.isActive).toBe(false);
    expect(await repo.markInactiveExcept([])).toEqual(['g1']);
    expect(await repo.markInactiveExcept([])).toEqual([]);
  });

  it('lists the active servers that have no inviter', async () => {
    const repo = new GuildRepository(db.client);
    await repo.upsert(guild('g1'));
    await repo.upsert(guild('g2'));
    await repo.upsert(guild('g3'));
    await repo.setInviterIfMissing('g1', 'u1', 'audit_log');
    await repo.markInactive(['g3']);

    expect(await repo.listActiveIdsWithoutInviter()).toEqual(['g2']);
  });

  it('lists the newest join first', async () => {
    const repo = new GuildRepository(db.client);
    await repo.upsert(guild('old', { joinedAt: at(1) }));
    await repo.upsert(guild('new', { joinedAt: at(5) }));

    expect((await repo.listAll()).map((row) => row.id)).toEqual(['new', 'old']);
  });
});
