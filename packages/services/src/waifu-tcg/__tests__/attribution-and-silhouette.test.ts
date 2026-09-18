import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient, WaifuAssetRepository } from '@ririko/database';
import type { SqliteDatabaseClient } from '@ririko/database';
import {
  DEFAULT_ATTRIBUTION_TEXT,
  getCardAttribution,
  formatCardEmbedFooter,
} from '../attribution.js';
import { resolveCardAssetDisplay, SILHOUETTE_FALLBACK_URL } from '../silhouette.js';
import type { WaifuAsset, WaifuSource } from '../types.js';

describe('Waifu TCG Section 24 Attribution & Soft-Deletion Silhouette (TASK-1002)', () => {
  describe('Section 24 Attribution Rules (BLUEPRINT.md:L1260-1280)', () => {
    it('should return mandatory default attribution when source is undefined or null', () => {
      const defaultAttr = getCardAttribution(undefined);
      expect(defaultAttr.footerText).toBe('Image source: waifu.im');
      expect(defaultAttr.sourceName).toBe('waifu.im');
      expect(defaultAttr.sourceUrl).toBe('https://api.waifu.im');

      const nullAttr = getCardAttribution(null);
      expect(nullAttr.footerText).toBe('Image source: waifu.im');
    });

    it('should format custom source attribution when configured', () => {
      const customSource: WaifuSource = {
        id: 'CUSTOM_SRC',
        name: 'AnimeArtStudio',
        baseUrl: 'https://animeart.example.com',
        attributionText: 'Art by AnimeArtStudio (CC-BY)',
        isActive: true,
      };

      const attr = getCardAttribution(customSource);
      expect(attr.footerText).toBe('Art by AnimeArtStudio (CC-BY)');
      expect(attr.sourceName).toBe('AnimeArtStudio');
      expect(attr.sourceUrl).toBe('https://animeart.example.com');
    });

    it('should format Discord embed footer with Section 24 text and optional extra suffix', () => {
      const footer1 = formatCardEmbedFooter(null);
      expect(footer1.text).toBe('Image source: waifu.im');

      const footer2 = formatCardEmbedFooter(null, 'ID: #4829 • Series 1');
      expect(footer2.text).toBe('Image source: waifu.im • ID: #4829 • Series 1');
    });
  });

  describe('Graceful Soft-Deletion Handling (docs/waifu-tcg.md:L39-53)', () => {
    const activeAsset: WaifuAsset = {
      id: 'asset_001',
      sourceId: 'WAIFU_IM',
      sourceImageId: '12345',
      characterName: 'Rem',
      animeTitle: 'Re:Zero',
      imageHash: 'abcdef123456',
      localStoragePath: '/assets/waifu-cards/abcdef123456.png',
      discordCdnUrl: 'https://cdn.discordapp.com/attachments/1/2/rem.png',
      isDeletedByRequest: false,
      tags: ['rem', 'maid', 'blue_hair'],
      createdAt: new Date(),
    };

    it('should resolve active card asset with CDN/local image URL', () => {
      const display = resolveCardAssetDisplay(activeAsset);

      expect(display.isSilhouette).toBe(false);
      expect(display.imageUrl).toBe('https://cdn.discordapp.com/attachments/1/2/rem.png');
      expect(display.characterName).toBe('Rem');
      expect(display.animeTitle).toBe('Re:Zero');
      expect(display.attribution.footerText).toBe(DEFAULT_ATTRIBUTION_TEXT);
    });

    it('should fallback to standardized silhouette frame when isDeletedByRequest is true', () => {
      const deletedAsset: WaifuAsset = {
        ...activeAsset,
        isDeletedByRequest: true,
      };

      const display = resolveCardAssetDisplay(deletedAsset);

      expect(display.isSilhouette).toBe(true);
      expect(display.imageUrl).toBe(SILHOUETTE_FALLBACK_URL);
      // Character metadata, stats context, and attribution must remain intact
      expect(display.characterName).toBe('Rem');
      expect(display.animeTitle).toBe('Re:Zero');
      expect(display.attribution.footerText).toBe(DEFAULT_ATTRIBUTION_TEXT);
    });

    describe('Database Soft-Deletion Integration', () => {
      let client: SqliteDatabaseClient;
      let repo: WaifuAssetRepository;

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

        repo = new WaifuAssetRepository(client);

        await repo.upsertSource({
          id: 'WAIFU_IM',
          name: 'waifu.im',
          baseUrl: 'https://api.waifu.im',
          attributionText: 'Image source: waifu.im',
          isActive: true,
        });
      });

      afterEach(async () => {
        await client.close();
      });

      it('should mark asset deleted by request in database and gracefully display silhouette', async () => {
        const asset = await repo.create({
          sourceId: 'WAIFU_IM',
          sourceImageId: 'test_asset_99',
          characterName: 'Asuna Yuuki',
          animeTitle: 'Sword Art Online',
          imageHash: 'asuna_hash_99',
          localStoragePath: '/assets/waifu-cards/asuna.png',
          discordCdnUrl: null,
          tags: ['asuna', 'sao'],
          isDeletedByRequest: false,
        });

        // Initially active
        const initialDisplay = resolveCardAssetDisplay(asset);
        expect(initialDisplay.isSilhouette).toBe(false);
        expect(initialDisplay.imageUrl).toBe('/assets/waifu-cards/asuna.png');

        // Creator requests removal
        await repo.markDeletedByRequest(asset.id);

        // Fetch updated record from DB
        const updatedAsset = await repo.findById(asset.id);
        expect(updatedAsset).not.toBeNull();
        expect(updatedAsset?.isDeletedByRequest).toBe(true);

        // Verify resolved display now uses silhouette fallback
        const updatedDisplay = resolveCardAssetDisplay(updatedAsset!);
        expect(updatedDisplay.isSilhouette).toBe(true);
        expect(updatedDisplay.imageUrl).toBe(SILHOUETTE_FALLBACK_URL);
        expect(updatedDisplay.characterName).toBe('Asuna Yuuki');
        expect(updatedDisplay.animeTitle).toBe('Sword Art Online');
      });
    });
  });
});
