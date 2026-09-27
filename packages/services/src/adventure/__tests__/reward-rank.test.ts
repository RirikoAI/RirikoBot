import { describe, it, expect } from 'vitest';
import {
  adventureRewardRank,
  rankChance,
  rankAmount,
  newRewardCalculation,
  validateAdventureRewardState,
  finalizeRankRewards,
} from '../reward-rank.js';
import type { ActiveAdventureSession } from '../types.js';

describe('companion reward ranks', () => {
  it.each([
    [1, 'F', 10000],
    [9, 'F', 10000],
    [10, 'E', 15000],
    [19, 'E', 15000],
    [20, 'D', 20000],
    [29, 'D', 20000],
    [30, 'C', 25000],
    [39, 'C', 25000],
    [40, 'B', 30000],
    [59, 'B', 30000],
    [60, 'A', 40000],
    [79, 'A', 40000],
    [80, 'S', 50000],
    [99, 'S', 50000],
    [100, 'S+', 60000],
    [101, 'S+', 60000],
    [50, 'B', 30000],
    [70, 'A', 40000],
    [85, 'S', 50000],
  ] as const)('level %i earns %s', (level, rank, bps) => {
    expect(adventureRewardRank(level)).toMatchObject({ rank, amountBps: bps, chanceBps: bps });
  });
  it('handles solo and invalid levels without parsing display names', () => {
    expect(adventureRewardRank(null)).toMatchObject({ rank: 'F', companionLevel: null });
    for (const level of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])
      expect(() => adventureRewardRank(level)).toThrow();
  });
  it('uses relative capped chances and preserves absent/guaranteed/excluded drops', () => {
    const rank = adventureRewardRank(100);
    expect(rankChance(0.1, rank)).toBe(0.6);
    expect(rankChance(0.8, rank)).toBe(1);
    expect(rankChance(0, rank)).toBe(0);
    expect(rankChance(1, rank)).toBe(1);
    expect(rankChance(0.1, rank, true)).toBe(0.1);
    expect(rankChance(0.1)).toBe(0.1);
  });
  it('aggregates, rounds once, keeps bigint precision and finalizes once', () => {
    const session = {
      status: 'ACTIVE',
      rewardRank: adventureRewardRank(10),
      rewardCalculation: newRewardCalculation(),
      rewards: { credits: '0', xp: 0, dust: 0 },
    } as ActiveAdventureSession;
    session.rewardCalculation!.eligible = { credits: '9007199254740993', xp: 3 + 3, dust: 3 + 3 };
    session.rewardCalculation!.excluded = { credits: '400', xp: 1, dust: 0 };
    finalizeRankRewards(session);
    expect(session.rewards).toEqual({ credits: '13510798882111889', xp: 10, dust: 9 });
    const result = structuredClone(session.rewards);
    finalizeRankRewards(session);
    expect(session.rewards).toEqual(result);
    expect(rankAmount(300n, 60000)).toBe(1800n);
    session.status = 'SETTLING';
    expect(() => validateAdventureRewardState(session)).not.toThrow();
  });
  it('rejects overflow and malformed new data while leaving legacy sessions untouched', () => {
    const legacy = {
      status: 'SETTLING',
      rewards: { credits: '400', xp: 10, dust: 0 },
    } as ActiveAdventureSession;
    validateAdventureRewardState(legacy);
    finalizeRankRewards(legacy);
    expect(legacy.rewards.credits).toBe('400');
    const ranked = {
      ...legacy,
      rewardRank: adventureRewardRank(100),
      rewardCalculation: newRewardCalculation(),
    };
    expect(() => validateAdventureRewardState(ranked)).toThrow('not finalized');
    ranked.status = 'ACTIVE';
    ranked.rewardCalculation.eligible.xp = Number.MAX_SAFE_INTEGER;
    expect(() => finalizeRankRewards(ranked)).toThrow('safe integer');
    expect(() =>
      validateAdventureRewardState({
        ...ranked,
        rewardRank: { ...ranked.rewardRank, policyVersion: 2 } as never,
      }),
    ).toThrow('Unsupported');
    const incomplete: ActiveAdventureSession = structuredClone(ranked);
    delete incomplete.rewardCalculation;
    expect(() => validateAdventureRewardState(incomplete)).toThrow('Unsupported');
    expect(() =>
      validateAdventureRewardState({
        ...ranked,
        rewardRank: { ...ranked.rewardRank, amountBps: NaN },
      }),
    ).toThrow();
  });
});
