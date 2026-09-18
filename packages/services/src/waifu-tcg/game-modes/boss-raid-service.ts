import type { PlayerEnergyRepository } from '@ririko/database';
import { CombatSimulator } from '../combat/combat-simulator.js';
import type { Combatant, CombatResult } from '../combat/types.js';

export const BOSS_RAID_ENERGY_COST = 30; // Section 12.4

export interface WorldBossState {
  id: string;
  name: string;
  title: string;
  element: Combatant['element'];
  totalHp: number;
  currentHp: number;
  attack: number;
  defense: number;
  speed: number;
  isDefeated: boolean;
  defeatedBy?: string;
  endsAt: Date;
}

export interface BossRaidParticipant {
  userId: string;
  totalDamage: number;
  attemptsCount: number;
  lastAttemptAt: Date;
}

export interface BossAttackResult {
  success: boolean;
  damageDealt: number;
  bossRemainingHp: number;
  isBossDefeated: boolean;
  combatResult?: CombatResult;
  rewards?: {
    raidBadges: number;
    credits: number;
    craftingDust: number;
  };
  error?: string;
}

export class BossRaidService {
  private currentBoss: WorldBossState;
  private readonly participants: Map<string, BossRaidParticipant> = new Map();
  private readonly energyRepo: PlayerEnergyRepository;
  private readonly combatSimulator: CombatSimulator;

  constructor(energyRepo: PlayerEnergyRepository, combatSimulator?: CombatSimulator) {
    this.energyRepo = energyRepo;
    this.combatSimulator = combatSimulator ?? new CombatSimulator({ maxTurns: 10 });
    this.currentBoss = this.generateDefaultBoss();
  }

  private generateDefaultBoss(): WorldBossState {
    const now = new Date();
    return {
      id: `boss_${now.getFullYear()}_leviathan`,
      name: 'Abyssal Leviathan',
      title: 'World Scourge of the Depths',
      element: 'WATER',
      totalHp: 100000,
      currentHp: 100000,
      attack: 600,
      defense: 250,
      speed: 75,
      isDefeated: false,
      endsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days duration
    };
  }

  public getCurrentBoss(): WorldBossState {
    return { ...this.currentBoss };
  }

  /**
   * Attacks the world boss, consuming 30 energy.
   */
  public async attackBoss(
    userId: string,
    attackerCard: Combatant,
  ): Promise<BossAttackResult> {
    if (this.currentBoss.isDefeated || this.currentBoss.currentHp <= 0) {
      return {
        success: false,
        damageDealt: 0,
        bossRemainingHp: 0,
        isBossDefeated: true,
        error: `The World Boss **${this.currentBoss.name}** has already been defeated! Wait for the next raid cycle.`,
      };
    }

    // 1. Consume 30 energy
    const energyResult = await this.energyRepo.consumeEnergy(userId, BOSS_RAID_ENERGY_COST);
    if (!energyResult.success) {
      return {
        success: false,
        damageDealt: 0,
        bossRemainingHp: this.currentBoss.currentHp,
        isBossDefeated: false,
        error: energyResult.reason ?? `Insufficient energy (${BOSS_RAID_ENERGY_COST} required).`,
      };
    }

    // 2. Prepare Boss Combatant
    const bossCombatant: Combatant = {
      id: this.currentBoss.id,
      name: this.currentBoss.name,
      team: 'TEAM_B',
      element: this.currentBoss.element,
      rarity: 'MYTHIC',
      level: 100,
      maxHealth: this.currentBoss.totalHp,
      currentHealth: this.currentBoss.currentHp,
      attack: this.currentBoss.attack,
      defense: this.currentBoss.defense,
      speed: this.currentBoss.speed,
      critRate: 0.15,
      critDamage: 1.5,
      maxMp: 100,
      currentMp: 50,
      skillName: 'Tidal Cataclysm',
      skillDescription: 'Crushes all foes with high-pressure ocean currents.',
      skillManaCost: 50,
      shield: 0,
      statusEffects: [],
      perks: ['SHARPENED_EDGE'],
      hasUsedPhoenixWard: false,
      isAlive: true,
    };

    // 3. Simulate Combat for 10 rounds max
    const attackerInstance: Combatant = {
      ...attackerCard,
      team: 'TEAM_A',
    };

    const combatResult = this.combatSimulator.simulate([attackerInstance], [bossCombatant]);

    // Calculate damage dealt to boss across all action logs
    const damageDealt = combatResult.logs
      .filter((l) => l.actorId === attackerCard.id && l.damageDealt !== undefined)
      .reduce((sum, l) => sum + (l.damageDealt ?? 0), 0);

    // Apply damage to World Boss
    this.currentBoss.currentHp = Math.max(0, this.currentBoss.currentHp - damageDealt);
    const isDefeated = this.currentBoss.currentHp <= 0;
    if (isDefeated) {
      this.currentBoss.isDefeated = true;
      this.currentBoss.defeatedBy = userId;
    }

    // Record participant progress
    const prev = this.participants.get(userId) ?? {
      userId,
      totalDamage: 0,
      attemptsCount: 0,
      lastAttemptAt: new Date(),
    };
    this.participants.set(userId, {
      userId,
      totalDamage: prev.totalDamage + damageDealt,
      attemptsCount: prev.attemptsCount + 1,
      lastAttemptAt: new Date(),
    });

    // Reward scaling based on damage dealt
    const raidBadges = Math.max(1, Math.round(damageDealt / 500));
    const credits = Math.max(50, Math.round(damageDealt / 2));
    const craftingDust = Math.max(5, Math.round(damageDealt / 100));

    return {
      success: true,
      damageDealt,
      bossRemainingHp: this.currentBoss.currentHp,
      isBossDefeated: isDefeated,
      combatResult,
      rewards: {
        raidBadges,
        credits,
        craftingDust,
      },
    };
  }

  /**
   * Retrieves raid leaderboard sorted by total damage.
   */
  public getLeaderboard(): BossRaidParticipant[] {
    return Array.from(this.participants.values()).sort((a, b) => b.totalDamage - a.totalDamage);
  }
}
