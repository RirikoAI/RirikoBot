import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { WaifuAssetRepository } from '@ririko/database';
import { BossImageService } from '../canvas/boss-image.service.js';
import type { BossSynthesizer } from '../canvas/boss-synthesizer.js';
import type { DungeonBossProfile } from '../dungeon/boss-definition.js';

const profile: DungeonBossProfile = {
  id: 's1_infernal_crucible:megumin',
  name: 'Megumin',
  animeTitle: 'KonoSuba',
  element: 'FIRE',
  tier: 'MAJOR_BOSS',
  title: 'Crimson Demon Archwizard',
  assetId: 'asset-1',
};

describe('BossImageService (STORY-155)', () => {
  let dir: string;
  let renders: Array<{ imagePath?: string | undefined }>;
  let asset: { id: string; isDeletedByRequest: boolean; localStoragePath: string | null };

  const synthesizer = {
    render: async (input: { imagePath?: string | undefined }) => {
      renders.push(input);
      return Buffer.from(`png:${input.imagePath ?? 'no-art'}`);
    },
  } as unknown as BossSynthesizer;
  const assetRepo = { findById: async () => asset } as unknown as WaifuAssetRepository;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bosses-'));
    renders = [];
    asset = {
      id: 'asset-1',
      isDeletedByRequest: false,
      localStoragePath: 'data/tcg/boss-images/x.jpg',
    };
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('renders once from the asset art, then serves the cached PNG', async () => {
    const service = new BossImageService(assetRepo, { bossesDir: dir, synthesizer });
    const first = await service.getBossImage(profile, 10);
    const second = await service.getBossImage(profile, 10);

    expect(renders).toHaveLength(1);
    expect(renders[0]?.imagePath).toContain(path.join('data', 'tcg', 'boss-images', 'x.jpg'));
    expect(second?.equals(first!)).toBe(true);
    expect(fs.existsSync(path.join(dir, 's1_infernal_crucible', 'megumin.png'))).toBe(true);
  });

  it('drops the cached art and renders without it after a takedown', async () => {
    const service = new BossImageService(assetRepo, { bossesDir: dir, synthesizer });
    await service.getBossImage(profile, 10);

    asset.isDeletedByRequest = true;
    const png = await service.getBossImage(profile, 10);
    expect(png?.toString()).toBe('png:no-art');
    expect(fs.existsSync(path.join(dir, 's1_infernal_crucible', 'megumin.png'))).toBe(false);
  });

  it('never writes outside the bosses folder for unsafe ids', async () => {
    const service = new BossImageService(assetRepo, { bossesDir: dir, synthesizer });
    await service.getBossImage({ ...profile, id: '../evil:../../x' }, 1);
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
