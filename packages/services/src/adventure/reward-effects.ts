import type { ActiveAdventureSession, AdventureEffects } from './types.js';
import { rankChance, safeRewardInteger } from './reward-rank.js';

export function accumulateAdventureEffects(
  session: ActiveAdventureSession,
  effects: AdventureEffects | undefined,
  random: () => number,
): void {
  if (!effects) return;
  const amount = (range: { min: number; max: number } | undefined): bigint =>
    range
      ? BigInt(
          range.min === range.max
            ? range.min
            : range.min + Math.floor(random() * (range.max - range.min + 1)),
        )
      : 0n;
  const rewards = effects.rewards,
    penalties = effects.penalties;
  const credits = amount(rewards?.credits);
  const calculation = session.rewardCalculation;
  if (calculation) {
    if (calculation.finalized) throw new Error('Cannot add finalized adventure rewards');
    const bucket = rewards?.rankScaling === 'none' ? calculation.excluded : calculation.eligible;
    bucket.credits = (BigInt(bucket.credits) + credits).toString();
    bucket.xp = safeRewardInteger(BigInt(bucket.xp) + BigInt(rewards?.xp ?? 0));
    bucket.dust = safeRewardInteger(BigInt(bucket.dust) + BigInt(rewards?.dust ?? 0));
  }
  session.rewards.credits = (BigInt(session.rewards.credits) + credits).toString();
  session.penalties.credits = (
    BigInt(session.penalties.credits) + amount(penalties?.credits)
  ).toString();
  session.rewards.xp = safeRewardInteger(BigInt(session.rewards.xp) + BigInt(rewards?.xp ?? 0));
  session.rewards.dust = safeRewardInteger(
    BigInt(session.rewards.dust) + BigInt(rewards?.dust ?? 0),
  );
  if (session.admissionMode === 'ENERGY') {
    session.rewards.energy += rewards?.energy ?? 0;
    session.penalties.energy += penalties?.energy ?? 0;
  }
  for (const drop of rewards?.items ?? [])
    if (random() < rankChance(drop.chance, session.rewardRank, rewards?.rankScaling === 'none'))
      session.rewards.items.push({ code: drop.code, quantity: drop.quantity });
  if (
    rewards?.card &&
    random() < rankChance(rewards.card.chance, session.rewardRank, rewards.rankScaling === 'none')
  )
    session.rewards.cards.push({ minRarity: rewards.card.minRarity, cardId: null });
}
