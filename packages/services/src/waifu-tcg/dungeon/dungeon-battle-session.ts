import type { Combatant, CombatActionLog, CombatElement } from '../combat/types.js';
import {
  getElementalMultiplier,
  getElementAdvantageDescription,
} from '../combat/elemental-matrix.js';
import {
  calculateEffectiveStats,
  processStartOfTurnStatusEffects,
  applyStatusEffect,
} from '../combat/status-effects.js';
import {
  applyAttackPerks,
  applyBattleStartPerks,
  checkPhoenixWard,
} from '../combat/battle-perks.js';
import { ElementalWard } from './elemental-ward.js';
import { SeasonalAffixHandler } from './seasonal-affixes.js';
import { DEFAULT_ENRAGE, type DungeonBossProfile, type EnrageConfig } from './boss-definition.js';

export type PlayerCombatAction = 'ATTACK' | 'SKILL' | 'DEFEND';

export interface WardSnapshot {
  active: boolean;
  element?: CombatElement | undefined;
  currentHealth: number;
  maxHealth: number;
  layerCount: number;
  statusText: string;
}

export interface DungeonTurnState {
  turn: number;
  maxTurns: number;
  player: Combatant;
  boss: Combatant;
  ward: WardSnapshot | null;
  affixTheme: string;
  defendingThisTurn: boolean;
  potionUsedThisTurn: boolean;
  isFinished: boolean;
  winner: 'TEAM_A' | 'TEAM_B' | 'DRAW' | null;
  lastTurnLogs: CombatActionLog[];
  allLogs: CombatActionLog[];
}

export interface DungeonBattleSessionOptions {
  floorNumber: number;
  seasonId: string;
  userId: string;
  playerCard: Combatant;
  boss: Combatant;
  affixHandler: SeasonalAffixHandler;
  ward?: ElementalWard | null | undefined;
  rng?: (() => number) | undefined;
  maxTurns?: number | undefined;
  /** Soft enrage timing; defaults to turn 10, +100% ATK per turn, true damage. */
  enrage?: EnrageConfig | undefined;
  /** Boss skill damage multiplier over a basic attack (default 1.5). */
  bossSkillPower?: number | undefined;
  /** Display info for the boss character (art, anime, flavor text). */
  bossProfile?: DungeonBossProfile | undefined;
  /** Pity blessing: extra share of ATK, DEF and HP for a player stuck on this floor. */
  pityBonus?: number | undefined;
}

/**
 * Stateful, step-by-step combat session for Dungeon Tower climbs.
 * Enables interactive manual actions (Attack, Skill, Defend),
 * real-time auto-battle simulation, and deterministic verification.
 */
export class DungeonBattleSession {
  public readonly floorNumber: number;
  public readonly seasonId: string;
  public readonly userId: string;
  public readonly maxTurns: number;
  public readonly bossProfile: DungeonBossProfile | null;

  private readonly enrage: EnrageConfig;
  private readonly bossSkillPower: number;
  private readonly player: Combatant;
  private readonly boss: Combatant;
  private readonly affixHandler: SeasonalAffixHandler;
  private readonly ward: ElementalWard | null;
  private readonly rng: () => number;

  private turn: number = 1;
  private defendingThisTurn: boolean = false;
  private potionUsedThisTurn: boolean = false;
  private potionsUsed: number = 0;
  private readonly pityBonus: number;
  private isFinished: boolean = false;
  private forfeited: boolean = false;
  private winner: 'TEAM_A' | 'TEAM_B' | 'DRAW' | null = null;
  private readonly allLogs: CombatActionLog[] = [];
  private lastTurnLogs: CombatActionLog[] = [];

  constructor(options: DungeonBattleSessionOptions) {
    this.floorNumber = options.floorNumber;
    this.seasonId = options.seasonId;
    this.userId = options.userId;
    this.affixHandler = options.affixHandler;
    this.ward = options.ward ?? null;
    this.rng = options.rng ?? Math.random;
    this.maxTurns = options.maxTurns ?? 25;
    this.enrage = options.enrage ?? { ...DEFAULT_ENRAGE };
    this.bossSkillPower = options.bossSkillPower ?? 1.5;
    this.bossProfile = options.bossProfile ?? null;
    this.pityBonus = Math.max(0, options.pityBonus ?? 0);

    // Clone player combatant with clean combat state
    this.player = {
      ...options.playerCard,
      team: 'TEAM_A',
      currentHealth: options.playerCard.currentHealth,
      currentMp: options.playerCard.currentMp ?? 0,
      shield: options.playerCard.shield ?? 0,
      statusEffects: [...(options.playerCard.statusEffects ?? [])],
      perks: [...(options.playerCard.perks ?? [])],
      isAlive: true,
      hasUsedPhoenixWard: false,
    };

    if (this.pityBonus > 0) {
      const scale = 1 + this.pityBonus;
      this.player.attack = Math.round(this.player.attack * scale);
      this.player.defense = Math.round(this.player.defense * scale);
      this.player.maxHealth = Math.round(this.player.maxHealth * scale);
      this.player.currentHealth = Math.round(this.player.currentHealth * scale);
    }

    // Clone boss combatant
    this.boss = {
      ...options.boss,
      team: 'TEAM_B',
      currentHealth: options.boss.currentHealth,
      currentMp: options.boss.currentMp ?? 0,
      shield: options.boss.shield ?? 0,
      statusEffects: [...(options.boss.statusEffects ?? [])],
      perks: [...(options.boss.perks ?? [])],
      isAlive: true,
      hasUsedPhoenixWard: false,
    };
  }

  /** Potions drunk during this battle. */
  public get potionCount(): number {
    return this.potionsUsed;
  }

  /** True when the player surrendered instead of fighting the battle out. */
  public get wasForfeited(): boolean {
    return this.forfeited;
  }

  public get isTutorial(): boolean {
    return this.seasonId.toLowerCase().includes('tutorial');
  }

  /**
   * Initializes the battle session, applying start-of-combat perks and environmental affixes.
   */
  public start(): DungeonTurnState {
    // 1. Battle Start Perks (e.g. Mana Conduit)
    const perkLogs = applyBattleStartPerks([this.player, this.boss]);
    for (const msg of perkLogs) {
      this.pushLog({
        turn: 0,
        actorId: 'system',
        actorName: 'Combat Field',
        actionType: 'PERK',
        message: msg,
      });
    }

    // 2. Battle Start Environmental Affixes
    const affixLogs = this.affixHandler.applyBattleStartAffixes([this.player, this.boss]);
    for (const log of affixLogs) {
      this.pushLog(log);
    }

    if (this.pityBonus > 0) {
      this.pushLog({
        turn: 0,
        actorId: this.player.id,
        actorName: this.player.name,
        actionType: 'PERK',
        message: `🕊️ **Pity Blessing:** ${this.player.name} fights with +${Math.round(this.pityBonus * 100)}% ATK, DEF and HP after earlier defeats here.`,
      });
    }

    // 3. Ward notification
    if (this.ward && !this.ward.isBroken()) {
      this.pushLog({
        turn: 0,
        actorId: this.boss.id,
        actorName: this.boss.name,
        actionType: 'STATUS_TICK',
        message: `🛡️ **Boss Ward Active:** ${this.ward.formatWardStatus()}! Countering element required to break!`,
      });
    }

    return this.getSnapshot();
  }

  /**
   * Executes a single turn with the specified player action.
   */
  public executeTurn(action: PlayerCombatAction): DungeonTurnState {
    if (this.isFinished) {
      return this.getSnapshot();
    }

    this.lastTurnLogs = [];
    const currentTurn = this.turn;

    // Reset defend stance at the start of a new turn
    this.defendingThisTurn = action === 'DEFEND';

    // 1. Process start-of-turn status effects (Burn DoT, Freeze check)
    this.processStatusTicks(currentTurn);
    if (this.isFinished) return this.getSnapshot();

    // Gear mana regeneration
    const manaRegen = this.player.gearMods?.manaRegen ?? 0;
    if (manaRegen > 0) {
      this.player.currentMp = Math.min(
        this.player.maxMp,
        this.player.currentMp + Math.round(this.player.maxMp * manaRegen),
      );
    }

    // 2. Soft Enrage notice on turn 10 (disabled in tutorial)
    const isTutorial = this.seasonId.toLowerCase().includes('tutorial');
    const { startTurn, perTurn, trueDamage } = this.enrage;
    const enrageMultiplier =
      !isTutorial && currentTurn >= startTurn ? 1 + perTurn * (currentTurn - startTurn + 1) : 1.0;
    if (!isTutorial && currentTurn === startTurn) {
      this.pushLog({
        turn: currentTurn,
        actorId: this.boss.id,
        actorName: this.boss.name,
        actionType: 'ENRAGE',
        message: `⚠️ **SOFT ENRAGE ACTIVATED!** ${this.boss.name} gains +${Math.round(perTurn * 100)}% Attack per turn${trueDamage ? ' with true damage strikes' : ''}!`,
      });
    }

    // 3. Resolve turn order based on effective speed
    const playerStats = calculateEffectiveStats(this.player);
    const bossStats = calculateEffectiveStats(this.boss);
    const playerFirst = playerStats.effectiveSpeed >= bossStats.effectiveSpeed;

    if (playerFirst) {
      this.resolvePlayerAction(currentTurn, action, playerStats, bossStats);
      if (!this.boss.isAlive || this.boss.currentHealth <= 0) {
        this.winner = 'TEAM_A';
        this.isFinished = true;
        this.pushLog({
          turn: currentTurn,
          actorId: this.player.id,
          actorName: this.player.name,
          actionType: 'ATTACK',
          message: `🏆 **${this.boss.name} was vanquished!**`,
        });
        return this.getSnapshot();
      }

      this.resolveBossAction(currentTurn, enrageMultiplier, bossStats, playerStats);
      if (!this.player.isAlive || this.player.currentHealth <= 0) {
        this.winner = 'TEAM_B';
        this.isFinished = true;
        return this.getSnapshot();
      }
    } else {
      this.resolveBossAction(currentTurn, enrageMultiplier, bossStats, playerStats);
      if (!this.player.isAlive || this.player.currentHealth <= 0) {
        this.winner = 'TEAM_B';
        this.isFinished = true;
        return this.getSnapshot();
      }

      this.resolvePlayerAction(currentTurn, action, playerStats, bossStats);
      if (!this.boss.isAlive || this.boss.currentHealth <= 0) {
        this.winner = 'TEAM_A';
        this.isFinished = true;
        this.pushLog({
          turn: currentTurn,
          actorId: this.player.id,
          actorName: this.player.name,
          actionType: 'ATTACK',
          message: `🏆 **${this.boss.name} was vanquished!**`,
        });
        return this.getSnapshot();
      }
    }

    // 4. Apply end-of-turn environmental affixes (e.g. Scorched Earth burn, Tidal Barrier heal)
    const endAffixLogs = this.affixHandler.applyEndOfTurnAffixes(
      currentTurn,
      [this.player],
      this.boss,
    );
    for (const log of endAffixLogs) {
      this.pushLog(log);
    }

    // Check if end-of-turn affix caused death
    if (this.player.currentHealth <= 0) {
      const revive = checkPhoenixWard(this.player);
      if (revive.revived) {
        this.pushLog({
          turn: currentTurn,
          actorId: this.player.id,
          actorName: this.player.name,
          actionType: 'REVIVE',
          message: revive.logs[0]!,
        });
      } else {
        this.player.isAlive = false;
        this.winner = 'TEAM_B';
        this.isFinished = true;
        return this.getSnapshot();
      }
    }

    if (this.boss.currentHealth <= 0) {
      this.boss.isAlive = false;
      this.winner = 'TEAM_A';
      this.isFinished = true;
      this.pushLog({
        turn: currentTurn,
        actorId: this.player.id,
        actorName: this.player.name,
        actionType: 'ATTACK',
        message: `🏆 **${this.boss.name} succumbed to elemental conditions!**`,
      });
      return this.getSnapshot();
    }

    // 5. Turn limit check
    this.turn++;
    this.potionUsedThisTurn = false;
    if (this.turn > this.maxTurns) {
      this.isFinished = true;
      this.winner = this.boss.currentHealth <= 0 ? 'TEAM_A' : 'TEAM_B';
      this.pushLog({
        turn: currentTurn,
        actorId: 'system',
        actorName: 'Dungeon Gauntlet',
        actionType: 'STATUS_TICK',
        message: `⏳ **Turn limit reached (25/25 turns)!** Combat resulted in ${this.winner === 'TEAM_A' ? 'Victory' : 'Defeat'}.`,
      });
    }

    return this.getSnapshot();
  }

  /**
   * Consumes a potion item (e.g. HP Potion, Mana Potion).
   * Rule: Using a potion does NOT reduce/advance a turn, but is limited to 1 use of potion at one time (per turn).
   */
  public executeItemTurn(item: {
    id?: string | undefined;
    code: string;
    name: string;
    subtype: string;
    consumableEffect?:
      | {
          healFlat?: number | undefined;
          healPercent?: number | undefined;
          cleanseDebuffs?: boolean | undefined;
          restoreMp?: number | undefined;
          restoreMpPercent?: number | undefined;
          freeSkillCast?: boolean | undefined;
        }
      | null
      | undefined;
  }): DungeonTurnState {
    if (this.isFinished) {
      return this.getSnapshot();
    }

    if (this.potionUsedThisTurn) {
      this.pushLog({
        turn: this.turn,
        actorId: this.player.id,
        actorName: this.player.name,
        actionType: 'STATUS_TICK',
        message: `⚠️ **${this.player.name}** can only use 1 potion at a time per turn!`,
      });
      return this.getSnapshot();
    }

    this.potionUsedThisTurn = true;
    this.potionsUsed++;
    const currentTurn = this.turn;

    // Resolve item consumption
    const effect = item.consumableEffect ?? {};
    if (item.subtype === 'HP_POTION') {
      let healAmount = 0;
      if (effect.healFlat) healAmount += effect.healFlat;
      if (effect.healPercent) healAmount += Math.round(this.player.maxHealth * effect.healPercent);
      if (healAmount <= 0) healAmount = 300;

      const prevHp = this.player.currentHealth;
      this.player.currentHealth = Math.min(
        this.player.maxHealth,
        this.player.currentHealth + healAmount,
      );
      const actualHealed = this.player.currentHealth - prevHp;

      let extraMsg = '';
      if (effect.cleanseDebuffs) {
        this.player.statusEffects = this.player.statusEffects.filter(
          (e) => e.type !== 'BURN' && e.type !== 'FREEZE' && e.type !== 'CHILL',
        );
        extraMsg = ' and cleansed all debuffs!';
      }

      this.pushLog({
        turn: currentTurn,
        actorId: this.player.id,
        actorName: this.player.name,
        actionType: 'POTION',
        message: `🧪 **${this.player.name}** drank **${item.name}** and restored **${actualHealed} HP** (${this.player.currentHealth}/${this.player.maxHealth} HP)${extraMsg}!`,
      });
    } else if (item.subtype === 'MANA_POTION') {
      let mpAmount = 0;
      if (effect.restoreMp) mpAmount += effect.restoreMp;
      if (effect.restoreMpPercent)
        mpAmount += Math.round(this.player.maxMp * effect.restoreMpPercent);
      if (mpAmount <= 0) mpAmount = 30;

      const prevMp = this.player.currentMp;
      this.player.currentMp = Math.min(this.player.maxMp, this.player.currentMp + mpAmount);
      const actualMp = this.player.currentMp - prevMp;

      this.pushLog({
        turn: currentTurn,
        actorId: this.player.id,
        actorName: this.player.name,
        actionType: 'POTION',
        message: `🔷 **${this.player.name}** drank **${item.name}** and restored **${actualMp} MP** (${this.player.currentMp}/${this.player.maxMp} MP)!`,
      });
    } else {
      this.pushLog({
        turn: currentTurn,
        actorId: this.player.id,
        actorName: this.player.name,
        actionType: 'PERK',
        message: `🎒 **${this.player.name}** used **${item.name}**!`,
      });
    }

    return this.getSnapshot();
  }

  /**
   * Automatically determines and executes the best turn action:
   * Uses skill when MP is sufficient, otherwise attacks.
   */
  public executeAutoTurn(): DungeonTurnState {
    const canUseSkill =
      this.player.currentMp >= this.player.skillManaCost && Boolean(this.player.skillName);
    const chosenAction: PlayerCombatAction = canUseSkill ? 'SKILL' : 'ATTACK';
    return this.executeTurn(chosenAction);
  }

  /**
   * Forfeits/surrenders the battle immediately.
   */
  public forfeit(): DungeonTurnState {
    if (this.isFinished) return this.getSnapshot();

    this.isFinished = true;
    this.forfeited = true;
    this.winner = 'TEAM_B';
    this.pushLog({
      turn: this.turn,
      actorId: this.player.id,
      actorName: this.player.name,
      actionType: 'STATUS_TICK',
      message: `🏳️ **${this.player.name}** forfeited the dungeon challenge.`,
    });

    return this.getSnapshot();
  }

  /**
   * Returns a complete, immutable snapshot of the current turn state.
   */
  public getSnapshot(): DungeonTurnState {
    let wardSnapshot: WardSnapshot | null = null;
    if (this.ward) {
      const currentLayer = this.ward.getCurrentLayer();
      wardSnapshot = {
        active: !this.ward.isBroken(),
        element: currentLayer?.element,
        currentHealth: currentLayer?.currentHealth ?? 0,
        maxHealth: currentLayer?.maxHealth ?? 0,
        layerCount: this.ward.getLayers().filter((l) => !l.isBroken).length,
        statusText: this.ward.formatWardStatus(),
      };
    }

    return {
      turn: Math.min(this.turn, this.maxTurns),
      maxTurns: this.maxTurns,
      player: { ...this.player, statusEffects: [...this.player.statusEffects] },
      boss: { ...this.boss, statusEffects: [...this.boss.statusEffects] },
      ward: wardSnapshot,
      affixTheme: this.affixHandler.getTheme(),
      defendingThisTurn: this.defendingThisTurn,
      potionUsedThisTurn: this.potionUsedThisTurn,
      isFinished: this.isFinished,
      winner: this.winner,
      lastTurnLogs: [...this.lastTurnLogs],
      allLogs: [...this.allLogs],
    };
  }

  // --- Internal Combat Resolution Helpers ---

  private processStatusTicks(turn: number): void {
    // Player status tick
    const pTick = processStartOfTurnStatusEffects(this.player, this.rng);
    for (const msg of pTick.logs) {
      this.pushLog({
        turn,
        actorId: this.player.id,
        actorName: this.player.name,
        actionType: 'STATUS_TICK',
        message: msg,
      });
    }
    if (this.player.currentHealth <= 0) {
      const revive = checkPhoenixWard(this.player);
      if (revive.revived) {
        this.pushLog({
          turn,
          actorId: this.player.id,
          actorName: this.player.name,
          actionType: 'REVIVE',
          message: revive.logs[0]!,
        });
      } else {
        this.player.isAlive = false;
        this.winner = 'TEAM_B';
        this.isFinished = true;
        return;
      }
    }

    // Boss status tick
    const bTick = processStartOfTurnStatusEffects(this.boss, this.rng);
    for (const msg of bTick.logs) {
      this.pushLog({
        turn,
        actorId: this.boss.id,
        actorName: this.boss.name,
        actionType: 'STATUS_TICK',
        message: msg,
      });
    }
    if (this.boss.currentHealth <= 0) {
      this.boss.isAlive = false;
      this.winner = 'TEAM_A';
      this.isFinished = true;
    }
  }

  private resolvePlayerAction(
    turn: number,
    action: PlayerCombatAction,
    playerStats: ReturnType<typeof calculateEffectiveStats>,
    bossStats: ReturnType<typeof calculateEffectiveStats>,
  ): void {
    if (action === 'DEFEND') {
      // Guard stance: generate 10 MP and reduce next hit by 50%
      this.player.currentMp = Math.min(this.player.maxMp, this.player.currentMp + 10);
      this.pushLog({
        turn,
        actorId: this.player.id,
        actorName: this.player.name,
        actionType: 'PERK',
        message: `🛡️ **${this.player.name}** assumed a defensive guard! Incoming damage is halved this turn (+10 MP).`,
      });
      return;
    }

    const isSkill =
      action === 'SKILL' &&
      this.player.currentMp >= this.player.skillManaCost &&
      Boolean(this.player.skillName);

    let rawDamage: number;
    let isCritical = false;

    if (isSkill) {
      this.player.currentMp = Math.max(0, this.player.currentMp - this.player.skillManaCost);
      rawDamage = Math.round(playerStats.effectiveAttack * 1.5);
    } else {
      // Basic attack generates 15 MP
      this.player.currentMp = Math.min(this.player.maxMp, this.player.currentMp + 15);
      const piercing = Math.min(0.8, this.player.gearMods?.armorPiercing ?? 0);
      rawDamage = Math.max(
        10,
        playerStats.effectiveAttack - Math.round(bossStats.effectiveDefense * (1 - piercing) * 0.4),
      );
    }

    // Critical strike check
    if (this.rng() < playerStats.effectiveCritRate) {
      isCritical = true;
      rawDamage = Math.round(rawDamage * this.player.critDamage);
    }

    // Elemental multiplier
    const baseElemMult = getElementalMultiplier(this.player.element, this.boss.element);
    const elemMult =
      baseElemMult > 1
        ? baseElemMult + (this.player.gearMods?.elementalMastery ?? 0)
        : baseElemMult;
    rawDamage = Math.round(rawDamage * elemMult);

    // Apply affix modifier
    const affixDmg = this.affixHandler.modifyDamage(this.player, this.boss, rawDamage);
    rawDamage = affixDmg.damage;
    if (affixDmg.logMessage) {
      this.pushLog({
        turn,
        actorId: this.player.id,
        actorName: this.player.name,
        actionType: 'ATTACK',
        message: affixDmg.logMessage,
      });
    }

    // Apply attack perks (Sharpened Edge, Vampiric Touch)
    const perkResult = applyAttackPerks(this.player, this.boss, rawDamage);
    rawDamage = perkResult.modifiedDamage;

    // Process Ward or direct damage
    if (this.ward && !this.ward.isBroken()) {
      const wardResult = this.ward.processAttack(this.player.element, rawDamage);
      this.pushLog({
        turn,
        actorId: this.player.id,
        actorName: this.player.name,
        actionType: isSkill ? 'SKILL' : 'ATTACK',
        targetId: this.boss.id,
        targetName: this.boss.name,
        message: wardResult.message,
      });

      if (wardResult.damagePassedToBoss > 0) {
        this.boss.currentHealth = Math.max(
          0,
          this.boss.currentHealth - wardResult.damagePassedToBoss,
        );
        if (this.boss.currentHealth <= 0) this.boss.isAlive = false;
      }
    } else {
      // Direct damage to boss
      let dmgToHp = rawDamage;
      let shieldAbsorbed = 0;
      if (this.boss.shield > 0) {
        if (this.boss.shield >= rawDamage) {
          this.boss.shield -= rawDamage;
          shieldAbsorbed = rawDamage;
          dmgToHp = 0;
        } else {
          shieldAbsorbed = this.boss.shield;
          dmgToHp = rawDamage - this.boss.shield;
          this.boss.shield = 0;
        }
      }

      this.boss.currentHealth = Math.max(0, this.boss.currentHealth - dmgToHp);
      if (this.boss.currentHealth <= 0) this.boss.isAlive = false;

      const actionLabel = isSkill
        ? `✨ Skill [**${this.player.skillName}**]`
        : `⚔️ **${this.player.name}** struck`;
      const critLabel = isCritical ? ' **(CRITICAL HIT!)**' : '';
      const elemDesc =
        elemMult !== 1.0
          ? ` (${elemMult}x ${getElementAdvantageDescription(this.player.element, this.boss.element)})`
          : '';
      const shieldDesc = shieldAbsorbed > 0 ? ` [${shieldAbsorbed} absorbed by shield]` : '';

      this.pushLog({
        turn,
        actorId: this.player.id,
        actorName: this.player.name,
        actionType: isSkill ? 'SKILL' : 'ATTACK',
        targetId: this.boss.id,
        targetName: this.boss.name,
        damageDealt: rawDamage,
        isCritical,
        elementMultiplier: elemMult,
        message: `${actionLabel} dealing **${rawDamage} DMG** to **${this.boss.name}**${critLabel}${elemDesc}${shieldDesc}!`,
      });

      // If skill was used, apply elemental status effect
      if (isSkill) {
        this.applyElementalSkillEffect(turn);
      }
    }
  }

  private resolveBossAction(
    turn: number,
    enrageMultiplier: number,
    bossStats: ReturnType<typeof calculateEffectiveStats>,
    playerStats: ReturnType<typeof calculateEffectiveStats>,
  ): void {
    const isTutorial = this.seasonId.toLowerCase().includes('tutorial');
    const effectiveEnrage = isTutorial ? 1.0 : enrageMultiplier;
    const isTrueDamage = !isTutorial && this.enrage.trueDamage && turn >= this.enrage.startTurn;

    // Bosses build 20 MP per basic attack and unleash their skill once they can pay for it.
    const castsSkill =
      !isTutorial &&
      Boolean(this.boss.skillName) &&
      this.boss.skillManaCost > 0 &&
      this.boss.currentMp >= this.boss.skillManaCost;
    if (castsSkill) {
      this.boss.currentMp -= this.boss.skillManaCost;
    } else {
      this.boss.currentMp = Math.min(this.boss.maxMp, this.boss.currentMp + 20);
    }

    const skillMult = castsSkill ? this.bossSkillPower : 1;
    const bossAtk = Math.round(bossStats.effectiveAttack * effectiveEnrage * skillMult);
    let damage: number;

    if (isTrueDamage) {
      // Unblockable true damage during enrage
      damage = bossAtk;
    } else {
      damage = Math.round(bossAtk * (100 / (100 + playerStats.effectiveDefense)));
      const mitigation = Math.min(0.6, this.player.gearMods?.mitigation ?? 0);
      damage = Math.round(damage * (1 - mitigation));
    }

    // Halve damage if player guarded
    if (this.defendingThisTurn) {
      damage = Math.max(5, Math.round(damage * 0.5));
    }
    damage = Math.max(10, damage);

    // Tutorial bosses damage cap: at most 100 damage across all tutorial floors
    if (isTutorial) {
      damage = Math.min(100, damage);
    }

    // Shield absorption
    let dmgToHp = damage;
    let shieldAbsorbed = 0;
    if (this.player.shield > 0) {
      if (this.player.shield >= damage) {
        this.player.shield -= damage;
        shieldAbsorbed = damage;
        dmgToHp = 0;
      } else {
        shieldAbsorbed = this.player.shield;
        dmgToHp = damage - this.player.shield;
        this.player.shield = 0;
      }
    }

    this.player.currentHealth = Math.max(0, this.player.currentHealth - dmgToHp);
    if (this.player.currentHealth <= 0) {
      const revive = checkPhoenixWard(this.player);
      if (revive.revived) {
        this.pushLog({
          turn,
          actorId: this.player.id,
          actorName: this.player.name,
          actionType: 'REVIVE',
          message: revive.logs[0]!,
        });
      } else {
        this.player.isAlive = false;
      }
    }

    const enrageDesc = isTrueDamage ? ' *(TRUE DAMAGE ENRAGE!)*' : '';
    const guardDesc = this.defendingThisTurn ? ' *(Guard reduced damage by 50%)*' : '';
    const shieldDesc = shieldAbsorbed > 0 ? ` [${shieldAbsorbed} absorbed by shield]` : '';
    const actionText = castsSkill
      ? `💥 **${this.boss.name}** unleashed ✨ **${this.boss.skillName}** on`
      : `💥 **${this.boss.name}** struck`;

    this.pushLog({
      turn,
      actorId: this.boss.id,
      actorName: this.boss.name,
      actionType: castsSkill ? 'SKILL' : 'ATTACK',
      targetId: this.player.id,
      targetName: this.player.name,
      damageDealt: damage,
      message: `${actionText} **${this.player.name}** for **${damage} DMG**!${enrageDesc}${guardDesc}${shieldDesc}${!this.player.isAlive ? ` (${this.player.name} fainted!)` : ''}`,
    });
  }

  private applyElementalSkillEffect(turn: number): void {
    switch (this.player.element) {
      case 'FIRE': {
        applyStatusEffect(this.boss, {
          type: 'BURN',
          duration: 3,
          value: Math.round(this.player.attack * 0.2),
          sourceElement: 'FIRE',
        });
        this.pushLog({
          turn,
          actorId: this.player.id,
          actorName: this.player.name,
          actionType: 'STATUS_TICK',
          message: `🔥 **${this.boss.name} was afflicted with Burn** for 3 turns!`,
        });
        break;
      }
      case 'ICE': {
        const freezeRoll = this.rng();
        if (freezeRoll < 0.4) {
          applyStatusEffect(this.boss, {
            type: 'FREEZE',
            duration: 1,
            sourceElement: 'ICE',
          });
          this.pushLog({
            turn,
            actorId: this.player.id,
            actorName: this.player.name,
            actionType: 'STATUS_TICK',
            message: `❄️ **${this.boss.name} was Frozen solid** for 1 turn!`,
          });
        } else {
          applyStatusEffect(this.boss, {
            type: 'CHILL',
            duration: 2,
            value: 20,
            sourceElement: 'ICE',
          });
          this.pushLog({
            turn,
            actorId: this.player.id,
            actorName: this.player.name,
            actionType: 'STATUS_TICK',
            message: `🧊 **${this.boss.name} was Chilled (-20 Speed)** for 2 turns!`,
          });
        }
        break;
      }
      case 'EARTH': {
        applyStatusEffect(this.player, {
          type: 'FORTIFY',
          duration: 2,
          value: 30,
          sourceElement: 'EARTH',
        });
        this.pushLog({
          turn,
          actorId: this.player.id,
          actorName: this.player.name,
          actionType: 'STATUS_TICK',
          message: `🛡️ **${this.player.name} activated Fortify (+30% DEF)** for 2 turns!`,
        });
        break;
      }
      case 'LIGHT': {
        const heal = Math.round(this.player.maxHealth * 0.25);
        this.player.currentHealth = Math.min(
          this.player.maxHealth,
          this.player.currentHealth + heal,
        );
        this.pushLog({
          turn,
          actorId: this.player.id,
          actorName: this.player.name,
          actionType: 'STATUS_TICK',
          healingDone: heal,
          message: `✨ **${this.player.name} restored ${heal} HP** through radiant blessing!`,
        });
        break;
      }
      default:
        break;
    }
  }

  private pushLog(log: CombatActionLog): void {
    this.allLogs.push(log);
    this.lastTurnLogs.push(log);
  }
}
