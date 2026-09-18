import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDatabaseClient, WaifuAssetRepository } from '@ririko/database';
import type { SqliteDatabaseClient } from '@ririko/database';
import { ImageValidator } from '../ingestion/image-validator.js';
import { WaifuImClient } from '../ingestion/waifu-im.client.js';
import { IngestionService } from '../ingestion/ingestion-service.js';
import { createMockPngBuffer, CANONICAL_SEED_ASSETS } from '../ingestion/seed-assets.js';
import type { WaifuImSearchResponse } from '../types.js';

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

  describe('WaifuImClient', () => {
    it('should query API and extract character metadata', async () => {
      const mockResponse: WaifuImSearchResponse = {
        images: [
          {
            image_id: 101,
            signature: 'sig_101',
            extension: '.png',
            image: 'https://cdn.waifu.im/101.png',
            width: 600,
            height: 900,
            tags: [{ name: 'makima', is_nsfw: false }, { name: 'suit', is_nsfw: false }],
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const client = new WaifuImClient({
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const images = await client.search({ tags: ['makima'] });
      expect(images).toHaveLength(1);
      expect(images[0]?.image_id).toBe(101);

      const metadata = client.extractMetadata(images[0]!);
      expect(metadata.characterName).toBe('Makima');
      expect(metadata.tags).toEqual(['makima', 'suit']);
    });

    it('should retry with backoff on HTTP 429 rate limit', async () => {
      const mockResponse: WaifuImSearchResponse = { images: [] };

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockResponse,
        });

      const client = new WaifuImClient({
        fetchFn: mockFetch as unknown as typeof fetch,
        maxRetries: 2,
      });

      const images = await client.search();
      expect(images).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
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
      const mockImageMeta: WaifuImSearchResponse = {
        images: [
          {
            image_id: 999,
            signature: 'sig_999',
            extension: '.png',
            image: 'https://cdn.waifu.im/999.png',
            width: 600,
            height: 900,
            tags: [{ name: 'kurumi_tokisaki' }],
          },
        ],
      };

      const mockClient = new WaifuImClient({
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
