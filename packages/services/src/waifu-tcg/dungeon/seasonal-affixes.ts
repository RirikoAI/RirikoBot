import type { Combatant, CombatActionLog } from '../combat/types.js';

export type SeasonTheme = 'INFERNAL_CRUCIBLE' | 'ABYSSAL_MAELSTROM' | 'CELESTIAL_TWILIGHT' | 'NONE';

export interface SeasonalAffixContext {
  theme: SeasonTheme;
  seasonName: string;
  turn: number;
}

export interface AffixTurnResult {
  logs: CombatActionLog[];
}

export class SeasonalAffixHandler {
  private readonly theme: SeasonTheme;
  private readonly seasonName: string;
  private lastTidalFreezeTurn: number = 0;

  constructor(theme: SeasonTheme = 'NONE', seasonName: string = 'Standard Season') {
    this.theme = theme;
    this.seasonName = seasonName;
  }

  public getTheme(): SeasonTheme {
    return this.theme;
  }

  public getSeasonName(): string {
    return this.seasonName;
  }

  /**
   * Modifies stats at battle start according to environmental affixes.
   * e.g., Heat Haze (-15% CRIT for non-Fire), Torrential Deluge (-25% SPD).
   */
  public applyBattleStartAffixes(combatants: Combatant[]): CombatActionLog[] {
    const logs: CombatActionLog[] = [];

    switch (this.theme) {
      case 'INFERNAL_CRUCIBLE': {
        // Heat Haze: Crit rate -15% for non-Fire elements
        for (const c of combatants) {
          if (c.element !== 'FIRE') {
            c.critRate = Math.max(0, c.critRate - 0.15);
          }
        }
        logs.push({
          turn: 0,
          actorId: 'environmental_affix',
          actorName: 'Infernal Crucible',
          actionType: 'STATUS_TICK',
          message:
            '🔥 **Affix: Heat Haze** active! Non-Fire units suffer -15% Critical Hit Chance under blistering heat!',
        });
        break;
      }

      case 'ABYSSAL_MAELSTROM': {
        // Torrential Deluge: Card Speed stat reduced by 25%
        for (const c of combatants) {
          c.speed = Math.max(1, Math.round(c.speed * 0.75));
        }
        logs.push({
          turn: 0,
          actorId: 'environmental_affix',
          actorName: 'Abyssal Maelstrom',
          actionType: 'STATUS_TICK',
          message:
            '🌊 **Affix: Torrential Deluge** active! All combatants suffer -25% Speed in torrential currents!',
        });
        break;
      }

      case 'CELESTIAL_TWILIGHT': {
        logs.push({
          turn: 0,
          actorId: 'environmental_affix',
          actorName: 'Celestial Twilight',
          actionType: 'STATUS_TICK',
          message:
            '✨🌑 **Affix: Radiant Flare & Void Drain** active! Light/Shadow deal 2.0x Catastrophe, and healing is suppressed by 40%!',
        });
        break;
      }

      default:
        break;
    }

    return logs;
  }

  /**
   * Applies periodic turn-based environmental effects at the end of each turn.
   */
  public applyEndOfTurnAffixes(
    turn: number,
    playerTeam: Combatant[],
    boss: Combatant,
  ): CombatActionLog[] {
    const logs: CombatActionLog[] = [];

    switch (this.theme) {
      case 'INFERNAL_CRUCIBLE': {
        // Scorched Earth: Cards take 6% max HP burn damage every 2 turns
        // unless shielded by Earth (c.shield > 0 or FORTIFY) or purified by Water (PURIFY_FLOW)
        if (turn % 2 === 0) {
          for (const c of playerTeam) {
            if (!c.isAlive || c.currentHealth <= 0) continue;

            const hasEarthShield =
              (c.shield > 0 && c.element === 'EARTH') ||
              c.statusEffects.some((s) => s.type === 'FORTIFY');
            const hasWaterPurify = c.statusEffects.some((s) => s.type === 'PURIFY_FLOW');

            if (hasEarthShield || hasWaterPurify) {
              logs.push({
                turn,
                actorId: 'environmental_affix',
                actorName: 'Scorched Earth',
                actionType: 'STATUS_TICK',
                targetId: c.id,
                targetName: c.name,
                message: `🛡️ **${c.name}** was protected from Scorched Earth burn by ${hasEarthShield ? 'Earth Fortification' : 'Water Purification'}!`,
              });
            } else {
              const burnDamage = Math.max(1, Math.round(c.maxHealth * 0.06));
              c.currentHealth = Math.max(1, c.currentHealth - burnDamage);
              logs.push({
                turn,
                actorId: 'environmental_affix',
                actorName: 'Scorched Earth',
                actionType: 'STATUS_TICK',
                targetId: c.id,
                targetName: c.name,
                damageDealt: burnDamage,
                message: `🔥 **Scorched Earth** seared **${c.name}** for ${burnDamage} HP (6% Max HP burn)!`,
              });
            }
          }
        }
        break;
      }

      case 'ABYSSAL_MAELSTROM': {
        // Tidal Barrier: Boss heals 8% max HP if not afflicted with Freeze/Chill/Shock within 3 turns
        const hasFreezeOrShock = boss.statusEffects.some(
          (s) => s.type === 'FREEZE' || s.type === 'CHILL' || s.sourceElement === 'LIGHTNING',
        );

        if (hasFreezeOrShock) {
          this.lastTidalFreezeTurn = turn;
        } else if (turn - this.lastTidalFreezeTurn >= 3) {
          if (boss.isAlive && boss.currentHealth < boss.maxHealth) {
            const healAmount = Math.round(boss.maxHealth * 0.08);
            boss.currentHealth = Math.min(boss.maxHealth, boss.currentHealth + healAmount);
            logs.push({
              turn,
              actorId: 'environmental_affix',
              actorName: 'Tidal Barrier',
              actionType: 'STATUS_TICK',
              targetId: boss.id,
              targetName: boss.name,
              healingDone: healAmount,
              message: `🌊 **Tidal Barrier** surged! Since the boss was not Frozen/Shocked in 3 turns, **${boss.name}** healed for ${healAmount} HP (8% Max HP)!`,
            });
          }
        }
        break;
      }

      case 'CELESTIAL_TWILIGHT':
        // Catastrophe damage and suppressed healing are processed during damage/heal calculation
        break;

      default:
        break;
    }

    return logs;
  }

  /**
   * Calculates affix-modified damage for Light/Shadow interactions or Lightning bounces.
   */
  public modifyDamage(
    attacker: Combatant,
    defender: Combatant,
    baseDamage: number,
  ): { damage: number; logMessage?: string } {
    if (this.theme === 'CELESTIAL_TWILIGHT') {
      const isLightVsShadow =
        (attacker.element === 'LIGHT' && defender.element === 'SHADOW') ||
        (attacker.element === 'SHADOW' && defender.element === 'LIGHT');

      if (isLightVsShadow) {
        const cataclysmDamage = Math.round(baseDamage * 2.0);
        return {
          damage: cataclysmDamage,
          logMessage: `✨🌑 **Catastrophic Twilight!** Light vs Shadow collision amplified strike to 2.0x (${cataclysmDamage} DMG)!`,
        };
      }
    }

    if (this.theme === 'ABYSSAL_MAELSTROM' && attacker.element === 'LIGHTNING') {
      const boostedDamage = Math.round(baseDamage * 1.2);
      return {
        damage: boostedDamage,
        logMessage: `⚡ **Torrential Resonance!** Lightning strike gained +20% bonus surge damage in torrential waters!`,
      };
    }

    return { damage: baseDamage };
  }

  /**
   * Modifies healing value (e.g. 40% suppression in Celestial Twilight).
   */
  public modifyHealing(healer: Combatant, baseHeal: number): number {
    if (this.theme === 'CELESTIAL_TWILIGHT') {
      return Math.round(baseHeal * 0.6); // 40% suppression
    }
    return baseHeal;
  }
}
