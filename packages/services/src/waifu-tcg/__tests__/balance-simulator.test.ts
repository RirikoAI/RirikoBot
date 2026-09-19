import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createDatabaseClient,
  DungeonSeasonRepository,
  PlayerEnergyRepository,
  UserDungeonProgressRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import {
  checkWinRateBands,
  createSeededRng,
  DEFAULT_SIM_PROFILES,
  formatBalanceReport,
  simulateDungeonBalance,
  type SimRow,
} from '../dungeon/balance-simulator.js';
import { DungeonRunner } from '../dungeon/dungeon-runner.js';

describe('Dungeon balance simulator (STORY-152)', () => {
  let client: SqliteDatabaseClient;
  let runner: DungeonRunner;

  beforeAll(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = raw;
    const seasonRepo = new DungeonSeasonRepository(client);
    await seasonRepo.create({
      id: 's1_sim',
      name: 'Season 1: Infernal Crucible',
      description: 'sim',
      themeElement: 'FIRE',
      seasonalAffixes: ['SCORCHED_EARTH', 'HEAT_HAZE'],
      scalingModel: 'EXPONENTIAL',
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86_400_000),
    });
    runner = new DungeonRunner(
      new PlayerEnergyRepository(client),
      new UserDungeonProgressRepository(client),
      {
        seasonRepo,
      },
    );
  });

  afterAll(async () => {
    await client.close();
  });

  const profiles = DEFAULT_SIM_PROFILES.filter((p) => p.id === 'newbie' || p.id === 'endgame');

  it('is deterministic for a seed and gets harder as floors rise', async () => {
    const run = () =>
      simulateDungeonBalance({
        runner,
        seasonId: 's1_sim',
        floors: [1, 10],
        profiles,
        trials: 60,
        seed: 7,
      });
    const first = await run();
    const second = await run();
    expect(second).toEqual(first);

    const rate = (floor: number, id: string) =>
      first.find((r) => r.floor === floor && r.profileId === id)!.winRate;
    expect(rate(1, 'newbie')).toBeGreaterThan(rate(10, 'newbie'));
    expect(rate(10, 'endgame')).toBeGreaterThan(rate(10, 'newbie'));
  });

  it('flags floors outside their target bands', () => {
    const rows: SimRow[] = [
      { floor: 1, profileId: 'newbie', trials: 100, winRate: 0.7, avgTurns: 6 },
      { floor: 2, profileId: 'newbie', trials: 100, winRate: 0.95, avgTurns: 6 },
      { floor: 10, profileId: 'newbie', trials: 100, winRate: 0.2, avgTurns: 9 },
    ];
    const violations = checkWinRateBands(rows, [
      { profileId: 'newbie', fromFloor: 1, toFloor: 3, min: 0.85 },
      { profileId: 'newbie', fromFloor: 10, toFloor: 10, max: 0.05 },
    ]);
    expect(violations.map((v) => v.floor)).toEqual([1, 10]);
    expect(formatBalanceReport(rows, profiles)).toContain('F10');
  });

  it('rejects unknown gear codes in profiles', async () => {
    await expect(
      simulateDungeonBalance({
        runner,
        seasonId: 's1_sim',
        floors: [1],
        profiles: [
          { id: 'bad', label: 'bad', rarity: 'COMMON', level: 1, gear: [{ code: 'NOPE' }] },
        ],
        trials: 1,
      }),
    ).rejects.toThrow('NOPE');
  });

  it('seeded rng stays in [0, 1)', () => {
    const rng = createSeededRng(1);
    const values = Array.from({ length: 1000 }, rng);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
  });
});
