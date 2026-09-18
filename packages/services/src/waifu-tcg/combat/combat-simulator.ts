import type {
  CombatActionLog,
  Combatant,
  CombatResult,
} from './types.js';
import {
  getElementalMultiplier,
  getElementAdvantageDescription,
} from './elemental-matrix.js';
import {
  calculateEffectiveStats,
  processLeech,
  processStartOfTurnStatusEffects,
  applyStatusEffect,
} from './status-effects.js';
import {
  applyAttackPerks,
  applyBattleStartPerks,
  applyDefendPerks,
  applyPeriodicPerks,
  checkPhoenixWard,
} from './battle-perks.js';

export interface CombatOptions {
  maxTurns?: number;
  rng?: () => number;
}

export class CombatSimulator {
  private readonly maxTurns: number;
  private readonly rng: () => number;

  constructor(options: CombatOptions = {}) {
    this.maxTurns = options.maxTurns ?? 25;
    this.rng = options.rng ?? Math.random;
  }

  /**
   * Simulates full combat between two teams (1v1 or up to 3v3).
   */
  public simulate(teamA: Combatant[], teamB: Combatant[]): CombatResult {
    // Clone combatants to preserve caller state
    const teamAState = teamA.map((c) => this.cloneCombatant(c, 'TEAM_A'));
    const teamBState = teamB.map((c) => this.cloneCombatant(c, 'TEAM_B'));

    const logs: CombatActionLog[] = [];

    // 1. Apply Battle Start Perks (e.g. Mana Conduit)
    const startPerkLogs = applyBattleStartPerks([...teamAState, ...teamBState]);
    for (const msg of startPerkLogs) {
      logs.push({
        turn: 0,
        actorId: 'system',
        actorName: 'Combat Field',
        actionType: 'PERK',
        message: msg,
      });
    }

    let turn = 1;
    let winner: 'TEAM_A' | 'TEAM_B' | 'DRAW' = 'DRAW';

    while (turn <= this.maxTurns) {
      // Check win condition before turn begins
      if (this.isTeamDefeated(teamAState)) {
        winner = 'TEAM_B';
        break;
      }
      if (this.isTeamDefeated(teamBState)) {
        winner = 'TEAM_A';
        break;
      }

      // Check Turn 10+ Soft Enrage (+100% ATK per turn over 9)
      const enrageMultiplier = turn >= 10 ? 1 + (turn - 9) : 1.0;
      if (turn === 10) {
        logs.push({
          turn,
          actorId: 'field',
          actorName: 'Enrage Arena',
          actionType: 'ENRAGE',
          message:
            '⚠️ **SOFT ENRAGE ACTIVATED!** Combat length has exceeded 10 turns. Attackers gain massive true damage amplification!',
        });
      }

      // Build speed-sorted turn queue for living combatants
      const aliveCombatants = [...teamAState, ...teamBState].filter((c) => c.isAlive);
      aliveCombatants.sort((a, b) => {
        const spdA = calculateEffectiveStats(a).effectiveSpeed;
        const spdB = calculateEffectiveStats(b).effectiveSpeed;
        if (spdB !== spdA) return spdB - spdA;
        return a.id.localeCompare(b.id);
      });

      for (const actor of aliveCombatants) {
        if (!actor.isAlive) continue;

        // Check if opposing team is already defeated during the turn
        const opposingTeam = actor.team === 'TEAM_A' ? teamBState : teamAState;
        if (this.isTeamDefeated(opposingTeam)) {
          break;
        }

        // Periodic Perks (e.g. Cosmic Cataclysm on every 3rd turn)
        const cataclysm = applyPeriodicPerks(actor, opposingTeam, turn);
        if (cataclysm.triggeredCataclysm && cataclysm.target) {
          for (const msg of cataclysm.logs) {
            logs.push({
              turn,
              actorId: actor.id,
              actorName: actor.name,
              actionType: 'PERK',
              targetId: cataclysm.target.id,
              targetName: cataclysm.target.name,
              damageDealt: cataclysm.trueDamage,
              message: msg,
            });
          }
          // Check target Phoenix Ward
          if (cataclysm.target.currentHealth <= 0) {
            const revive = checkPhoenixWard(cataclysm.target);
            if (revive.revived) {
              logs.push({
                turn,
                actorId: cataclysm.target.id,
                actorName: cataclysm.target.name,
                actionType: 'REVIVE',
                message: revive.logs[0]!,
              });
            }
          }
        }

        // 2. Start-of-turn status ticks (Burn, Purify, Freeze check)
        const statusTick = processStartOfTurnStatusEffects(actor, this.rng);
        for (const msg of statusTick.logs) {
          logs.push({
            turn,
            actorId: actor.id,
            actorName: actor.name,
            actionType: 'STATUS_TICK',
            message: msg,
          });
        }

        // Check if died from Burn DoT
        if (!actor.isAlive) {
          const revive = checkPhoenixWard(actor);
          if (revive.revived) {
            logs.push({
              turn,
              actorId: actor.id,
              actorName: actor.name,
              actionType: 'REVIVE',
              message: revive.logs[0]!,
            });
          } else {
            logs.push({
              turn,
              actorId: actor.id,
              actorName: actor.name,
              actionType: 'STATUS_TICK',
              message: `💀 **${actor.name}** was incapacitated by lingering status damage!`,
            });
            continue;
          }
        }

        // If frozen or stunned, skip combat action
        if (!statusTick.canAct) {
          continue;
        }

        // 3. Select Target (First living vanguard on opposing team)
        const aliveOpponents = opposingTeam.filter((o) => o.isAlive);
        if (aliveOpponents.length === 0) break;
        const target = aliveOpponents[0]!;

        // 4. Resolve Action: Active Skill vs Basic Attack
        const actorStats = calculateEffectiveStats(actor);
        const targetStats = calculateEffectiveStats(target);

        const canCastSkill = actor.currentMp >= actor.skillManaCost && actor.skillName;
        const isSkill = canCastSkill;

        let baseDamage: number;
        let isCritical = false;

        if (isSkill) {
          actor.currentMp -= actor.skillManaCost;
          // Active skills deal 1.5x damage base
          baseDamage = Math.round(actorStats.effectiveAttack * 1.5);
        } else {
          // Basic attack generates 15 MP
          actor.currentMp = Math.min(actor.maxMp, actor.currentMp + 15);
          baseDamage = Math.max(10, actorStats.effectiveAttack - Math.round(targetStats.effectiveDefense * 0.4));
        }

        // Apply Critical Strike check
        const critRoll = this.rng();
        if (critRoll < actorStats.effectiveCritRate) {
          isCritical = true;
          baseDamage = Math.round(baseDamage * actor.critDamage);
        }

        // Apply Elemental Multiplier
        const elemMult = getElementalMultiplier(actor.element, target.element);
        let finalDamage = Math.round(baseDamage * elemMult);

        // Apply Turn 10+ Soft Enrage multiplier
        if (enrageMultiplier > 1.0) {
          finalDamage = Math.round(finalDamage * enrageMultiplier);
        }

        // Apply Attack Perks (Sharpened Edge, Vampiric Touch)
        const attackPerks = applyAttackPerks(actor, target, finalDamage);
        finalDamage = attackPerks.modifiedDamage;

        // Apply Damage to Target (Shield first, then HP)
        let dmgToHp = finalDamage;
        let shieldAbsorbed = 0;

        if (target.shield > 0 && !actorStats.piercesShield) {
          if (target.shield >= finalDamage) {
            target.shield -= finalDamage;
            shieldAbsorbed = finalDamage;
            dmgToHp = 0;
          } else {
            shieldAbsorbed = target.shield;
            dmgToHp = finalDamage - target.shield;
            target.shield = 0;
          }
        }

        target.currentHealth = Math.max(0, target.currentHealth - dmgToHp);
        if (target.currentHealth === 0) {
          target.isAlive = false;
        }

        // Format Action Message
        const actionLabel = isSkill ? `✨ Skill [**${actor.skillName}**]` : '⚔️ Basic Strike';
        const critLabel = isCritical ? ' **CRITICAL HIT!**' : '';
        const elemDesc = elemMult !== 1.0 ? ` (${elemMult}x ${getElementAdvantageDescription(actor.element, target.element)})` : '';
        const shieldDesc = shieldAbsorbed > 0 ? ` [${shieldAbsorbed} absorbed by shield]` : '';
        const enrageDesc = enrageMultiplier > 1.0 ? ' ⚡[Enraged]' : '';

        logs.push({
          turn,
          actorId: actor.id,
          actorName: actor.name,
          actionType: isSkill ? 'SKILL' : 'ATTACK',
          targetId: target.id,
          targetName: target.name,
          damageDealt: finalDamage,
          isCritical,
          elementMultiplier: elemMult,
          message:
            `${actionLabel} by **${actor.name}** dealt **${finalDamage} DMG** to **${target.name}**${critLabel}${elemDesc}${shieldDesc}${enrageDesc} ` +
            `(${target.currentHealth}/${target.maxHealth} HP remaining).`,
        });

        // Log perks from attack
        for (const pLog of attackPerks.logs) {
          logs.push({
            turn,
            actorId: actor.id,
            actorName: actor.name,
            actionType: 'PERK',
            message: pLog,
          });
        }

        // Apply Status Effects on skill cast or element
        if (isSkill) {
          this.applySkillElementalEffects(actor, target, logs, turn);
        }

        // Apply Shadow Leech if applicable
        const leechHeal = processLeech(actor, finalDamage);
        if (leechHeal > 0) {
          logs.push({
            turn,
            actorId: actor.id,
            actorName: actor.name,
            actionType: 'STATUS_TICK',
            healingDone: leechHeal,
            message: `🌑 **Decay & Leech** healed **${actor.name}** for **${leechHeal} HP** (${actor.currentHealth}/${actor.maxHealth} HP).`,
          });
        }

        // Apply Defend Perks (e.g. Glacial Counter 25% freeze)
        const defendPerks = applyDefendPerks(target, actor, this.rng);
        for (const dLog of defendPerks.logs) {
          logs.push({
            turn,
            actorId: target.id,
            actorName: target.name,
            actionType: 'PERK',
            targetId: actor.id,
            targetName: actor.name,
            message: dLog,
          });
        }

        // Check if defender died and can trigger Phoenix Ward
        if (!target.isAlive) {
          const revive = checkPhoenixWard(target);
          if (revive.revived) {
            logs.push({
              turn,
              actorId: target.id,
              actorName: target.name,
              actionType: 'REVIVE',
              message: revive.logs[0]!,
            });
          } else {
            logs.push({
              turn,
              actorId: target.id,
              actorName: target.name,
              actionType: 'ATTACK',
              message: `💥 **${target.name}** has fallen in combat!`,
            });
          }
        }
      }

      turn++;
    }

    // Determine final winner if not already set
    if (winner === 'DRAW') {
      if (this.isTeamDefeated(teamBState)) {
        winner = 'TEAM_A';
      } else if (this.isTeamDefeated(teamAState)) {
        winner = 'TEAM_B';
      } else {
        // Compare total remaining health percentage
        const hpA = teamAState.reduce((acc, c) => acc + c.currentHealth, 0);
        const maxHpA = teamAState.reduce((acc, c) => acc + c.maxHealth, 0);
        const hpB = teamBState.reduce((acc, c) => acc + c.currentHealth, 0);
        const maxHpB = teamBState.reduce((acc, c) => acc + c.maxHealth, 0);

        const pctA = maxHpA > 0 ? hpA / maxHpA : 0;
        const pctB = maxHpB > 0 ? hpB / maxHpB : 0;

        if (pctA > pctB) {
          winner = 'TEAM_A';
        } else if (pctB > pctA) {
          winner = 'TEAM_B';
        } else {
          winner = 'DRAW';
        }
      }
    }

    return {
      winner,
      turnsTotal: Math.min(turn - 1, this.maxTurns),
      logs,
      teamA: teamAState,
      teamB: teamBState,
    };
  }

  /**
   * Applies specific status effects on skill execution based on attacker element.
   */
  private applySkillElementalEffects(
    actor: Combatant,
    target: Combatant,
    logs: CombatActionLog[],
    turn: number,
  ): void {
    switch (actor.element) {
      case 'FIRE':
        applyStatusEffect(target, {
          type: 'BURN',
          duration: 2,
          value: Math.round(actor.attack * 0.15),
          sourceElement: 'FIRE',
        });
        logs.push({
          turn,
          actorId: actor.id,
          actorName: actor.name,
          actionType: 'STATUS_TICK',
          targetId: target.id,
          targetName: target.name,
          message: `🔥 **${actor.name}** inflicted **Burn** on **${target.name}** for 2 turns!`,
        });
        break;

      case 'ICE':
        applyStatusEffect(target, {
          type: 'CHILL',
          duration: 2,
          sourceElement: 'ICE',
        });
        logs.push({
          turn,
          actorId: actor.id,
          actorName: actor.name,
          actionType: 'STATUS_TICK',
          targetId: target.id,
          targetName: target.name,
          message: `❄️ **${actor.name}** inflicted **Chill** on **${target.name}** (-25% Speed, chance to Freeze)!`,
        });
        break;

      case 'EARTH':
        actor.shield += Math.round(actor.defense * 1.5);
        applyStatusEffect(actor, {
          type: 'FORTIFY',
          duration: 2,
          sourceElement: 'EARTH',
        });
        logs.push({
          turn,
          actorId: actor.id,
          actorName: actor.name,
          actionType: 'STATUS_TICK',
          message: `🛡️ **${actor.name}** erected **Fortify** (+${Math.round(actor.defense * 1.5)} Shield, +20% Mitigation)!`,
        });
        break;

      case 'LIGHTNING':
        applyStatusEffect(actor, {
          type: 'SURGE',
          duration: 2,
          sourceElement: 'LIGHTNING',
        });
        logs.push({
          turn,
          actorId: actor.id,
          actorName: actor.name,
          actionType: 'STATUS_TICK',
          message: `⚡ **${actor.name}** channeled **Surge** (+15% Critical Chance)!`,
        });
        break;

      case 'WATER':
        applyStatusEffect(actor, {
          type: 'PURIFY_FLOW',
          duration: 3,
          sourceElement: 'WATER',
        });
        logs.push({
          turn,
          actorId: actor.id,
          actorName: actor.name,
          actionType: 'STATUS_TICK',
          message: `💧 **${actor.name}** activated **Purify & Flow** (8% Max HP Regen/turn & debuff cleanse)!`,
        });
        break;

      case 'LIGHT':
        applyStatusEffect(actor, {
          type: 'RADIANCE',
          duration: 2,
          sourceElement: 'LIGHT',
        });
        logs.push({
          turn,
          actorId: actor.id,
          actorName: actor.name,
          actionType: 'STATUS_TICK',
          message: `☀️ **${actor.name}** radiated **Radiance** (+15% Team ATK, barrier pierce)!`,
        });
        break;

      case 'SHADOW':
        applyStatusEffect(actor, {
          type: 'DECAY_LEECH',
          duration: 3,
          sourceElement: 'SHADOW',
        });
        logs.push({
          turn,
          actorId: actor.id,
          actorName: actor.name,
          actionType: 'STATUS_TICK',
          message: `🌑 **${actor.name}** embraced **Decay & Leech** (20% Lifesteal on all strikes)!`,
        });
        break;
    }
  }

  private isTeamDefeated(team: Combatant[]): boolean {
    return team.every((c) => !c.isAlive || c.currentHealth <= 0);
  }

  private cloneCombatant(c: Combatant, team: 'TEAM_A' | 'TEAM_B'): Combatant {
    return {
      ...c,
      team,
      currentHealth: c.currentHealth,
      shield: c.shield ?? 0,
      currentMp: c.currentMp ?? 0,
      statusEffects: c.statusEffects ? c.statusEffects.map((e) => ({ ...e })) : [],
      perks: [...(c.perks ?? [])],
      hasUsedPhoenixWard: false,
      isAlive: c.currentHealth > 0,
    };
  }
}
