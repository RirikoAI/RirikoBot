import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { SqliteDatabaseClient } from '../client/types.js';
import { WaifuAssetRepository } from './waifu-asset.repository.js';
import { SQLITE_SCHEMA_DDL } from '../schema/sqlite/ddl.js';

describe('WaifuAssetRepository (TASK-1001)', () => {
  let client: SqliteDatabaseClient;
  let repo: WaifuAssetRepository;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    client.raw.exec(SQLITE_SCHEMA_DDL);
    repo = new WaifuAssetRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  describe('Waifu Sources', () => {
    it('should create and find waifu sources', async () => {
      const source = await repo.createSource({
        id: 'WAIFU_IM',
        name: 'waifu.im',
        baseUrl: 'https://api.waifu.im',
        attributionText: 'Image source: waifu.im',
        isActive: true,
      });

      expect(source.id).toBe('WAIFU_IM');
      expect(source.attributionText).toBe('Image source: waifu.im');

      const found = await repo.findSourceById('WAIFU_IM');
      expect(found).not.toBeNull();
      expect(found?.name).toBe('waifu.im');

      const all = await repo.findAllSources();
      expect(all).toHaveLength(1);
    });

    it('should upsert existing source', async () => {
      await repo.createSource({
        id: 'WAIFU_IM',
        name: 'waifu.im',
        baseUrl: 'https://api.waifu.im',
        attributionText: 'Image source: waifu.im',
        isActive: true,
      });

      const updated = await repo.upsertSource({
        id: 'WAIFU_IM',
        name: 'waifu.im updated',
        baseUrl: 'https://api.waifu.im/v2',
        attributionText: 'Image source: waifu.im',
        isActive: false,
      });

      expect(updated.name).toBe('waifu.im updated');
      expect(updated.isActive).toBe(false);
    });
  });

  describe('Waifu Assets', () => {
    beforeEach(async () => {
      await repo.createSource({
        id: 'WAIFU_IM',
        name: 'waifu.im',
        baseUrl: 'https://api.waifu.im',
        attributionText: 'Image source: waifu.im',
        isActive: true,
      });
    });

    it('should create asset with generated UUID and query by id and hash', async () => {
      const asset = await repo.create({
        sourceId: 'WAIFU_IM',
        sourceImageId: 'w_1001',
        characterName: 'Makima',
        animeTitle: 'Chainsaw Man',
        imageHash: 'hash_makima_123456',
        localStoragePath: '/assets/waifu-cards/hash_makima_123456.png',
        discordCdnUrl: 'https://cdn.discordapp.com/attachments/123/456/card.png',
        tags: ['makima', 'chainsaw_man', 'suit'],
      });

      expect(asset.id).toBeDefined();
      expect(asset.characterName).toBe('Makima');
      expect(asset.imageHash).toBe('hash_makima_123456');
      expect(asset.isDeletedByRequest).toBe(false);

      const exists = await repo.exists(asset.id);
      expect(exists).toBe(true);

      const byHash = await repo.findByImageHash('hash_makima_123456');
      expect(byHash).not.toBeNull();
      expect(byHash?.id).toBe(asset.id);

      const bySourceId = await repo.findBySourceImageId('WAIFU_IM', 'w_1001');
      expect(bySourceId).not.toBeNull();
      expect(bySourceId?.characterName).toBe('Makima');
    });

    it('should search assets by character and active status', async () => {
      await repo.create({
        sourceId: 'WAIFU_IM',
        sourceImageId: 'w_2001',
        characterName: 'Rem',
        animeTitle: 'Re:Zero',
        imageHash: 'hash_rem_001',
        tags: ['rem', 'maid', 'blue_hair'],
      });

      await repo.create({
        sourceId: 'WAIFU_IM',
        sourceImageId: 'w_2002',
        characterName: 'Rem',
        animeTitle: 'Re:Zero',
        imageHash: 'hash_rem_002',
        tags: ['rem', 'smile'],
      });

      await repo.create({
        sourceId: 'WAIFU_IM',
        sourceImageId: 'w_3001',
        characterName: 'Emilia',
        animeTitle: 'Re:Zero',
        imageHash: 'hash_emilia_001',
        tags: ['emilia', 'silver_hair'],
      });

      const rems = await repo.findAssetsByCharacter('Rem');
      expect(rems).toHaveLength(2);

      const active = await repo.findActiveAssets();
      expect(active).toHaveLength(3);

      const count = await repo.count();
      expect(count).toBe(3);
    });

    it('should find active assets by exact tag', async () => {
      const base = { sourceId: 'WAIFU_IM', animeTitle: 'Re:Zero' };
      const tagged = await repo.create({
        ...base,
        sourceImageId: 't_1',
        characterName: 'Rem',
        imageHash: 'hash_tag_1',
        tags: ['starter_pool', 'water'],
      });
      await repo.create({
        ...base,
        sourceImageId: 't_2',
        characterName: 'Ram',
        imageHash: 'hash_tag_2',
        tags: ['starter_pool_extra', 'water'],
      });
      const takenDown = await repo.create({
        ...base,
        sourceImageId: 't_3',
        characterName: 'Emilia',
        imageHash: 'hash_tag_3',
        tags: ['starter_pool'],
      });
      await repo.markDeletedByRequest(takenDown.id);

      const found = await repo.findActiveAssetsByTag('starter_pool');
      expect(found.map((a) => a.id)).toEqual([tagged.id]);
    });

    it('should handle soft deletion for takedown requests preserving stats', async () => {
      const asset = await repo.create({
        sourceId: 'WAIFU_IM',
        sourceImageId: 'w_4001',
        characterName: 'Power',
        animeTitle: 'Chainsaw Man',
        imageHash: 'hash_power_001',
        tags: ['power', 'horns'],
      });

      const updated = await repo.markDeletedByRequest(asset.id);
      expect(updated.isDeletedByRequest).toBe(true);

      // Active assets should omit the soft-deleted asset
      const active = await repo.findActiveAssets();
      expect(active.some((a) => a.id === asset.id)).toBe(false);

      // findById still retrieves it with all metadata intact
      const found = await repo.findById(asset.id);
      expect(found).not.toBeNull();
      expect(found?.isDeletedByRequest).toBe(true);
      expect(found?.characterName).toBe('Power');
      expect(found?.animeTitle).toBe('Chainsaw Man');
    });

    it('should delete asset permanently if required', async () => {
      const asset = await repo.create({
        sourceId: 'WAIFU_IM',
        sourceImageId: 'w_5001',
        characterName: 'Asuka',
        animeTitle: 'Evangelion',
        imageHash: 'hash_asuka_001',
        tags: ['asuka'],
      });

      const deleted = await repo.delete(asset.id);
      expect(deleted).toBe(true);

      const exists = await repo.exists(asset.id);
      expect(exists).toBe(false);
    });
  });
});
