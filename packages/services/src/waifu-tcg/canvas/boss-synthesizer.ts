import { createCanvas, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import { resolveWorkspacePath } from '@ririko/core';
import type { CardElement } from '../types.js';
import { ELEMENT_AURA_COLORS } from './card-synthesizer.js';

export const BOSS_IMAGE_WIDTH = 720;
export const BOSS_IMAGE_HEIGHT = 960;

/** Repo-relative folder for rendered boss images: `<dir>/<seasonId>/<key>.png` (gitignored). */
export const RENDERED_BOSSES_DIR = 'public/bosses';

const TIER_LABELS: Record<string, string> = {
  STANDARD: 'Floor Guardian',
  MINI_BOSS: 'Mini-Boss',
  MAJOR_BOSS: 'Major Boss',
};

export interface BossImageInput {
  name: string;
  animeTitle: string;
  element: CardElement;
  tier: string;
  title?: string | undefined;
  /** e.g. "Floor 10" or "Floors 1, 7, 13". */
  floorLabel?: string | undefined;
  imagePath?: string | undefined;
  imageBuffer?: Buffer | undefined;
  credit?: string | undefined;
}

function font(size: number, bold = false): string {
  return `${bold ? 'bold ' : ''}${Math.round(size)}px sans-serif`;
}

function fitText(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  size: number,
  minSize: number,
  bold: boolean,
): void {
  let current = size;
  ctx.font = font(current, bold);
  while (current > minSize && ctx.measureText(text).width > maxWidth) {
    current -= 1;
    ctx.font = font(current, bold);
  }
}

/**
 * Renders a plain boss portrait: full-bleed artwork, element icon top-left, and the boss's
 * name, title and anime on a dark fade at the bottom. No rarity frame or foil.
 */
export class BossSynthesizer {
  private readonly assetsDir: string;

  constructor(options: { assetsDir?: string } = {}) {
    this.assetsDir = options.assetsDir ?? resolveWorkspacePath('assets/tcg');
  }

  async render(input: BossImageInput): Promise<Buffer> {
    const W = BOSS_IMAGE_WIDTH;
    const H = BOSS_IMAGE_HEIGHT;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const aura = ELEMENT_AURA_COLORS[input.element] ?? ELEMENT_AURA_COLORS.FIRE;

    // Background (visible only when art is missing or letterboxed)
    const bg = ctx.createRadialGradient(W / 2, H * 0.4, 40, W / 2, H * 0.4, H * 0.8);
    bg.addColorStop(0, aura.primary);
    bg.addColorStop(1, '#090d16');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Artwork, cover-fit and anchored near the top so faces stay in frame
    const art = await this.loadArt(input);
    if (art) {
      const scale = Math.max(W / art.width, H / art.height);
      const drawW = art.width * scale;
      const drawH = art.height * scale;
      ctx.drawImage(art, (W - drawW) / 2, (H - drawH) * 0.15, drawW, drawH);
    }

    // Bottom fade for text
    const fadeTop = H * 0.62;
    const fade = ctx.createLinearGradient(0, fadeTop, 0, H);
    fade.addColorStop(0, 'rgba(9, 13, 22, 0)');
    fade.addColorStop(0.45, 'rgba(9, 13, 22, 0.78)');
    fade.addColorStop(1, 'rgba(9, 13, 22, 0.96)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, fadeTop, W, H - fadeTop);

    await this.drawElementIcon(ctx, input.element, aura.glow);

    // Text block
    const left = 36;
    const maxWidth = W - left * 2;
    let y = H - 36;

    ctx.textBaseline = 'alphabetic';
    if (input.credit) {
      ctx.font = font(14);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.fillText(input.credit, left, y);
      y -= 26;
    }

    fitText(ctx, input.animeTitle, maxWidth, 24, 16, false);
    ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
    ctx.fillText(input.animeTitle, left, y);
    y -= 44;

    fitText(ctx, input.name, maxWidth, 54, 30, true);
    ctx.shadowColor = aura.glow;
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(input.name, left, y);
    ctx.shadowBlur = 0;
    y -= 50;

    if (input.title) {
      fitText(ctx, input.title, maxWidth, 24, 16, false);
      ctx.fillStyle = aura.glow;
      ctx.fillText(input.title, left, y);
      y -= 36;
    }

    const badge = [TIER_LABELS[input.tier] ?? input.tier, input.floorLabel]
      .filter(Boolean)
      .join(' · ');
    ctx.font = font(18, true);
    const badgeWidth = ctx.measureText(badge).width + 28;
    ctx.fillStyle = 'rgba(9, 13, 22, 0.75)';
    ctx.beginPath();
    ctx.roundRect(left, y - 26, badgeWidth, 36, 18);
    ctx.fill();
    ctx.strokeStyle = aura.glow;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(badge, left + 14, y);

    return canvas.toBuffer('image/png');
  }

  private async loadArt(input: BossImageInput): Promise<Image | null> {
    try {
      if (input.imageBuffer) return await loadImage(input.imageBuffer);
      if (input.imagePath && fs.existsSync(input.imagePath))
        return await loadImage(input.imagePath);
    } catch {
      // Unreadable art falls back to the element background.
    }
    return null;
  }

  private async drawElementIcon(
    ctx: SKRSContext2D,
    element: CardElement,
    glow: string,
  ): Promise<void> {
    const iconPath = path.join(this.assetsDir, 'elements', `${element.toLowerCase()}.png`);
    const size = 88;
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = 18;
    if (fs.existsSync(iconPath)) {
      ctx.drawImage(await loadImage(iconPath), 24, 24, size, size);
    } else {
      ctx.beginPath();
      ctx.arc(24 + size / 2, 24 + size / 2, size / 2 - 4, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();
      ctx.font = font(18, true);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(element.slice(0, 2), 24 + size / 2, 24 + size / 2 + 6);
    }
    ctx.restore();
  }
}
