import type { WaifuAssetRepository } from '@ririko/database';
import type { WaifuImClient, WaifuImImage, WaifuImSearchOptions } from '../../anime/waifu-im.client.js';
import type { ImageValidator } from './image-validator.js';
import type { IngestionResult } from '../types.js';
import { CANONICAL_SEED_ASSETS, createMockPngBuffer } from './seed-assets.js';

export interface IngestionServiceOptions {
  assetRepo: WaifuAssetRepository;
  client: WaifuImClient;
  validator: ImageValidator;
}

export class IngestionService {
  private readonly assetRepo: WaifuAssetRepository;
  private readonly client: WaifuImClient;
  private readonly validator: ImageValidator;

  constructor(options: IngestionServiceOptions) {
    this.assetRepo = options.assetRepo;
    this.client = options.client;
    this.validator = options.validator;
  }

  /**
   * Ensures default waifu.im source is registered in the database.
   */
  async ensureDefaultSource(): Promise<void> {
    await this.assetRepo.upsertSource({
      id: 'WAIFU_IM',
      name: 'waifu.im',
      baseUrl: 'https://api.waifu.im',
      attributionText: 'Image source: waifu.im',
      isActive: true,
    });
  }

  /**
   * Seeds the database with canonical initial card assets for offline testing and initial inventory.
   */
  async seedCanonicalAssets(): Promise<number> {
    await this.ensureDefaultSource();
    let seeded = 0;

    for (const item of CANONICAL_SEED_ASSETS) {
      const buffer = createMockPngBuffer(item.width, item.height, item.sourceImageId);
      const validation = this.validator.validate(buffer);

      if (!validation.isValid || !validation.hash) {
        continue;
      }

      const existing = await this.assetRepo.findByImageHash(validation.hash);
      if (existing) {
        continue;
      }

      await this.assetRepo.create({
        sourceId: 'WAIFU_IM',
        sourceImageId: item.sourceImageId,
        characterName: item.characterName,
        animeTitle: item.animeTitle,
        imageHash: validation.hash,
        localStoragePath: `/assets/waifu-cards/${validation.hash}.png`,
        discordCdnUrl: null,
        tags: [...item.tags, item.element.toLowerCase()],
        isDeletedByRequest: false,
      });

      seeded++;
    }

    return seeded;
  }

  /**
   * Ingests a batch of character assets from waifu.im API with validation and SHA-256 deduplication.
   */
  async ingestFromWaifuIm(options?: WaifuImSearchOptions): Promise<IngestionResult[]> {
    await this.ensureDefaultSource();
    const images = await this.client.search(options);
    const results: IngestionResult[] = [];

    for (const image of images) {
      try {
        const imageUrl = image.url;
        if (!imageUrl) {
          results.push({
            success: false,
            reason: `No image URL found for asset ${image.id}`,
          });
          continue;
        }

        const buffer = await this.client.downloadImage(imageUrl);
        const validation = this.validator.validate(buffer);

        if (!validation.isValid || !validation.hash) {
          results.push({
            success: false,
            reason: validation.error ?? 'Validation failed',
          });
          continue;
        }

        // SHA-256 Deduplication check
        const existing = await this.assetRepo.findByImageHash(validation.hash);
        if (existing) {
          results.push({
            success: false,
            isDuplicate: true,
            reason: `Image hash ${validation.hash} already exists in database`,
            asset: existing,
          });
          continue;
        }

        const metadata = extractWaifuImMetadata(image);
        const asset = await this.assetRepo.create({
          sourceId: 'WAIFU_IM',
          sourceImageId: String(image.id),
          characterName: metadata.characterName,
          animeTitle: metadata.animeTitle,
          imageHash: validation.hash,
          localStoragePath: `/assets/waifu-cards/${validation.hash}.${validation.format ?? 'png'}`,
          discordCdnUrl: null,
          tags: metadata.tags,
          isDeletedByRequest: false,
        });

        results.push({
          success: true,
          asset,
        });
      } catch (err: unknown) {
        results.push({
          success: false,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return results;
  }
}

/**
 * Derives a card name from waifu.im tags. waifu.im tags are mostly generic (`maid`, `waifu`);
 * character tags such as `rem` or `raiden-shogun` become the name when present.
 */
export function extractWaifuImMetadata(image: WaifuImImage): {
  characterName: string;
  animeTitle: string;
  tags: string[];
} {
  const tags = image.tags.map((t) => t.slug);
  const generic = /maid|waifu|uniform|selfies/i;
  const characterTag = tags.find((tag) => !generic.test(tag));
  const characterName = characterTag
    ? characterTag
        .split(/[-_]/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : `Waifu #${String(image.id).slice(-4)}`;
  return { characterName, animeTitle: 'Anime Collection', tags };
}
