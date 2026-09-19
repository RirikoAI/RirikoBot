import type {
  PlayerEnergyRepository,
  UserDungeonProgressRepository,
  DungeonFloorRepository,
  DungeonSeasonRepository,
  WaifuCardRepository,
} from '@ririko/database';
import type { CardElement } from '../types.js';
import type { Combatant, CombatActionLog, CombatResult } from '../combat/types.js';
import { ScalingEngine } from './scaling-engine.js';
import { ElementalWard } from './elemental-ward.js';
import { SeasonalAffixHandler, type SeasonTheme } from './seasonal-affixes.js';

import { DungeonLootService, type DungeonLootResult } from './dungeon-loot.service.js';
import { TUTORIAL_FLOORS, TutorialService, getCounterElement } from './tutorial-service.js';

import { DungeonBattleSession } from './dungeon-battle-session.js';

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
  skipEnergyDeduction?: boolean | undefined;
}

export interface CreateBattleSessionResult {
  success: boolean;
  session?: DungeonBattleSession;
  energySpent: number;
  highestFloorCleared: number;
  error?: string | undefined;
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
  error?: string | undefined;
}

export class DungeonRunner {
  private readonly energyRepo: PlayerEnergyRepository;
  private readonly progressRepo: UserDungeonProgressRepository;
  private readonly scalingEngine: ScalingEngine;
  private readonly floorRepo: DungeonFloorRepository | undefined;
  private readonly seasonRepo: DungeonSeasonRepository | undefined;
  private readonly lootService: DungeonLootService | undefined;
  private readonly cardRepo: WaifuCardRepository | undefined;
  private readonly tutorialService: TutorialService | undefined;

  constructor(
    energyRepo: PlayerEnergyRepository,
    progressRepo: UserDungeonProgressRepository,
    options: {
      scalingEngine?: ScalingEngine | undefined;
      floorRepo?: DungeonFloorRepository | undefined;
      seasonRepo?: DungeonSeasonRepository | undefined;
      lootService?: DungeonLootService | undefined;
      cardRepo?: WaifuCardRepository | undefined;
      tutorialService?: TutorialService | undefined;
    } = {},
  ) {
    this.energyRepo = energyRepo;
    this.progressRepo = progressRepo;
    this.scalingEngine = options.scalingEngine ?? new ScalingEngine();
    this.floorRepo = options.floorRepo;
    this.seasonRepo = options.seasonRepo;
    this.lootService = options.lootService;
    this.cardRepo = options.cardRepo;
    this.tutorialService = options.tutorialService;
  }

  /**
   * Executes a dungeon floor attempt.
   */
  /**
   * Prepares floor setup, validates prerequisites, consumes energy, and initializes boss & affixes.
   */
  public async prepareFloorSetup(options: DungeonRunOptions): Promise<{
    success: boolean;
    error?: string | undefined;
    energyCost: number;
    highestCleared: number;
    affixHandler?: SeasonalAffixHandler | undefined;
    enemyBoss?: Combatant | undefined;
    elementalWard?: ElementalWard | null | undefined;
  }> {
    const { userId, seasonId, floorNumber, playerParty, skipEnergyDeduction } = options;

    if (!playerParty || playerParty.length === 0) {
      return {
        success: false,
        energyCost: 0,
        highestCleared: 0,
        error: 'No active cards selected for dungeon climb! Equip or select a card first.',
      };
    }

    // 1. Check user progress & prerequisites (sequential climb: must have cleared floorNumber - 1)
    const currentProgress = await this.progressRepo.getOrCreateProgress(userId, seasonId);
    const highestCleared = currentProgress.highestClearedFloor;

    if (floorNumber > highestCleared + 1) {
      return {
        success: false,
        energyCost: 0,
        highestCleared,
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
          energyCost,
          highestCleared,
          error: `Insufficient energy! Floor ${floorNumber} requires ${energyCost} energy. Current: ${energyResult.currentEnergy}`,
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
    let enemyBoss: Combatant;
    let elementalWard: ElementalWard | null = null;

    if (isTutorial) {
      const tutFloor = TUTORIAL_FLOORS.find((f) => f.floorNumber === floorNumber);
      if (tutFloor) {
        enemyBoss = { ...tutFloor.dummyEnemy };
        if (floorNumber === 4) {
          const playerElement = (playerParty[0]?.element as CardElement) ?? 'FIRE';
          let bossElement: CardElement = getCounterElement(playerElement);
          let bossName = `Warded Guardian Automaton [${bossElement}]`;

          if (this.tutorialService) {
            const config = await this.tutorialService.getFloor4BossConfig(userId, playerElement);
            bossElement = config.element;
            bossName = config.name;
          }

          enemyBoss.element = bossElement;
          enemyBoss.name = bossName;
          elementalWard = new ElementalWard([
            {
              element: bossElement,
              health: 100,
            },
          ]);
        }
      } else {
        const enemyStats = this.scalingEngine.calculateFloorStats(floorNumber);
        const enemyElement = this.getEnemyElementForSeasonAndFloor(theme, floorNumber);
        enemyBoss = {
          id: `dungeon_mob_t${floorNumber}`,
          name: `Training Automaton T${floorNumber}`,
          team: 'TEAM_B',
          element: enemyElement,
          rarity: 'COMMON',
          level: floorNumber,
          maxHealth: enemyStats.hp,
          currentHealth: enemyStats.hp,
          attack: enemyStats.attack,
          defense: enemyStats.defense,
          speed: enemyStats.speed,
          critRate: 0.05,
          critDamage: 1.5,
          maxMp: 0,
          currentMp: 0,
          skillManaCost: 0,
          shield: 0,
          statusEffects: [],
          perks: [],
          hasUsedPhoenixWard: false,
          isAlive: true,
        };
      }
    } else {
      const enemyStats = this.scalingEngine.calculateFloorStats(floorNumber);
      const floorType = this.scalingEngine.getFloorType(floorNumber);
      const enemyElement = this.getEnemyElementForSeasonAndFloor(theme, floorNumber);

      const enemyName = this.generateEnemyName(floorNumber, floorType, enemyElement);
      enemyBoss = {
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
      if (floorNumber >= 20 && floorType !== 'STANDARD') {
        const wardLayers = this.generateWardLayers(floorNumber, enemyElement, enemyStats.hp);
        elementalWard = new ElementalWard(wardLayers);
      }
    }

    return {
      success: true,
      energyCost,
      highestCleared,
      affixHandler,
      enemyBoss,
      elementalWard,
    };
  }

  /**
   * Creates an interactive, step-by-step DungeonBattleSession for real-time combat.
   */
  public async createBattleSession(options: DungeonRunOptions): Promise<CreateBattleSessionResult> {
    const setup = await this.prepareFloorSetup(options);
    if (!setup.success || !setup.enemyBoss || !setup.affixHandler) {
      return {
        success: false,
        energySpent: setup.energyCost,
        highestFloorCleared: setup.highestCleared,
        error: setup.error,
      };
    }

    const session = new DungeonBattleSession({
      floorNumber: options.floorNumber,
      seasonId: options.seasonId,
      userId: options.userId,
      playerCard: options.playerParty[0]!,
      boss: setup.enemyBoss,
      affixHandler: setup.affixHandler,
      ward: setup.elementalWard,
    });

    session.start();

    return {
      success: true,
      session,
      energySpent: setup.energyCost,
      highestFloorCleared: setup.highestCleared,
    };
  }

  /**
   * Finalizes an interactive battle session: saves attempt/progress to the database and dispatches loot if won.
   */
  public async finalizeBattleResult(
    session: DungeonBattleSession,
    options: { energySpent: number },
  ): Promise<DungeonRunResult> {
    const snapshot = session.getSnapshot();
    const isWin = snapshot.winner === 'TEAM_A';
    const isTutorial = session.seasonId.toLowerCase().includes('tutorial');

    const currentProgress = await this.progressRepo.getOrCreateProgress(session.userId, session.seasonId);
    const isFirstClear = isWin && session.floorNumber > currentProgress.highestClearedFloor;

    let loot: DungeonLootResult | undefined;
    if (isWin) {
      if (!isTutorial && this.lootService) {
        loot = await this.lootService.generateAndDispatchLoot(session.userId, session.floorNumber, isFirstClear);
      }
      if (this.cardRepo && snapshot.player?.id) {
        await this.cardRepo.incrementUserCardBattlesWon(snapshot.player.id).catch(() => {});
      }
    }

    const updatedProgress = await this.progressRepo.recordFloorAttempt(
      session.userId,
      session.seasonId,
      session.floorNumber,
      isWin,
    );

    return {
      success: true,
      victory: isWin,
      floorNumber: session.floorNumber,
      seasonId: session.seasonId,
      energySpent: options.energySpent,
      turnsTotal: snapshot.turn,
      logs: snapshot.allLogs,
      highestFloorCleared: updatedProgress.highestClearedFloor,
      isFirstClear,
      loot,
    };
  }

  /**
   * Executes a dungeon floor attempt (synchronous batch simulation).
   */
  public async runFloor(options: DungeonRunOptions): Promise<DungeonRunResult> {
    const setup = await this.prepareFloorSetup(options);
    if (!setup.success || !setup.enemyBoss || !setup.affixHandler) {
      return {
        success: false,
        victory: false,
        floorNumber: options.floorNumber,
        seasonId: options.seasonId,
        energySpent: setup.energyCost,
        turnsTotal: 0,
        logs: [],
        highestFloorCleared: setup.highestCleared,
        isFirstClear: false,
        error: setup.error,
      };
    }

    // Run Combat with custom Dungeon Combat loop incorporating Wards, Affixes, and Soft Enrage
    const simulationResult = this.simulateDungeonCombat(
      options.playerParty,
      setup.enemyBoss,
      setup.affixHandler,
      setup.elementalWard ?? null,
    );

    const isWin = simulationResult.winner === 'TEAM_A';
    const isTutorial = options.seasonId.toLowerCase().includes('tutorial');
    const isFirstClear = isWin && options.floorNumber > setup.highestCleared;

    let loot: DungeonLootResult | undefined;
    if (isWin) {
      if (!isTutorial && this.lootService) {
        loot = await this.lootService.generateAndDispatchLoot(options.userId, options.floorNumber, isFirstClear);
      }
      if (this.cardRepo && options.playerParty.length > 0) {
        for (const card of options.playerParty) {
          if (card.id) {
            await this.cardRepo.incrementUserCardBattlesWon(card.id).catch(() => {});
          }
        }
      }
    }

    // Update user dungeon progress in repository
    const updatedProgress = await this.progressRepo.recordFloorAttempt(
      options.userId,
      options.seasonId,
      options.floorNumber,
      isWin,
    );

    return {
      success: true,
      victory: isWin,
      floorNumber: options.floorNumber,
      seasonId: options.seasonId,
      energySpent: setup.energyCost,
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
