import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveWorkspacePath } from '@ririko/core';
import {
  createDatabaseClient,
  DungeonBossRepository,
  DungeonFloorRepository,
  DungeonSeasonRepository,
  GameItemRepository,
  PlayerEnergyRepository,
  TcgConfigRepository,
  UserDungeonProgressRepository,
  UserInventoryItemRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { CANONICAL_ITEMS } from '../equipment/catalog.js';
import { ItemGrantService } from '../equipment/item-grant.service.js';
import {
  loadBossCatalog,
  planSeasonFloors,
  toBossRow,
  toFloorRow,
  toSeasonRow,
} from '../dungeon/boss-catalog.js';
import { DungeonRunner } from '../dungeon/dungeon-runner.js';
import {
  checkWinRateBands,
  DEFAULT_SIM_PROFILES,
  S1_TARGET_BANDS,
  simulateDungeonBalance,
} from '../dungeon/balance-simulator.js';
import {
  DungeonProgressService,
  formatProgressOutcome,
} from '../dungeon/dungeon-progress.service.js';
import { DungeonBattleSession } from '../dungeon/dungeon-battle-session.js';
import { SeasonalAffixHandler } from '../dungeon/seasonal-affixes.js';
import type { Combatant } from '../combat/types.js';

async function memoryDb(): Promise<SqliteDatabaseClient> {
  const raw = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:', autoMigrate: true });
  if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
  return raw;
}

describe('Season 1 balance (STORY-159)', () => {
  it('meets every Season 1 win-rate band with the committed catalog', async () => {
    const client = await memoryDb();
    const catalog = loadBossCatalog(
      resolveWorkspacePath('assets/tcg/catalog/bosses/s1_infernal_crucible.json'),
    );
    const seasons = new DungeonSeasonRepository(client);
    const bosses = new DungeonBossRepository(client);
    const floors = new DungeonFloorRepository(client);
    await seasons.create(toSeasonRow(catalog));
    for (const boss of catalog.bosses) await bosses.upsert(toBossRow(catalog, boss, {}));
    for (const floor of planSeasonFloors(catalog)) {
      await floors.upsertBySeasonAndFloor(toFloorRow(catalog, floor));
    }

    const runner = new DungeonRunner(
      new PlayerEnergyRepository(client),
      new UserDungeonProgressRepository(client),
      { seasonRepo: seasons, floorRepo: floors, bossRepo: bosses },
    );
    const bandFloors = [
      ...new Set(S1_TARGET_BANDS.flatMap((b) => [b.fromFloor, b.toFloor, b.toFloor - 1])),
    ];
    const rows = await simulateDungeonBalance({
      runner,
      seasonId: catalog.seasonId,
      floors: bandFloors.filter((f) => f >= 1 && f <= 50),
      profiles: DEFAULT_SIM_PROFILES,
      trials: 150,
      seed: 42,
    });
    await client.close();

    const violations = checkWinRateBands(rows, S1_TARGET_BANDS).map(
      (v) => `F${v.floor} ${v.band.profileId} ${(v.winRate * 100).toFixed(0)}%`,
    );
    expect(violations).toEqual([]);
  }, 120_000);
});

describe('Pity blessing, stars & energy refund (STORY-159)', () => {
  let client: SqliteDatabaseClient;
  let progress: DungeonProgressService;
  let energy: PlayerEnergyRepository;
  let grants: ItemGrantService;

  beforeEach(async () => {
    client = await memoryDb();
    const itemRepo = new GameItemRepository(client);
    for (const item of CANONICAL_ITEMS) await itemRepo.create(item);
    grants = new ItemGrantService(itemRepo, new UserInventoryItemRepository(client));
    energy = new PlayerEnergyRepository(client);
    progress = new DungeonProgressService(new TcgConfigRepository(client), energy, grants);
  });

  afterEach(async () => {
    await client.close();
  });

  const loss = { victory: false, forfeited: false, turns: 11, potionsUsed: 1, energySpent: 10 };

  it('stacks pity per defeat on the same floor up to +30% and clears it on a win', async () => {
    await progress.recordOutcome('u1', 's1', 5, loss);
    await progress.recordOutcome('u1', 's1', 5, loss);
    expect(await progress.getPityBonus('u1', 's1', 5)).toBeCloseTo(0.2);
    expect(await progress.getPityBonus('u1', 's1', 6)).toBe(0);

    await progress.recordOutcome('u1', 's1', 5, loss);
    const capped = await progress.recordOutcome('u1', 's1', 5, loss);
    expect(capped.nextPityBonus).toBeCloseTo(0.3);

    // Forfeits never add pity.
    await progress.recordOutcome('u1', 's1', 5, { ...loss, forfeited: true });
    expect(await progress.getPityBonus('u1', 's1', 5)).toBeCloseTo(0.3);

    await progress.recordOutcome('u1', 's1', 5, { ...loss, victory: true });
    expect(await progress.getPityBonus('u1', 's1', 5)).toBe(0);
  });

  it('refunds half the energy on defeats up to floor 10 only', async () => {
    await energy.getOrCreate('u1');
    await energy.consumeEnergy('u1', 20);
    const early = await progress.recordOutcome('u1', 's1', 3, loss);
    expect(early.energyRefunded).toBe(5);
    expect((await energy.getOrCreate('u1')).currentEnergy).toBe(85);

    const late = await progress.recordOutcome('u1', 's1', 11, { ...loss, energySpent: 15 });
    expect(late.energyRefunded).toBe(0);
  });

  it('awards stars, keeps the best, and pays dust once for the first 3-star clear', async () => {
    const two = await progress.recordOutcome('u1', 's1', 7, { ...loss, victory: true, turns: 6 });
    expect(two).toMatchObject({ stars: 2, bestStars: 2, threeStarDust: 0 });

    const three = await progress.recordOutcome('u1', 's1', 7, {
      ...loss,
      victory: true,
      turns: 6,
      potionsUsed: 0,
    });
    expect(three).toMatchObject({ stars: 3, bestStars: 3, threeStarDust: 70 });
    expect(await grants.countOwned('u1', 'CRAFTING_DUST')).toBe(70);

    const again = await progress.recordOutcome('u1', 's1', 7, {
      ...loss,
      victory: true,
      turns: 20,
    });
    expect(again).toMatchObject({ stars: 1, bestStars: 3, threeStarDust: 0 });
    expect(await progress.getStars('u1', 's1')).toEqual({ '7': 3 });
    expect(formatProgressOutcome(three)).toContain('First 3-star clear');
  });

  it('boosts the player in battle and counts potions', () => {
    const player: Combatant = {
      id: 'p',
      name: 'Hero',
      team: 'TEAM_A',
      element: 'FIRE',
      rarity: 'COMMON',
      level: 1,
      maxHealth: 1000,
      currentHealth: 1000,
      attack: 100,
      defense: 50,
      speed: 10,
      critRate: 0,
      critDamage: 1.5,
      maxMp: 100,
      currentMp: 0,
      skillManaCost: 35,
      shield: 0,
      statusEffects: [],
      perks: [],
      hasUsedPhoenixWard: false,
      isAlive: true,
    };
    const session = new DungeonBattleSession({
      floorNumber: 5,
      seasonId: 's1',
      userId: 'u1',
      playerCard: player,
      boss: { ...player, id: 'b', team: 'TEAM_B' },
      affixHandler: new SeasonalAffixHandler('NONE'),
      pityBonus: 0.2,
    });
    const start = session.start();
    expect(start.player).toMatchObject({ attack: 120, defense: 60, maxHealth: 1200 });
    expect(start.allLogs.some((l) => l.message.includes('Pity Blessing'))).toBe(true);

    session.executeItemTurn({
      code: 'POTION_MINOR_HP',
      name: 'Minor HP Potion',
      subtype: 'HP_POTION',
      consumableEffect: { healFlat: 300 },
    });
    expect(session.potionCount).toBe(1);
  });
});
