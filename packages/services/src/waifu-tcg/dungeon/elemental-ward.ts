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

export class ElementalWard {
  private readonly layers: WardLayer[];

  constructor(layers: Array<{ element: CardElement; health: number }>) {
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
   * If non-matching element, absorbs 100% of damage (0 damage to boss).
   * If matching element, depletes the active layer. Excess damage hits the boss if all wards break.
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

    // Check elemental match
    if (attackerElement !== current.element) {
      return {
        absorbed: true,
        damagePassedToBoss: 0,
        layerBroken: false,
        allWardsBroken: false,
        message: `🛡️ **Elemental Ward [${current.element}]** absorbed the ${attackerElement} strike! Non-matching attacks deal 0 damage!`,
      };
    }

    // Matching element! Damage is dealt to the current ward layer
    const damageDealt = Math.min(rawDamage, current.currentHealth);
    current.currentHealth -= damageDealt;
    const overflow = rawDamage - damageDealt;

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
      message: `⚔️ **Resonant Strike!** [${current.element}] barrier damaged for ${damageDealt} HP! (${current.currentHealth}/${current.maxHealth} remaining)`,
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
