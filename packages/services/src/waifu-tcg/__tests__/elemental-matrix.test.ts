import { describe, it, expect } from 'vitest';
import {
  getElementalAdvantage,
  getElementalMultiplier,
  getElementAdvantageDescription,
  ELEMENTAL_ADVANTAGE_MULTIPLIER,
  ELEMENTAL_DISADVANTAGE_MULTIPLIER,
  ELEMENTAL_NEUTRAL_MULTIPLIER,
} from '../combat/elemental-matrix.js';

describe('7-Element Affinity Matrix (TASK-1021)', () => {
  it('should enforce exact Section 4.1 advantage loop (1.5x)', () => {
    // Fire melts Ice
    expect(getElementalAdvantage('FIRE', 'ICE')).toBe('ADVANTAGE');
    expect(getElementalMultiplier('FIRE', 'ICE')).toBe(ELEMENTAL_ADVANTAGE_MULTIPLIER);

    // Ice freezes & fractures Earth
    expect(getElementalAdvantage('ICE', 'EARTH')).toBe('ADVANTAGE');
    expect(getElementalMultiplier('ICE', 'EARTH')).toBe(ELEMENTAL_ADVANTAGE_MULTIPLIER);

    // Earth grounds & absorbs Lightning
    expect(getElementalAdvantage('EARTH', 'LIGHTNING')).toBe('ADVANTAGE');
    expect(getElementalMultiplier('EARTH', 'LIGHTNING')).toBe(ELEMENTAL_ADVANTAGE_MULTIPLIER);

    // Lightning electrifies & shocks Water
    expect(getElementalAdvantage('LIGHTNING', 'WATER')).toBe('ADVANTAGE');
    expect(getElementalMultiplier('LIGHTNING', 'WATER')).toBe(ELEMENTAL_ADVANTAGE_MULTIPLIER);

    // Water extinguishes Fire
    expect(getElementalAdvantage('WATER', 'FIRE')).toBe('ADVANTAGE');
    expect(getElementalMultiplier('WATER', 'FIRE')).toBe(ELEMENTAL_ADVANTAGE_MULTIPLIER);
  });

  it('should enforce mutual high-risk catastrophe between Light and Shadow (1.5x each)', () => {
    expect(getElementalAdvantage('LIGHT', 'SHADOW')).toBe('ADVANTAGE');
    expect(getElementalMultiplier('LIGHT', 'SHADOW')).toBe(1.5);

    expect(getElementalAdvantage('SHADOW', 'LIGHT')).toBe('ADVANTAGE');
    expect(getElementalMultiplier('SHADOW', 'LIGHT')).toBe(1.5);
  });

  it('should enforce 0.75x penalty for disadvantaged matchups', () => {
    expect(getElementalAdvantage('ICE', 'FIRE')).toBe('DISADVANTAGE');
    expect(getElementalMultiplier('ICE', 'FIRE')).toBe(ELEMENTAL_DISADVANTAGE_MULTIPLIER);

    expect(getElementalAdvantage('EARTH', 'ICE')).toBe('DISADVANTAGE');
    expect(getElementalMultiplier('EARTH', 'ICE')).toBe(0.75);

    expect(getElementalAdvantage('LIGHTNING', 'EARTH')).toBe('DISADVANTAGE');
    expect(getElementalMultiplier('LIGHTNING', 'EARTH')).toBe(0.75);

    expect(getElementalAdvantage('WATER', 'LIGHTNING')).toBe('DISADVANTAGE');
    expect(getElementalMultiplier('WATER', 'LIGHTNING')).toBe(0.75);

    expect(getElementalAdvantage('FIRE', 'WATER')).toBe('DISADVANTAGE');
    expect(getElementalMultiplier('FIRE', 'WATER')).toBe(0.75);
  });

  it('should return 1.0x for neutral matchups', () => {
    expect(getElementalAdvantage('FIRE', 'EARTH')).toBe('NEUTRAL');
    expect(getElementalMultiplier('FIRE', 'EARTH')).toBe(ELEMENTAL_NEUTRAL_MULTIPLIER);

    expect(getElementalAdvantage('FIRE', 'FIRE')).toBe('NEUTRAL');
    expect(getElementalMultiplier('FIRE', 'FIRE')).toBe(1.0);

    expect(getElementalAdvantage('LIGHT', 'FIRE')).toBe('NEUTRAL');
    expect(getElementalMultiplier('LIGHT', 'FIRE')).toBe(1.0);
  });

  it('should generate informative advantage descriptions', () => {
    const descFireIce = getElementAdvantageDescription('FIRE', 'ICE');
    expect(descFireIce).toContain('Thermal Melt');
    expect(descFireIce).toContain('1.5x');

    const descLightShadow = getElementAdvantageDescription('LIGHT', 'SHADOW');
    expect(descLightShadow).toContain('Mutual Catastrophe');
    expect(descLightShadow).toContain('1.5x');

    const descNeutral = getElementAdvantageDescription('FIRE', 'FIRE');
    expect(descNeutral).toContain('Neutral Affinity');
  });
});
