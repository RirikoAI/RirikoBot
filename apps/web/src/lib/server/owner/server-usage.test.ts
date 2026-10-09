import { describe, expect, it, vi } from 'vitest';
import type { Guild } from '@ririko/database';
import { loadServerUsage, summarizeServers } from './server-usage';

vi.mock('server-only', () => ({}));

const NOW = Date.UTC(2026, 9, 9, 12, 0, 0);
const OWNER = '300000000000000001';
const INVITER = '300000000000000002';

function guild(id: string, overrides: Partial<Guild> = {}): Guild {
  return {
    id,
    name: `Server ${id}`,
    iconUrl: null,
    ownerId: OWNER,
    invitedById: INVITER,
    invitedVia: 'audit_log',
    joinedAt: new Date(Date.UTC(2026, 8, 1)),
    isActive: true,
    createdAt: new Date(Date.UTC(2026, 8, 1)),
    updatedAt: new Date(Date.UTC(2026, 8, 1)),
    ...overrides,
  };
}

const usage = [
  { guildId: 'a', day: '2026-10-07', commandName: 'play', count: 4 },
  { guildId: 'a', day: '2026-10-08', commandName: 'help', count: 3 },
  { guildId: 'a', day: '2026-10-08', commandName: 'play', count: 5 },
  { guildId: 'b', day: '2026-10-08', commandName: 'ban', count: 100 },
  { guildId: 'old', day: '2026-10-08', commandName: 'play', count: 1 },
];

describe('summarizeServers (TASK-1832)', () => {
  it('totals each server, finds its busiest day and top command, and sorts by total', () => {
    const list = summarizeServers([guild('a'), guild('b'), guild('quiet')], usage);

    expect(list.active.map((s) => [s.id, s.total])).toEqual([
      ['b', 100],
      ['a', 12],
      ['quiet', 0],
    ]);
    expect(list.active[1]).toMatchObject({
      busiestDay: { day: '2026-10-08', count: 8 },
      topCommand: { commandName: 'play', count: 9 },
      inviterId: INVITER,
      inviterVia: 'audit_log',
      joinedAt: '2026-09-01T00:00:00.000Z',
    });
  });

  it('gives a server without usage no busiest day and no top command', () => {
    const [quiet] = summarizeServers([guild('quiet')], usage).active;
    expect(quiet).toMatchObject({ total: 0, busiestDay: null, topCommand: null });
  });

  it('breaks ties by earlier day, command name and server name', () => {
    const list = summarizeServers(
      [guild('z', { name: 'Zeta' }), guild('y', { name: 'Alpha' })],
      [
        { guildId: 'z', day: '2026-10-08', commandName: 'play', count: 2 },
        { guildId: 'z', day: '2026-10-07', commandName: 'help', count: 2 },
        { guildId: 'y', day: '2026-10-08', commandName: 'play', count: 4 },
      ],
    );
    expect(list.active.map((s) => s.name)).toEqual(['Alpha', 'Zeta']);
    expect(list.active[1]).toMatchObject({
      busiestDay: { day: '2026-10-07', count: 2 },
      topCommand: { commandName: 'help', count: 2 },
    });
  });

  it('lists servers the bot left separately, and keeps an unknown inviter as null', () => {
    const list = summarizeServers(
      [guild('a', { invitedById: null }), guild('old', { isActive: false })],
      usage,
    );
    expect(list.active.map((s) => s.id)).toEqual(['a']);
    expect(list.active[0]!.inviterId).toBeNull();
    expect(list.active[0]!.inviterVia).toBeNull();
    expect(list.inactive.map((s) => [s.id, s.total])).toEqual([['old', 1]]);
  });

  it('carries how each inviter was learned, and drops a source it does not know', () => {
    const list = summarizeServers(
      [
        guild('a', { invitedVia: 'oauth' }),
        guild('b', { invitedVia: 'integration' }),
        guild('c', { invitedVia: null }),
        guild('d', { invitedVia: 'carrier-pigeon' }),
        guild('e', { invitedById: null, invitedVia: 'oauth' }),
      ],
      [],
    );
    const via = Object.fromEntries(list.active.map((s) => [s.id, s.inviterVia]));
    expect(via).toEqual({ a: 'oauth', b: 'integration', c: null, d: null, e: null });
  });

  it('copes with no servers and no usage', () => {
    expect(summarizeServers([], [])).toEqual({ active: [], inactive: [] });
  });
});

describe('loadServerUsage (TASK-1832)', () => {
  function deps() {
    return {
      guilds: {
        listAll: vi.fn(async () => [
          guild('a'),
          guild('b', { invitedById: null }),
          guild('old', { isActive: false }),
        ]),
      },
      activity: { listAllCommandUsage: vi.fn(async () => usage) },
      users: {
        lookup: vi.fn(
          async (_ids: Iterable<string>) =>
            new Map([[OWNER, { id: OWNER, name: 'Owner Name', username: 'owner', avatarUrl: '' }]]),
        ),
      },
    };
  }

  it('reads 30 UTC days for all servers and looks up owners and inviters', async () => {
    const d = deps();
    const view = await loadServerUsage(d, undefined, NOW);

    expect(d.activity.listAllCommandUsage).toHaveBeenCalledWith('2026-09-10');
    expect(view.selected).toBeNull();
    expect(view.usage.total).toBe(113);
    expect(view.usage.top[0]).toEqual({ commandName: 'ban', count: 100 });
    expect(view.usage.days).toHaveLength(30);
    expect(view.active.map((s) => s.id)).toEqual(['b', 'a']);
    expect(view.inactive.map((s) => s.id)).toEqual(['old']);
    expect(view.users.get(OWNER)).toEqual({
      id: OWNER,
      name: 'Owner Name',
      username: 'owner',
      avatarUrl: '',
    });
    expect(view.users.has(INVITER)).toBe(false);
    const asked = [...d.users.lookup.mock.calls[0]![0]];
    expect(asked).toContain(OWNER);
    expect(asked).toContain(INVITER);
  });

  it('shows one server when the chosen ID is a listed server, active or not', async () => {
    const chosen = await loadServerUsage(deps(), 'a', NOW);
    expect(chosen.selected?.id).toBe('a');
    expect(chosen.usage.total).toBe(12);
    expect(chosen.usage.top).toEqual([
      { commandName: 'play', count: 9 },
      { commandName: 'help', count: 3 },
    ]);

    const left = await loadServerUsage(deps(), 'old', NOW);
    expect(left.selected?.id).toBe('old');
    expect(left.usage.total).toBe(1);
  });

  it('ignores a chosen ID that is not a listed server', async () => {
    for (const unknown of ['nope', '', "1' OR '1'='1"]) {
      const view = await loadServerUsage(deps(), unknown, NOW);
      expect(view.selected).toBeNull();
      expect(view.usage.total).toBe(113);
    }
  });
});
