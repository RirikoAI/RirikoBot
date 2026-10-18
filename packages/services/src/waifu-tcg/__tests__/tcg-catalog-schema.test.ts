import { describe, expect, it } from 'vitest';
import {
  TCG_BATTLE_PERKS,
  TCG_FLAT_GEAR_STATS,
  TCG_FRACTION_GEAR_STATS,
  TCG_GEAR_SLOTS,
  TCG_ITEM_RARITIES,
} from '@ririko/core';
import { RARITY_ENHANCEMENT_MULTIPLIERS } from '../equipment/enhancement-service.js';
import { CANONICAL_ITEMS } from '../equipment/catalog.js';
import { ALL_GEAR_SLOTS } from '../equipment/types.js';

/** The owner console's gear schema (in @ririko/core) must describe what the engine reads. */
describe('TCG catalog schema lists match the engine', () => {
  const gear = CANONICAL_ITEMS.filter(
    (item) => item.type === 'EQUIPMENT' || item.type === 'ACCESSORY',
  );
  const stats = new Set<string>([...TCG_FLAT_GEAR_STATS, ...TCG_FRACTION_GEAR_STATS]);

  it('covers every gear slot, rarity, stat and perk the canonical catalog uses', () => {
    expect([...TCG_GEAR_SLOTS]).toEqual(ALL_GEAR_SLOTS);
    expect([...TCG_ITEM_RARITIES].sort()).toEqual(
      Object.keys(RARITY_ENHANCEMENT_MULTIPLIERS).sort(),
    );
    for (const item of gear) {
      expect(TCG_ITEM_RARITIES).toContain(item.rarity);
      for (const stat of Object.keys(item.baseStats ?? {})) expect(stats).toContain(stat);
      for (const perk of item.battlePerks ?? []) expect(TCG_BATTLE_PERKS).toContain(perk);
    }
  });
});
