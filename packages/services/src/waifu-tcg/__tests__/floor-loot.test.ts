import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDatabaseClient,
  DungeonFloorRepository,
  GameItemRepository,
  UserInventoryItemRepository,
  UserDungeonProgressRepository,
  PlayerEnergyRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { CANONICAL_ITEMS } from '../equipment/catalog.js';
import { DungeonLootService, getDropBracket } from '../dungeon/dungeon-loot.service.js';
import { parseFloorLoot, type FloorLoot } from '../dungeon/floor-loot.js';
import {
  floorLootFormValues,
  floorLootFromInput,
  floorLootInputSchema,
  type FloorLootInput,
} from '../dungeon/dungeon-admin-input.js';
import { DungeonRunner } from '../dungeon/dungeon-runner.js';
import type { DungeonBattleSession } from '../dungeon/dungeon-battle-session.js';

/** Replays a fixed list of rolls, then repeats the last one. */
function rolls(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
}

describe('parseFloorLoot', () => {
  it('reads valid tables and falls back to defaults on invalid or missing JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseFloorLoot({ firstClearRewards: {}, repeatRewardsTable: null })).toEqual({
      firstClear: {},
      repeat: {},
    });
    expect(
      parseFloorLoot({
        firstClearRewards: { credits: 900, items: [{ code: 'POTION_MINOR_HP', quantity: 2 }] },
        repeatRewardsTable: { dropChance: 0.5 },
      }),
    ).toEqual({
      firstClear: { credits: 900, items: [{ code: 'POTION_MINOR_HP', quantity: 2 }] },
      repeat: { dropChance: 0.5 },
    });
    expect(
      parseFloorLoot({
        id: 'f1',
        firstClearRewards: { credits: 500, dust: 50 },
        repeatRewardsTable: { pool: [{ code: 'X', weight: 1, minQty: 3, maxQty: 1 }] },
      }),
    ).toEqual({ firstClear: {}, repeat: {} });
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

describe('floor loot editor input', () => {
  it('round-trips stored tables through the form fields', () => {
    const stored = {
      firstClearRewards: {
        credits: 1000,
        exp: 50,
        items: [
          { code: 'POTION_MINOR_HP', quantity: 3 },
          { code: 'RING_COPPER_BAND', quantity: 1 },
        ],
      },
      repeatRewardsTable: {
        craftingDust: 7,
        dropChance: 0.125,
        pool: [{ code: 'POTION_MANA_DRAUGHT', weight: 10, minQty: 1, maxQty: 2 }],
      },
    };
    const values = floorLootFormValues(stored);
    expect(values).toMatchObject({
      firstCredits: 1000,
      firstDust: null,
      firstItem2Code: 'RING_COPPER_BAND',
      firstItem3Code: null,
      repeatDropChancePercent: 12.5,
      pool1Max: 2,
    });
    const input = floorLootInputSchema.parse(values) as FloorLootInput;
    expect(floorLootFromInput(input)).toEqual(stored);
  });

  it('fills row defaults and drops empty rows', () => {
    const input = floorLootInputSchema.parse({
      firstItem2Code: ' potion_minor_hp ',
      pool3Code: 'RING_COPPER_BAND',
      pool3Weight: '5',
      pool3Min: '2',
    }) as FloorLootInput;
    expect(floorLootFromInput(input)).toEqual({
      firstClearRewards: { items: [{ code: 'POTION_MINOR_HP', quantity: 1 }] },
      repeatRewardsTable: { pool: [{ code: 'RING_COPPER_BAND', weight: 5, minQty: 2, maxQty: 2 }] },
    });
    expect(floorLootFromInput(floorLootInputSchema.parse({}) as FloorLootInput)).toEqual({
      firstClearRewards: {},
      repeatRewardsTable: {},
    });
  });

  it('reports incomplete rows on their fields', () => {
    const result = floorLootInputSchema.safeParse({
      firstItem1Quantity: '2',
      pool1Weight: '3',
      pool2Code: 'X',
      pool3Code: 'Y',
      pool3Weight: '1',
      pool3Min: '5',
      pool3Max: '2',
      repeatDropChancePercent: '150',
    });
    expect(result.success).toBe(false);
    const fields = result.success ? {} : result.error.flatten().fieldErrors;
    expect(Object.keys(fields).sort()).toEqual(
      ['firstItem1Code', 'pool1Code', 'pool2Weight', 'pool3Max', 'repeatDropChancePercent'].sort(),
    );
  });
});

describe('DungeonLootService floor tables (TASK-1126)', () => {
  let client: SqliteDatabaseClient;
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
  });

  afterEach(async () => {
    await client.close();
  });

  const loot = (rng: () => number) => new DungeonLootService({ itemRepo, inventoryRepo, rng });

  it('gives the same loot as before when the floor has no table', async () => {
    const plain = await loot(rolls(0.5)).generateAndDispatchLoot('u1', 12, false);
    const empty = await loot(rolls(0.5)).generateAndDispatchLoot('u2', 12, false, {
      floorLoot: { firstClear: {}, repeat: {} },
    });
    expect(empty).toEqual(plain);
    const first = await loot(rolls(0.5)).generateAndDispatchLoot('u3', 20, true, {
      floorLoot: { firstClear: {}, repeat: {} },
    });
    expect(first).toMatchObject({ credits: 5000, craftingDust: 150, exp: 300 });
    expect(first.items.map((i) => i.code)).toEqual([getDropBracket(20).bossFallbackCode]);
  });

  it('uses first-clear overrides and keeps the boss signature drop', async () => {
    const floorLoot: FloorLoot = {
      firstClear: {
        credits: 777,
        items: [{ code: 'POTION_MINOR_HP', quantity: 3 }],
      },
      repeat: {},
    };
    const boss = await loot(rolls(0.5)).generateAndDispatchLoot('u1', 10, true, {
      signatureDropCode: 'WEAPON_OBSIDIAN_KATANA',
      floorLoot,
    });
    expect(boss).toMatchObject({ credits: 777, exp: 150, craftingDust: 50 });
    expect(boss.items.map((i) => [i.code, i.quantity])).toEqual([
      ['WEAPON_OBSIDIAN_KATANA', 1],
      ['POTION_MINOR_HP', 3],
    ]);

    const standard = await loot(rolls(0.5)).generateAndDispatchLoot('u2', 7, true, { floorLoot });
    expect(standard.items.map((i) => [i.code, i.quantity])).toEqual([['POTION_MINOR_HP', 3]]);
  });

  it('rolls the repeat pool with its drop chance and quantity range', async () => {
    const floorLoot: FloorLoot = {
      firstClear: {},
      repeat: {
        credits: 40,
        exp: 4,
        craftingDust: 0,
        dropChance: 0.9,
        pool: [
          { code: 'RING_COPPER_BAND', weight: 1, minQty: 1, maxQty: 1 },
          { code: 'POTION_MINOR_HP', weight: 3, minQty: 2, maxQty: 4 },
        ],
      },
    };
    // drop roll 0.5 < 0.9, pick 0.5 of weight 4 = potion, quantity roll 0.99 -> 4
    const lucky = await loot(rolls(0.5, 0.5, 0.99)).generateAndDispatchLoot('u1', 13, false, {
      floorLoot,
    });
    expect(lucky).toMatchObject({ credits: 40, exp: 4, craftingDust: 0 });
    expect(lucky.items.map((i) => [i.code, i.quantity])).toEqual([['POTION_MINOR_HP', 4]]);

    const unlucky = await loot(rolls(0.95)).generateAndDispatchLoot('u2', 13, false, { floorLoot });
    expect(unlucky.items).toEqual([]);
  });

  it('reads the floor table when a season battle is won', async () => {
    const floors = new DungeonFloorRepository(client);
    await floors.upsertBySeasonAndFloor({
      seasonId: 's1',
      floorNumber: 3,
      name: 'F3',
      enemyLineup: [],
      firstClearRewards: { credits: 4242 },
    });
    const lootService = loot(rolls(0.5));
    const spy = vi.spyOn(lootService, 'generateAndDispatchLoot');
    const runner = new DungeonRunner(
      new PlayerEnergyRepository(client),
      new UserDungeonProgressRepository(client),
      { floorRepo: floors, lootService },
    );
    const session = {
      seasonId: 's1',
      floorNumber: 1,
      userId: 'u1',
      wasForfeited: false,
      potionCount: 0,
      bossProfile: undefined,
      getSnapshot: () => ({ winner: 'TEAM_A', turn: 3, allLogs: [], player: null }),
    } as unknown as DungeonBattleSession;

    const noTable = await runner.finalizeBattleResult(session, { energySpent: 0 });
    expect(noTable.loot?.credits).toBe(100);

    const onF3 = await runner.finalizeBattleResult(
      { ...session, floorNumber: 3, getSnapshot: session.getSnapshot } as DungeonBattleSession,
      { energySpent: 0 },
    );
    expect(onF3.loot?.credits).toBe(4242);
    expect(spy.mock.calls[1]![3]).toMatchObject({ floorLoot: { firstClear: { credits: 4242 } } });
  });

  it('keeps owner-edited loot when the boss builder re-imports floors', async () => {
    const floors = new DungeonFloorRepository(client);
    const row = {
      seasonId: 's1',
      floorNumber: 4,
      name: 'F4',
      enemyLineup: [{ bossId: 's1:a' }],
    };
    const created = await floors.upsertBySeasonAndFloor(row);
    await floors.update(created.id, { firstClearRewards: { credits: 1 } });
    await floors.upsertBySeasonAndFloor({ ...row, name: 'F4 renamed' });
    const after = await floors.findBySeasonAndFloor('s1', 4);
    expect(after).toMatchObject({ name: 'F4 renamed', firstClearRewards: { credits: 1 } });
  });
});
