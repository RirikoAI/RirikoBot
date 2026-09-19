import fs from 'node:fs';
import path from 'node:path';
import { resolveWorkspacePath } from '@ririko/core';
import type { WaifuAsset, WaifuCard } from '@ririko/database';
import { ELEMENTAL_SKILLS } from '../card/card-generator.js';
import type { CardElement, CardRarity } from '../types.js';
import { CardSynthesizer } from './card-synthesizer.js';

/** Repo-relative folder where `pnpm tcg:card-builder` writes `<cardId>.png`. */
export const RENDERED_CARDS_DIR = 'public/cards';

const SAFE_CARD_ID = /^[A-Za-z0-9_-]+$/;

export interface CardImageOptions {
  attributionText?: string;
  maxCollectionNumber?: number;
}

/**
 * Supplies the full rendered card PNG for a card definition.
 * - Uses the builder's pre-rendered `public/cards/<cardId>.png` when present.
 * - Otherwise renders once from the DB row and asset image, and caches the result there.
 * - A taken-down asset (isDeletedByRequest) always renders as a silhouette, and any cached
 *   render that still shows the removed art is deleted.
 */
export class CardImageService {
  private readonly cardsDir: string;
  private readonly synthesizer: CardSynthesizer;

  constructor(options: { cardsDir?: string; synthesizer?: CardSynthesizer } = {}) {
    this.cardsDir = options.cardsDir ?? resolveWorkspacePath(RENDERED_CARDS_DIR);
    this.synthesizer = options.synthesizer ?? new CardSynthesizer();
  }

  async getCardImage(
    card: WaifuCard,
    asset: WaifuAsset | null,
    options: CardImageOptions = {},
  ): Promise<Buffer> {
    // Never build a file path from an id that could escape the cards folder.
    const cachePath = SAFE_CARD_ID.test(card.id)
      ? path.join(this.cardsDir, `${card.id}.png`)
      : null;

    if (asset?.isDeletedByRequest) {
      if (cachePath) fs.rmSync(cachePath, { force: true });
      return this.render(card, null, options, true);
    }

    if (cachePath && fs.existsSync(cachePath)) return fs.readFileSync(cachePath);

    const png = await this.render(card, asset, options, false);
    if (cachePath) {
      fs.mkdirSync(this.cardsDir, { recursive: true });
      fs.writeFileSync(cachePath, png);
    }
    return png;
  }

  private render(
    card: WaifuCard,
    asset: WaifuAsset | null,
    options: CardImageOptions,
    isSilhouette: boolean,
  ): Promise<Buffer> {
    const element = card.element as CardElement;
    const defaults = ELEMENTAL_SKILLS[element]?.skill;
    return this.synthesizer.synthesizeCard({
      name: card.name,
      ...(asset ? { animeTitle: asset.animeTitle } : {}),
      element,
      rarity: card.rarity as CardRarity,
      stats: {
        hp: card.health,
        attack: card.attack,
        defense: card.defense,
        speed: card.speed,
        critRate: card.critRate,
      },
      ...(card.skillName
        ? {
            skill: {
              name: card.skillName,
              description: card.skillDescription ?? '',
              ...(defaults && defaults.name === card.skillName ? { mpCost: defaults.mpCost } : {}),
            },
          }
        : {}),
      ...(card.passiveName
        ? { passive: { name: card.passiveName, description: card.passiveDescription ?? '' } }
        : {}),
      ...this.imageSource(asset),
      isSilhouette,
      collectionNumber: card.collectionNumber,
      ...(options.maxCollectionNumber !== undefined
        ? { maxCollectionNumber: options.maxCollectionNumber }
        : {}),
      ...(options.attributionText !== undefined
        ? { attributionText: options.attributionText }
        : {}),
    });
  }

  private imageSource(asset: WaifuAsset | null): { imagePath?: string; imageUrl?: string } {
    if (!asset) return {};
    for (const candidate of [asset.discordCdnUrl, asset.localStoragePath]) {
      if (!candidate) continue;
      if (/^https?:\/\//.test(candidate)) return { imageUrl: candidate };
      const local = resolveWorkspacePath(candidate.replace(/^\/+/, ''));
      if (fs.existsSync(local)) return { imagePath: local };
    }
    return {};
  }
}
