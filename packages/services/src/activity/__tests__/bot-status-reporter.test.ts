import { describe, expect, it, vi } from 'vitest';
import type { Client } from 'discord.js';
import type { BotStatus, VoiceChannelActivity } from '@ririko/database';
import { BOT_STATUS_ID, BotStatusReporter } from '../bot-status-reporter.js';

interface FakeVoiceState {
  channelId: string | null;
  bot?: boolean;
}

function fakeClient(ping: number, guilds: Record<string, FakeVoiceState[]>) {
  const cache = new Map(
    Object.entries(guilds).map(([id, states]) => [
      id,
      {
        id,
        voiceStates: {
          cache: new Map(
            states.map((state, index) => [
              `u${index}`,
              { channelId: state.channelId, member: { user: { bot: state.bot ?? false } } },
            ]),
          ),
        },
      },
    ]),
  );
  return { ws: { ping }, guilds: { cache } } as unknown as Pick<Client, 'ws' | 'guilds'>;
}

function fakeRepo() {
  return {
    saveBotStatus: vi.fn(async (_status: BotStatus) => undefined),
    setVoiceActivity: vi.fn(
      async (_guildId: string, _channels: VoiceChannelActivity[], _now: Date) => undefined,
    ),
    clearVoiceActivity: vi.fn(async () => undefined),
  };
}

const T0 = Date.UTC(2026, 8, 26, 12, 0, 0);

describe('BotStatusReporter (TASK-1131)', () => {
  it('writes gateway ping, guild count, version and uptime start', async () => {
    const now = { value: T0 };
    const repo = fakeRepo();
    const reporter = new BotStatusReporter(fakeClient(41.6, { g1: [], g2: [] }), repo, {
      version: '2.0.0',
      now: () => now.value,
    });

    now.value += 30_000;
    await reporter.tick();

    expect(repo.saveBotStatus).toHaveBeenCalledWith({
      id: BOT_STATUS_ID,
      gatewayPingMs: 42,
      guildCount: 2,
      version: '2.0.0',
      startedAt: new Date(T0),
      updatedAt: new Date(T0 + 30_000),
    });
  });

  it('records no ping before the first gateway heartbeat', async () => {
    const repo = fakeRepo();
    await new BotStatusReporter(fakeClient(-1, {}), repo, { version: '2.0.0' }).tick();
    expect(repo.saveBotStatus.mock.calls[0]![0].gatewayPingMs).toBeNull();
  });

  it('clears old voice rows once, then writes only guilds whose activity changed', async () => {
    const guilds: Record<string, FakeVoiceState[]> = {
      g1: [{ channelId: 'c2' }, { channelId: 'c1' }, { channelId: 'c2' }, { channelId: null }],
      g2: [{ channelId: 'c9', bot: true }],
      g3: [{ channelId: 'c5' }],
    };
    const client = fakeClient(10, guilds);
    const repo = fakeRepo();
    const reporter = new BotStatusReporter(client, repo, { version: '2.0.0', now: () => T0 });

    await reporter.tick();
    expect(repo.clearVoiceActivity).toHaveBeenCalledOnce();
    expect(
      repo.setVoiceActivity.mock.calls.map(([guildId, channels]) => [guildId, channels]),
    ).toEqual([
      [
        'g1',
        [
          { channelId: 'c1', members: 1 },
          { channelId: 'c2', members: 2 },
        ],
      ],
      ['g3', [{ channelId: 'c5', members: 1 }]],
    ]);

    // g3 empties; g1 is unchanged.
    const cache = client.guilds.cache as unknown as Map<
      string,
      { voiceStates: { cache: Map<string, unknown> } }
    >;
    cache.get('g3')!.voiceStates.cache.clear();
    repo.setVoiceActivity.mockClear();
    await reporter.tick();

    expect(repo.clearVoiceActivity).toHaveBeenCalledOnce();
    expect(
      repo.setVoiceActivity.mock.calls.map(([guildId, channels]) => [guildId, channels]),
    ).toEqual([['g3', []]]);
  });

  it('retries a failed voice write on the next tick', async () => {
    const repo = fakeRepo();
    const reporter = new BotStatusReporter(fakeClient(10, { g1: [{ channelId: 'c1' }] }), repo, {
      version: '2.0.0',
    });
    repo.setVoiceActivity.mockRejectedValueOnce(new Error('db down'));

    await expect(reporter.tick()).rejects.toThrow('db down');
    await reporter.tick();

    expect(repo.setVoiceActivity).toHaveBeenCalledTimes(2);
  });
});
