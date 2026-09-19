import type { NewGameItem } from '@ririko/database';
import type { CardElement, CardRarity } from '../types.js';
import { CardGenerator } from '../card/card-generator.js';
import { createCardCombatant } from '../card/card-combatant.js';
import { CANONICAL_ITEMS } from '../equipment/catalog.js';
import { scaleEquipmentPerks, scaleEquipmentStats } from '../equipment/enhancement-service.js';
import { addEquipmentStats, applyEquipmentToCombatant } from '../equipment/loadout-service.js';
import type { EquipmentStats } from '../equipment/types.js';
import { startEncounterSession, type DungeonRunner } from './dungeon-runner.js';

const ELEMENTS: readonly CardElement[] = [
  'FIRE',
  'ICE',
  'EARTH',
  'LIGHTNING',
  'WATER',
  'LIGHT',
  'SHADOW',
];

/** A typical player at some point of their climb. Card stats are rolled per trial. */
export interface SimProfile {
  id: string;
  label: string;
  rarity: CardRarity;
  level: number;
  /** Fixed element, or omit for a random element each trial. */
  element?: CardElement | undefined;
  gear?: ReadonlyArray<{ code: string; enhancement?: number }> | undefined;
  /** Minor HP Potions carried into each battle (drunk below 35% HP). */
  potions?: number | undefined;
}

export interface WinRateBand {
  profileId: string;
  fromFloor: number;
  toFloor: number;
  min?: number | undefined;
  max?: number | undefined;
  note?: string | undefined;
}

export interface SimRow {
  floor: number;
  profileId: string;
  trials: number;
  winRate: number;
  avgTurns: number;
}

export interface BandViolation {
  band: WinRateBand;
  floor: number;
  winRate: number;
}

/**
 * Player profiles for each stage of a season, from a fresh tutorial graduate to endgame.
 * Gear uses catalog codes so the simulator measures the real items players can get.
 */
export const DEFAULT_SIM_PROFILES: readonly SimProfile[] = [
  {
    id: 'newbie',
    label: 'Tutorial graduate: COMMON Lv3, Novice Blade, 3 potions',
    rarity: 'COMMON',
    level: 3,
    gear: [{ code: 'WEAPON_NOVICE_BLADE' }],
    potions: 3,
  },
  {
    id: 'starter',
    label: 'Starter grinding F1-4: COMMON Lv8, blade + shop armor',
    rarity: 'COMMON',
    level: 8,
    gear: [{ code: 'WEAPON_NOVICE_BLADE' }, { code: 'ARMOR_IRON_HAUBERK' }],
    potions: 3,
  },
  {
    id: 'early',
    label: 'Early climber: UNCOMMON Lv12, shop weapon/armor/accessories',
    rarity: 'UNCOMMON',
    level: 12,
    gear: [
      { code: 'WEAPON_SCOUT_BOOMERANG', enhancement: 2 },
      { code: 'ARMOR_IRON_HAUBERK', enhancement: 2 },
      { code: 'RING_COPPER_BAND' },
      { code: 'AMULET_LEATHER_CHOKER' },
    ],
    potions: 3,
  },
  {
    id: 'mid',
    label: 'Mid tower: RARE Lv22, F10 katana +4, rare accessories',
    rarity: 'RARE',
    level: 22,
    gear: [
      { code: 'WEAPON_OBSIDIAN_KATANA', enhancement: 4 },
      { code: 'ARMOR_IRON_HAUBERK', enhancement: 5 },
      { code: 'RING_BLAZING_SUN' },
      { code: 'AMULET_MOUNTAIN' },
      { code: 'TALISMAN_WINDWALKER' },
    ],
    potions: 3,
  },
  {
    id: 'late',
    label: 'Late tower: SUPER_RARE Lv35, F30 lance +5, SR armor',
    rarity: 'SUPER_RARE',
    level: 35,
    gear: [
      { code: 'WEAPON_SOLAR_LANCE', enhancement: 5 },
      { code: 'ARMOR_DRAGONSCALE_PLATE', enhancement: 5 },
      { code: 'RING_BLAZING_SUN', enhancement: 5 },
      { code: 'AMULET_MOUNTAIN', enhancement: 5 },
      { code: 'TALISMAN_WINDWALKER', enhancement: 5 },
    ],
    potions: 3,
  },
  {
    id: 'endgame',
    label: 'Endgame: ULTRA_RARE Lv50, full +8 set with relic',
    rarity: 'ULTRA_RARE',
    level: 50,
    gear: [
      { code: 'WEAPON_SOLAR_LANCE', enhancement: 8 },
      { code: 'ARMOR_AEGIS_BARRIER', enhancement: 8 },
      { code: 'RELIC_CHRONOS_HOURGLASS', enhancement: 8 },
      { code: 'RING_BLAZING_SUN', enhancement: 8 },
      { code: 'AMULET_MOUNTAIN', enhancement: 8 },
      { code: 'TALISMAN_WINDWALKER', enhancement: 8 },
    ],
    potions: 3,
  },
];

/**
 * Season 1 progression targets: each stage clears its bracket reliably but cannot skip ahead,
 * so better cards and then better gear are required as the climb goes on.
 */
export const S1_TARGET_BANDS: readonly WinRateBand[] = [
  { profileId: 'newbie', fromFloor: 1, toFloor: 3, min: 0.85, note: 'Onboarding floors' },
  {
    profileId: 'starter',
    fromFloor: 4,
    toFloor: 5,
    min: 0.6,
    note: 'First mini-boss teaches skills/potions',
  },
  { profileId: 'newbie', fromFloor: 10, toFloor: 10, max: 0.05, note: 'F10 is a real gear check' },
  { profileId: 'early', fromFloor: 6, toFloor: 10, min: 0.5, note: 'Element + shop gear' },
  { profileId: 'early', fromFloor: 20, toFloor: 20, max: 0.05, note: 'F20 needs enhanced gear' },
  { profileId: 'mid', fromFloor: 11, toFloor: 20, min: 0.4 },
  { profileId: 'mid', fromFloor: 30, toFloor: 30, max: 0.1 },
  { profileId: 'late', fromFloor: 21, toFloor: 30, min: 0.35 },
  { profileId: 'endgame', fromFloor: 31, toFloor: 50, min: 0.15 },
];

/** Deterministic PRNG (mulberry32) so simulations and CI checks are repeatable. */
export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gearTotals(
  profile: SimProfile,
  items: readonly NewGameItem[],
): { stats: EquipmentStats; perks: string[] } {
  const stats: EquipmentStats = {};
  const perks: string[] = [];
  for (const piece of profile.gear ?? []) {
    const item = items.find((i) => i.code === piece.code);
    if (!item) throw new Error(`Unknown gear code in sim profile ${profile.id}: ${piece.code}`);
    addEquipmentStats(stats, scaleEquipmentStats(item.baseStats ?? {}, piece.enhancement ?? 0));
    perks.push(...scaleEquipmentPerks(item.battlePerks ?? [], piece.enhancement ?? 0));
  }
  return { stats, perks };
}

/**
 * Monte Carlo win rates per floor and profile, using the real encounter builder and battle
 * session. The player fights on auto (skill when affordable) and drinks potions below 35% HP.
 */
export async function simulateDungeonBalance(options: {
  runner: DungeonRunner;
  seasonId: string;
  floors: readonly number[];
  profiles: readonly SimProfile[];
  trials: number;
  seed?: number | undefined;
  items?: readonly NewGameItem[] | undefined;
}): Promise<SimRow[]> {
  const items = options.items ?? CANONICAL_ITEMS;
  const minorPotion = items.find((i) => i.code === 'POTION_MINOR_HP');
  const rows: SimRow[] = [];

  for (const floor of options.floors) {
    // Encounters are pure data (the tutorial is the only case that looks at the player), so one per floor.
    const probe = createCardCombatant(
      {
        id: 'sim',
        name: 'Sim',
        element: 'FIRE',
        rarity: 'COMMON',
        level: 1,
        stats: { hp: 1, attack: 1, defense: 1, speed: 1, critRate: 0 },
      },
      'TEAM_A',
    );
    const { encounter } = await options.runner.buildEncounter('sim', options.seasonId, floor, [
      probe,
    ]);

    for (const profile of options.profiles) {
      const rng = createSeededRng((options.seed ?? 42) + floor * 1009 + profile.id.length * 97);
      const generator = new CardGenerator({ randomFn: rng });
      const gear = gearTotals(profile, items);
      let wins = 0;
      let turns = 0;

      for (let t = 0; t < options.trials; t++) {
        const element = profile.element ?? ELEMENTS[Math.floor(rng() * ELEMENTS.length)]!;
        const player = createCardCombatant(
          {
            id: `sim_${profile.id}`,
            name: profile.id,
            element,
            rarity: profile.rarity,
            level: profile.level,
            stats: generator.generateStats(profile.rarity),
          },
          'TEAM_A',
        );
        applyEquipmentToCombatant(player, gear.stats, gear.perks);

        const session = startEncounterSession({
          encounter,
          floorNumber: floor,
          seasonId: options.seasonId,
          userId: 'sim',
          playerCard: player,
          rng,
        });

        let potions = profile.potions ?? 0;
        let state = session.getSnapshot();
        while (!state.isFinished) {
          if (
            potions > 0 &&
            minorPotion &&
            state.player.currentHealth < state.player.maxHealth * 0.35
          ) {
            session.executeItemTurn({
              code: minorPotion.code,
              name: minorPotion.name,
              subtype: minorPotion.subtype,
              consumableEffect: minorPotion.consumableEffect as {
                healFlat?: number;
                healPercent?: number;
              },
            });
            potions--;
          }
          state = session.executeAutoTurn();
        }
        if (state.winner === 'TEAM_A') wins++;
        turns += state.turn;
      }

      rows.push({
        floor,
        profileId: profile.id,
        trials: options.trials,
        winRate: wins / options.trials,
        avgTurns: turns / options.trials,
      });
    }
  }
  return rows;
}

/** Returns every simulated floor whose win rate falls outside its target band. */
export function checkWinRateBands(
  rows: readonly SimRow[],
  bands: readonly WinRateBand[],
): BandViolation[] {
  const violations: BandViolation[] = [];
  for (const band of bands) {
    for (const row of rows) {
      if (
        row.profileId !== band.profileId ||
        row.floor < band.fromFloor ||
        row.floor > band.toFloor
      )
        continue;
      if (
        (band.min !== undefined && row.winRate < band.min) ||
        (band.max !== undefined && row.winRate > band.max)
      ) {
        violations.push({ band, floor: row.floor, winRate: row.winRate });
      }
    }
  }
  return violations;
}

/** Floors × profiles win-rate table for terminal output. */
export function formatBalanceReport(
  rows: readonly SimRow[],
  profiles: readonly SimProfile[],
): string {
  const floors = [...new Set(rows.map((r) => r.floor))].sort((a, b) => a - b);
  const header = ['Floor', ...profiles.map((p) => p.id)];
  const lines = [header.map((h) => h.padStart(9)).join('')];
  for (const floor of floors) {
    const cells = profiles.map((p) => {
      const row = rows.find((r) => r.floor === floor && r.profileId === p.id);
      return row ? `${(row.winRate * 100).toFixed(0)}%` : '-';
    });
    lines.push([`F${floor}`, ...cells].map((c) => c.padStart(9)).join(''));
  }
  return lines.join('\n');
}
