/**
 * Ririko TCG Boss Builder: turns the seasonal boss catalogs into database rows and boss art.
 *
 *   pnpm tcg:boss-builder --sync       [--season=<id>] [--only=key,...] [--force]
 *   pnpm tcg:boss-builder --render     [--season=<id>] [--only=key,...]
 *   pnpm tcg:boss-builder --import-db  [--season=<id>] [--dry-run]
 *   pnpm tcg:boss-builder --all        [--season=<id>]            (sync + render + import-db)
 *   pnpm tcg:boss-builder --suggest    --season=<id> [--elements=FIRE,EARTH] [--limit=20]
 *
 * Data files
 *   assets/tcg/catalog/bosses/<seasonId>.json   Boss catalog (hand-edited; --sync fills API fields)
 *   data/tcg/boss-images/<seasonId>/<key>.*      Downloaded artwork cache (gitignored)
 *   public/bosses/<seasonId>/<key>.png           Rendered boss images (gitignored)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { findWorkspaceRoot } from '../packages/core/src/index.js';
import {
  createDatabaseClient,
  DungeonBossRepository,
  DungeonFloorRepository,
  DungeonSeasonRepository,
  WaifuAssetRepository,
} from '../packages/database/src/index.js';
import {
  AniListClient,
  applySyncedCharacter,
  BossSynthesizer,
  bossToCatalogCharacter,
  CARD_IMAGE_SOURCES,
  DanbooruClient,
  downloadImage,
  loadBossCatalog,
  loadCatalog,
  planSeasonFloors,
  RateLimiter,
  RENDERED_BOSSES_DIR,
  saveBossCatalog,
  suggestBossCandidates,
  syncCatalogCharacter,
  toBossRow,
  toFloorRow,
  toSeasonRow,
  type BossCatalog,
  type CardElement,
  type CatalogBoss,
} from '../packages/services/src/index.js';

const ROOT = findWorkspaceRoot();
const CATALOG_DIR = path.join(ROOT, 'assets/tcg/catalog/bosses');
const CHARACTER_CATALOG = path.join(ROOT, 'assets/tcg/catalog/characters.json');
const IMAGE_CACHE_DIR = path.join(ROOT, 'data/tcg/boss-images');
const RENDER_DIR = path.join(ROOT, RENDERED_BOSSES_DIR);
const ELEMENTS: readonly CardElement[] = [
  'FIRE',
  'ICE',
  'EARTH',
  'LIGHTNING',
  'WATER',
  'LIGHT',
  'SHADOW',
];

const cdnLimiter = new RateLimiter(500);

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

function catalogPaths(seasonId: string | undefined): string[] {
  if (seasonId) {
    const file = path.join(CATALOG_DIR, `${seasonId}.json`);
    if (!fs.existsSync(file)) throw new Error(`No boss catalog at ${path.relative(ROOT, file)}`);
    return [file];
  }
  return fs
    .readdirSync(CATALOG_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(CATALOG_DIR, f));
}

function selectBosses(catalog: BossCatalog): CatalogBoss[] {
  const only = readArg('only')?.split(',');
  return only ? catalog.bosses.filter((b) => only.includes(b.key)) : catalog.bosses;
}

function cachedImagePath(seasonId: string, key: string): string | null {
  const dir = path.join(IMAGE_CACHE_DIR, seasonId);
  if (!fs.existsSync(dir)) return null;
  const file = fs.readdirSync(dir).find((f) => f.startsWith(`${key}.`));
  return file ? path.join(dir, file) : null;
}

function renderedImagePath(seasonId: string, key: string): string {
  return path.join(RENDER_DIR, seasonId, `${key}.png`);
}

const toRepoPath = (file: string) => path.relative(ROOT, file).replace(/\\/g, '/');

async function ensureImageCached(seasonId: string, boss: CatalogBoss): Promise<string | null> {
  const existing = cachedImagePath(seasonId, boss.key);
  if (existing) return existing;
  if (!boss.image) return null;

  let buffer: Buffer | null;
  let ext = '.jpg';
  if (fs.existsSync(boss.image.url)) {
    buffer = fs.readFileSync(boss.image.url);
    ext = path.extname(boss.image.url) || ext;
  } else {
    buffer = await downloadImage(boss.image.url, cdnLimiter);
    ext = path.extname(new URL(boss.image.url).pathname) || ext;
  }
  if (!buffer) return null;

  const dir = path.join(IMAGE_CACHE_DIR, seasonId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${boss.key}${ext}`);
  fs.writeFileSync(file, buffer);
  return file;
}

// ─── MODES ────────────────────────────────────────────────────────────────────

async function runSync(file: string): Promise<void> {
  const catalog = loadBossCatalog(file);
  const force = hasFlag('force');
  const clients = { anilist: new AniListClient(), danbooru: new DanbooruClient() };
  const targets = selectBosses(catalog).filter(
    (b) =>
      force || b.anilistId === undefined || !b.image || !cachedImagePath(catalog.seasonId, b.key),
  );
  console.log(
    `🔍 ${catalog.seasonId}: syncing ${targets.length} boss(es) (AniList ≤24/min, Danbooru ≤1/s)…`,
  );

  for (const [i, target] of targets.entries()) {
    const index = catalog.bosses.findIndex((b) => b.key === target.key);
    const previousUrl = target.image?.url;
    const result = await syncCatalogCharacter(bossToCatalogCharacter(target), clients, { force });
    const boss = applySyncedCharacter(target, result.character);
    catalog.bosses[index] = boss;

    if (boss.image?.url !== previousUrl) {
      const stale = cachedImagePath(catalog.seasonId, boss.key);
      if (stale) fs.rmSync(stale);
    }
    let note = 'no image';
    try {
      if (await ensureImageCached(catalog.seasonId, boss))
        note = `${boss.image!.source.toLowerCase()} art`;
    } catch (err) {
      result.warnings.push(`download: ${err instanceof Error ? err.message : String(err)}`);
    }
    saveBossCatalog(file, catalog); // resumable: progress is saved after every boss

    const warn = result.warnings.length ? `  ⚠ ${result.warnings.join('; ')}` : '';
    console.log(`  [${i + 1}/${targets.length}] ${boss.name} (${boss.anime}) → ${note}${warn}`);
  }
  console.log('✓ Sync complete.');
}

async function runRender(file: string): Promise<void> {
  const catalog = loadBossCatalog(file);
  const planned = planSeasonFloors(catalog);
  const synthesizer = new BossSynthesizer();
  const bosses = selectBosses(catalog);
  console.log(`🎨 ${catalog.seasonId}: rendering ${bosses.length} boss image(s)…`);

  for (const boss of bosses) {
    const floors = planned.filter((f) => f.bossKey === boss.key).map((f) => f.floorNumber);
    const floorLabel =
      floors.length === 0
        ? undefined
        : floors.length === 1
          ? `Floor ${floors[0]}`
          : `Floors ${floors.join(', ')}`;
    const art = cachedImagePath(catalog.seasonId, boss.key);
    const png = await synthesizer.render({
      name: boss.name,
      animeTitle: boss.anime,
      element: boss.element,
      tier: boss.tier,
      title: boss.title,
      floorLabel,
      imagePath: art ?? undefined,
      credit: boss.image?.credit,
    });
    const out = renderedImagePath(catalog.seasonId, boss.key);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, png);
    console.log(
      `  ${boss.key}: ${art ? 'rendered' : 'rendered without art (run --sync)'} → ${toRepoPath(out)}`,
    );
  }
}

async function runImportDb(file: string): Promise<void> {
  const catalog = loadBossCatalog(file);
  const planned = planSeasonFloors(catalog);
  const dryRun = hasFlag('dry-run');

  console.log(
    `🗄️  ${catalog.seasonId}: ${catalog.bosses.length} bosses, ${planned.length} floors${dryRun ? ' (dry run)' : ''}`,
  );
  for (const floor of planned) {
    console.log(
      `  F${String(floor.floorNumber).padStart(2)} ${floor.tier.padEnd(10)} ${floor.bossKey}  (${floor.energyCost} energy)`,
    );
  }
  if (dryRun) return;

  const client = await createDatabaseClient({
    dialect: (process.env.DATABASE_DIALECT as 'sqlite' | 'postgres') || 'sqlite',
    url: process.env.DATABASE_URL || './data/ririko.sqlite',
  });
  const seasons = new DungeonSeasonRepository(client);
  const bosses = new DungeonBossRepository(client);
  const floors = new DungeonFloorRepository(client);
  const assets = new WaifuAssetRepository(client);

  for (const [id, source] of Object.entries(CARD_IMAGE_SOURCES)) {
    await assets.upsertSource({ id, ...source, isActive: true });
  }

  const existingSeason = await seasons.findById(catalog.seasonId);
  const seasonRow = toSeasonRow(catalog, existingSeason?.startsAt ?? new Date());
  if (existingSeason) {
    const { id: _id, startsAt: _startsAt, ...fields } = seasonRow;
    await seasons.update(catalog.seasonId, fields);
  } else {
    await seasons.create(seasonRow);
  }

  for (const boss of catalog.bosses) {
    const art = cachedImagePath(catalog.seasonId, boss.key);
    let assetId: string | null = null;
    if (art) {
      const imageHash = createHash('sha256').update(fs.readFileSync(art)).digest('hex');
      const existing = await assets.findByImageHash(imageHash);
      assetId =
        existing?.id ??
        (
          await assets.create({
            id: randomUUID(),
            sourceId: boss.image?.source ?? 'NONE',
            sourceImageId: boss.image?.sourceId ?? boss.key,
            characterName: boss.name,
            animeTitle: boss.anime,
            imageHash,
            localStoragePath: toRepoPath(art),
            tags: ['dungeon_boss', catalog.seasonId],
          })
        ).id;
    }
    const rendered = renderedImagePath(catalog.seasonId, boss.key);
    await bosses.upsert(
      toBossRow(catalog, boss, {
        assetId,
        imagePath: fs.existsSync(rendered) ? toRepoPath(rendered) : null,
      }),
    );
  }

  for (const floor of planned) {
    await floors.upsertBySeasonAndFloor(toFloorRow(catalog, floor));
  }

  await client.close();
  console.log(`✓ Imported season ${catalog.seasonId}.`);
}

function runSuggest(file: string): void {
  const catalog = loadBossCatalog(file);
  const elements = (readArg('elements')?.split(',') as CardElement[] | undefined) ?? [
    ...new Set([...catalog.bosses.map((b) => b.element)]),
  ];
  const bad = elements.filter((e) => !ELEMENTS.includes(e));
  if (bad.length) throw new Error(`Unknown element(s): ${bad.join(', ')}`);
  const limit = Number(readArg('limit') ?? 20);
  const candidates = suggestBossCandidates(
    loadCatalog(CHARACTER_CATALOG),
    catalog,
    elements,
    limit,
  );
  console.log(
    `💡 ${catalog.seasonId}: ${candidates.length} candidate(s) for ${elements.join('/')}, most popular first:`,
  );
  for (const c of candidates) {
    console.log(`  ${c.element.padEnd(9)} ${c.name} (${c.anime})  ♥ ${c.favourites ?? '?'}`);
  }
}

function printHelp(): void {
  const header = fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0] ?? '';
  console.log(header.replace(/^\/\*\*|^ \* ?/gm, ''));
}

async function main(): Promise<void> {
  const season = readArg('season');
  if (hasFlag('help') || process.argv.length <= 2) return printHelp();

  for (const file of catalogPaths(season)) {
    if (hasFlag('suggest')) runSuggest(file);
    if (hasFlag('sync') || hasFlag('all')) await runSync(file);
    if (hasFlag('render') || hasFlag('all')) await runRender(file);
    if (hasFlag('import-db') || hasFlag('all')) await runImportDb(file);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
