import type { EconomyRepository } from '@ririko/database';
import type { Player } from './types.js';

export interface EscrowResult {
  success: boolean;
  error?: string | undefined;
}

export interface SettleWagersOptions {
  guildId: string;
  players: Player[];
  winnerId?: string | null | undefined;
  isTie: boolean;
  amount: number;
}

export class GameEscrowService {
  constructor(private readonly economyRepo: EconomyRepository) {}

  /**
   * Validates balances and atomically escrows wagers from human players.
   */
  public async escrowWagers(
    guildId: string,
    players: Player[],
    amount: number,
  ): Promise<EscrowResult> {
    if (!amount || amount <= 0) {
      return { success: true };
    }

    // 1. Validation phase: check freeze & balance for all human participants
    for (const player of players) {
      if (player.isAi) continue;

      const isFrozen = await this.economyRepo.isAccountFrozen(player.id);
      if (isFrozen) {
        return {
          success: false,
          error: `Player ${player.username} has a frozen economy account.`,
        };
      }

      const balance = await this.economyRepo.getOrCreateBalance(player.id);
      if (Number(balance.walletBalance) < amount) {
        return {
          success: false,
          error: `Player ${player.username} has insufficient wallet credits (${balance.walletBalance} < ${amount}).`,
        };
      }
    }

    // 2. Deduction phase: hold wagers in escrow
    for (const player of players) {
      if (player.isAi) continue;

      await this.economyRepo.modifyBalance({
        userId: player.id,
        guildId,
        walletDelta: -amount,
        type: 'GAME_ESCROW',
        source: 'GAME_START',
        metadata: { wagerAmount: amount },
      });
    }

    return { success: true };
  }

  /**
   * Settles wagers upon game completion:
   * - Tie: refunds escrowed wager back to all human players.
   * - Win: awards full pot to the winning human player. If AI won, human loss is finalized.
   */
  public async settleWagers(options: SettleWagersOptions): Promise<void> {
    const { guildId, players, winnerId, isTie, amount } = options;
    if (!amount || amount <= 0) return;

    if (isTie || !winnerId) {
      for (const player of players) {
        if (player.isAi) continue;
        await this.economyRepo.modifyBalance({
          userId: player.id,
          guildId,
          walletDelta: amount,
          type: 'GAME_ESCROW_REFUND',
          source: 'GAME_TIE',
          metadata: { refundAmount: amount },
        });
      }
      return;
    }

    const winner = players.find((p) => p.id === winnerId);
    if (!winner || winner.isAi) {
      // AI won: the house retains the escrowed credits
      return;
    }

    // Calculate total pot: either 2x for 1 human vs AI, or humanCount * amount
    const humanCount = players.filter((p) => !p.isAi).length;
    const totalPot = humanCount === 1 ? amount * 2 : amount * players.length;

    await this.economyRepo.modifyBalance({
      userId: winner.id,
      guildId,
      walletDelta: totalPot,
      type: 'GAME_WIN',
      source: 'GAME_WIN',
      metadata: { totalPot, originalWager: amount },
    });
  }

  /**
   * Refunds escrowed wagers in the event of game cancellation or early abort.
   */
  public async refundWagers(
    guildId: string,
    players: Player[],
    amount: number,
    reason = 'GAME_CANCELLED',
  ): Promise<void> {
    if (!amount || amount <= 0) return;

    for (const player of players) {
      if (player.isAi) continue;

      await this.economyRepo.modifyBalance({
        userId: player.id,
        guildId,
        walletDelta: amount,
        type: 'GAME_ESCROW_REFUND',
        source: reason,
        metadata: { refundAmount: amount, reason },
      });
    }
  }
}
