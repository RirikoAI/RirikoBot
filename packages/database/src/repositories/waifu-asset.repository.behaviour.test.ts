import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { WaifuAssetRepository } from './waifu-asset.repository.js';

const MISSING_UUID = '00000000-0000-4000-8000-000000000001';
const T0 = new Date('2026-05-05T00:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

const source = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `Source ${id}`,
  baseUrl: `https://${id}.example.com`,
  attributionText: `Image source: ${id}`,
  ...overrides,
});

let hashCounter = 0;
const asset = (
  sourceId: string,
  sourceImageId: string,
  overrides: Record<string, unknown> = {},
) => ({
  sourceId,
  sourceImageId,
  characterName: 'Aqua',
  animeTitle: 'Konosuba',
  imageHash: `hash-${++hashCounter}`,
  ...overrides,
});

describeDialects('WaifuAssetRepository behaviour', (db) => {
  it('stores sources, listing them and upserting by id', async () => {
    const repo = new WaifuAssetRepository(db.client);
    expect(await repo.findSourceById('waifu-im')).toBeNull();
    expect(await repo.findAllSources()).toEqual([]);

    const created = await repo.createSource(source('waifu-im'));
    expect(created.attributionText).toBe('Image source: waifu-im');
    expect((await repo.findSourceById('waifu-im'))?.name).toBe('Source waifu-im');
    await expect(repo.createSource(source('waifu-im'))).rejects.toThrow();

    const updated = await repo.upsertSource(source('waifu-im', { name: 'Renamed' }));
    expect(updated.name).toBe('Renamed');
    await repo.upsertSource(source('danbooru'));
    expect((await repo.findAllSources()).map((s) => s.id).sort()).toEqual(['danbooru', 'waifu-im']);
  });

  it('creates an asset with defaults and finds it by id, hash and source image', async () => {
    const repo = new WaifuAssetRepository(db.client);
    await repo.createSource(source('src'));
    expect(await repo.findById(MISSING_UUID)).toBeNull();
    expect(await repo.exists(MISSING_UUID)).toBe(false);
    expect(await repo.count()).toBe(0);

    const created = await repo.create(asset('src', 'img-1', { imageHash: 'h-1' }));
    expect(created.tags).toEqual([]);
    expect(created.isDeletedByRequest).toBe(false);
    expect(created.createdAt).toBeInstanceOf(Date);

    expect((await repo.findById(created.id))?.characterName).toBe('Aqua');
    expect(await repo.exists(created.id)).toBe(true);
    expect((await repo.findByImageHash('h-1'))?.id).toBe(created.id);
    expect(await repo.findByImageHash('nope')).toBeNull();
    expect((await repo.findBySourceImageId('src', 'img-1'))?.id).toBe(created.id);
    expect(await repo.findBySourceImageId('src', 'img-9')).toBeNull();
    expect(await repo.findBySourceImageId('other', 'img-1')).toBeNull();
    expect(await repo.count()).toBe(1);
    await expect(repo.create(asset('src', 'img-2', { imageHash: 'h-1' }))).rejects.toThrow();
  });

  it('keeps explicit tags and ids', async () => {
    const repo = new WaifuAssetRepository(db.client);
    await repo.createSource(source('src'));
    const id = randomUUID();

    const created = await repo.create(asset('src', 'img-1', { id, tags: ['maid', 'blue-hair'] }));

    expect(created.id).toBe(id);
    expect(created.tags).toEqual(['maid', 'blue-hair']);
  });

  it('updates an asset and throws for a missing one', async () => {
    const repo = new WaifuAssetRepository(db.client);
    await repo.createSource(source('src'));
    const created = await repo.create(asset('src', 'img-1'));

    const updated = await repo.update(created.id, { characterName: 'Megumin', tags: ['mage'] });
    expect(updated.characterName).toBe('Megumin');
    expect(updated.tags).toEqual(['mage']);

    await expect(repo.update(MISSING_UUID, { characterName: 'x' })).rejects.toThrow(DatabaseError);
  });

  it('hides an asset taken down on request from the active lists', async () => {
    const repo = new WaifuAssetRepository(db.client);
    await repo.createSource(source('src'));
    const kept = await repo.create(asset('src', 'img-1', { createdAt: at(1), tags: ['maid'] }));
    const gone = await repo.create(asset('src', 'img-2', { createdAt: at(2), tags: ['maid'] }));

    const taken = await repo.markDeletedByRequest(gone.id);
    expect(taken.isDeletedByRequest).toBe(true);

    expect((await repo.findActiveAssets()).map((a) => a.id)).toEqual([kept.id]);
    expect((await repo.findActiveAssetsByTag('maid')).map((a) => a.id)).toEqual([kept.id]);
    expect(await repo.count()).toBe(2);
  });

  it('lists active assets newest first with paging', async () => {
    const repo = new WaifuAssetRepository(db.client);
    await repo.createSource(source('src'));
    const ids: string[] = [];
    for (let n = 1; n <= 4; n++)
      ids.push((await repo.create(asset('src', `img-${n}`, { createdAt: at(n) }))).id);

    expect((await repo.findActiveAssets()).map((a) => a.id)).toEqual([...ids].reverse());
    expect((await repo.findActiveAssets(2, 1)).map((a) => a.id)).toEqual([ids[2], ids[1]]);
    expect(await repo.findActiveAssets(10, 10)).toEqual([]);
  });

  it('finds the assets of one character with a limit', async () => {
    const repo = new WaifuAssetRepository(db.client);
    await repo.createSource(source('src'));
    await repo.create(asset('src', 'img-1', { characterName: 'Aqua' }));
    await repo.create(asset('src', 'img-2', { characterName: 'Aqua' }));
    await repo.create(asset('src', 'img-3', { characterName: 'Megumin' }));

    expect(await repo.findAssetsByCharacter('Aqua')).toHaveLength(2);
    expect(await repo.findAssetsByCharacter('Aqua', 1)).toHaveLength(1);
    expect(await repo.findAssetsByCharacter('Nobody')).toEqual([]);
  });

  it('finds active assets by an exact tag, never by part of one', async () => {
    const repo = new WaifuAssetRepository(db.client);
    await repo.createSource(source('src'));
    const maid = await repo.create(asset('src', 'img-1', { tags: ['maid', 'blue-hair'] }));
    await repo.create(asset('src', 'img-2', { tags: ['maiden'] }));
    await repo.create(asset('src', 'img-3', { tags: [] }));

    expect((await repo.findActiveAssetsByTag('maid')).map((a) => a.id)).toEqual([maid.id]);
    expect(await repo.findActiveAssetsByTag('blue')).toEqual([]);
    expect(await repo.findActiveAssetsByTag('maid', 0)).toEqual([]);
  });

  it('deletes an asset once', async () => {
    const repo = new WaifuAssetRepository(db.client);
    await repo.createSource(source('src'));
    const created = await repo.create(asset('src', 'img-1'));

    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.delete(created.id)).toBe(false);
    expect(await repo.count()).toBe(0);
  });
});
