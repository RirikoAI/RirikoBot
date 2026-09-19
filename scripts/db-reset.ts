import fs from 'node:fs';
import path from 'node:path';
import {
  createDatabaseClient,
  ItemRepository,
  GameItemRepository,
  DungeonSeasonRepository,
  WaifuAssetRepository,
  AchievementRepository,
  EconomyRepository,
} from '../packages/database/src/index.js';
import { SQLITE_SCHEMA_DDL } from '../packages/database/src/schema/sqlite/ddl.js';
import {
  CANONICAL_ITEMS,
  AchievementService,
  IngestionService,
  WaifuImClient,
  ImageValidator,
} from '../packages/services/src/index.js';

// Simple .env parser for standalone script execution
function loadEnv(): void {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

async function resetDatabase(): Promise<void> {
  console.log('🔄 ==========================================');
  console.log('🔄 Ririko AI 2.0.0 — Database Reset & Rebuild');
  console.log('🔄 ==========================================\n');

  const dialect = (process.env.DATABASE_DIALECT as 'sqlite' | 'postgres') || 'sqlite';
  const url = process.env.DATABASE_URL || './data/ririko.sqlite';

  console.log(`• Dialect: ${dialect}`);
  console.log(`• Database URL: ${url}`);

  if (dialect === 'sqlite') {
    const dbPath = path.isAbsolute(url) ? url : path.resolve(process.cwd(), url);
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;

    let unlinkedFiles = false;
    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
      unlinkedFiles = true;
      console.log('✓ Successfully deleted existing SQLite files from disk.');
    } catch (err: any) {
      console.warn(`! Note: Could not unlink SQLite files directly (${err.message}).`);
      console.warn('  A running process (e.g. dev bot) has an active file handle.');
      console.warn('  Proceeding with transactional table wipe and schema recreation...');
    }

    // Connect via standard client
    const dbClient = await createDatabaseClient({
      dialect: 'sqlite',
      url,
      autoMigrate: true,
    });

    if (!unlinkedFiles && dbClient.dialect === 'sqlite') {
      const rawDb = dbClient.raw;
      rawDb.pragma('foreign_keys = OFF');

      const tables = rawDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all() as { name: string }[];
      for (const t of tables) {
        rawDb.exec(`DROP TABLE IF EXISTS "${t.name}"`);
      }

      const views = rawDb.prepare("SELECT name FROM sqlite_master WHERE type='view'").all() as {
        name: string;
      }[];
      for (const v of views) {
        rawDb.exec(`DROP VIEW IF EXISTS "${v.name}"`);
      }

      rawDb.exec('VACUUM');
      rawDb.pragma('foreign_keys = ON');

      // Re-apply full DDL
      rawDb.exec(SQLITE_SCHEMA_DDL);
      console.log('✓ Successfully wiped all existing tables and re-applied DDL.');
    }

    const ping = await dbClient.ping();
    if (!ping.ok) {
      throw new Error(`Database ping failed: ${ping.error}`);
    }
    console.log(`✓ Database initialized and responsive (${ping.latencyMs}ms latency).\n`);

    console.log('🌱 Seeding canonical data for a brand new application...');

    // 1. Seed default economy catalog
    const itemRepo = new ItemRepository(dbClient);
    const seededEconomyItems = await itemRepo.seedDefaultCatalog();
    console.log(`  ✓ Seeded ${seededEconomyItems} economy shop items.`);

    // 2. Seed canonical achievements
    const economyRepo = new EconomyRepository(dbClient);
    const achievementRepo = new AchievementRepository(dbClient);
    const achievementService = new AchievementService(achievementRepo, economyRepo, dbClient);
    await achievementService.seedAchievements();
    const achievementCount = await achievementRepo.count();
    console.log(`  ✓ Seeded ${achievementCount} canonical achievements.`);

    // 3. Seed canonical game items
    const gameItemRepo = new GameItemRepository(dbClient);
    let seededGameItems = 0;
    for (const item of CANONICAL_ITEMS) {
      const exists = await gameItemRepo.findByCode(item.code);
      if (!exists) {
        await gameItemRepo.create(item);
        seededGameItems++;
      }
    }
    console.log(`  ✓ Seeded ${seededGameItems} canonical game items & equipment.`);

    // 4. Seed default dungeon seasons
    const seasonRepo = new DungeonSeasonRepository(dbClient);
    const active = await seasonRepo.findActiveSeason();
    if (!active) {
      await seasonRepo.create({
        id: 's1_infernal_crucible',
        name: 'Season 1: Infernal Crucible',
        description: 'Blistering magma towers with Scorched Earth and Heat Haze affixes.',
        isActive: true,
        themeElement: 'FIRE',
        seasonalAffixes: ['SCORCHED_EARTH', 'HEAT_HAZE'],
        scalingModel: 'EXPONENTIAL',
        isTutorial: false,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      });
    }
    const tutorialSeason = await seasonRepo.findTutorialSeason();
    if (!tutorialSeason) {
      await seasonRepo.create({
        id: 'season_tutorial',
        name: 'Tutorial Prologue: Training Grounds',
        description: 'Introductory 4-floor training dungeon teaching basic mechanics and wards.',
        isActive: true,
        themeElement: 'NEUTRAL',
        seasonalAffixes: [],
        scalingModel: 'LINEAR',
        isTutorial: true,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000),
      });
    }
    console.log('  ✓ Seeded canonical dungeon seasons (Season 1 & Tutorial Prologue).');

    // 5. Seed canonical waifu assets
    const assetRepo = new WaifuAssetRepository(dbClient);
    const ingestionService = new IngestionService({
      assetRepo,
      client: new WaifuImClient(),
      validator: new ImageValidator(),
    });
    const seededAssets = await ingestionService.seedCanonicalAssets();
    console.log(`  ✓ Seeded ${seededAssets} canonical waifu assets across all 7 elements.`);

    // Verification
    let totalTables = 0;
    if (dbClient.dialect === 'sqlite') {
      const tableCountRow = dbClient.raw
        .prepare(
          "SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
        .get() as { count: number };
      totalTables = tableCountRow.count;
    }
    await dbClient.close();

    console.log('\n==========================================');
    console.log(`✨ Database rebuild complete! Total Tables: ${totalTables}`);
    console.log('==========================================\n');
  } else {
    console.log('PostgreSQL dialect detected. Run drizzle-kit push for PostgreSQL migrations.');
  }
}

resetDatabase().catch((err) => {
  console.error('\n✖ Database reset failed:', err);
  process.exit(1);
});
