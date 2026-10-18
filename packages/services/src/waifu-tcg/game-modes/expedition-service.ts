import type { EconomyRepository, PlayerEnergyRepository } from '@ririko/database';
import type { ItemGrantService } from '../equipment/item-grant.service.js';
import type { EnergyLifecycleService } from '../energy/energy-lifecycle.service.js';

/** Where claimed rewards are paid; without it rewards are only reported. */
export interface RewardPayout {
  economyRepo: EconomyRepository;
  grants: ItemGrantService;
}

export type ExpeditionDuration = '1h' | '4h' | '8h';

export interface ExpeditionTierConfig {
  durationMs: number;
  energyCost: number;
  minCredits: number;
  maxCredits: number;
  minDust: number;
  maxDust: number;
  cardShardChance: number;
  label: string;
}

export const EXPEDITION_TIERS: Record<ExpeditionDuration, ExpeditionTierConfig> = {
  '1h': {
    durationMs: 60 * 60 * 1000,
    energyCost: 10,
    minCredits: 150,
    maxCredits: 300,
    minDust: 10,
    maxDust: 25,
    cardShardChance: 0.15,
    label: '1 Hour Scout Expedition',
  },
  '4h': {
    durationMs: 4 * 60 * 60 * 1000,
    energyCost: 25,
    minCredits: 400,
    maxCredits: 800,
    minDust: 50,
    maxDust: 100,
    cardShardChance: 0.35,
    label: '4 Hour In-Depth Expedition',
  },
  '8h': {
    durationMs: 8 * 60 * 60 * 1000,
    energyCost: 45,
    minCredits: 1000,
    maxCredits: 2500,
    minDust: 150,
    maxDust: 300,
    cardShardChance: 0.7,
    label: '8 Hour Deep-Wilds Expedition',
  },
};

export interface ActiveExpedition {
  id: string;
  userId: string;
  cardId: string;
  tier: ExpeditionDuration;
  energyCost: number;
  startedAt: Date;
  completesAt: Date;
  isClaimed: boolean;
}

export interface ExpeditionReward {
  credits: number;
  dust: number;
  cardShards: number;
  tier: ExpeditionDuration;
}

export class ExpeditionService {
  private readonly activeExpeditions: Map<string, ActiveExpedition> = new Map();
  private readonly energyRepo: PlayerEnergyRepository;

  private readonly payout: RewardPayout | undefined;

  private readonly energyLifecycle: EnergyLifecycleService | undefined;

  constructor(
    energyRepo: PlayerEnergyRepository,
    payout?: RewardPayout | undefined,
    energyLifecycle?: EnergyLifecycleService | undefined,
  ) {
    this.energyRepo = energyRepo;
    this.payout = payout;
    this.energyLifecycle = energyLifecycle;
  }

  /**
   * Starts a timed expedition consuming energy.
   */
  async startExpedition(
    userId: string,
    cardId: string,
    tier: ExpeditionDuration,
    customDurationMs?: number,
  ): Promise<{ success: boolean; expedition?: ActiveExpedition; error?: string }> {
    const config = EXPEDITION_TIERS[tier];
    if (!config) {
      return { success: false, error: `Invalid expedition tier: ${tier}` };
    }

    // Check if user already has an active unclaimed expedition with this card
    const existing = Array.from(this.activeExpeditions.values()).find(
      (e) => e.userId === userId && e.cardId === cardId && !e.isClaimed,
    );
    if (existing) {
      return {
        success: false,
        error: 'This card is currently already deployed on an active expedition!',
      };
    }

    // Consume player energy
    const energyResult = this.energyLifecycle
      ? await this.energyLifecycle.spendEnergy(userId, config.energyCost)
      : await this.energyRepo.consumeEnergy(userId, config.energyCost);
    if (!energyResult.success) {
      return {
        success: false,
        error: energyResult.reason ?? `Insufficient energy (${config.energyCost} required).`,
      };
    }

    const durationMs = customDurationMs ?? config.durationMs;
    const now = new Date();
    const expedition: ActiveExpedition = {
      id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId,
      cardId,
      tier,
      energyCost: config.energyCost,
      startedAt: now,
      completesAt: new Date(now.getTime() + durationMs),
      isClaimed: false,
    };

    this.activeExpeditions.set(expedition.id, expedition);

    return { success: true, expedition };
  }

  /**
   * Claims rewards for a finished expedition.
   */
  async claimExpedition(
    userId: string,
    expeditionId: string,
    rng: () => number = Math.random,
  ): Promise<{ success: boolean; rewards?: ExpeditionReward; error?: string }> {
    const expedition = this.activeExpeditions.get(expeditionId);
    if (!expedition) {
      return { success: false, error: 'Expedition not found.' };
    }

    if (expedition.userId !== userId) {
      return { success: false, error: 'You do not own this expedition.' };
    }

    if (expedition.isClaimed) {
      return { success: false, error: 'This expedition has already been claimed.' };
    }

    const now = new Date();
    if (now.getTime() < expedition.completesAt.getTime()) {
      const remainingSeconds = Math.ceil((expedition.completesAt.getTime() - now.getTime()) / 1000);
      return {
        success: false,
        error: `Expedition is still in progress! Remaining time: ${remainingSeconds}s.`,
      };
    }

    expedition.isClaimed = true;
    const config = EXPEDITION_TIERS[expedition.tier];

    // Roll rewards
    const credits = config.minCredits + Math.round(rng() * (config.maxCredits - config.minCredits));
    const dust = config.minDust + Math.round(rng() * (config.maxDust - config.minDust));
    const cardShards = rng() < config.cardShardChance ? 1 : 0;

    if (this.payout) {
      await this.payout.economyRepo.modifyBalance({
        userId,
        walletDelta: credits,
        type: 'EXPEDITION_REWARD',
        source: `EXPEDITION_${expedition.tier}`,
      });
      await this.payout.grants.grant(userId, 'CRAFTING_DUST', dust, 'EXPEDITION');
    }

    return {
      success: true,
      rewards: {
        credits,
        dust,
        cardShards,
        tier: expedition.tier,
      },
    };
  }

  /**
   * Lists all active expeditions for a user.
   */
  getUserExpeditions(userId: string): ActiveExpedition[] {
    return Array.from(this.activeExpeditions.values()).filter((e) => e.userId === userId);
  }
}
