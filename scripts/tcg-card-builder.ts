import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { findWorkspaceRoot } from '../packages/core/src/index.js';
import {
  createDatabaseClient,
  WaifuAssetRepository,
  WaifuCardRepository,
} from '../packages/database/src/index.js';
import {
  AniListClient,
  CARD_ELEMENTS,
  CARD_IMAGE_SOURCES,
  CardGenerator,
  CardSynthesizer,
  DanbooruClient,
  ELEMENTAL_SKILLS,
  RARITIES_ASCENDING,
  RENDERED_CARDS_DIR,
  RateLimiter,
  STARTER_POOL_TAG,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
  clampTextScale,
  downloadImage,
  loadCatalog,
  loadManifest,
  matchCatalogCharacter,
  pickCharacters,
  pickStarterCharacters,
  saveCatalog,
  saveManifest,
  slugifyCharacterKey,
  syncCatalogCharacter,
  type CardElement,
  type CardManifest,
  type CardManifestCard,
  type CardRarity,
  type CatalogCharacter,
} from '../packages/services/src/index.js';

// ─── PATHS & ENV ─────────────────────────────────────────────────────────────

const ROOT = findWorkspaceRoot();
const CATALOG_PATH = path.join(ROOT, 'assets/tcg/catalog/characters.json');
const MANIFEST_PATH = path.join(ROOT, 'assets/tcg/catalog/manifest.json');
const IMAGE_CACHE_DIR = path.join(ROOT, 'data/tcg/images'); // gitignored, rebuilt by --sync
const OUTPUT_DIR = path.join(ROOT, RENDERED_CARDS_DIR);

function loadEnv(): void {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

// ─── ARGS ────────────────────────────────────────────────────────────────────

interface RarityBatch {
  rarity: CardRarity;
  count: number;
}

interface CliArgs {
  mode?: 'sync' | 'generate' | 'starters' | 'rerender' | 'create' | 'import-db' | 'help';
  batches: RarityBatch[];
  count?: number;
  element?: CardElement;
  only?: string[];
  force: boolean;
  refetchImages: boolean;
  textScale?: number;
  dryRun: boolean;
  name?: string;
  anime?: string;
  image?: string;
  rarity?: CardRarity;
}

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function parseRarity(value: string): CardRarity {
  const r = value.toUpperCase() as CardRarity;
  if (!RARITIES_ASCENDING.includes(r))
    fail(`Unknown rarity "${value}". Use: ${RARITIES_ASCENDING.join(', ')}`);
  return r;
}

function parseCount(value: string): number {
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n < 1) fail(`--count must be a positive integer, got "${value}"`);
  return n;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { batches: [], force: false, refetchImages: false, dryRun: false };
  let pendingBatch: { rarity: CardRarity; count?: number } | undefined;

  for (const raw of argv) {
    const [flag, ...rest] = raw.split('=');
    const value = rest.join('=');
    switch (flag) {
      case '--help':
      case '-h':
        args.mode = 'help';
        break;
      case '--sync':
        args.mode = 'sync';
        break;
      case '--generate':
        args.mode = 'generate';
        break;
      case '--starters':
        args.mode = 'starters';
        break;
      case '--rerender':
        args.mode = 'rerender';
        break;
      case '--create':
        args.mode = 'create';
        break;
      case '--import-db':
        args.mode = 'import-db';
        break;
      case '--rarity': {
        const rarity = parseRarity(value);
        args.rarity = rarity;
        pendingBatch = { rarity };
        args.batches.push(pendingBatch as RarityBatch);
        break;
      }
      case '--count':
        // A --count right after a --rarity belongs to that rarity; otherwise it is the global count.
        if (pendingBatch && pendingBatch.count === undefined)
          pendingBatch.count = parseCount(value);
        else args.count = parseCount(value);
        break;
      case '--element': {
        const element = value.toUpperCase() as CardElement;
        if (!CARD_ELEMENTS.includes(element))
          fail(`Unknown element "${value}". Use: ${CARD_ELEMENTS.join(', ')}`);
        args.element = element;
        break;
      }
      case '--only':
        args.only = value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case '--force':
        args.force = true;
        break;
      case '--refetch-images':
        args.refetchImages = true;
        break;
      case '--text-scale': {
        const n = Number(value);
        if (!Number.isFinite(n)) fail(`--text-scale must be a number, got "${value}"`);
        args.textScale = n;
        break;
      }
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--name':
        args.name = value;
        break;
      case '--anime':
        args.anime = value;
        break;
      case '--image':
        args.image = value;
        break;
      default:
        fail(`Unknown option "${raw}". Run with --help.`);
    }
  }

  for (const b of args.batches) b.count ??= args.count ?? 10;
  return args;
}

function printHelp(): void {
  console.log(`
Ririko TCG Card Builder

Data files
  assets/tcg/catalog/characters.json  Character catalog (hand-edited; --sync fills API fields)
  assets/tcg/catalog/manifest.json    Every generated card (stats, skills, text scale, DB ids)
  data/tcg/images/                    Downloaded artwork cache (gitignored, rebuilt by --sync)
  public/cards/<cardId>.png           Rendered cards

Modes
  --sync [--force] [--only=key,...]
      Resolve AniList id/favourites + Danbooru tag + artwork for catalog characters and download
      images. Skips characters that already have data unless --force. Resumable.

  --generate --rarity=<R> [--count=<n>] [--rarity=<R2> --count=<n2> ...] [--element=<E>]
      Generate new cards. Rarity names: ${RARITIES_ASCENDING.join(', ')}.
      Example: --generate --rarity=COMMON --count=10 --rarity=MYTHIC --count=2

  --starters [--count=10]
      Generate COMMON starter cards spread across elements. New players get one at random.

  --rerender [--only=cardId,...] [--refetch-images] [--text-scale=<n>]
      Re-render cards from the manifest (no new stats). --refetch-images re-resolves artwork
      from the APIs; --text-scale overrides the saved text size.

  --import-db
      Adopt existing waifu_cards rows that are not in the manifest (e.g. from the old bulk
      generator). Keeps their ids, rarity, element, stats, skills and collection numbers, maps
      each to a catalog character of the same anime, then re-renders with real art.

  --create --name=<name> --anime=<anime> --element=<E> --rarity=<R> [--image=<url|path>]
      Add one character (if new) and generate one card for it.

Common options
  --text-scale=<n>   Text size multiplier, ${TEXT_SCALE_MIN}–${TEXT_SCALE_MAX} (default 1.0)
  --dry-run          Render and update the manifest, but skip database writes
`);
}

// ─── IMAGE CACHE ─────────────────────────────────────────────────────────────

const cdnLimiter = new RateLimiter(500);

function cachedImagePath(key: string): string | null {
  if (!fs.existsSync(IMAGE_CACHE_DIR)) return null;
  const file = fs.readdirSync(IMAGE_CACHE_DIR).find((f) => f.startsWith(`${key}.`));
  return file ? path.join(IMAGE_CACHE_DIR, file) : null;
}

function removeCachedImage(key: string): void {
  const existing = cachedImagePath(key);
  if (existing) fs.rmSync(existing);
}

async function ensureImageCached(character: CatalogCharacter): Promise<string | null> {
  const existing = cachedImagePath(character.key);
  if (existing) return existing;
  if (!character.image) return null;

  let buffer: Buffer | null;
  let ext = '.jpg';
  if (fs.existsSync(character.image.url)) {
    buffer = fs.readFileSync(character.image.url);
    ext = path.extname(character.image.url) || ext;
  } else {
    buffer = await downloadImage(character.image.url, cdnLimiter);
    ext = path.extname(new URL(character.image.url).pathname) || ext;
  }
  if (!buffer) return null;

  fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
  const file = path.join(IMAGE_CACHE_DIR, `${character.key}${ext}`);
  fs.writeFileSync(file, buffer);
  return file;
}

// ─── CATALOG SYNC ────────────────────────────────────────────────────────────

function createApiClients() {
  return { anilist: new AniListClient(), danbooru: new DanbooruClient() };
}

async function syncCharacters(
  catalog: CatalogCharacter[],
  keys: Set<string> | null,
  options: { force: boolean },
): Promise<void> {
  const clients = createApiClients();
  const targets = catalog.filter(
    (c) =>
      (!keys || keys.has(c.key)) &&
      (options.force || c.anilistId === undefined || !c.image || !cachedImagePath(c.key)),
  );
  if (targets.length === 0) {
    console.log('✓ Catalog already synced. Use --force to re-resolve.');
    return;
  }
  console.log(`🔍 Syncing ${targets.length} character(s) (AniList ≤24/min, Danbooru ≤1/s)…`);

  let done = 0;
  let queueIndex = 0;
  // A few workers overlap AniList and Danbooru waits; each host limiter still serializes its own calls.
  const worker = async () => {
    while (queueIndex < targets.length) {
      const target = targets[queueIndex++]!;
      const index = catalog.findIndex((c) => c.key === target.key);
      const hadImageUrl = target.image?.url;
      const result = await syncCatalogCharacter(target, clients, { force: options.force });
      catalog[index] = result.character;
      if (result.character.image?.url !== hadImageUrl) removeCachedImage(target.key);

      let imageNote = 'no image';
      try {
        const file = await ensureImageCached(result.character);
        if (file) imageNote = `${result.character.image!.source.toLowerCase()} art`;
      } catch (err) {
        result.warnings.push(`download: ${err instanceof Error ? err.message : String(err)}`);
      }
      saveCatalog(CATALOG_PATH, catalog);

      done++;
      const warn = result.warnings.length ? `  ⚠ ${result.warnings.join('; ')}` : '';
      console.log(
        `  [${done}/${targets.length}] ${target.name} (${target.anime}) → ${imageNote}${warn}`,
      );
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  console.log('✓ Catalog sync complete.');
}

/** Ensures a character has API data and a cached image before its card is rendered. */
async function prepareCharacters(
  catalog: CatalogCharacter[],
  picked: CatalogCharacter[],
): Promise<void> {
  const missing = picked.filter((c) => !c.image || !cachedImagePath(c.key));
  if (missing.length > 0) {
    await syncCharacters(catalog, new Set(missing.map((c) => c.key)), { force: false });
  }
}

// ─── CARD CREATION ───────────────────────────────────────────────────────────

function buildCard(
  character: CatalogCharacter,
  rarity: CardRarity,
  manifest: CardManifest,
  options: { isStarter: boolean; textScale: number },
): CardManifestCard {
  // Starters use mid-roll stats so every new player starts on equal footing.
  const generator = options.isStarter
    ? new CardGenerator({ randomFn: () => 0.5 })
    : new CardGenerator();
  const stats = generator.generateStats(rarity);
  const { skill, passive } = ELEMENTAL_SKILLS[character.element];
  const collectionNumber =
    manifest.cards.reduce((max, c) => Math.max(max, c.collectionNumber), 0) + 1;
  return {
    id: randomUUID(),
    characterKey: character.key,
    name: character.name,
    animeTitle: character.anime,
    element: character.element,
    rarity,
    stats: {
      hp: stats.hp,
      attack: stats.attack,
      defense: stats.defense,
      speed: stats.speed,
      critRate: stats.critRate,
    },
    skill: { name: skill.name, description: skill.description, mpCost: skill.mpCost },
    passive: { name: passive.name, description: passive.description },
    collectionNumber,
    isStarter: options.isStarter,
    textScale: clampTextScale(options.textScale),
    createdAt: new Date().toISOString(),
  };
}

// ─── RENDER + DB SYNC ────────────────────────────────────────────────────────

type Repos = { assets: WaifuAssetRepository; cards: WaifuCardRepository } | null;

async function connectRepos(): Promise<NonNullable<Repos>> {
  const dialect = (process.env.DATABASE_DIALECT as 'sqlite' | 'postgres') || 'sqlite';
  const url = process.env.DATABASE_URL || './data/ririko.sqlite';
  const client = await createDatabaseClient({ dialect, url });
  return { assets: new WaifuAssetRepository(client), cards: new WaifuCardRepository(client) };
}

/** Repos for writing, or null on --dry-run. */
async function openRepos(dryRun: boolean): Promise<Repos> {
  if (dryRun) return null;
  const repos = await connectRepos();
  const { assets } = repos;
  // Asset rows reference these by sourceId; the bot reads them for the embed attribution footer.
  for (const [id, source] of Object.entries(CARD_IMAGE_SOURCES)) {
    await assets.upsertSource({ id, ...source, isActive: true });
  }
  return repos;
}

async function upsertAsset(
  repos: NonNullable<Repos>,
  manifest: CardManifest,
  character: CatalogCharacter,
  imageFile: string | null,
  isStarter: boolean,
): Promise<string> {
  const imageHash = createHash('sha256')
    .update(imageFile ? fs.readFileSync(imageFile) : Buffer.from(`placeholder:${character.key}`))
    .digest('hex');
  const entry = (manifest.assets[character.key] ??= { assetId: randomUUID(), imageHash });
  entry.imageHash = imageHash;

  const data = {
    sourceId: character.image?.source ?? 'NONE',
    sourceImageId: character.image?.sourceId ?? character.key.slice(0, 64),
    characterName: character.name,
    animeTitle: character.anime,
    imageHash,
    localStoragePath: imageFile ? path.relative(ROOT, imageFile).replace(/\\/g, '/') : null,
    tags: [...character.tags, ...(isStarter ? [STARTER_POOL_TAG] : [])],
  };
  if (await repos.assets.findById(entry.assetId)) await repos.assets.update(entry.assetId, data);
  else await repos.assets.create({ id: entry.assetId, ...data });
  return entry.assetId;
}

async function upsertCard(
  repos: NonNullable<Repos>,
  card: CardManifestCard,
  assetId: string,
): Promise<void> {
  const data = {
    assetId,
    name: card.name,
    rarity: card.rarity,
    element: card.element,
    attack: card.stats.attack,
    defense: card.stats.defense,
    speed: card.stats.speed,
    health: card.stats.hp,
    critRate: card.stats.critRate,
    skillName: card.skill.name,
    skillDescription: card.skill.description,
    passiveName: card.passive.name,
    passiveDescription: card.passive.description,
    collectionNumber: card.collectionNumber,
    isActive: true,
  };
  if (await repos.cards.findById(card.id)) await repos.cards.update(card.id, data);
  else await repos.cards.create({ id: card.id, ...data });
}

async function renderCards(
  cards: CardManifestCard[],
  catalog: CatalogCharacter[],
  manifest: CardManifest,
  repos: Repos,
): Promise<void> {
  const synthesizer = new CardSynthesizer();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  // Numbers are not contiguous once cards are imported or skipped, so use the highest one.
  const maxCollection = manifest.cards.reduce((max, c) => Math.max(max, c.collectionNumber), 0);
  const byKey = new Map(catalog.map((c) => [c.key, c]));
  const starterKeys = new Set(manifest.cards.filter((c) => c.isStarter).map((c) => c.characterKey));

  for (const [i, card] of cards.entries()) {
    const character = byKey.get(card.characterKey);
    if (!character) {
      console.warn(
        `  ⚠ ${card.id}: character "${card.characterKey}" is missing from the catalog, skipped`,
      );
      continue;
    }
    const imageFile = cachedImagePath(character.key);

    const png = await synthesizer.synthesizeCard({
      name: card.name,
      animeTitle: card.animeTitle,
      element: card.element,
      rarity: card.rarity,
      stats: card.stats,
      skill: card.skill,
      passive: card.passive,
      ...(imageFile ? { imagePath: imageFile } : {}),
      collectionNumber: card.collectionNumber,
      maxCollectionNumber: maxCollection,
      attributionText: `${character.image?.credit ?? 'No artwork'} • Ririko TCG`,
      textScale: card.textScale,
    });
    fs.writeFileSync(path.join(OUTPUT_DIR, `${card.id}.png`), png);

    if (repos) {
      const assetId = await upsertAsset(
        repos,
        manifest,
        character,
        imageFile,
        starterKeys.has(character.key),
      );
      await upsertCard(repos, card, assetId);
    }
    saveManifest(MANIFEST_PATH, manifest);

    const art = imageFile ? '' : '  ⚠ no artwork (silhouette)';
    console.log(
      `  ✓ [${i + 1}/${cards.length}] ${card.rarity.padEnd(11)} ${card.element.padEnd(9)} ${card.name} → ${card.id}.png${art}`,
    );
  }
}

// ─── MODES ───────────────────────────────────────────────────────────────────

async function runGenerate(
  args: CliArgs,
  catalog: CatalogCharacter[],
  manifest: CardManifest,
): Promise<void> {
  if (args.batches.length === 0) fail('--generate needs at least one --rarity=<R> [--count=<n>]');
  const textScale = args.textScale ?? 1;
  const created: CardManifestCard[] = [];

  for (const batch of args.batches) {
    const picked = pickCharacters(catalog, manifest, {
      rarity: batch.rarity,
      count: batch.count,
      ...(args.element ? { element: args.element } : {}),
    });
    if (picked.length === 0)
      fail(`No catalog characters available${args.element ? ` for ${args.element}` : ''}`);
    await prepareCharacters(catalog, picked);
    for (const character of picked) {
      const card = buildCard(character, batch.rarity, manifest, { isStarter: false, textScale });
      manifest.cards.push(card);
      created.push(card);
    }
    console.log(`🎴 ${batch.count} × ${batch.rarity}${args.element ? ` (${args.element})` : ''}`);
  }

  saveManifest(MANIFEST_PATH, manifest);
  await renderCards(created, catalog, manifest, await openRepos(args.dryRun));
  console.log(`✨ Generated ${created.length} card(s) in ${path.relative(ROOT, OUTPUT_DIR)}`);
}

async function runStarters(
  args: CliArgs,
  catalog: CatalogCharacter[],
  manifest: CardManifest,
): Promise<void> {
  const count = args.count ?? 10;
  const picked = pickStarterCharacters(catalog, manifest, count);
  if (picked.length < count)
    console.warn(`⚠ Only ${picked.length} unused characters left for starters`);
  await prepareCharacters(catalog, picked);

  const created = picked.map((character) => {
    const card = buildCard(character, 'COMMON', manifest, {
      isStarter: true,
      textScale: args.textScale ?? 1,
    });
    manifest.cards.push(card);
    return card;
  });
  saveManifest(MANIFEST_PATH, manifest);
  await renderCards(created, catalog, manifest, await openRepos(args.dryRun));

  const poolSize = manifest.cards.filter((c) => c.isStarter).length;
  console.log(`✨ Added ${created.length} starter card(s). Starter pool size: ${poolSize}`);
}

async function runRerender(
  args: CliArgs,
  catalog: CatalogCharacter[],
  manifest: CardManifest,
): Promise<void> {
  const only = args.only ? new Set(args.only) : null;
  const cards = manifest.cards.filter((c) => !only || only.has(c.id) || only.has(c.characterKey));
  if (cards.length === 0) fail('No manifest cards match. Generate cards first or check --only.');

  if (args.textScale !== undefined) {
    for (const card of cards) card.textScale = clampTextScale(args.textScale);
  }

  const keys = new Set(cards.map((c) => c.characterKey));
  if (args.refetchImages) {
    for (const key of keys) removeCachedImage(key);
    await syncCharacters(catalog, keys, { force: true });
  } else {
    await prepareCharacters(
      catalog,
      catalog.filter((c) => keys.has(c.key)),
    );
  }

  console.log(`🎨 Re-rendering ${cards.length} card(s)…`);
  await renderCards(cards, catalog, manifest, await openRepos(args.dryRun));
  console.log('✨ Re-render complete.');
}

async function runImportDb(
  args: CliArgs,
  catalog: CatalogCharacter[],
  manifest: CardManifest,
): Promise<void> {
  const reader = await connectRepos();
  const known = new Set(manifest.cards.map((c) => c.id));
  const imported: CardManifestCard[] = [];
  const unmatched: string[] = [];

  for (let offset = 0; ; offset += 500) {
    const rows = await reader.cards.listCards({ limit: 500, offset });
    if (rows.length === 0) break;
    for (const row of rows) {
      if (known.has(row.id)) continue;
      const asset = await reader.assets.findById(row.assetId);
      const character = asset ? matchCatalogCharacter(catalog, row.name, asset.animeTitle) : null;
      if (!character) {
        unmatched.push(`${row.id} (${row.name})`);
        continue;
      }
      const defaults = ELEMENTAL_SKILLS[row.element as CardElement];
      imported.push({
        id: row.id,
        characterKey: character.key,
        name: character.name,
        animeTitle: character.anime,
        element: row.element as CardElement,
        rarity: row.rarity as CardRarity,
        stats: {
          hp: row.health,
          attack: row.attack,
          defense: row.defense,
          speed: row.speed,
          critRate: row.critRate,
        },
        skill: {
          name: row.skillName ?? defaults.skill.name,
          description: row.skillDescription ?? defaults.skill.description,
          mpCost: defaults.skill.mpCost,
        },
        passive: {
          name: row.passiveName ?? defaults.passive.name,
          description: row.passiveDescription ?? defaults.passive.description,
        },
        collectionNumber: row.collectionNumber,
        isStarter: false,
        textScale: clampTextScale(args.textScale ?? 1),
        createdAt: new Date().toISOString(),
      });
    }
  }

  console.log(
    `📥 Importing ${imported.length} card(s); ${unmatched.length} left unchanged (no catalog match)`,
  );
  for (const u of unmatched) console.log(`  · ${u}`);
  if (imported.length === 0) return;

  manifest.cards.push(...imported);
  manifest.cards.sort((a, b) => a.collectionNumber - b.collectionNumber);
  saveManifest(MANIFEST_PATH, manifest);
  await prepareCharacters(
    catalog,
    catalog.filter((c) => imported.some((i) => i.characterKey === c.key)),
  );
  await renderCards(imported, catalog, manifest, await openRepos(args.dryRun));
  console.log(`✨ Imported and re-rendered ${imported.length} card(s).`);
}

async function runCreate(
  args: CliArgs,
  catalog: CatalogCharacter[],
  manifest: CardManifest,
): Promise<void> {
  if (!args.name || !args.anime || !args.element || !args.rarity) {
    fail('--create needs --name, --anime, --element and --rarity');
  }
  const key = slugifyCharacterKey(args.name, args.anime);
  let character = catalog.find((c) => c.key === key);
  if (!character) {
    character = {
      key,
      name: args.name,
      anime: args.anime,
      element: args.element,
      tags: [args.element.toLowerCase()],
    };
    catalog.push(character);
    console.log(`➕ Added "${args.name}" to the catalog`);
  }
  if (args.image) {
    character.image = {
      url: args.image,
      source: 'MANUAL',
      sourceId: key.slice(0, 64),
      credit: 'Image: manual upload',
    };
    removeCachedImage(key);
  }
  saveCatalog(CATALOG_PATH, catalog);
  await prepareCharacters(catalog, [character]);

  const card = buildCard(character, args.rarity, manifest, {
    isStarter: false,
    textScale: args.textScale ?? 1,
  });
  manifest.cards.push(card);
  saveManifest(MANIFEST_PATH, manifest);
  await renderCards([card], catalog, manifest, await openRepos(args.dryRun));
}

async function main(): Promise<void> {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  if (!args.mode || args.mode === 'help') {
    printHelp();
    return;
  }

  const catalog = loadCatalog(CATALOG_PATH);
  const manifest = loadManifest(MANIFEST_PATH);

  switch (args.mode) {
    case 'sync':
      await syncCharacters(catalog, args.only ? new Set(args.only) : null, { force: args.force });
      break;
    case 'generate':
      await runGenerate(args, catalog, manifest);
      break;
    case 'starters':
      await runStarters(args, catalog, manifest);
      break;
    case 'rerender':
      await runRerender(args, catalog, manifest);
      break;
    case 'import-db':
      await runImportDb(args, catalog, manifest);
      break;
    case 'create':
      await runCreate(args, catalog, manifest);
      break;
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error running TCG card builder:', err);
    process.exit(1);
  });
