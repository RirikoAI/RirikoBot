import type { PlayerEnergyRepository, EconomyRepository } from '@ririko/database';
import { CombatSimulator } from '../combat/combat-simulator.js';
import type { Combatant, CombatResult } from '../combat/types.js';
import type { EnergyLifecycleService } from '../energy/energy-lifecycle.service.js';

export const PVP_DUEL_ENERGY_COST = 5; // Section 12.4

export interface PvPDuelRequest {
  challengerId: string;
  opponentId: string;
  challengerCards: Combatant[];
  opponentCards: Combatant[];
  wagerCredits?: number | undefined;
}

export interface PvPDuelResult {
  success: boolean;
  winnerUserId: string | 'DRAW';
  loserUserId: string | 'DRAW';
  combatResult?: CombatResult | undefined;
  wagerWon?: number | undefined;
  ratingDelta: number;
  error?: string | undefined;
}

export class PvPDuelService {
  private readonly energyRepo: PlayerEnergyRepository;
  private readonly economyRepo?: EconomyRepository | undefined;
  private readonly combatSimulator: CombatSimulator;

  private readonly energyLifecycle: EnergyLifecycleService | undefined;

  constructor(
    energyRepo: PlayerEnergyRepository,
    economyRepo?: EconomyRepository | undefined,
    combatSimulator?: CombatSimulator,
    energyLifecycle?: EnergyLifecycleService | undefined,
  ) {
    this.energyRepo = energyRepo;
    this.economyRepo = economyRepo;
    this.energyLifecycle = energyLifecycle;
    this.combatSimulator = combatSimulator ?? new CombatSimulator({ maxTurns: 20 });
  }

  /**
   * Executes a PvP duel between two players.
   */
  async executeDuel(request: PvPDuelRequest): Promise<PvPDuelResult> {
    const { challengerId, opponentId, challengerCards, opponentCards, wagerCredits = 0 } = request;

    if (challengerId === opponentId) {
      return {
        success: false,
        winnerUserId: 'DRAW',
        loserUserId: 'DRAW',
        ratingDelta: 0,
        error: 'You cannot challenge yourself to a PvP duel!',
      };
    }

    if (challengerCards.length === 0 || opponentCards.length === 0) {
      return {
        success: false,
        winnerUserId: 'DRAW',
        loserUserId: 'DRAW',
        ratingDelta: 0,
        error: 'Both players must have at least one card deployed to duel!',
      };
    }

    // 1. Consume 5 energy for challenger
    const energyResult = this.energyLifecycle
      ? await this.energyLifecycle.spendEnergy(challengerId, PVP_DUEL_ENERGY_COST)
      : await this.energyRepo.consumeEnergy(challengerId, PVP_DUEL_ENERGY_COST);
    if (!energyResult.success) {
      return {
        success: false,
        winnerUserId: 'DRAW',
        loserUserId: 'DRAW',
        ratingDelta: 0,
        error: energyResult.reason ?? `Insufficient energy (${PVP_DUEL_ENERGY_COST} required).`,
      };
    }

    // 2. Validate wagers if specified and economyRepo available
    if (wagerCredits > 0 && this.economyRepo) {
      const challengerBal = await this.economyRepo.getOrCreateBalance(challengerId);
      const opponentBal = await this.economyRepo.getOrCreateBalance(opponentId);

      if (BigInt(challengerBal.walletBalance) < BigInt(wagerCredits)) {
        return {
          success: false,
          winnerUserId: 'DRAW',
          loserUserId: 'DRAW',
          ratingDelta: 0,
          error: `You do not have enough wallet credits to cover the wager of ${wagerCredits} coins!`,
        };
      }
      if (BigInt(opponentBal.walletBalance) < BigInt(wagerCredits)) {
        return {
          success: false,
          winnerUserId: 'DRAW',
          loserUserId: 'DRAW',
          ratingDelta: 0,
          error: `Opponent does not have enough wallet credits to cover the wager of ${wagerCredits} coins!`,
        };
      }
    }

    // 3. Simulate duel
    const combatResult = this.combatSimulator.simulate(challengerCards, opponentCards);

    let winnerUserId: string | 'DRAW' = 'DRAW';
    let loserUserId: string | 'DRAW' = 'DRAW';
    let ratingDelta = 0;

    if (combatResult.winner === 'TEAM_A') {
      winnerUserId = challengerId;
      loserUserId = opponentId;
      ratingDelta = 25;
    } else if (combatResult.winner === 'TEAM_B') {
      winnerUserId = opponentId;
      loserUserId = challengerId;
      ratingDelta = 25;
    }

    // 4. Resolve wagers: transfer wager from loser to winner
    let wagerWon: number | undefined;
    if (wagerCredits > 0 && this.economyRepo && winnerUserId !== 'DRAW' && loserUserId !== 'DRAW') {
      wagerWon = wagerCredits;
      await this.economyRepo.transferBalance({
        fromUserId: loserUserId,
        toUserId: winnerUserId,
        amount: wagerCredits,
        source: 'PVP_DUEL',
      });
    }

    return {
      success: true,
      winnerUserId,
      loserUserId,
      combatResult,
      wagerWon,
      ratingDelta,
    };
  }
}
