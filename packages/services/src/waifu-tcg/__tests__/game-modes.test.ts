import { describe, it, expect, beforeEach } from 'vitest';
import { ExpeditionService } from '../game-modes/expedition-service.js';
import { BossRaidService } from '../game-modes/boss-raid-service.js';
import { PvPDuelService } from '../game-modes/pvp-duel-service.js';
import { QuestService } from '../game-modes/quest-service.js';
import type { Combatant } from '../combat/types.js';

// Mock PlayerEnergyRepository with in-memory state
class MockPlayerEnergyRepository {
  private energyMap = new Map<string, number>();

  setEnergy(userId: string, amount: number) {
    this.energyMap.set(userId, amount);
  }

  getEnergy(userId: string): number {
    return this.energyMap.get(userId) ?? 100;
  }

  async consumeEnergy(
    userId: string,
    amount: number,
  ): Promise<{ success: boolean; currentEnergy: number; reason?: string }> {
    const current = this.getEnergy(userId);
    if (current < amount) {
      return {
        success: false,
        currentEnergy: current,
        reason: `Insufficient energy! Required: ${amount}, Available: ${current}`,
      };
    }
    const updated = current - amount;
    this.energyMap.set(userId, updated);
    return { success: true, currentEnergy: updated };
  }
}

// Mock EconomyRepository
class MockEconomyRepository {
  private balances = new Map<string, number>();

  setBalance(userId: string, amount: number) {
    this.balances.set(userId, amount);
  }

  async getOrCreateBalance(
    userId: string,
  ): Promise<{ walletBalance: number; bankBalance: number }> {
    return { walletBalance: this.balances.get(userId) ?? 0, bankBalance: 0 };
  }

  async transferBalance(params: {
    fromUserId: string;
    toUserId: string;
    amount: number | bigint;
    source?: string;
  }) {
    const amt = Number(params.amount);
    const fromBal = this.balances.get(params.fromUserId) ?? 0;
    const toBal = this.balances.get(params.toUserId) ?? 0;
    this.balances.set(params.fromUserId, fromBal - amt);
    this.balances.set(params.toUserId, toBal + amt);
    return {} as any;
  }
}

function createCombatant(
  id: string,
  name: string,
  element: Combatant['element'] = 'FIRE',
): Combatant {
  return {
    id,
    name,
    team: 'TEAM_A',
    element,
    rarity: 'RARE',
    level: 25,
    maxHealth: 2500,
    currentHealth: 2500,
    attack: 400,
    defense: 150,
    speed: 100,
    critRate: 0.1,
    critDamage: 1.5,
    maxMp: 100,
    currentMp: 0,
    skillName: 'Blazing Strike',
    skillManaCost: 50,
    shield: 0,
    statusEffects: [],
    perks: [],
    hasUsedPhoenixWard: false,
    isAlive: true,
  };
}

describe('TCG Game Modes Suite (TASK-1022)', () => {
  let mockEnergyRepo: MockPlayerEnergyRepository;
  let mockEconomyRepo: MockEconomyRepository;

  beforeEach(() => {
    mockEnergyRepo = new MockPlayerEnergyRepository();
    mockEconomyRepo = new MockEconomyRepository();
  });

  describe('ExpeditionService', () => {
    it('should consume energy and start a timed expedition', async () => {
      mockEnergyRepo.setEnergy('user_1', 50);
      const service = new ExpeditionService(mockEnergyRepo as any);

      // Start 1h expedition (10 energy)
      const res = await service.startExpedition('user_1', 'card_1', '1h', 1000); // 1s for test
      expect(res.success).toBe(true);
      expect(res.expedition).toBeDefined();
      expect(mockEnergyRepo.getEnergy('user_1')).toBe(40);

      // Card cannot be deployed twice concurrently
      const dup = await service.startExpedition('user_1', 'card_1', '1h');
      expect(dup.success).toBe(false);
      expect(dup.error).toContain('already deployed');
    });

    it('should prevent premature reward claim and award rewards after completion', async () => {
      mockEnergyRepo.setEnergy('user_1', 100);
      const service = new ExpeditionService(mockEnergyRepo as any);

      // 50ms expedition
      const { expedition } = await service.startExpedition('user_1', 'card_1', '1h', 50);

      // Immediate claim fails
      const earlyClaim = await service.claimExpedition('user_1', expedition!.id);
      expect(earlyClaim.success).toBe(false);
      expect(earlyClaim.error).toContain('still in progress');

      // Wait for timer
      await new Promise((r) => setTimeout(r, 60));

      const claim = await service.claimExpedition('user_1', expedition!.id, () => 0.5);
      expect(claim.success).toBe(true);
      expect(claim.rewards?.credits).toBeGreaterThan(0);
      expect(claim.rewards?.dust).toBeGreaterThan(0);

      // Cannot claim twice
      const secondClaim = await service.claimExpedition('user_1', expedition!.id);
      expect(secondClaim.success).toBe(false);
      expect(secondClaim.error).toContain('already been claimed');
    });
  });

  describe('BossRaidService', () => {
    it('should attack boss, consume 30 energy, and reduce boss HP', async () => {
      mockEnergyRepo.setEnergy('user_1', 100);
      const service = new BossRaidService(mockEnergyRepo as any);

      const boss = service.getCurrentBoss();
      expect(boss.name).toBe('Abyssal Leviathan');
      expect(boss.currentHp).toBe(100000);

      const card = createCombatant('card_hero', 'Hero Card', 'LIGHTNING'); // Advantage over WATER
      const attackRes = await service.attackBoss('user_1', card);

      expect(attackRes.success).toBe(true);
      expect(attackRes.damageDealt).toBeGreaterThan(0);
      expect(attackRes.bossRemainingHp).toBeLessThan(100000);
      expect(mockEnergyRepo.getEnergy('user_1')).toBe(70); // 100 - 30 = 70
      expect(attackRes.rewards?.raidBadges).toBeGreaterThanOrEqual(1);

      const leaderboard = service.getLeaderboard();
      expect(leaderboard[0]?.userId).toBe('user_1');
      expect(leaderboard[0]?.totalDamage).toBe(attackRes.damageDealt);
    });

    it('should reject attack when user has insufficient energy', async () => {
      mockEnergyRepo.setEnergy('user_1', 10);
      const service = new BossRaidService(mockEnergyRepo as any);
      const card = createCombatant('card_hero', 'Hero Card');

      const res = await service.attackBoss('user_1', card);
      expect(res.success).toBe(false);
      expect(res.error).toContain('Insufficient energy');
    });
  });

  describe('PvPDuelService', () => {
    it('should execute a 1v1 duel, consume 5 energy, and transfer wagers to the winner', async () => {
      mockEnergyRepo.setEnergy('player_a', 50);
      mockEconomyRepo.setBalance('player_a', 500);
      mockEconomyRepo.setBalance('player_b', 500);

      const service = new PvPDuelService(mockEnergyRepo as any, mockEconomyRepo as any);

      const strongCard = createCombatant('strong_card', 'Champion', 'FIRE');
      strongCard.attack = 1000;
      strongCard.maxHealth = 5000;
      strongCard.currentHealth = 5000;

      const weakCard = createCombatant('weak_card', 'Rookie', 'ICE'); // Disadvantage vs FIRE
      weakCard.attack = 50;
      weakCard.maxHealth = 500;
      weakCard.currentHealth = 500;

      const duelRes = await service.executeDuel({
        challengerId: 'player_a',
        opponentId: 'player_b',
        challengerCards: [strongCard],
        opponentCards: [weakCard],
        wagerCredits: 100,
      });

      expect(duelRes.success).toBe(true);
      expect(duelRes.winnerUserId).toBe('player_a');
      expect(duelRes.ratingDelta).toBe(25);
      expect(duelRes.wagerWon).toBe(100);
      expect(mockEnergyRepo.getEnergy('player_a')).toBe(45); // 50 - 5 = 45

      // Check balances after payout: player_a had 500 + 100 = 600, player_b had 500 - 100 = 400
      const balA = await mockEconomyRepo.getOrCreateBalance('player_a');
      const balB = await mockEconomyRepo.getOrCreateBalance('player_b');
      expect(balA.walletBalance).toBe(600);
      expect(balB.walletBalance).toBe(400);
    });

    it('should reject self-duels', async () => {
      mockEnergyRepo.setEnergy('player_a', 50);
      const service = new PvPDuelService(mockEnergyRepo as any);

      const res = await service.executeDuel({
        challengerId: 'player_a',
        opponentId: 'player_a',
        challengerCards: [createCombatant('c1', 'Card')],
        opponentCards: [createCombatant('c2', 'Card')],
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('cannot challenge yourself');
    });
  });

  describe('QuestService', () => {
    it('should track quest progress and allow claiming rewards once completed', async () => {
      const service = new QuestService();

      const initialQuests = service.getUserQuests('user_1');
      expect(initialQuests.length).toBe(4);
      expect(initialQuests[0]?.isCompleted).toBe(false);

      // Complete Daily PvP Win quest
      service.recordProgress('user_1', 'daily_pvp_win', 1);

      const updatedQuests = service.getUserQuests('user_1');
      const pvpQuest = updatedQuests.find((q) => q.questId === 'daily_pvp_win');
      expect(pvpQuest?.isCompleted).toBe(true);
      expect(pvpQuest?.isClaimed).toBe(false);

      // Claim rewards
      const claimRes = service.claimQuest('user_1', 'daily_pvp_win');
      expect(claimRes.success).toBe(true);
      expect(claimRes.rewardCredits).toBe(200);
      expect(claimRes.rewardDust).toBe(20);

      // Cannot claim again
      const repeatClaim = service.claimQuest('user_1', 'daily_pvp_win');
      expect(repeatClaim.success).toBe(false);
      expect(repeatClaim.error).toContain('already been claimed');
    });
  });
});
