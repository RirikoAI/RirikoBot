import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDatabaseClient, WaifuAssetRepository } from '@ririko/database';
import type { SqliteDatabaseClient } from '@ririko/database';
import { ImageValidator } from '../ingestion/image-validator.js';
import { WaifuImClient } from '../../anime/waifu-im.client.js';
import { RateLimiter } from '../../http/rate-limiter.js';
import { IngestionService, extractWaifuImMetadata } from '../ingestion/ingestion-service.js';
import { createMockPngBuffer, CANONICAL_SEED_ASSETS } from '../ingestion/seed-assets.js';

const instantLimiter = () => new RateLimiter(0, { sleep: () => Promise.resolve() });

/** Minimal waifu.im v7 `/images` item. */
function waifuImItem(id: number, tagSlugs: string[]) {
  return {
    id,
    url: `https://cdn.waifu.im/${id}.png`,
    extension: '.png',
    source: null,
    isNsfw: false,
    width: 600,
    height: 900,
    dominantColor: null,
    favorites: 0,
    tags: tagSlugs.map((slug) => ({ name: slug, slug })),
    artists: [],
  };
}

describe('Waifu Ingestion Pipeline & Validation (TASK-1001)', () => {
  describe('ImageValidator', () => {
    const validator = new ImageValidator();

    it('should validate conforming PNG buffer', () => {
      const buffer = createMockPngBuffer(600, 900); // 2:3 aspect ratio = 0.67
      const result = validator.validate(buffer);

      expect(result.isValid).toBe(true);
      expect(result.format).toBe('png');
      expect(result.width).toBe(600);
      expect(result.height).toBe(900);
      expect(result.aspectRatio).toBeCloseTo(0.667, 2);
      expect(result.hash).toBeDefined();
      expect(result.hash).toHaveLength(64);
    });

    it('should reject corrupt buffer with unknown magic bytes', () => {
      const corruptBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
      const result = validator.validate(corruptBuffer);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid image format');
    });

    it('should reject image below minimum resolution (400x600)', () => {
      const smallBuffer = createMockPngBuffer(200, 300);
      const result = validator.validate(smallBuffer);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('below minimum required');
    });

    it('should reject image outside card aspect ratio tolerance', () => {
      // 800x600 is landscape (ratio = 1.33 > 0.9) while satisfying min dimensions (>=400x600)
      const landscapeBuffer = createMockPngBuffer(800, 600);
      const result = validator.validate(landscapeBuffer);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Aspect ratio');
    });

    it('should compute deterministic SHA-256 content hashes', () => {
      const buf1 = createMockPngBuffer(600, 900);
      const buf2 = createMockPngBuffer(600, 900);
      const buf3 = createMockPngBuffer(400, 600);

      const hash1 = validator.computeHash(buf1);
      const hash2 = validator.computeHash(buf2);
      const hash3 = validator.computeHash(buf3);

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
    });
  });

  describe('extractWaifuImMetadata', () => {
    it('names the card after the first non-generic tag', () => {
      const meta = extractWaifuImMetadata({
        ...waifuImItem(101, ['maid', 'raiden-shogun']),
        tags: [
          { name: 'Maid', slug: 'maid' },
          { name: 'Raiden Shogun', slug: 'raiden-shogun' },
        ],
      });
      expect(meta.characterName).toBe('Raiden Shogun');
      expect(meta.tags).toEqual(['maid', 'raiden-shogun']);
    });

    it('falls back to a numbered name when only generic tags exist', () => {
      expect(extractWaifuImMetadata(waifuImItem(12345, ['waifu'])).characterName).toBe('Waifu #2345');
    });
  });

  describe('IngestionService Integration', () => {
    let client: SqliteDatabaseClient;
    let assetRepo: WaifuAssetRepository;
    let ingestionService: IngestionService;
    let imageValidator: ImageValidator;

    beforeEach(async () => {
      const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
      if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
      client = rawClient;

      client.raw.exec(`
        CREATE TABLE waifu_sources (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          base_url TEXT NOT NULL,
          attribution_text TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE waifu_assets (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL,
          source_image_id TEXT NOT NULL,
          character_name TEXT NOT NULL,
          anime_title TEXT NOT NULL,
          image_hash TEXT NOT NULL UNIQUE,
          local_storage_path TEXT,
          discord_cdn_url TEXT,
          is_deleted_by_request INTEGER NOT NULL DEFAULT 0,
          tags TEXT NOT NULL DEFAULT '[]',
          created_at INTEGER NOT NULL
        );
      `);
      assetRepo = new WaifuAssetRepository(client);
      imageValidator = new ImageValidator();

      const mockWaifuImClient = new WaifuImClient();
      ingestionService = new IngestionService({
        assetRepo,
        client: mockWaifuImClient,
        validator: imageValidator,
      });
    });

    afterEach(async () => {
      await client.close();
    });

    it('should ensure default WAIFU_IM source with Section 24 attribution text', async () => {
      await ingestionService.ensureDefaultSource();
      const source = await assetRepo.findSourceById('WAIFU_IM');

      expect(source).not.toBeNull();
      expect(source?.attributionText).toBe('Image source: waifu.im');
      expect(source?.isActive).toBe(true);
    });

    it('should seed 25 canonical waifu assets across all 7 elements', async () => {
      const seededCount = await ingestionService.seedCanonicalAssets();
      expect(seededCount).toBe(25);
      expect(CANONICAL_SEED_ASSETS).toHaveLength(25);

      const totalInDb = await assetRepo.count();
      expect(totalInDb).toBe(25);

      // Verify character query
      const rias = await assetRepo.findAssetsByCharacter('Rias Gremory');
      expect(rias).toHaveLength(1);
      expect(rias[0]?.animeTitle).toBe('High School DxD');
      expect(rias[0]?.tags).toContain('fire');

      const esdeath = await assetRepo.findAssetsByCharacter('Esdeath');
      expect(esdeath).toHaveLength(1);
      expect(esdeath[0]?.tags).toContain('ice');

      // Second seed run should be idempotent and skip duplicates
      const secondRun = await ingestionService.seedCanonicalAssets();
      expect(secondRun).toBe(0);
      expect(await assetRepo.count()).toBe(25);
    });

    it('should ingest and deduplicate images by SHA-256 content hash', async () => {
      const samplePng = createMockPngBuffer(600, 900);
      const mockImageMeta = { items: [waifuImItem(999, ['kurumi_tokisaki'])] };

      const mockClient = new WaifuImClient({
        limiter: instantLimiter(),
        fetchFn: vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => mockImageMeta,
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            arrayBuffer: async () => Uint8Array.from(samplePng).buffer,
          }) as unknown as typeof fetch,
      });

      const service = new IngestionService({
        assetRepo,
        client: mockClient,
        validator: imageValidator,
      });

      const results = await service.ingestFromWaifuIm();
      expect(results).toHaveLength(1);
      expect(results[0]?.success).toBe(true);
      expect(results[0]?.asset?.characterName).toBe('Kurumi Tokisaki');

      // Re-ingesting identical binary must detect duplicate hash and skip insertion
      const duplicateClient = new WaifuImClient({
        limiter: instantLimiter(),
        fetchFn: vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => mockImageMeta,
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            arrayBuffer: async () => Uint8Array.from(samplePng).buffer,
          }) as unknown as typeof fetch,
      });

      const dupService = new IngestionService({
        assetRepo,
        client: duplicateClient,
        validator: imageValidator,
      });

      const dupResults = await dupService.ingestFromWaifuIm();
      expect(dupResults).toHaveLength(1);
      expect(dupResults[0]?.success).toBe(false);
      expect(dupResults[0]?.isDuplicate).toBe(true);
      expect(dupResults[0]?.reason).toContain('already exists');
    });
  });
});
