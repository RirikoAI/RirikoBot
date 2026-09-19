import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveWorkspacePath } from '@ririko/core';
import {
  createDatabaseClient,
  GameItemRepository,
  UserInventoryItemRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { CANONICAL_ITEMS } from '../equipment/catalog.js';
import { ItemGrantService } from '../equipment/item-grant.service.js';
import { applyEquipmentToCombatant } from '../equipment/loadout-service.js';
import {
  DUNGEON_DROP_BRACKETS,
  DungeonLootService,
  getDropBracket,
} from '../dungeon/dungeon-loot.service.js';
import { loadBossCatalog } from '../dungeon/boss-catalog.js';
import { DungeonBattleSession } from '../dungeon/dungeon-battle-session.js';
import { SeasonalAffixHandler } from '../dungeon/seasonal-affixes.js';
import type { Combatant } from '../combat/types.js';

const byCode = new Map(CANONICAL_ITEMS.map((i) => [i.code, i]));

/** Rough single-number power of a gear piece, used only to check bracket ordering. */
function gearPower(code: string): number {
  const s = (byCode.get(code)?.baseStats ?? {}) as Record<string, number>;
  return (
    (s.attack ?? 0) +
    (s.defense ?? 0) * 1.5 +
    (s.health ?? 0) * 0.15 +
    (s.speed ?? 0) * 2 +
    (s.critRate ?? 0) * 600 +
    (s.critDamage ?? 0) * 250 +
    ((s.mitigation ?? 0) + (s.elementalResistance ?? 0)) * 1500 +
    (s.armorPiercing ?? 0) * 800 +
    (s.elementalMastery ?? 0) * 600 +
    (s.manaRegen ?? 0) * 500 +
    (s.manaShield ?? 0) * 0.3 +
    (s.manaMax ?? 0) * 2
  );
}

function fighter(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: 'p',
    name: 'Hero',
    team: 'TEAM_A',
    element: 'WATER',
    rarity: 'RARE',
    level: 1,
    maxHealth: 10000,
    currentHealth: 10000,
    attack: 500,
    defense: 100,
    speed: 99,
    critRate: 0,
    critDamage: 1.5,
    maxMp: 100,
    currentMp: 0,
    skillManaCost: 999,
    shield: 0,
    statusEffects: [],
    perks: [],
    hasUsedPhoenixWard: false,
    isAlive: true,
    ...overrides,
  };
}

function firstExchange(player: Combatant, boss: Partial<Combatant> = {}) {
  const session = new DungeonBattleSession({
    floorNumber: 1,
    seasonId: 's1',
    userId: 'u',
    playerCard: player,
    boss: fighter({
      id: 'b',
      name: 'Boss',
      team: 'TEAM_B',
      element: 'FIRE',
      speed: 1,
      attack: 1000,
      defense: 500,
      maxHealth: 99999,
      currentHealth: 99999,
      skillName: undefined,
      ...boss,
    }),
    affixHandler: new SeasonalAffixHandler('NONE'),
    rng: () => 0.99,
  });
  session.start();
  const state = session.executeTurn('ATTACK');
  const dealt =
    state.lastTurnLogs.find((l) => l.actorId === 'p' && l.damageDealt)?.damageDealt ?? 0;
  const taken =
    state.lastTurnLogs.find((l) => l.actorId === 'b' && l.damageDealt)?.damageDealt ?? 0;
  return { dealt, taken, mp: state.player.currentMp, shield: state.player.shield };
}

describe('Equipment acquisition & gear power budget (STORY-156)', () => {
  it('only references real catalog items in drop tables and S1 signatures', () => {
    for (const bracket of DUNGEON_DROP_BRACKETS) {
      for (const code of [...bracket.pool.map((d) => d.code), bracket.bossFallbackCode]) {
        expect(byCode.has(code), code).toBe(true);
      }
    }
    const s1 = loadBossCatalog(
      resolveWorkspacePath('assets/tcg/catalog/bosses/s1_infernal_crucible.json'),
    );
    const signatures = s1.bosses
      .filter((b) => b.tier !== 'STANDARD')
      .map((b) => b.signatureDropCode);
    expect(signatures).toHaveLength(10);
    for (const code of signatures) {
      expect(byCode.get(code!)?.isShopBuyable, code).toBe(false);
    }
  });

  it('makes each floor bracket drop stronger gear than the one before', () => {
    const averages = DUNGEON_DROP_BRACKETS.map((bracket) => {
      const gear = bracket.pool.map((d) => d.code).filter((c) => !c.startsWith('POTION_'));
      return gear.reduce((sum, code) => sum + gearPower(code), 0) / gear.length;
    });
    for (let i = 1; i < averages.length; i++) expect(averages[i]).toBeGreaterThan(averages[i - 1]!);
    expect(getDropBracket(10).fromFloor).toBe(10);
    expect(getDropBracket(999).fromFloor).toBe(40);
  });

  describe('loot', () => {
    let client: SqliteDatabaseClient;
    let grants: ItemGrantService;
    let itemRepo: GameItemRepository;
    let inventoryRepo: UserInventoryItemRepository;

    beforeEach(async () => {
      const raw = await createDatabaseClient({
        dialect: 'sqlite',
        url: ':memory:',
        autoMigrate: true,
      });
      if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
      client = raw;
      itemRepo = new GameItemRepository(client);
      inventoryRepo = new UserInventoryItemRepository(client);
      for (const item of CANONICAL_ITEMS) await itemRepo.create(item);
      grants = new ItemGrantService(itemRepo, inventoryRepo);
    });

    afterEach(async () => {
      await client.close();
    });

    it('grants the boss signature on a first clear and bracket gear on standard floors', async () => {
      const loot = new DungeonLootService({ itemRepo, inventoryRepo, rng: () => 0.5 });
      const boss = await loot.generateAndDispatchLoot('u1', 10, true, {
        signatureDropCode: 'WEAPON_CRIMSON_CHANT_STAFF',
      });
      expect(boss.items.map((i) => i.code)).toEqual(['WEAPON_CRIMSON_CHANT_STAFF']);

      const fallback = await loot.generateAndDispatchLoot('u2', 20, true);
      expect(fallback.items.map((i) => i.code)).toEqual(['WEAPON_SOLAR_LANCE']);

      const standard = await loot.generateAndDispatchLoot('u3', 7, true);
      expect(standard.items).toHaveLength(1);
      expect(getDropBracket(7).pool.map((d) => d.code)).toContain(standard.items[0]!.code);
    });

    it('occasionally drops the signature again on repeat clears', async () => {
      const lucky = new DungeonLootService({ itemRepo, inventoryRepo, rng: () => 0.01 });
      const repeat = await lucky.generateAndDispatchLoot('u1', 15, false, {
        signatureDropCode: 'ARMOR_CRUSADER_PLATE',
      });
      expect(repeat.items.map((i) => i.code)).toEqual(['ARMOR_CRUSADER_PLATE']);

      const unlucky = new DungeonLootService({ itemRepo, inventoryRepo, rng: () => 0.99 });
      const none = await unlucky.generateAndDispatchLoot('u1', 15, false, {
        signatureDropCode: 'ARMOR_CRUSADER_PLATE',
      });
      expect(none.items).toEqual([]);
      expect(await grants.countOwned('u1', 'CRAFTING_DUST')).toBeGreaterThan(0);
    });
  });

  describe('secondary gear stats in dungeon combat', () => {
    it('applies mitigation, armor piercing, mana regen, mana shield, crit damage and mastery', () => {
      const base = firstExchange(fighter());

      const geared = fighter();
      applyEquipmentToCombatant(
        geared,
        { mitigation: 0.2, armorPiercing: 0.5, manaRegen: 0.1, manaShield: 50, critDamage: 0.4 },
        [],
      );
      expect(geared.critDamage).toBeCloseTo(1.9);
      const withGear = firstExchange(geared);

      expect(withGear.dealt).toBeGreaterThan(base.dealt); // armor piercing
      expect(withGear.taken).toBeLessThan(base.taken); // mitigation
      expect(withGear.mp).toBe(base.mp + 10); // +10% of 100 MP regen

      // Elemental mastery only boosts elemental advantage (WATER beats FIRE here).
      const master = fighter();
      applyEquipmentToCombatant(master, { elementalMastery: 0.5 }, []);
      expect(firstExchange(master).dealt).toBeGreaterThan(base.dealt);
      expect(firstExchange(master, { element: 'EARTH' }).dealt).toBe(
        firstExchange(fighter(), { element: 'EARTH' }).dealt,
      );
    });
  });
});
