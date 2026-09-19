import fs from 'node:fs';
import path from 'node:path';
import { resolveWorkspacePath } from '@ririko/core';
import type { WaifuAssetRepository } from '@ririko/database';
import type { DungeonBossProfile } from '../dungeon/boss-definition.js';
import { BossSynthesizer, RENDERED_BOSSES_DIR } from './boss-synthesizer.js';

const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

/**
 * Supplies boss portraits for the battle screen.
 * - Uses the builder's `public/bosses/<seasonId>/<key>.png` when present.
 * - Otherwise renders from the boss's asset art once and caches the result there.
 * - A taken-down asset (isDeletedByRequest) never shows its art: the cache is removed and the
 *   portrait is rendered on the element background.
 */
export class BossImageService {
  private readonly bossesDir: string;
  private readonly synthesizer: BossSynthesizer;

  constructor(
    private readonly assetRepo?: WaifuAssetRepository | undefined,
    options: { bossesDir?: string; synthesizer?: BossSynthesizer } = {},
  ) {
    this.bossesDir = options.bossesDir ?? resolveWorkspacePath(RENDERED_BOSSES_DIR);
    this.synthesizer = options.synthesizer ?? new BossSynthesizer();
  }

  async getBossImage(profile: DungeonBossProfile, floorNumber: number): Promise<Buffer | null> {
    const [seasonId, key] = profile.id.split(':');
    // Never build a file path from ids that could escape the bosses folder.
    const cachePath =
      seasonId && key && SAFE_SEGMENT.test(seasonId) && SAFE_SEGMENT.test(key)
        ? path.join(this.bossesDir, seasonId, `${key}.png`)
        : null;

    const asset =
      profile.assetId && this.assetRepo ? await this.assetRepo.findById(profile.assetId) : null;
    if (asset?.isDeletedByRequest) {
      if (cachePath) fs.rmSync(cachePath, { force: true });
      return this.render(profile, floorNumber, undefined);
    }

    if (cachePath && fs.existsSync(cachePath)) return fs.readFileSync(cachePath);

    const artPath = asset?.localStoragePath
      ? resolveWorkspacePath(asset.localStoragePath)
      : undefined;
    const png = await this.render(profile, floorNumber, artPath);
    if (cachePath) {
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      fs.writeFileSync(cachePath, png);
    }
    return png;
  }

  private render(
    profile: DungeonBossProfile,
    floorNumber: number,
    imagePath: string | undefined,
  ): Promise<Buffer> {
    return this.synthesizer.render({
      name: profile.name,
      animeTitle: profile.animeTitle,
      element: profile.element,
      tier: profile.tier,
      title: profile.title,
      floorLabel: `Floor ${floorNumber}`,
      imagePath,
    });
  }
}
