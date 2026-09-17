import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameEscrowService } from '../escrow.js';
import type { EconomyRepository } from '@ririko/database';
import type { Player } from '../types.js';

describe('GameEscrowService (TASK-0921)', () => {
  let mockRepo: Partial<EconomyRepository>;
  let escrowService: GameEscrowService;

  const player1: Player = { id: 'p1', username: 'PlayerOne' };
  const player2: Player = { id: 'p2', username: 'PlayerTwo' };
  const aiPlayer: Player = { id: 'ai', username: 'Ririko', isAi: true };

  beforeEach(() => {
    mockRepo = {
      isAccountFrozen: vi.fn().mockResolvedValue(false),
      getOrCreateBalance: vi.fn().mockResolvedValue({
        userId: 'p1',
        walletBalance: 1000,
        bankBalance: 0,
        bankCapacity: 10000,
        netWorth: 1000,
      } as any),
      modifyBalance: vi.fn().mockResolvedValue({} as any),
    };
    escrowService = new GameEscrowService(mockRepo as EconomyRepository);
  });

  it('rejects escrow if a player account is frozen', async () => {
    (mockRepo.isAccountFrozen as any).mockImplementation(async (id: string) => id === 'p1');

    const res = await escrowService.escrowWagers('g1', [player1, player2], 100);
    expect(res.success).toBe(false);
    expect(res.error).toContain('frozen economy account');
    expect(mockRepo.modifyBalance).not.toHaveBeenCalled();
  });

  it('rejects escrow if a player has insufficient wallet balance', async () => {
    (mockRepo.getOrCreateBalance as any).mockImplementation(async (id: string) => ({
      userId: id,
      walletBalance: id === 'p2' ? 50 : 1000,
    }));

    const res = await escrowService.escrowWagers('g1', [player1, player2], 100);
    expect(res.success).toBe(false);
    expect(res.error).toContain('insufficient wallet credits');
    expect(mockRepo.modifyBalance).not.toHaveBeenCalled();
  });

  it('atomically deducts escrow from both human players upon start', async () => {
    const res = await escrowService.escrowWagers('g1', [player1, player2], 100);
    expect(res.success).toBe(true);

    expect(mockRepo.modifyBalance).toHaveBeenCalledTimes(2);
    expect(mockRepo.modifyBalance).toHaveBeenCalledWith({
      userId: 'p1',
      guildId: 'g1',
      walletDelta: -100,
      type: 'GAME_ESCROW',
      source: 'GAME_START',
      metadata: { wagerAmount: 100 },
    });
    expect(mockRepo.modifyBalance).toHaveBeenCalledWith({
      userId: 'p2',
      guildId: 'g1',
      walletDelta: -100,
      type: 'GAME_ESCROW',
      source: 'GAME_START',
      metadata: { wagerAmount: 100 },
    });
  });

  it('settles win by awarding full pot (200) to winning human player', async () => {
    await escrowService.settleWagers({
      guildId: 'g1',
      players: [player1, player2],
      winnerId: 'p1',
      isTie: false,
      amount: 100,
    });

    expect(mockRepo.modifyBalance).toHaveBeenCalledWith({
      userId: 'p1',
      guildId: 'g1',
      walletDelta: 200,
      type: 'GAME_WIN',
      source: 'GAME_WIN',
      metadata: { totalPot: 200, originalWager: 100 },
    });
  });

  it('settles tie by refunding wager (100) to all human players', async () => {
    await escrowService.settleWagers({
      guildId: 'g1',
      players: [player1, player2],
      winnerId: null,
      isTie: true,
      amount: 100,
    });

    expect(mockRepo.modifyBalance).toHaveBeenCalledTimes(2);
    expect(mockRepo.modifyBalance).toHaveBeenCalledWith({
      userId: 'p1',
      guildId: 'g1',
      walletDelta: 100,
      type: 'GAME_ESCROW_REFUND',
      source: 'GAME_TIE',
      metadata: { refundAmount: 100 },
    });
    expect(mockRepo.modifyBalance).toHaveBeenCalledWith({
      userId: 'p2',
      guildId: 'g1',
      walletDelta: 100,
      type: 'GAME_ESCROW_REFUND',
      source: 'GAME_TIE',
      metadata: { refundAmount: 100 },
    });
  });

  it('handles human vs AI match win correctly', async () => {
    // Human wins vs AI: receives 2x wager
    await escrowService.settleWagers({
      guildId: 'g1',
      players: [player1, aiPlayer],
      winnerId: 'p1',
      isTie: false,
      amount: 50,
    });

    expect(mockRepo.modifyBalance).toHaveBeenCalledWith({
      userId: 'p1',
      guildId: 'g1',
      walletDelta: 100,
      type: 'GAME_WIN',
      source: 'GAME_WIN',
      metadata: { totalPot: 100, originalWager: 50 },
    });
  });
});
