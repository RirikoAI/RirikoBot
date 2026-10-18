import { describe, expect, it, vi } from 'vitest';
import type { BotStatus } from '@ririko/database';
import { loadGuildOverview, summarizeCommandUsage, USAGE_DAYS } from './guild-overview';
import type { GuildCounts } from './guild-resources';

vi.mock('server-only', () => ({}));

const NOW = Date.UTC(2026, 8, 26, 12, 0, 0);
const GUILD = '100000000000000001';

function status(updatedAgoMs: number): BotStatus {
  return {
    id: 'bot',
    gatewayPingMs: 48,
    guildCount: 3,
    version: '2.0.0',
    startedAt: new Date(NOW - 3_600_000),
    updatedAt: new Date(NOW - updatedAgoMs),
  };
}

function deps(overrides: { status?: BotStatus | null; counts?: () => Promise<GuildCounts> } = {}) {
  return {
    resources: {
      memberCounts: vi.fn(overrides.counts ?? (async () => ({ members: 120, online: 33 }))),
      channelNames: vi.fn(
        async () =>
          new Map([
            ['c1', 'Lounge'],
            ['c2', 'Gaming'],
          ]),
      ),
    },
    activity: {
      getBotStatus: vi.fn(async () =>
        overrides.status === undefined ? status(10_000) : overrides.status,
      ),
      getVoiceActivity: vi.fn(async () => ({
        guildId: GUILD,
        channels: [
          { channelId: 'c1', members: 2 },
          { channelId: 'c2', members: 5 },
          { channelId: 'gone', members: 1 },
        ],
        updatedAt: new Date(NOW),
      })),
      listCommandUsage: vi.fn(async () => [
        { guildId: GUILD, day: '2026-09-25', commandName: 'play', count: 4 },
        { guildId: GUILD, day: '2026-09-26', commandName: 'help', count: 1 },
        { guildId: GUILD, day: '2026-09-26', commandName: 'play', count: 2 },
      ]),
    },
  };
}

describe('summarizeCommandUsage (TASK-1131)', () => {
  it('fills every UTC day of the period and ranks commands', () => {
    const summary = summarizeCommandUsage(
      [
        { day: '2026-08-28', commandName: 'ban', count: 1 },
        { day: '2026-09-26', commandName: 'play', count: 3 },
        { day: '2026-09-26', commandName: 'help', count: 3 },
      ],
      NOW,
    );

    expect(summary.days).toHaveLength(USAGE_DAYS);
    expect(summary.days[0]).toEqual({ day: '2026-08-28', count: 1 });
    expect(summary.days.at(-1)).toEqual({ day: '2026-09-26', count: 6 });
    expect(summary.top).toEqual([
      { commandName: 'help', count: 3 },
      { commandName: 'play', count: 3 },
      { commandName: 'ban', count: 1 },
    ]);
    expect(summary.total).toBe(7);
  });
});

describe('loadGuildOverview (TASK-1131)', () => {
  it('combines counts, bot status, named voice channels and 30 days of usage', async () => {
    const d = deps();
    const overview = await loadGuildOverview(d, GUILD, NOW);

    expect(d.activity.listCommandUsage).toHaveBeenCalledWith(GUILD, '2026-08-28');
    expect(overview.counts).toEqual({ members: 120, online: 33 });
    expect(overview.bot).toMatchObject({ online: true, pingMs: 48, version: '2.0.0' });
    expect(overview.voice).toEqual([
      { channelId: 'c2', name: 'Gaming', members: 5 },
      { channelId: 'c1', name: 'Lounge', members: 2 },
      { channelId: 'gone', name: 'Unknown channel', members: 1 },
    ]);
    expect(overview.usage.total).toBe(7);
  });

  it('hides voice activity when the bot status is stale', async () => {
    const overview = await loadGuildOverview(deps({ status: status(5 * 60_000) }), GUILD, NOW);
    expect(overview.bot?.online).toBe(false);
    expect(overview.voice).toBeNull();
  });

  it('reports no bot and no voice when the bot never wrote a status', async () => {
    const overview = await loadGuildOverview(deps({ status: null }), GUILD, NOW);
    expect(overview.bot).toBeNull();
    expect(overview.voice).toBeNull();
  });

  it('still loads when Discord member counts fail', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const overview = await loadGuildOverview(
      deps({
        counts: async () => {
          throw new Error('Discord down');
        },
      }),
      GUILD,
      NOW,
    );
    expect(overview.counts).toBeNull();
    expect(overview.usage.total).toBe(7);
    errorSpy.mockRestore();
  });
});
