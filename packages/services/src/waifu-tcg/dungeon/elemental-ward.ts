import type { CardElement } from '../types.js';

export interface WardLayer {
  element: CardElement;
  maxHealth: number;
  currentHealth: number;
  isBroken: boolean;
}

export interface WardAttackResult {
  absorbed: boolean;
  damagePassedToBoss: number;
  layerBroken: boolean;
  brokenElement?: CardElement;
  allWardsBroken: boolean;
  message: string;
}

/** Share of an off-element strike that still damages a season ward. */
export const DEFAULT_OFF_ELEMENT_WARD_CHIP = 0.25;

export class ElementalWard {
  private readonly layers: WardLayer[];
  private readonly offElementChip: number;

  /**
   * @param options.offElementChip share of an off-element strike that damages the ward
   *   (0 = only the matching element breaks it, as in the tutorial).
   */
  constructor(
    layers: Array<{ element: CardElement; health: number }>,
    options: { offElementChip?: number | undefined } = {},
  ) {
    this.offElementChip = Math.max(0, Math.min(1, options.offElementChip ?? 0));
    this.layers = layers.map((l) => ({
      element: l.element,
      maxHealth: Math.max(1, l.health),
      currentHealth: Math.max(1, l.health),
      isBroken: false,
    }));
  }

  /**
   * Checks if all ward layers are completely shattered.
   */
  public isBroken(): boolean {
    return this.layers.every((l) => l.isBroken);
  }

  /**
   * Returns current active ward layer, or null if all layers are broken.
   */
  public getCurrentLayer(): WardLayer | null {
    const active = this.layers.find((l) => !l.isBroken);
    return active ?? null;
  }

  /**
   * Returns all layers state for display / inspection.
   */
  public getLayers(): ReadonlyArray<WardLayer> {
    return this.layers;
  }

  /**
   * Processes incoming strike against the elemental ward.
   * Matching elements deplete the active layer at full damage; other elements only chip it by
   * offElementChip (0 absorbs them completely). Excess damage hits the boss once all wards break.
   */
  public processAttack(attackerElement: CardElement, rawDamage: number): WardAttackResult {
    const current = this.getCurrentLayer();

    // If no active ward, all damage passes directly to boss
    if (!current) {
      return {
        absorbed: false,
        damagePassedToBoss: rawDamage,
        layerBroken: false,
        allWardsBroken: true,
        message: 'No active elemental ward. Direct hit on the boss!',
      };
    }

    // Off-element strikes only chip the ward (or bounce off entirely)
    const matching = attackerElement === current.element;
    const effective = matching ? rawDamage : Math.round(rawDamage * this.offElementChip);
    if (effective <= 0) {
      return {
        absorbed: true,
        damagePassedToBoss: 0,
        layerBroken: false,
        allWardsBroken: false,
        message: `🛡️ **Elemental Ward [${current.element}]** absorbed the ${attackerElement} strike! Non-matching attacks deal 0 damage!`,
      };
    }

    const damageDealt = Math.min(effective, current.currentHealth);
    current.currentHealth -= damageDealt;
    const overflow = effective - damageDealt;

    if (current.currentHealth <= 0) {
      current.currentHealth = 0;
      current.isBroken = true;
      const allBroken = this.isBroken();

      if (allBroken) {
        return {
          absorbed: false,
          damagePassedToBoss: overflow,
          layerBroken: true,
          brokenElement: current.element,
          allWardsBroken: true,
          message: `💥 **Elemental Ward [${current.element}] SHATTERED!** All barriers are down! Boss is vulnerable! (+${overflow} overflow damage)`,
        };
      } else {
        const nextLayer = this.getCurrentLayer()!;
        return {
          absorbed: true,
          damagePassedToBoss: 0,
          layerBroken: true,
          brokenElement: current.element,
          allWardsBroken: false,
          message: `💥 **Elemental Ward [${current.element}] BROKEN!** Next barrier active: **[${nextLayer.element}]** (${nextLayer.currentHealth}/${nextLayer.maxHealth} HP)!`,
        };
      }
    }

    return {
      absorbed: true,
      damagePassedToBoss: 0,
      layerBroken: false,
      allWardsBroken: false,
      message: matching
        ? `⚔️ **Resonant Strike!** [${current.element}] barrier damaged for ${damageDealt} HP! (${current.currentHealth}/${current.maxHealth} remaining)`
        : `🛡️ **Off-element strike** only chipped the [${current.element}] barrier for ${damageDealt} HP (${Math.round(this.offElementChip * 100)}%). Match its element to break it faster! (${current.currentHealth}/${current.maxHealth} remaining)`,
    };
  }

  /**
   * Formats current ward status as an embed or log friendly string.
   */
  public formatWardStatus(): string {
    if (this.layers.length === 0) return 'No Wards';
    return this.layers
      .map((l) => {
        if (l.isBroken) return `~~[${l.element}]~~`;
        return `**[${l.element}: ${l.currentHealth}/${l.maxHealth} HP]**`;
      })
      .join(' ➔ ');
  }
}
