/**
 * Waifu TCG dungeon balance simulator.
 *
 *   pnpm tcg:simulate [--season=<id>] [--floors=1-20] [--profiles=newbie,early]
 *                     [--trials=300] [--seed=42] [--check]
 *
 * Reads the season, floors and bosses from the configured database (DATABASE_DIALECT /
 * DATABASE_URL, default ./data/ririko.sqlite) and prints win rates per floor for each player
 * profile. --check compares the results with the Season 1 target bands and exits 1 on misses.
 */
import {
  createDatabaseClient,
  DungeonBossRepository,
  DungeonFloorRepository,
  DungeonSeasonRepository,
  PlayerEnergyRepository,
  UserDungeonProgressRepository,
} from '../packages/database/src/index.js';
import {
  checkWinRateBands,
  DEFAULT_SIM_PROFILES,
  DungeonRunner,
  formatBalanceReport,
  S1_TARGET_BANDS,
  simulateDungeonBalance,
} from '../packages/services/src/index.js';

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

function parseFloors(value: string): number[] {
  const floors = new Set<number>();
  for (const part of value.split(',')) {
    const [from, to] = part.split('-').map(Number);
    if (!from || Number.isNaN(from)) throw new Error(`Invalid --floors value: ${value}`);
    for (let f = from; f <= (to ?? from); f++) floors.add(f);
  }
  return [...floors].sort((a, b) => a - b);
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: pnpm tcg:simulate [--season=<id>] [--floors=1-20] [--profiles=newbie,early] [--trials=300] [--seed=42] [--check]',
    );
    return;
  }

  const client = await createDatabaseClient({
    dialect: (process.env.DATABASE_DIALECT as 'sqlite' | 'postgres') || 'sqlite',
    url: process.env.DATABASE_URL || './data/ririko.sqlite',
  });
  const seasonRepo = new DungeonSeasonRepository(client);
  const runner = new DungeonRunner(
    new PlayerEnergyRepository(client),
    new UserDungeonProgressRepository(client),
    {
      seasonRepo,
      floorRepo: new DungeonFloorRepository(client),
      bossRepo: new DungeonBossRepository(client),
    },
  );

  const seasonId = readArg('season') ?? (await seasonRepo.findActiveSeason())?.id;
  if (!seasonId) throw new Error('No --season given and no active season in the database.');

  const wanted = readArg('profiles')?.split(',');
  const profiles = wanted
    ? DEFAULT_SIM_PROFILES.filter((p) => wanted.includes(p.id))
    : DEFAULT_SIM_PROFILES;
  if (profiles.length === 0) throw new Error(`No profiles match --profiles=${wanted?.join(',')}`);

  const floors = parseFloors(readArg('floors') ?? '1-50');
  const trials = Number(readArg('trials') ?? 300);
  const seed = Number(readArg('seed') ?? 42);

  console.log(
    `Simulating ${seasonId}: ${floors.length} floors × ${profiles.length} profiles × ${trials} trials (seed ${seed})`,
  );
  for (const p of profiles) console.log(`  ${p.id.padEnd(8)} ${p.label}`);

  const rows = await simulateDungeonBalance({ runner, seasonId, floors, profiles, trials, seed });
  console.log('\n' + formatBalanceReport(rows, profiles));

  if (process.argv.includes('--check')) {
    const violations = checkWinRateBands(rows, S1_TARGET_BANDS);
    if (violations.length === 0) {
      console.log('\n✓ All simulated floors are inside the Season 1 target bands.');
    } else {
      console.log(`\n✗ ${violations.length} floor(s) outside the target bands:`);
      for (const v of violations) {
        const target = [
          v.band.min !== undefined ? `≥${v.band.min * 100}%` : '',
          v.band.max !== undefined ? `≤${v.band.max * 100}%` : '',
        ]
          .filter(Boolean)
          .join(' ');
        console.log(
          `  F${v.floor} ${v.band.profileId}: ${(v.winRate * 100).toFixed(1)}% (target ${target}${v.band.note ? `, ${v.band.note}` : ''})`,
        );
      }
      process.exitCode = 1;
    }
  }

  await client.close();
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
