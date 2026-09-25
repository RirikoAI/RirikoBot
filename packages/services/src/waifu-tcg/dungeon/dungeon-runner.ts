import type {
  PlayerEnergyRepository,
  UserDungeonProgressRepository,
  DungeonFloorRepository,
  DungeonSeasonRepository,
  DungeonBossRepository,
  DungeonSeason,
  WaifuCardRepository,
} from '@ririko/database';
import type { EnergyLifecycleService } from '../energy/energy-lifecycle.service.js';
import type { CardElement } from '../types.js';
import type { Combatant, CombatActionLog } from '../combat/types.js';
import { ScalingEngine } from './scaling-engine.js';
import { DEFAULT_OFF_ELEMENT_WARD_CHIP, ElementalWard } from './elemental-ward.js';
import { SeasonalAffixHandler, type SeasonTheme } from './seasonal-affixes.js';

import { DungeonLootService, type DungeonLootResult } from './dungeon-loot.service.js';
import { TUTORIAL_FLOORS, TutorialService, getCounterElement } from './tutorial-service.js';

import { DungeonBattleSession } from './dungeon-battle-session.js';
import type { DungeonProgressOutcome, DungeonProgressService } from './dungeon-progress.service.js';
import {
  mergeBossDefinitions,
  parseBossDefinition,
  parseFloorLineup,
  parseSeasonCurve,
  resolveEnrage,
  toScalingConfig,
  type BossTier,
  type DungeonBossProfile,
  type EnrageConfig,
} from './boss-definition.js';
import {
  getDungeonCardExp,
  type CardExpResult,
  type CardProgressionService,
} from '../card/card-progression.service.js';

export function getDungeonFloorEnergyCost(
  floorNumber: number,
  isTutorial: boolean = false,
): number {
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
  progress?: DungeonProgressOutcome | undefined;
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
  cardExp: CardExpResult[];
  error?: string | undefined;
}

/**
 * Everything needed to fight one floor, as plain data. Stateful combat objects (ward, affix
 * handler) are created per battle by startEncounterSession, so one encounter can be replayed.
 */
export interface FloorEncounter {
  enemyBoss: Combatant;
  wardLayers: Array<{ element: CardElement; health: number }> | null;
  /** Share of off-element damage that chips wards (the tutorial uses 0). */
  wardOffElementChip: number;
  affixTheme: SeasonTheme;
  seasonName: string;
  enrage?: EnrageConfig | undefined;
  maxTurns?: number | undefined;
  bossSkillPower?: number | undefined;
  bossProfile?: DungeonBossProfile | undefined;
}

export interface FloorSetup {
  success: boolean;
  error?: string | undefined;
  energyCost: number;
  highestCleared: number;
  encounter?: FloorEncounter | undefined;
}

/** Starts a fresh battle session for an encounter. */
export function startEncounterSession(options: {
  encounter: FloorEncounter;
  floorNumber: number;
  seasonId: string;
  userId: string;
  playerCard: Combatant;
  rng?: (() => number) | undefined;
  pityBonus?: number | undefined;
}): DungeonBattleSession {
  const { encounter } = options;
  const session = new DungeonBattleSession({
    floorNumber: options.floorNumber,
    seasonId: options.seasonId,
    userId: options.userId,
    playerCard: options.playerCard,
    boss: { ...encounter.enemyBoss, statusEffects: [], perks: [...encounter.enemyBoss.perks] },
    affixHandler: new SeasonalAffixHandler(encounter.affixTheme, encounter.seasonName),
    ward: encounter.wardLayers
      ? new ElementalWard(encounter.wardLayers, { offElementChip: encounter.wardOffElementChip })
      : null,
    enrage: encounter.enrage,
    maxTurns: encounter.maxTurns,
    bossSkillPower: encounter.bossSkillPower,
    bossProfile: encounter.bossProfile,
    rng: options.rng,
    pityBonus: options.pityBonus,
  });
  session.start();
  return session;
}

export class DungeonRunner {
  private readonly energyRepo: PlayerEnergyRepository;
  private readonly energyLifecycle: EnergyLifecycleService | undefined;
  private readonly progressRepo: UserDungeonProgressRepository;
  private readonly scalingEngine: ScalingEngine;
  private readonly floorRepo: DungeonFloorRepository | undefined;
  private readonly seasonRepo: DungeonSeasonRepository | undefined;
  private readonly bossRepo: DungeonBossRepository | undefined;
  private readonly lootService: DungeonLootService | undefined;
  private readonly cardRepo: WaifuCardRepository | undefined;
  private readonly tutorialService: TutorialService | undefined;
  private readonly cardProgression: CardProgressionService | undefined;
  private readonly progressService: DungeonProgressService | undefined;

  constructor(
    energyRepo: PlayerEnergyRepository,
    progressRepo: UserDungeonProgressRepository,
    options: {
      scalingEngine?: ScalingEngine | undefined;
      floorRepo?: DungeonFloorRepository | undefined;
      seasonRepo?: DungeonSeasonRepository | undefined;
      bossRepo?: DungeonBossRepository | undefined;
      lootService?: DungeonLootService | undefined;
      cardRepo?: WaifuCardRepository | undefined;
      tutorialService?: TutorialService | undefined;
      cardProgression?: CardProgressionService | undefined;
      progressService?: DungeonProgressService | undefined;
      energyLifecycle?: EnergyLifecycleService | undefined;
    } = {},
  ) {
    this.energyRepo = energyRepo;
    this.energyLifecycle = options.energyLifecycle;
    this.progressRepo = progressRepo;
    this.scalingEngine = options.scalingEngine ?? new ScalingEngine();
    this.floorRepo = options.floorRepo;
    this.seasonRepo = options.seasonRepo;
    this.bossRepo = options.bossRepo;
    this.lootService = options.lootService;
    this.cardRepo = options.cardRepo;
    this.tutorialService = options.tutorialService;
    this.cardProgression = options.cardProgression;
    this.progressService = options.progressService;
  }

  /** Grants card EXP for one battle to every card that fought. */
  private async grantCardExp(
    cardIds: string[],
    floorNumber: number,
    outcome: { victory: boolean; isFirstClear: boolean; forfeited: boolean },
  ): Promise<CardExpResult[]> {
    if (!this.cardProgression) return [];
    const amount = getDungeonCardExp(floorNumber, outcome);
    const results: CardExpResult[] = [];
    for (const id of cardIds) {
      const result = await this.cardProgression.grantExp(id, amount).catch(() => null);
      if (result) results.push(result);
    }
    return results;
  }

  private resolveSeasonTheme(seasonId: string, season: DungeonSeason | null): SeasonTheme {
    if (season) {
      const affixString = (
        (season.seasonalAffixes ?? []).join(' ') +
        ' ' +
        (season.themeElement ?? '')
      ).toUpperCase();
      if (
        affixString.includes('INFERNAL') ||
        affixString.includes('SCORCHED') ||
        season.themeElement === 'FIRE'
      )
        return 'INFERNAL_CRUCIBLE';
      if (
        affixString.includes('ABYSSAL') ||
        affixString.includes('TORRENTIAL') ||
        season.themeElement === 'WATER'
      )
        return 'ABYSSAL_MAELSTROM';
      if (
        affixString.includes('CELESTIAL') ||
        affixString.includes('TWILIGHT') ||
        season.themeElement === 'LIGHT'
      )
        return 'CELESTIAL_TWILIGHT';
      return 'NONE';
    }
    const id = seasonId.toLowerCase();
    if (id.includes('infernal') || seasonId === 's1') return 'INFERNAL_CRUCIBLE';
    if (id.includes('abyssal') || seasonId === 's2') return 'ABYSSAL_MAELSTROM';
    if (id.includes('celestial') || seasonId === 's3') return 'CELESTIAL_TWILIGHT';
    return 'NONE';
  }

  /**
   * Prepares floor setup, validates prerequisites, consumes energy, and builds the boss.
   * Season floors read the season curve (`dungeon_seasons.scaling_params`), the floor row
   * (`dungeon_floors`) and its boss (`dungeon_bosses`); anything missing falls back to code defaults.
   */
  public async prepareFloorSetup(options: DungeonRunOptions): Promise<FloorSetup> {
    const { userId, seasonId, floorNumber, playerParty, skipEnergyDeduction } = options;

    if (!playerParty || playerParty.length === 0) {
      return {
        success: false,
        energyCost: 0,
        highestCleared: 0,
        error: 'No active cards selected for dungeon climb! Equip or select a card first.',
      };
    }

    // 1. Sequential climb: floorNumber - 1 must be cleared
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

    const { encounter, energyCost } = await this.buildEncounter(
      userId,
      seasonId,
      floorNumber,
      playerParty,
    );

    // 2. Energy
    if (!skipEnergyDeduction && energyCost > 0) {
      const energyResult = this.energyLifecycle
        ? await this.energyLifecycle.spendEnergy(userId, energyCost)
        : await this.energyRepo.consumeEnergy(userId, energyCost);
      if (!energyResult.success) {
        return {
          success: false,
          energyCost,
          highestCleared,
          error: `Insufficient energy! Floor ${floorNumber} requires ${energyCost} energy. Current: ${energyResult.currentEnergy}`,
        };
      }
    }

    return { success: true, energyCost, highestCleared, encounter };
  }

  /**
   * Builds the enemy and battle conditions for a floor without touching progress or energy.
   * Season floors read the season curve (`dungeon_seasons.scaling_params`), the floor row
   * (`dungeon_floors`) and its boss (`dungeon_bosses`); anything missing falls back to code defaults.
   */
  public async buildEncounter(
    userId: string,
    seasonId: string,
    floorNumber: number,
    playerParty: Combatant[],
  ): Promise<{ encounter: FloorEncounter; energyCost: number }> {
    const isTutorial = seasonId.toLowerCase().includes('tutorial');
    const season = this.seasonRepo ? await this.seasonRepo.findById(seasonId) : null;
    const floorRow =
      !isTutorial && this.floorRepo
        ? await this.floorRepo.findBySeasonAndFloor(seasonId, floorNumber)
        : null;

    const energyCost = isTutorial
      ? 0
      : (floorRow?.energyCost ?? getDungeonFloorEnergyCost(floorNumber));

    // Environmental affixes (switched off below the season's affixStartFloor)
    const curve = parseSeasonCurve(season?.scalingParams);
    const theme = this.resolveSeasonTheme(seasonId, season);
    const affixTheme: SeasonTheme = floorNumber < (curve.affixStartFloor ?? 1) ? 'NONE' : theme;
    const seasonName = season?.name ?? 'Dungeon Tower';

    if (isTutorial) {
      const tutorial = await this.buildTutorialEnemy(userId, floorNumber, playerParty);
      return {
        energyCost,
        encounter: {
          enemyBoss: tutorial.enemyBoss,
          wardLayers: tutorial.wardLayers,
          wardOffElementChip: 0,
          affixTheme,
          seasonName,
        },
      };
    }

    // Season boss
    const engine = season
      ? new ScalingEngine(toScalingConfig(season.scalingModel, curve))
      : this.scalingEngine;
    const floorType = engine.getFloorType(floorNumber);
    const curveStats = engine.calculateFloorStats(floorNumber);

    const lineup = parseFloorLineup(floorRow?.enemyLineup);
    const bossRow = lineup && this.bossRepo ? await this.bossRepo.findById(lineup.bossId) : null;
    const def = mergeBossDefinitions(
      bossRow ? parseBossDefinition(bossRow.definition, `boss ${bossRow.id}`) : undefined,
      lineup?.overrides,
    );

    const element =
      (bossRow?.element as CardElement | undefined) ??
      this.getEnemyElementForSeasonAndFloor(theme, floorNumber);
    const hp = Math.round(def.stats?.hp ?? curveStats.hp * (def.statMultipliers?.hp ?? 1));
    const enemyBoss: Combatant = {
      id: bossRow?.id ?? `dungeon_mob_f${floorNumber}`,
      name: bossRow?.name ?? this.generateEnemyName(floorNumber, floorType, element),
      team: 'TEAM_B',
      element,
      rarity:
        floorType === 'MAJOR_BOSS' ? 'MYTHIC' : floorType === 'MINI_BOSS' ? 'SECRET_RARE' : 'RARE',
      level: Math.max(1, floorNumber * 2),
      maxHealth: hp,
      currentHealth: hp,
      attack: Math.round(
        def.stats?.attack ?? curveStats.attack * (def.statMultipliers?.attack ?? 1),
      ),
      defense: Math.round(
        def.stats?.defense ?? curveStats.defense * (def.statMultipliers?.defense ?? 1),
      ),
      speed: Math.round(def.stats?.speed ?? curveStats.speed * (def.statMultipliers?.speed ?? 1)),
      critRate: def.critRate ?? 0.1,
      critDamage: def.critDamage ?? 1.5,
      maxMp: 100,
      currentMp: 0,
      skillName:
        def.skill?.name ?? (floorType === 'MAJOR_BOSS' ? 'Cataclysmic Shatter' : 'Elemental Rend'),
      skillDescription: def.skill?.description,
      skillManaCost: def.skill?.mpCost ?? 60,
      shield: 0,
      statusEffects: [],
      perks: [],
      hasUsedPhoenixWard: false,
      isAlive: true,
    };

    let wardLayers: FloorEncounter['wardLayers'] = null;
    if (def.wardLayers?.length) {
      wardLayers = def.wardLayers.map((l) => ({
        element: l.element,
        health: Math.max(1, Math.round(hp * l.hpPercent)),
      }));
    } else if (floorNumber >= 20 && floorType !== 'STANDARD') {
      wardLayers = this.generateWardLayers(floorNumber, element, hp);
    }

    const bossProfile: DungeonBossProfile | undefined = bossRow
      ? {
          id: bossRow.id,
          name: bossRow.name,
          animeTitle: bossRow.animeTitle,
          element,
          tier: (bossRow.tier as BossTier) ?? floorType,
          title: bossRow.title ?? undefined,
          flavorText: bossRow.flavorText ?? undefined,
          imagePath: bossRow.imagePath ?? undefined,
          assetId: bossRow.assetId ?? undefined,
          signatureDropCode: bossRow.signatureDropCode ?? undefined,
        }
      : undefined;

    return {
      energyCost,
      encounter: {
        enemyBoss,
        wardLayers,
        wardOffElementChip: DEFAULT_OFF_ELEMENT_WARD_CHIP,
        affixTheme,
        seasonName,
        enrage: resolveEnrage(curve.enrage, def.enrage),
        maxTurns: def.maxTurns,
        bossSkillPower: def.skill?.powerMult,
        bossProfile,
      },
    };
  }

  private async buildTutorialEnemy(
    userId: string,
    floorNumber: number,
    playerParty: Combatant[],
  ): Promise<{ enemyBoss: Combatant; wardLayers: FloorEncounter['wardLayers'] }> {
    const tutFloor = TUTORIAL_FLOORS.find((f) => f.floorNumber === floorNumber);
    if (!tutFloor) {
      const stats = this.scalingEngine.calculateFloorStats(floorNumber);
      return {
        enemyBoss: {
          id: `dungeon_mob_t${floorNumber}`,
          name: `Training Automaton T${floorNumber}`,
          team: 'TEAM_B',
          element: this.getEnemyElementForSeasonAndFloor('NONE', floorNumber),
          rarity: 'COMMON',
          level: floorNumber,
          maxHealth: stats.hp,
          currentHealth: stats.hp,
          attack: stats.attack,
          defense: stats.defense,
          speed: stats.speed,
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
        },
        wardLayers: null,
      };
    }

    const enemyBoss: Combatant = { ...tutFloor.dummyEnemy };
    if (floorNumber !== 4) return { enemyBoss, wardLayers: null };

    // Floor T4 teaches wards: the boss counters the player's element.
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
    return { enemyBoss, wardLayers: [{ element: bossElement, health: 100 }] };
  }

  /**
   * Creates an interactive, step-by-step DungeonBattleSession for real-time combat.
   */
  public async createBattleSession(options: DungeonRunOptions): Promise<CreateBattleSessionResult> {
    const setup = await this.prepareFloorSetup(options);
    if (!setup.success || !setup.encounter) {
      return {
        success: false,
        energySpent: setup.energyCost,
        highestFloorCleared: setup.highestCleared,
        error: setup.error,
      };
    }

    const isTutorial = options.seasonId.toLowerCase().includes('tutorial');
    const pityBonus =
      !isTutorial && this.progressService
        ? await this.progressService.getPityBonus(
            options.userId,
            options.seasonId,
            options.floorNumber,
          )
        : 0;

    const session = startEncounterSession({
      encounter: setup.encounter,
      floorNumber: options.floorNumber,
      seasonId: options.seasonId,
      userId: options.userId,
      playerCard: options.playerParty[0]!,
      pityBonus,
    });

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

    const currentProgress = await this.progressRepo.getOrCreateProgress(
      session.userId,
      session.seasonId,
    );
    const isFirstClear = isWin && session.floorNumber > currentProgress.highestClearedFloor;

    let loot: DungeonLootResult | undefined;
    if (isWin) {
      if (!isTutorial && this.lootService) {
        loot = await this.lootService.generateAndDispatchLoot(
          session.userId,
          session.floorNumber,
          isFirstClear,
          {
            signatureDropCode: session.bossProfile?.signatureDropCode,
          },
        );
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

    const cardExp = await this.grantCardExp(
      snapshot.player?.id ? [snapshot.player.id] : [],
      session.floorNumber,
      { victory: isWin, isFirstClear, forfeited: session.wasForfeited },
    );

    const progress =
      !isTutorial && this.progressService
        ? await this.progressService.recordOutcome(
            session.userId,
            session.seasonId,
            session.floorNumber,
            {
              victory: isWin,
              forfeited: session.wasForfeited,
              turns: snapshot.turn,
              potionsUsed: session.potionCount,
              energySpent: options.energySpent,
            },
          )
        : undefined;

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
      cardExp,
      progress,
    };
  }

  /**
   * Runs a whole floor attempt in one call using the session's auto-battle (skill when affordable,
   * otherwise attack), then records the result like an interactive battle.
   */
  public async runFloor(options: DungeonRunOptions): Promise<DungeonRunResult> {
    const created = await this.createBattleSession(options);
    if (!created.success || !created.session) {
      return {
        success: false,
        victory: false,
        floorNumber: options.floorNumber,
        seasonId: options.seasonId,
        energySpent: created.energySpent,
        turnsTotal: 0,
        logs: [],
        highestFloorCleared: created.highestFloorCleared,
        isFirstClear: false,
        cardExp: [],
        error: created.error,
      };
    }

    let state = created.session.getSnapshot();
    while (!state.isFinished) state = created.session.executeAutoTurn();
    return this.finalizeBattleResult(created.session, { energySpent: created.energySpent });
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
    const elements: CardElement[] = [
      'FIRE',
      'ICE',
      'EARTH',
      'LIGHTNING',
      'WATER',
      'LIGHT',
      'SHADOW',
    ];
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
      return (
        names[Math.min(names.length - 1, Math.floor(floorNumber / 10) - 1)] ??
        `Elder Primordial [${element}]`
      );
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
