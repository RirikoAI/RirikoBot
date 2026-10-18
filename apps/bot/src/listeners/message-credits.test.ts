import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { AntiSpamEvaluator, EconomyService } from '@ririko/services';
import { registerMessageListener } from './message.listener.js';
import type { BotServices } from '../services.js';

/**
 * BUG-0023: the listener and the economy service each ran the anti-spam check, so the second
 * check always failed and chat messages never paid credits. These tests drive the real
 * EconomyService and AntiSpamEvaluator through the listener.
 */
function setup() {
  const client = new EventEmitter();
  const modifyBalance = vi.fn(async (params: { walletDelta: number; metadata?: unknown }) => ({
    balance: { walletBalance: params.walletDelta, bankBalance: 0, netWorth: params.walletDelta },
    transaction: { id: 'tx', balanceBefore: 0, balanceAfter: params.walletDelta },
  }));
  const antiSpam = new AntiSpamEvaluator({
    cooldownSeconds: 60,
    minContentLength: 5,
    similarityThreshold: 0.8,
  });
  const economyService = new EconomyService({
    repository: { modifyBalance } as never,
    antiSpam,
  });
  const addExperience = vi.fn().mockResolvedValue({ didLevelUp: false, shouldNotify: false });
  const services = {
    antiSpamEvaluator: antiSpam,
    economyService,
    levelingService: { addExperience },
    userRepo: { getOrCreate: vi.fn().mockResolvedValue({ id: 'user-1' }) },
    guildSettingsService: {
      getSettings: vi.fn().mockResolvedValue({
        levelUpAnnouncements: true,
        levelUpChannelId: null,
        xpRatePercent: 100,
        noXpChannelIds: [],
        noXpRoleIds: [],
        voiceXpEnabled: false,
      }),
    },
  } as unknown as BotServices;
  registerMessageListener(client as never, services);

  let id = 0;
  async function send(content: string, createdTimestamp: number) {
    client.emit('messageCreate', {
      id: `msg-${++id}`,
      channelId: 'chan-1',
      channel: { isThread: () => false, isSendable: () => true, send: vi.fn() },
      content,
      createdTimestamp,
      author: { id: 'user-1', bot: false, username: 'tester', displayName: 'Tester' },
      guild: { id: 'guild-1', ownerId: 'owner-1' },
      member: { roles: { cache: new Map() } },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return { send, modifyBalance, addExperience };
}

describe('chat message credits (BUG-0023)', () => {
  it('pays 20 credits and chat XP for each valid message outside the cooldown', async () => {
    const { send, modifyBalance, addExperience } = setup();
    const start = 1_700_000_000_000;

    await send('Good morning everyone, how are you?', start);
    await send('Anyone up for a dungeon run later tonight?', start + 61_000);

    expect(modifyBalance).toHaveBeenCalledTimes(2);
    for (const [params] of modifyBalance.mock.calls) {
      expect(params).toMatchObject({ walletDelta: 20, type: 'MESSAGE_SENT' });
      expect(params.metadata).toEqual(
        expect.objectContaining({ messageId: expect.any(String), channelId: 'chan-1' }),
      );
      expect(params.metadata).not.toHaveProperty('content');
    }
    expect(addExperience).toHaveBeenCalledTimes(2);
  });

  it('pays nothing and gives no chat XP inside the cooldown, for short messages or duplicates', async () => {
    const { send, modifyBalance, addExperience } = setup();
    const start = 1_700_000_000_000;

    await send('Good morning everyone, how are you?', start);
    await send('A different message, but too soon', start + 30_000); // cooldown
    await send('hi', start + 61_000); // too short
    await send('Good morning everyone, how are you?', start + 122_000); // duplicate

    expect(modifyBalance).toHaveBeenCalledTimes(1);
    expect(addExperience).toHaveBeenCalledTimes(1);
  });
});
