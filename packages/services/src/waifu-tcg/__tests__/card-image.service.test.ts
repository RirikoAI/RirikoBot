import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import type { WaifuAsset, WaifuCard } from '@ririko/database';
import { CardImageService } from '../canvas/card-image.service.js';
import { CardSynthesizer } from '../canvas/card-synthesizer.js';

const card = (id: string): WaifuCard =>
  ({
    id,
    assetId: 'asset-1',
    name: 'Frieren',
    rarity: 'SIR',
    element: 'LIGHT',
    attack: 900,
    defense: 700,
    speed: 80,
    health: 6000,
    critRate: 0.1,
    skillName: 'Radiant Nova',
    skillDescription: 'Costs 45 MP. Deals 200% Light ATK and pierces 25% enemy DEF.',
    passiveName: 'Solar Halo',
    passiveDescription: '+15% ATK buff to user and immunity to debuff dispels.',
    collectionNumber: 7,
    isActive: true,
  }) as WaifuCard;

const asset = (overrides: Partial<WaifuAsset> = {}): WaifuAsset =>
  ({
    id: 'asset-1',
    sourceId: 'DANBOORU',
    sourceImageId: '1',
    characterName: 'Frieren',
    animeTitle: "Frieren: Beyond Journey's End",
    imageHash: 'h',
    localStoragePath: null,
    discordCdnUrl: null,
    isDeletedByRequest: false,
    tags: [],
    createdAt: new Date(),
    ...overrides,
  }) as WaifuAsset;

describe('CardImageService', () => {
  let dir: string;
  let synthesizer: CardSynthesizer;
  let synthesize: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcg-cards-'));
    synthesizer = new CardSynthesizer();
    synthesize = vi.spyOn(synthesizer, 'synthesizeCard');
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('serves the pre-rendered builder PNG without re-rendering', async () => {
    fs.writeFileSync(path.join(dir, 'card-1.png'), Buffer.from('prerendered'));
    const service = new CardImageService({ cardsDir: dir, synthesizer });
    const png = await service.getCardImage(card('card-1'), asset());
    expect(png.toString()).toBe('prerendered');
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('renders from the DB row once and caches the PNG', async () => {
    const service = new CardImageService({ cardsDir: dir, synthesizer });
    const png = await service.getCardImage(card('card-2'), asset(), {
      attributionText: 'Art via Danbooru',
      maxCollectionNumber: 99,
    });
    expect(png[0]).toBe(0x89);
    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Frieren',
        animeTitle: "Frieren: Beyond Journey's End",
        rarity: 'SIR',
        stats: expect.objectContaining({ hp: 6000, attack: 900 }),
        skill: expect.objectContaining({ name: 'Radiant Nova', mpCost: 45 }),
        isSilhouette: false,
        collectionNumber: 7,
        maxCollectionNumber: 99,
        attributionText: 'Art via Danbooru',
      }),
    );
    expect(fs.readFileSync(path.join(dir, 'card-2.png')).equals(png)).toBe(true);

    await service.getCardImage(card('card-2'), asset());
    expect(synthesize).toHaveBeenCalledTimes(1);
  });

  it('uses the cached local artwork and remote URLs from the asset', async () => {
    const artPath = path.join(dir, 'art.png');
    fs.writeFileSync(artPath, createCanvas(60, 90).toBuffer('image/png'));
    const service = new CardImageService({ cardsDir: dir, synthesizer });
    await service.getCardImage(card('card-3'), asset({ localStoragePath: artPath }));
    expect(synthesize).toHaveBeenLastCalledWith(expect.objectContaining({ imagePath: artPath }));

    synthesize.mockResolvedValueOnce(Buffer.from('x'));
    await service.getCardImage(card('card-4'), asset({ discordCdnUrl: 'https://cdn/x.png' }));
    expect(synthesize).toHaveBeenLastCalledWith(
      expect.objectContaining({ imageUrl: 'https://cdn/x.png' }),
    );
  });

  it('renders a silhouette for taken-down art and deletes the cached render', async () => {
    const cached = path.join(dir, 'card-5.png');
    fs.writeFileSync(cached, Buffer.from('old art'));
    const service = new CardImageService({ cardsDir: dir, synthesizer });

    const png = await service.getCardImage(
      card('card-5'),
      asset({ isDeletedByRequest: true, localStoragePath: cached }),
    );
    expect(png.toString()).not.toBe('old art');
    expect(fs.existsSync(cached)).toBe(false);
    expect(synthesize).toHaveBeenCalledWith(expect.objectContaining({ isSilhouette: true }));
    expect(synthesize.mock.calls[0]![0]).not.toHaveProperty('imagePath');
  });

  it('never builds a file path from an unsafe card id', async () => {
    const service = new CardImageService({ cardsDir: dir, synthesizer });
    await service.getCardImage(card('../../escape'), asset());
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
