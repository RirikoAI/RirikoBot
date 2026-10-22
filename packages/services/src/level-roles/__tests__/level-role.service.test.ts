import { PermissionFlagsBits } from 'discord.js';
import type { Guild, GuildMember } from 'discord.js';
import type { LevelRoleSettings } from '@ririko/database';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { LevelRoleService, rolesForLevel } from '../level-role.service.js';
import type { LevelRoleReward } from '../types.js';

const GUILD_ID = 'g1';
const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);

const REWARDS: LevelRoleReward[] = [
  { level: 5, roleId: 'r5' },
  { level: 10, roleId: 'r10' },
  { level: 20, roleId: 'r20' },
];

describe('rolesForLevel', () => {
  it('keeps every reward at or below the level when previous roles are kept', () => {
    expect(rolesForLevel(REWARDS, 10, true)).toEqual({ keep: ['r5', 'r10'], remove: [] });
    expect(rolesForLevel(REWARDS, 25, true)).toEqual({ keep: ['r5', 'r10', 'r20'], remove: [] });
  });

  it('keeps only the highest reward and removes every other reward role otherwise', () => {
    expect(rolesForLevel(REWARDS, 12, false)).toEqual({ keep: ['r10'], remove: ['r5', 'r20'] });
    expect(rolesForLevel(REWARDS, 20, false)).toEqual({ keep: ['r20'], remove: ['r5', 'r10'] });
  });

  it('gives the same result for a gap between levels (level 7 holds the level 5 reward)', () => {
    expect(rolesForLevel(REWARDS, 7, true).keep).toEqual(['r5']);
    expect(rolesForLevel(REWARDS, 7, false)).toEqual({ keep: ['r5'], remove: ['r10', 'r20'] });
  });

  it('gives the rewards of every level skipped by a multi-level jump', () => {
    // A jump from level 4 to level 21 crosses all three rewards.
    expect(rolesForLevel(REWARDS, 21, true).keep).toEqual(['r5', 'r10', 'r20']);
    expect(rolesForLevel(REWARDS, 21, false)).toEqual({ keep: ['r20'], remove: ['r5', 'r10'] });
  });

  it('gives empty lists for level 0, a level below every reward and no rewards', () => {
    const empty = { keep: [], remove: [] };
    expect(rolesForLevel(REWARDS, 0, true)).toEqual(empty);
    expect(rolesForLevel(REWARDS, 0, false)).toEqual(empty);
    expect(rolesForLevel(REWARDS, 4, false)).toEqual(empty);
    expect(rolesForLevel([], 50, true)).toEqual(empty);
    expect(rolesForLevel([], 50, false)).toEqual(empty);
  });

  it('works for rewards in any order and does not change the input', () => {
    const shuffled: LevelRoleReward[] = [REWARDS[2]!, REWARDS[0]!, REWARDS[1]!];
    const copy = shuffled.map((reward) => ({ ...reward }));
    expect(rolesForLevel(shuffled, 10, true).keep).toEqual(['r5', 'r10']);
    expect(rolesForLevel(shuffled, 10, false)).toEqual({ keep: ['r10'], remove: ['r20', 'r5'] });
    expect(shuffled).toEqual(copy);
  });

  it('lists a role once even when two rewards share it', () => {
    const shared: LevelRoleReward[] = [
      { level: 1, roleId: 'a' },
      { level: 2, roleId: 'a' },
      { level: 3, roleId: 'b' },
    ];
    expect(rolesForLevel(shared, 3, true).keep).toEqual(['a', 'b']);
    expect(rolesForLevel(shared, 2, false)).toEqual({ keep: ['a'], remove: ['b'] });
  });
});

interface FakeRole {
  id: string;
  position: number;
  managed: boolean;
}

interface Setup {
  roles?: FakeRole[];
  botPosition?: number;
  botCanManage?: boolean;
  botInCache?: boolean;
  viaCache?: boolean;
}

function makeGuild(setup: Setup = {}) {
  const roles: FakeRole[] = setup.roles ?? [
    { id: 'r5', position: 1, managed: false },
    { id: 'r10', position: 2, managed: false },
    { id: 'r20', position: 3, managed: false },
    { id: 'plain', position: 1, managed: false },
  ];
  const me = {
    permissions: {
      has: (flag: bigint) =>
        flag === PermissionFlagsBits.ManageRoles && setup.botCanManage !== false,
    },
    roles: { highest: { position: setup.botPosition ?? 10 } },
  };
  const botInCache = setup.botInCache !== false;
  return {
    id: GUILD_ID,
    client: { user: { id: 'bot' } },
    roles: { cache: new Map(roles.map((role) => [role.id, role])) },
    members: {
      me: botInCache && !setup.viaCache ? me : null,
      cache: new Map(botInCache && setup.viaCache ? [['bot', me]] : []),
      fetch: vi.fn<(options: { user: string[] }) => Promise<Map<string, unknown>>>(),
    },
  };
}

type FakeGuild = ReturnType<typeof makeGuild>;

function makeMember(guild: FakeGuild, held: string[] = [], id = 'u1') {
  const member = {
    id,
    guild,
    roles: {
      cache: new Set(held),
      add: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
  };
  return member;
}

function asMember(member: object): GuildMember {
  return member as unknown as GuildMember;
}

function asGuild(guild: object): Guild {
  return guild as unknown as Guild;
}

function row(overrides: Partial<LevelRoleSettings> = {}): LevelRoleSettings {
  return {
    guildId: GUILD_ID,
    rewards: REWARDS,
    keepPreviousRoles: true,
    updatedAt: new Date(NOW),
    ...overrides,
  };
}

describe('LevelRoleService', () => {
  let clock: number;
  let settings: { get: Mock<(guildId: string) => Promise<LevelRoleSettings | null>> };
  let xp: { listMembersAtLevel: Mock<(guildId: string, minLevel: number) => Promise<unknown[]>> };
  let service: LevelRoleService;
  let errors: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clock = NOW;
    settings = { get: vi.fn(async () => row()) };
    xp = { listMembersAtLevel: vi.fn(async () => []) };
    service = new LevelRoleService({
      settings,
      xp: xp as never,
      cacheTtlMs: 1000,
      now: () => clock,
    });
    errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('applyForMember', () => {
    it('adds the missing reward roles with the audit log reason', async () => {
      const guild = makeGuild();
      const member = makeMember(guild, ['r5']);
      const result = await service.applyForMember(asMember(member), 20);

      expect(result).toEqual({ added: ['r10', 'r20'], removed: [], skipped: [] });
      expect(member.roles.add).toHaveBeenCalledTimes(1);
      expect(member.roles.add).toHaveBeenCalledWith(['r10', 'r20'], 'Level 20 reward');
      expect(member.roles.remove).not.toHaveBeenCalled();
    });

    it('finds Ririko in the member cache when guild.members.me is empty', async () => {
      const guild = makeGuild({ viaCache: true });
      const member = makeMember(guild);
      const result = await service.applyForMember(asMember(member), 5);
      expect(result.added).toEqual(['r5']);
    });

    it('makes no call when the member already holds every role', async () => {
      const guild = makeGuild();
      const member = makeMember(guild, ['r5', 'r10']);
      const result = await service.applyForMember(asMember(member), 10);
      expect(result).toEqual({ added: [], removed: [], skipped: [] });
      expect(member.roles.add).not.toHaveBeenCalled();
      expect(member.roles.remove).not.toHaveBeenCalled();
    });

    it('removes the other reward roles the member holds when lower roles are not kept', async () => {
      settings.get.mockResolvedValue(row({ keepPreviousRoles: false }));
      const guild = makeGuild();
      const member = makeMember(guild, ['r5', 'plain']);
      const result = await service.applyForMember(asMember(member), 10);

      expect(result).toEqual({ added: ['r10'], removed: ['r5'], skipped: [] });
      expect(member.roles.add).toHaveBeenCalledWith(['r10'], 'Level 10 reward');
      expect(member.roles.remove).toHaveBeenCalledWith(['r5'], 'Level 10 reward');
    });

    it('never removes a role that is not a reward and ignores reward roles the member lacks', async () => {
      settings.get.mockResolvedValue(row({ keepPreviousRoles: false }));
      const guild = makeGuild();
      const member = makeMember(guild, ['plain', 'r10']);
      const result = await service.applyForMember(asMember(member), 10);

      expect(result).toEqual({ added: [], removed: [], skipped: [] });
      expect(member.roles.remove).not.toHaveBeenCalled();
    });

    it('does nothing at level 0, below every reward and with no rewards', async () => {
      const guild = makeGuild();
      const member = makeMember(guild);
      expect(await service.applyForMember(asMember(member), 0)).toEqual({
        added: [],
        removed: [],
        skipped: [],
      });
      expect(await service.applyForMember(asMember(member), 4)).toEqual({
        added: [],
        removed: [],
        skipped: [],
      });
      settings.get.mockResolvedValue(row({ rewards: [] }));
      service.invalidate();
      expect(await service.applyForMember(asMember(member), 30)).toEqual({
        added: [],
        removed: [],
        skipped: [],
      });
      expect(member.roles.add).not.toHaveBeenCalled();
    });

    it('does nothing when the server has no settings row', async () => {
      settings.get.mockResolvedValue(null);
      const guild = makeGuild();
      const member = makeMember(guild);
      const result = await service.applyForMember(asMember(member), 30);
      expect(result.added).toEqual([]);
      expect(member.roles.add).not.toHaveBeenCalled();
    });

    it('does nothing when Ririko lacks Manage Roles', async () => {
      const guild = makeGuild({ botCanManage: false });
      const member = makeMember(guild);
      const result = await service.applyForMember(asMember(member), 20);
      expect(result).toEqual({ added: [], removed: [], skipped: [] });
      expect(member.roles.add).not.toHaveBeenCalled();
    });

    it('does nothing when Ririko is not in the member cache', async () => {
      const guild = makeGuild({ botInCache: false });
      const member = makeMember(guild);
      const result = await service.applyForMember(asMember(member), 20);
      expect(result.added).toEqual([]);
      expect(member.roles.add).not.toHaveBeenCalled();
    });

    it('skips a role that no longer exists', async () => {
      const guild = makeGuild({
        roles: [
          { id: 'r5', position: 1, managed: false },
          { id: 'r20', position: 3, managed: false },
        ],
      });
      const member = makeMember(guild);
      const result = await service.applyForMember(asMember(member), 20);
      expect(result.added).toEqual(['r5', 'r20']);
      expect(result.skipped).toEqual([{ roleId: 'r10', reason: 'missing' }]);
    });

    it('skips @everyone', async () => {
      settings.get.mockResolvedValue(row({ rewards: [{ level: 1, roleId: GUILD_ID }] }));
      const guild = makeGuild({ roles: [{ id: GUILD_ID, position: 0, managed: false }] });
      const member = makeMember(guild);
      const result = await service.applyForMember(asMember(member), 1);
      expect(result.added).toEqual([]);
      expect(result.skipped).toEqual([{ roleId: GUILD_ID, reason: 'everyone' }]);
      expect(member.roles.add).not.toHaveBeenCalled();
    });

    it('skips a managed role', async () => {
      const guild = makeGuild({
        roles: [
          { id: 'r5', position: 1, managed: true },
          { id: 'r10', position: 2, managed: false },
        ],
      });
      const member = makeMember(guild);
      const result = await service.applyForMember(asMember(member), 10);
      expect(result.added).toEqual(['r10']);
      expect(result.skipped).toEqual([{ roleId: 'r5', reason: 'managed' }]);
    });

    it("skips a role at or above Ririko's highest role", async () => {
      const guild = makeGuild({ botPosition: 3 });
      const member = makeMember(guild);
      const result = await service.applyForMember(asMember(member), 20);
      // r20 is at position 3, the same as Ririko's highest role.
      expect(result.added).toEqual(['r5', 'r10']);
      expect(result.skipped).toEqual([{ roleId: 'r20', reason: 'hierarchy' }]);
    });

    it('skips a reward role it cannot remove because it sits above Ririko', async () => {
      settings.get.mockResolvedValue(row({ keepPreviousRoles: false }));
      const guild = makeGuild({ botPosition: 3 });
      const member = makeMember(guild, ['r20']);
      const result = await service.applyForMember(asMember(member), 5);
      expect(result.added).toEqual(['r5']);
      expect(result.removed).toEqual([]);
      expect(result.skipped).toEqual([{ roleId: 'r20', reason: 'hierarchy' }]);
      expect(member.roles.remove).not.toHaveBeenCalled();
    });

    it('logs a failed add with the guild and role IDs, returns normally and still removes', async () => {
      settings.get.mockResolvedValue(row({ keepPreviousRoles: false }));
      const guild = makeGuild();
      const member = makeMember(guild, ['r5']);
      member.roles.add.mockRejectedValue(new Error('Missing Permissions'));
      const result = await service.applyForMember(asMember(member), 10);

      expect(result).toEqual({ added: [], removed: ['r5'], skipped: [] });
      expect(errors).toHaveBeenCalledTimes(1);
      const message = String(errors.mock.calls[0]?.[0]);
      expect(message).toContain('add roles r10');
      expect(message).toContain('guild g1');
      expect(errors.mock.calls[0]?.[1]).toBe('Missing Permissions');
    });

    it('logs a failed remove and does not report the role as removed', async () => {
      settings.get.mockResolvedValue(row({ keepPreviousRoles: false }));
      const guild = makeGuild();
      const member = makeMember(guild, ['r5']);
      member.roles.remove.mockRejectedValue('boom');
      const result = await service.applyForMember(asMember(member), 10);

      expect(result).toEqual({ added: ['r10'], removed: [], skipped: [] });
      expect(String(errors.mock.calls[0]?.[0])).toContain('remove roles r5');
      expect(errors.mock.calls[0]?.[1]).toBe('boom');
    });

    it('never throws on an unexpected error', async () => {
      const guild = makeGuild();
      const member = makeMember(guild);
      Object.defineProperty(member.roles, 'cache', {
        get() {
          throw new Error('cache gone');
        },
      });
      await expect(service.applyForMember(asMember(member), 20)).resolves.toEqual({
        added: [],
        removed: [],
        skipped: [],
      });
      expect(errors).toHaveBeenCalledTimes(1);
      expect(errors.mock.calls[0]?.[1]).toBe('cache gone');
    });
  });

  describe('settings cache', () => {
    it('reads the settings once inside the TTL and again after it', async () => {
      const guild = makeGuild();
      const member = makeMember(guild);
      await service.applyForMember(asMember(member), 5);
      await service.applyForMember(asMember(member), 5);
      expect(settings.get).toHaveBeenCalledTimes(1);

      clock += 999;
      await service.applyForMember(asMember(member), 5);
      expect(settings.get).toHaveBeenCalledTimes(1);

      clock += 1;
      await service.applyForMember(asMember(member), 5);
      expect(settings.get).toHaveBeenCalledTimes(2);
    });

    it('uses the default TTL of 5 minutes', async () => {
      const plain = new LevelRoleService({ settings, xp: xp as never, now: () => clock });
      const guild = makeGuild();
      const member = makeMember(guild);
      await plain.applyForMember(asMember(member), 5);
      clock += 5 * 60 * 1000 - 1;
      await plain.applyForMember(asMember(member), 5);
      expect(settings.get).toHaveBeenCalledTimes(1);
      clock += 1;
      await plain.applyForMember(asMember(member), 5);
      expect(settings.get).toHaveBeenCalledTimes(2);
    });

    it('works with the real clock when none is given', async () => {
      const real = new LevelRoleService({ settings, xp: xp as never });
      const guild = makeGuild();
      await real.applyForMember(asMember(makeMember(guild)), 5);
      await real.applyForMember(asMember(makeMember(guild)), 5);
      expect(settings.get).toHaveBeenCalledTimes(1);
    });

    it('caches a server without settings too', async () => {
      settings.get.mockResolvedValue(null);
      const guild = makeGuild();
      const member = makeMember(guild);
      await service.applyForMember(asMember(member), 5);
      await service.applyForMember(asMember(member), 5);
      expect(settings.get).toHaveBeenCalledTimes(1);
    });

    it('invalidate(guildId) drops one server and invalidate() drops all', async () => {
      const guild = makeGuild();
      const member = makeMember(guild);
      await service.applyForMember(asMember(member), 5);
      service.invalidate('other');
      await service.applyForMember(asMember(member), 5);
      expect(settings.get).toHaveBeenCalledTimes(1);

      settings.get.mockResolvedValue(row({ rewards: [] }));
      service.invalidate(GUILD_ID);
      const result = await service.applyForMember(asMember(member), 20);
      expect(settings.get).toHaveBeenCalledTimes(2);
      expect(result.added).toEqual([]);

      service.invalidate();
      await service.applyForMember(asMember(member), 20);
      expect(settings.get).toHaveBeenCalledTimes(3);
    });

    it('logs a failed read, does nothing and reads again next time', async () => {
      settings.get.mockRejectedValueOnce(new Error('db down'));
      const guild = makeGuild();
      const member = makeMember(guild);
      const first = await service.applyForMember(asMember(member), 20);
      expect(first.added).toEqual([]);
      expect(String(errors.mock.calls[0]?.[0])).toContain('guild g1');
      expect(errors.mock.calls[0]?.[1]).toBe('db down');

      const second = await service.applyForMember(asMember(member), 20);
      expect(second.added).toEqual(['r5', 'r10', 'r20']);
    });
  });

  describe('syncGuild', () => {
    function accounts(count: number, level = 5, prefix = 'u'): { userId: string; level: number }[] {
      return Array.from({ length: count }, (_, i) => ({ userId: `${prefix}${i}`, level }));
    }

    it('returns zeros for a server without rewards', async () => {
      settings.get.mockResolvedValue(row({ rewards: [] }));
      const guild = makeGuild();
      const result = await service.syncGuild(asGuild(guild));
      expect(result).toEqual({ busy: false, checked: 0, added: 0, removed: 0 });
      expect(xp.listMembersAtLevel).not.toHaveBeenCalled();
    });

    it('returns zeros without reading members when Ririko lacks Manage Roles', async () => {
      const guild = makeGuild({ botCanManage: false });
      const result = await service.syncGuild(asGuild(guild));
      expect(result).toEqual({ busy: false, checked: 0, added: 0, removed: 0 });
      expect(xp.listMembersAtLevel).not.toHaveBeenCalled();
    });

    it("reads accounts from the lowest reward level and applies each member's own level", async () => {
      xp.listMembersAtLevel.mockResolvedValue([
        { userId: 'a', level: 20 },
        { userId: 'b', level: 5 },
      ]);
      const guild = makeGuild();
      const a = makeMember(guild, [], 'a');
      const b = makeMember(guild, ['r5'], 'b');
      guild.members.fetch.mockResolvedValue(
        new Map([
          ['a', a],
          ['b', b],
        ]),
      );

      const result = await service.syncGuild(asGuild(guild));

      expect(xp.listMembersAtLevel).toHaveBeenCalledWith(GUILD_ID, 5);
      expect(a.roles.add).toHaveBeenCalledWith(['r5', 'r10', 'r20'], 'Level 20 reward');
      expect(b.roles.add).not.toHaveBeenCalled();
      expect(result).toEqual({ busy: false, checked: 2, added: 3, removed: 0 });
    });

    it('counts removed roles when lower roles are not kept', async () => {
      settings.get.mockResolvedValue(row({ keepPreviousRoles: false }));
      xp.listMembersAtLevel.mockResolvedValue([{ userId: 'a', level: 10 }]);
      const guild = makeGuild();
      const a = makeMember(guild, ['r5'], 'a');
      guild.members.fetch.mockResolvedValue(new Map([['a', a]]));
      const result = await service.syncGuild(asGuild(guild));
      expect(result).toEqual({ busy: false, checked: 1, added: 1, removed: 1 });
    });

    it('fetches members in batches of 100 and applies them in order', async () => {
      const all = accounts(250);
      xp.listMembersAtLevel.mockResolvedValue(all);
      const guild = makeGuild();
      const order: string[] = [];
      guild.members.fetch.mockImplementation(async ({ user }: { user: string[] }) => {
        const map = new Map<string, ReturnType<typeof makeMember>>();
        for (const id of user) {
          const member = makeMember(guild, [], id);
          member.roles.add.mockImplementation(async () => {
            order.push(id);
          });
          map.set(id, member);
        }
        return map;
      });

      const result = await service.syncGuild(asGuild(guild));

      const sizes = guild.members.fetch.mock.calls.map((call) => call[0].user.length);
      expect(sizes).toEqual([100, 100, 50]);
      expect(guild.members.fetch.mock.calls[0]?.[0].user[0]).toBe('u0');
      expect(guild.members.fetch.mock.calls[2]?.[0].user[49]).toBe('u249');
      expect(order).toEqual(all.map((account) => account.userId));
      expect(result).toEqual({ busy: false, checked: 250, added: 250, removed: 0 });
    });

    it('applies one member at a time', async () => {
      xp.listMembersAtLevel.mockResolvedValue(accounts(3));
      const guild = makeGuild();
      let running = 0;
      let peak = 0;
      guild.members.fetch.mockImplementation(async ({ user }: { user: string[] }) => {
        const map = new Map<string, ReturnType<typeof makeMember>>();
        for (const id of user) {
          const member = makeMember(guild, [], id);
          member.roles.add.mockImplementation(async () => {
            running += 1;
            peak = Math.max(peak, running);
            await Promise.resolve();
            running -= 1;
          });
          map.set(id, member);
        }
        return map;
      });
      await service.syncGuild(asGuild(guild));
      expect(peak).toBe(1);
    });

    it('skips users who left the server and does not count them', async () => {
      xp.listMembersAtLevel.mockResolvedValue(accounts(3));
      const guild = makeGuild();
      const u0 = makeMember(guild, [], 'u0');
      const u2 = makeMember(guild, [], 'u2');
      guild.members.fetch.mockResolvedValue(
        new Map([
          ['u0', u0],
          ['u2', u2],
        ]),
      );
      const result = await service.syncGuild(asGuild(guild));
      expect(result).toEqual({ busy: false, checked: 2, added: 2, removed: 0 });
      expect(u0.roles.add).toHaveBeenCalledWith(['r5'], 'Level 5 reward');
    });

    it('logs a failed batch fetch and goes on with the next batch', async () => {
      xp.listMembersAtLevel.mockResolvedValue(accounts(150));
      const guild = makeGuild();
      guild.members.fetch
        .mockRejectedValueOnce(new Error('timeout'))
        .mockImplementationOnce(async ({ user }: { user: string[] }) => {
          return new Map(user.map((id) => [id, makeMember(guild, [], id)]));
        });
      const result = await service.syncGuild(asGuild(guild));
      expect(result).toEqual({ busy: false, checked: 50, added: 50, removed: 0 });
      expect(String(errors.mock.calls[0]?.[0])).toContain('guild g1');
      expect(errors.mock.calls[0]?.[1]).toBe('timeout');
    });

    it('returns what it has when the account read fails, and frees the server', async () => {
      xp.listMembersAtLevel.mockRejectedValueOnce(new Error('db down'));
      const guild = makeGuild();
      const result = await service.syncGuild(asGuild(guild));
      expect(result).toEqual({ busy: false, checked: 0, added: 0, removed: 0 });
      expect(errors.mock.calls[0]?.[1]).toBe('db down');

      xp.listMembersAtLevel.mockResolvedValue([]);
      const again = await service.syncGuild(asGuild(guild));
      expect(again.busy).toBe(false);
    });

    it('runs one sync per server at a time and reports busy for a second call', async () => {
      xp.listMembersAtLevel.mockResolvedValue(accounts(1));
      const guild = makeGuild();
      const other = { ...makeGuild(), id: 'g2' };
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      guild.members.fetch.mockImplementation(async ({ user }: { user: string[] }) => {
        await gate;
        return new Map(user.map((id) => [id, makeMember(guild, [], id)]));
      });
      other.members.fetch.mockResolvedValue(new Map());

      const first = service.syncGuild(asGuild(guild));
      await vi.waitFor(() => expect(guild.members.fetch).toHaveBeenCalled());
      const second = await service.syncGuild(asGuild(guild));
      expect(second).toEqual({ busy: true, checked: 0, added: 0, removed: 0 });

      // A different server is not blocked.
      xp.listMembersAtLevel.mockResolvedValueOnce([]);
      const otherResult = await service.syncGuild(asGuild(other));
      expect(otherResult.busy).toBe(false);

      release();
      const done = await first;
      expect(done).toEqual({ busy: false, checked: 1, added: 1, removed: 0 });

      // Once finished, the server can be synced again.
      const third = await service.syncGuild(asGuild(guild));
      expect(third.busy).toBe(false);
    });
  });
});
