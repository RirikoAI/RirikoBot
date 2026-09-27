import type {
  ActiveAdventureSession,
  AdventureRankAmounts,
  AdventureRewardCalculation,
  AdventureRewardRank,
} from './types.js';

/** Version 1 includes the user-requested tenfold percentage bonuses. */
export const ADVENTURE_REWARD_RANKS = [
  { rank: 'F', level: 1, bonus: 0 },
  { rank: 'E', level: 10, bonus: 50 },
  { rank: 'D', level: 20, bonus: 100 },
  { rank: 'C', level: 30, bonus: 150 },
  { rank: 'B', level: 40, bonus: 200 },
  { rank: 'A', level: 60, bonus: 300 },
  { rank: 'S', level: 80, bonus: 400 },
  { rank: 'S+', level: 100, bonus: 500 },
] as const;

export function adventureRewardRank(level: number | null, userId?: string): AdventureRewardRank {
  if (level !== null && (!Number.isSafeInteger(level) || level < 1))
    throw new Error('Invalid adventure companion level');
  // Explicit user override: always S+, including solo play and level-100 companions.
  const tier =
    userId === '391220345769689090'
      ? ADVENTURE_REWARD_RANKS.find((t) => t.rank === 'S+')!
      : ADVENTURE_REWARD_RANKS.findLast((t) => (level ?? 1) >= t.level)!;
  return {
    policyVersion: 1,
    rank: tier.rank,
    companionLevel: level,
    amountBps: 10_000 + tier.bonus * 100,
    chanceBps: 10_000 + tier.bonus * 100,
  };
}
export const emptyRankAmounts = (): AdventureRankAmounts => ({ credits: '0', xp: 0, dust: 0 });
export const newRewardCalculation = (): AdventureRewardCalculation => ({
  eligible: emptyRankAmounts(),
  excluded: emptyRankAmounts(),
  finalized: false,
});
export function safeRewardInteger(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('Adventure reward exceeds safe integer range');
  return Number(value);
}
export function rankAmount(base: bigint, bps: number): bigint {
  return (base * BigInt(bps)) / 10_000n;
}
export function rankChance(base: number, rank?: AdventureRewardRank, excluded = false): number {
  return Math.min(1, (base * (excluded ? 10_000 : (rank?.chanceBps ?? 10_000))) / 10_000);
}

/** Domain read guard; missing legacy fields never infer bonuses from today's card. */
export function validateAdventureRewardState(session: ActiveAdventureSession): void {
  const economy = session.rewardEconomy;
  if (
    economy !== undefined &&
    (!economy ||
      economy.version !== 2 ||
      !session.rewardRank ||
      !session.rewardCalculation ||
      ![
        economy.creditsPerShape,
        economy.xpPerShape,
        economy.dustPerShape,
        economy.companionXpPerShape,
        economy.expectedEnergy,
        economy.expectedCosts,
      ].every((n) => Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER))
  )
    throw new Error('Unsupported adventure completion policy');
  if (
    session.rewards.companionXp !== undefined &&
    (!Number.isSafeInteger(session.rewards.companionXp) || session.rewards.companionXp < 0)
  )
    throw new Error('Invalid companion XP');
  if (
    economy &&
    ['SETTLING', 'COMPLETED'].includes(session.status) &&
    session.rewards.companionXp === undefined
  )
    throw new Error('Missing companion XP budget');
  const rank = session.rewardRank,
    calculation = session.rewardCalculation;
  if (rank === undefined && calculation === undefined) return;
  if (!rank || !calculation || rank.policyVersion !== 1)
    throw new Error('Unsupported adventure reward policy');
  if (
    rank.companionLevel !== null &&
    (!Number.isSafeInteger(rank.companionLevel) || rank.companionLevel < 1)
  )
    throw new Error('Invalid adventure rank level');
  if (
    !ADVENTURE_REWARD_RANKS.some((t) => t.rank === rank.rank) ||
    ![rank.amountBps, rank.chanceBps].every(
      (n) => Number.isSafeInteger(n) && n >= 10_000 && n <= 60_000,
    ) ||
    typeof calculation.finalized !== 'boolean'
  )
    throw new Error('Invalid adventure rank snapshot');
  for (const amounts of [calculation.eligible, calculation.excluded]) {
    if (
      !amounts ||
      typeof amounts.credits !== 'string' ||
      !/^\d+$/.test(amounts.credits) ||
      ![amounts.xp, amounts.dust].every((n) => Number.isSafeInteger(n) && n >= 0)
    )
      throw new Error('Invalid adventure reward calculation');
  }
  if (session.status === 'SETTLING' && !calculation.finalized)
    throw new Error('Adventure rewards were not finalized');
  if (session.status === 'ACTIVE' && calculation.finalized)
    throw new Error('Active adventure rewards already finalized');
}

export function finalizeRankRewards(session: ActiveAdventureSession): void {
  const calc = session.rewardCalculation,
    rank = session.rewardRank;
  if (!calc || !rank || calc.finalized) return;
  session.rewards.credits = (
    BigInt(calc.excluded.credits) + rankAmount(BigInt(calc.eligible.credits), rank.amountBps)
  ).toString();
  for (const key of ['xp', 'dust'] as const)
    session.rewards[key] = safeRewardInteger(
      BigInt(calc.excluded[key]) + rankAmount(BigInt(calc.eligible[key]), rank.amountBps),
    );
  calc.finalized = true;
}
export function adventureRewardBonus(session: ActiveAdventureSession): AdventureRankAmounts {
  const calc = session.rewardCalculation;
  if (!calc?.finalized) return emptyRankAmounts();
  return {
    credits: (
      BigInt(session.rewards.credits) -
      BigInt(calc.eligible.credits) -
      BigInt(calc.excluded.credits)
    ).toString(),
    xp: session.rewards.xp - calc.eligible.xp - calc.excluded.xp,
    dust: session.rewards.dust - calc.eligible.dust - calc.excluded.dust,
  };
}
