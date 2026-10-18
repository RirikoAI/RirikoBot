import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceSessionAccumulator } from './voice-accumulator.js';
import {
  VoiceRewardService,
  earnsXp,
  scaleXp,
  type GuildXpRules,
  type VoiceLevelUp,
} from './voice-rewards.js';
import type { EconomyService } from './economy.service.js';
import type { LevelingService } from './leveling.service.js';

const T0 = 1_000_000_000;

function rules(overrides: Partial<GuildXpRules> = {}): GuildXpRules {
  return {
    xpRatePercent: 100,
    noXpChannelIds: [],
    noXpRoleIds: [],
    voiceXpEnabled: true,
    levelUpChannelId: null,
    ...overrides,
  };
}

describe('earnsXp and scaleXp', () => {
  it('refuses no-XP channels, thread parents and roles', () => {
    const r = rules({ noXpChannelIds: ['c1'], noXpRoleIds: ['r1'] });
    expect(earnsXp(r, ['c2', null], ['r2'])).toBe(true);
    expect(earnsXp(r, ['thread', 'c1'], [])).toBe(false);
    expect(earnsXp(r, ['c2'], ['r2', 'r1'])).toBe(false);
  });

  it('applies the rate in percent', () => {
    expect(scaleXp(20, 100)).toBe(20);
    expect(scaleXp(20, 150)).toBe(30);
    expect(scaleXp(15, 50)).toBe(8);
    expect(scaleXp(20, 0)).toBe(0);
  });
});

describe('VoiceRewardService', () => {
  let accumulator: VoiceSessionAccumulator;
  let handleEvent: ReturnType<typeof vi.fn>;
  let addExperience: ReturnType<typeof vi.fn>;
  let onLevelUp: ReturnType<typeof vi.fn<(levelUp: VoiceLevelUp) => Promise<void>>>;
  let guildRules: GuildXpRules;
  let memberRoles: string[];
  let service: VoiceRewardService;

  beforeEach(() => {
    accumulator = new VoiceSessionAccumulator({
      config: { minQuorum: 2, intervalSeconds: 60 },
      initialTime: T0,
    });
    for (const userId of ['u1', 'u2']) {
      accumulator.onVoiceStateUpdate({ userId, guildId: 'g1', channelId: 'vc1' });
    }
    handleEvent = vi.fn(async () => ({ awarded: true, credits: 35, xp: 40 }));
    addExperience = vi.fn(async () => ({ didLevelUp: false, shouldNotify: false, newLevel: 1 }));
    onLevelUp = vi.fn(async (_levelUp: VoiceLevelUp) => {});
    guildRules = rules();
    memberRoles = [];
    service = new VoiceRewardService({
      accumulator,
      economyService: { handleEvent } as unknown as EconomyService,
      levelingService: { addExperience } as unknown as LevelingService,
      getRules: async () => guildRules,
      getMemberRoleIds: () => memberRoles,
      onLevelUp,
    });
  });

  it('pays nothing while the guild has voice rewards off', async () => {
    guildRules = rules({ voiceXpEnabled: false });
    expect(await service.tick(T0 + 60_000)).toBe(0);
    expect(handleEvent).not.toHaveBeenCalled();
    expect(addExperience).not.toHaveBeenCalled();
  });

  it('pays credits and rate-scaled XP to each active member', async () => {
    guildRules = rules({ xpRatePercent: 50 });
    expect(await service.tick(T0 + 60_000)).toBe(2);
    expect(handleEvent).toHaveBeenCalledTimes(2);
    expect(handleEvent.mock.calls[0]![0]).toMatchObject({
      type: 'VOICE_MINUTE',
      guildId: 'g1',
      metadata: { channelId: 'vc1' },
    });
    expect(addExperience).toHaveBeenCalledWith('u1', 'g1', 20, 'VOICE_SESSION');
  });

  it('skips no-XP voice channels and members with no-XP roles', async () => {
    guildRules = rules({ noXpChannelIds: ['vc1'] });
    expect(await service.tick(T0 + 60_000)).toBe(0);

    guildRules = rules({ noXpRoleIds: ['muted'] });
    memberRoles = ['muted'];
    expect(await service.tick(T0 + 120_000)).toBe(0);
    expect(handleEvent).not.toHaveBeenCalled();
  });

  it('announces level-ups only in the guild level-up channel', async () => {
    addExperience.mockResolvedValue({ didLevelUp: true, shouldNotify: true, newLevel: 3 });
    await service.tick(T0 + 60_000);
    expect(onLevelUp).not.toHaveBeenCalled();

    guildRules = rules({ levelUpChannelId: 'levels' });
    await service.tick(T0 + 120_000);
    expect(onLevelUp).toHaveBeenCalledWith({
      guildId: 'g1',
      userId: 'u1',
      channelId: 'levels',
      newLevel: 3,
    });
  });

  it('keeps paying other members when one reward fails', async () => {
    handleEvent.mockRejectedValueOnce(new Error('db down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await service.tick(T0 + 60_000)).toBe(1);
    error.mockRestore();
  });
});
