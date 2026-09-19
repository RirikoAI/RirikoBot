import type {
  PlayerEnergyRepository,
  UserDungeonProgressRepository,
  DungeonFloorRepository,
  DungeonSeasonRepository,
} from '@ririko/database';
import type { CardElement } from '../types.js';
import type { Combatant, CombatActionLog, CombatResult } from '../combat/types.js';
import { ScalingEngine } from './scaling-engine.js';
import { ElementalWard } from './elemental-ward.js';
import { SeasonalAffixHandler, type SeasonTheme } from './seasonal-affixes.js';

import { DungeonLootService, type DungeonLootResult } from './dungeon-loot.service.js';

export function getDungeonFloorEnergyCost(floorNumber: number, isTutorial: boolean = false): number {
  if (isTutorial || floorNumber <= 0) return 0; // Section 7.1: Tutorial = 0 Energy
  if (floorNumber <= 10) return 10;
  if (floorNumber <= 25) return 15;
  if (floorNumber <= 40) return 20;
  return 25;
}

export interface DungeonRunOptions {
  userId: string;
  seasonId: string;
  floorNumber: number;
  playerParty: Combatant[];
  skipEnergyDeduction?: boolean;
}

export interface DungeonRunResult {
  success: boolean;
  victory: boolean;
  floorNumber: number;
  seasonId: string;
  energySpent: number;
  turnsTotal: number;
  logs: CombatActionLog[];
  highestFloorCleared: number;
  isFirstClear: boolean;
  loot?: DungeonLootResult | undefined;
  error?: string;
}

export class DungeonRunner {
  private readonly scalingEngine: ScalingEngine;
  private readonly energyRepo: PlayerEnergyRepository;
  private readonly progressRepo: UserDungeonProgressRepository;
  private readonly floorRepo: DungeonFloorRepository | undefined;
  private readonly seasonRepo: DungeonSeasonRepository | undefined;
  private readonly lootService: DungeonLootService | undefined;

  constructor(
    energyRepo: PlayerEnergyRepository,
    progressRepo: UserDungeonProgressRepository,
    options: {
      scalingEngine?: ScalingEngine | undefined;
      floorRepo?: DungeonFloorRepository | undefined;
      seasonRepo?: DungeonSeasonRepository | undefined;
      lootService?: DungeonLootService | undefined;
    } = {},
  ) {
    this.energyRepo = energyRepo;
    this.progressRepo = progressRepo;
    this.scalingEngine = options.scalingEngine ?? new ScalingEngine();
    this.floorRepo = options.floorRepo;
    this.seasonRepo = options.seasonRepo;
    this.lootService = options.lootService;
  }

  /**
   * Executes a dungeon floor attempt.
   */
  public async runFloor(options: DungeonRunOptions): Promise<DungeonRunResult> {
    const { userId, seasonId, floorNumber, playerParty, skipEnergyDeduction } = options;

    if (!playerParty || playerParty.length === 0) {
      return {
        success: false,
        victory: false,
        floorNumber,
        seasonId,
        energySpent: 0,
        turnsTotal: 0,
        logs: [],
        highestFloorCleared: 0,
        isFirstClear: false,
        error: 'No active cards selected for dungeon climb! Equip or select a card first.',
      };
    }

    // 1. Check user progress & prerequisites (sequential climb: must have cleared floorNumber - 1)
    const currentProgress = await this.progressRepo.getOrCreateProgress(userId, seasonId);
    const highestCleared = currentProgress.highestClearedFloor;

    if (floorNumber > highestCleared + 1) {
      return {
        success: false,
        victory: false,
        floorNumber,
        seasonId,
        energySpent: 0,
        turnsTotal: 0,
        logs: [],
        highestFloorCleared: highestCleared,
        isFirstClear: false,
        error: `Floor ${floorNumber} is locked! You must first clear Floor ${highestCleared + 1}.`,
      };
    }

    // 2. Determine energy cost
    const isTutorial = seasonId.toLowerCase().includes('tutorial');
    const energyCost = getDungeonFloorEnergyCost(floorNumber, isTutorial);

    if (!skipEnergyDeduction && energyCost > 0) {
      const energyResult = await this.energyRepo.consumeEnergy(userId, energyCost);
      if (!energyResult.success) {
        return {
          success: false,
          victory: false,
          floorNumber,
          seasonId,
          energySpent: 0,
          turnsTotal: 0,
          logs: [],
          highestFloorCleared: highestCleared,
          isFirstClear: false,
          error: `Insufficient energy! Required: ${energyCost} Energy, Available: ${energyResult.currentEnergy} Energy.`,
        };
      }
    }

    // 3. Look up season theme and environmental affix
    let theme: SeasonTheme = 'NONE';
    let seasonName = 'Dungeon Tower';

    if (this.seasonRepo) {
      const season = await this.seasonRepo.findById(seasonId);
      if (season) {
        seasonName = season.name;
        const affixes = season.seasonalAffixes ?? [];
        const affixString = (affixes.join(' ') + ' ' + (season.themeElement ?? '')).toUpperCase();
        if (affixString.includes('INFERNAL') || affixString.includes('SCORCHED') || season.themeElement === 'FIRE') theme = 'INFERNAL_CRUCIBLE';
        else if (affixString.includes('ABYSSAL') || affixString.includes('TORRENTIAL') || season.themeElement === 'WATER') theme = 'ABYSSAL_MAELSTROM';
        else if (affixString.includes('CELESTIAL') || affixString.includes('TWILIGHT') || season.themeElement === 'LIGHT') theme = 'CELESTIAL_TWILIGHT';
      }
    } else {
      if (seasonId.toLowerCase().includes('infernal') || seasonId === 's1') theme = 'INFERNAL_CRUCIBLE';
      else if (seasonId.toLowerCase().includes('abyssal') || seasonId === 's2') theme = 'ABYSSAL_MAELSTROM';
      else if (seasonId.toLowerCase().includes('celestial') || seasonId === 's3') theme = 'CELESTIAL_TWILIGHT';
    }

    const affixHandler = new SeasonalAffixHandler(theme, seasonName);

    // 4. Generate enemy boss/combatant
    const enemyStats = this.scalingEngine.calculateFloorStats(floorNumber);
    const floorType = this.scalingEngine.getFloorType(floorNumber);
    const enemyElement = this.getEnemyElementForSeasonAndFloor(theme, floorNumber);

    const enemyName = this.generateEnemyName(floorNumber, floorType, enemyElement);
    const enemyBoss: Combatant = {
      id: `dungeon_mob_f${floorNumber}`,
      name: enemyName,
      team: 'TEAM_B',
      element: enemyElement,
      rarity: floorType === 'MAJOR_BOSS' ? 'MYTHIC' : floorType === 'MINI_BOSS' ? 'SECRET_RARE' : 'RARE',
      level: Math.max(1, floorNumber * 2),
      maxHealth: enemyStats.hp,
      currentHealth: enemyStats.hp,
      attack: enemyStats.attack,
      defense: enemyStats.defense,
      speed: enemyStats.speed,
      critRate: 0.1,
      critDamage: 1.5,
      maxMp: 100,
      currentMp: 50,
      skillName: floorType === 'MAJOR_BOSS' ? 'Cataclysmic Shatter' : 'Elemental Rend',
      skillManaCost: 40,
      shield: 0,
      statusEffects: [],
      perks: [],
      hasUsedPhoenixWard: false,
      isAlive: true,
    };

    // 5. Build Elemental Wards for high-tier boss floors (e.g. F20+, F30+, F40+, F50+)
    let elementalWard: ElementalWard | null = null;
    if (floorNumber >= 20 && floorType !== 'STANDARD') {
      const wardLayers = this.generateWardLayers(floorNumber, enemyElement, enemyStats.hp);
      elementalWard = new ElementalWard(wardLayers);
    }

    // 6. Run Combat with custom Dungeon Combat loop incorporating Wards, Affixes, and Soft Enrage
    const simulationResult = this.simulateDungeonCombat(playerParty, enemyBoss, affixHandler, elementalWard);

    const isWin = simulationResult.winner === 'TEAM_A';
    const isFirstClear = isWin && floorNumber > highestCleared;

    let loot: DungeonLootResult | undefined;
    if (isWin && this.lootService) {
      loot = await this.lootService.generateAndDispatchLoot(userId, floorNumber, isFirstClear);
    }

    // 7. Update user dungeon progress in repository
    const updatedProgress = await this.progressRepo.recordFloorAttempt(userId, seasonId, floorNumber, isWin);

    return {
      success: true,
      victory: isWin,
      floorNumber,
      seasonId,
      energySpent: energyCost,
      turnsTotal: simulationResult.turnsTotal,
      logs: simulationResult.logs,
      highestFloorCleared: updatedProgress.highestClearedFloor,
      isFirstClear,
      loot,
    };
  }

  /**
   * Custom dungeon simulation adding Elemental Wards and Seasonal Affixes into the combat turn cycle.
   */
  private simulateDungeonCombat(
    playerParty: Combatant[],
    boss: Combatant,
    affixHandler: SeasonalAffixHandler,
    ward: ElementalWard | null,
  ): CombatResult {
    const logs: CombatActionLog[] = [];
    const party = playerParty.map((p) => ({
      ...p,
      team: 'TEAM_A' as const,
      currentHealth: p.currentHealth,
      currentMp: p.currentMp ?? 0,
      shield: p.shield ?? 0,
      statusEffects: [...(p.statusEffects ?? [])],
      isAlive: p.currentHealth > 0,
    }));

    const enemy = {
      ...boss,
      team: 'TEAM_B' as const,
      currentHealth: boss.currentHealth,
      currentMp: boss.currentMp ?? 0,
      shield: boss.shield ?? 0,
      statusEffects: [...(boss.statusEffects ?? [])],
      isAlive: true,
    };

    // Environmental Affix at Start
    const startAffixLogs = affixHandler.applyBattleStartAffixes([...party, enemy]);
    logs.push(...startAffixLogs);

    if (ward) {
      logs.push({
        turn: 0,
        actorId: enemy.id,
        actorName: enemy.name,
        actionType: 'STATUS_TICK',
        message: `🛡️ **Boss Ward Active:** ${ward.formatWardStatus()}! Matching elements required to break!`,
      });
    }

    let turn = 1;
    const maxTurns = 25;
    let winner: 'TEAM_A' | 'TEAM_B' | 'DRAW' = 'DRAW';

    while (turn <= maxTurns) {
      // Check defeat
      if (party.every((c) => !c.isAlive || c.currentHealth <= 0)) {
        winner = 'TEAM_B';
        break;
      }
      if (!enemy.isAlive || enemy.currentHealth <= 0) {
        winner = 'TEAM_A';
        break;
      }

      // Soft Enrage check (turn 10+)
      const enrageMultiplier = turn >= 10 ? 1 + (turn - 9) : 1.0;
      if (turn === 10) {
        logs.push({
          turn,
          actorId: enemy.id,
          actorName: enemy.name,
          actionType: 'ENRAGE',
          message: `⚠️ **SOFT ENRAGE ACTIVATED!** ${enemy.name} gains +100% Attack per turn with true damage strikes!`,
        });
      }

      // Order turn by speed
      const aliveAll = [...party.filter((c) => c.isAlive), enemy].sort((a, b) => b.speed - a.speed);

      for (const actor of aliveAll) {
        if (!actor.isAlive || actor.currentHealth <= 0) continue;

        if (actor.team === 'TEAM_A') {
          // Player card attacks boss
          if (!enemy.isAlive || enemy.currentHealth <= 0) break;

          const baseAtk = actor.attack;
          const isCrit = Math.random() < actor.critRate;
          let rawDmg = Math.round(baseAtk * (isCrit ? actor.critDamage : 1.0) * (100 / (100 + enemy.defense)));
          rawDmg = Math.max(10, rawDmg);

          // Apply affix modifier
          const affixDmg = affixHandler.modifyDamage(actor, enemy, rawDmg);
          rawDmg = affixDmg.damage;
          if (affixDmg.logMessage) {
            logs.push({ turn, actorId: actor.id, actorName: actor.name, actionType: 'ATTACK', message: affixDmg.logMessage });
          }

          // Check Elemental Ward
          if (ward && !ward.isBroken()) {
            const wardResult = ward.processAttack(actor.element, rawDmg);
            logs.push({
              turn,
              actorId: actor.id,
              actorName: actor.name,
              actionType: 'ATTACK',
              targetId: enemy.id,
              targetName: enemy.name,
              message: wardResult.message,
            });

            if (wardResult.damagePassedToBoss > 0) {
              enemy.currentHealth = Math.max(0, enemy.currentHealth - wardResult.damagePassedToBoss);
              if (enemy.currentHealth <= 0) {
                enemy.isAlive = false;
                logs.push({
                  turn,
                  actorId: actor.id,
                  actorName: actor.name,
                  actionType: 'ATTACK',
                  message: `🏆 **${enemy.name} was vanquished!**`,
                });
                break;
              }
            }
          } else {
            // Direct damage to boss
            enemy.currentHealth = Math.max(0, enemy.currentHealth - rawDmg);
            logs.push({
              turn,
              actorId: actor.id,
              actorName: actor.name,
              actionType: 'ATTACK',
              targetId: enemy.id,
              targetName: enemy.name,
              damageDealt: rawDmg,
              isCritical: isCrit,
              message: `⚔️ **${actor.name}** dealt **${rawDmg}** damage to **${enemy.name}**!${isCrit ? ' (CRITICAL!)' : ''}`,
            });

            if (enemy.currentHealth <= 0) {
              enemy.isAlive = false;
              logs.push({
                turn,
                actorId: actor.id,
                actorName: actor.name,
                actionType: 'ATTACK',
                message: `🏆 **${enemy.name} was vanquished!**`,
              });
              break;
            }
          }
        } else {
          // Boss attacks a living player card
          const livingCards = party.filter((c) => c.isAlive && c.currentHealth > 0);
          if (livingCards.length === 0) break;
          const target = livingCards[Math.floor(Math.random() * livingCards.length)]!;

          const bossAtk = Math.round(enemy.attack * enrageMultiplier);
          let damage = Math.round(bossAtk * (100 / (100 + target.defense)));
          if (turn >= 10) {
            // Unblockable true damage during enrage
            damage = bossAtk;
          }
          damage = Math.max(15, damage);

          target.currentHealth = Math.max(0, target.currentHealth - damage);
          if (target.currentHealth <= 0) target.isAlive = false;

          logs.push({
            turn,
            actorId: enemy.id,
            actorName: enemy.name,
            actionType: 'ATTACK',
            targetId: target.id,
            targetName: target.name,
            damageDealt: damage,
            message: `💥 **${enemy.name}** struck **${target.name}** for **${damage}** damage!${turn >= 10 ? ' *(TRUE DAMAGE ENRAGE!)*' : ''}${!target.isAlive ? ` (${target.name} fainted!)` : ''}`,
          });
        }
      }

      // End of turn affixes (e.g. Scorched Earth burn, Tidal Barrier heal)
      const endAffixLogs = affixHandler.applyEndOfTurnAffixes(turn, party, enemy);
      logs.push(...endAffixLogs);

      turn++;
    }

    if (winner === 'DRAW') {
      if (enemy.currentHealth <= 0) winner = 'TEAM_A';
      else winner = 'TEAM_B'; // turn limit exceeded
    }

    return {
      winner,
      turnsTotal: Math.min(turn, maxTurns),
      logs,
      teamA: party,
      teamB: [enemy],
    };
  }

  private getEnemyElementForSeasonAndFloor(theme: SeasonTheme, floorNumber: number): CardElement {
    if (theme === 'INFERNAL_CRUCIBLE') {
      return floorNumber % 2 === 0 ? 'FIRE' : 'EARTH';
    }
    if (theme === 'ABYSSAL_MAELSTROM') {
      return floorNumber % 2 === 0 ? 'WATER' : 'ICE';
    }
    if (theme === 'CELESTIAL_TWILIGHT') {
      return floorNumber % 2 === 0 ? 'LIGHT' : 'SHADOW';
    }
    const elements: CardElement[] = ['FIRE', 'ICE', 'EARTH', 'LIGHTNING', 'WATER', 'LIGHT', 'SHADOW'];
    return elements[(floorNumber - 1) % elements.length]!;
  }

  private generateEnemyName(floorNumber: number, floorType: string, element: CardElement): string {
    if (floorType === 'MAJOR_BOSS') {
      const names = [
        `Ignis the Ash Colossus`,
        `Leviathan of the Abyssal Core`,
        `Valkyrie of the Celestial Eclipse`,
        `Chronos Titan of Void`,
        `Ririko the Ascended Arbiter`,
      ];
      return names[Math.min(names.length - 1, Math.floor(floorNumber / 10) - 1)] ?? `Elder Primordial [${element}]`;
    }
    if (floorType === 'MINI_BOSS') {
      return `Dread Commander [${element}]`;
    }
    return `Tower Sentinel [${element}] F${floorNumber}`;
  }

  private generateWardLayers(
    floorNumber: number,
    baseElement: CardElement,
    bossMaxHp: number,
  ): Array<{ element: CardElement; health: number }> {
    const layerHp = Math.max(500, Math.round(bossMaxHp * 0.15));

    if (floorNumber >= 40) {
      // 3-Layer Ward (Fire -> Lightning -> Ice)
      return [
        { element: 'FIRE', health: layerHp },
        { element: 'LIGHTNING', health: layerHp },
        { element: 'ICE', health: layerHp },
      ];
    } else if (floorNumber >= 30) {
      // 2-Layer Ward (e.g. Water -> Earth)
      return [
        { element: 'WATER', health: layerHp },
        { element: 'EARTH', health: layerHp },
      ];
    } else {
      // 1-Layer Ward matching counter element
      return [{ element: baseElement === 'FIRE' ? 'WATER' : 'FIRE', health: layerHp }];
    }
  }
}
