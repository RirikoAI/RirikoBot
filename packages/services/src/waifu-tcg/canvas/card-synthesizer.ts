import { createCanvas, loadImage, type SKRSContext2D, type Image } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import { resolveWorkspacePath } from '@ririko/core';
import type { CardElement, CardRarity } from '../types.js';

export interface CardStatsInput {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  critRate?: number;
  mp?: number;
}

export interface CardSkillInput {
  name: string;
  description: string;
  mpCost?: number;
}

export interface CardPassiveInput {
  name: string;
  description: string;
}

export interface SynthesizeCardInput {
  name: string;
  animeTitle?: string;
  element: CardElement;
  rarity: CardRarity;
  stats: CardStatsInput;
  skill?: CardSkillInput;
  passive?: CardPassiveInput;
  imageBuffer?: Buffer;
  imageUrl?: string;
  imagePath?: string;
  isSilhouette?: boolean;
  collectionNumber?: number;
  maxCollectionNumber?: number;
  serialNumber?: number;
  maxSerialNumber?: number;
  attributionText?: string;
  /** Multiplier for all card text sizes, clamped to 0.8–1.2. Layout adapts; default 1. */
  textScale?: number;
}

export interface CardSynthesizerOptions {
  assetsDir?: string;
  fetchFn?: typeof fetch;
}

export const CARD_WIDTH = 800;
export const CARD_HEIGHT = 1200;

export const ELEMENT_AURA_COLORS: Record<
  CardElement,
  { primary: string; secondary: string; glow: string }
> = {
  FIRE: { primary: '#ff4500', secondary: '#1c0702', glow: '#f97316' },
  ICE: { primary: '#00d2ff', secondary: '#001326', glow: '#38bdf8' },
  WATER: { primary: '#1e90ff', secondary: '#051329', glow: '#60a5fa' },
  EARTH: { primary: '#22c55e', secondary: '#08240f', glow: '#4ade80' },
  LIGHTNING: { primary: '#facc15', secondary: '#261d02', glow: '#fde047' },
  LIGHT: { primary: '#fef08a', secondary: '#1e293b', glow: '#ffffff' },
  SHADOW: { primary: '#a855f7', secondary: '#180826', glow: '#c084fc' },
};

export type FoilBlendMode =
  | 'source-over'
  | 'overlay'
  | 'color-dodge'
  | 'hard-light'
  | 'soft-light'
  | 'screen'
  | 'lighter'
  | 'color';

export const RARITY_FOIL_CONFIG: Record<
  CardRarity,
  {
    stars: number;
    blendMode: FoilBlendMode;
    foilAlpha: number;
    foilFile?: string;
    frameFile?: string;
    isPrismaticStar: boolean;
    isFullArt: boolean;
  }
> = {
  COMMON: {
    stars: 1,
    blendMode: 'source-over',
    foilAlpha: 0,
    frameFile: 'common.png',
    isPrismaticStar: false,
    isFullArt: false,
  },
  UNCOMMON: {
    stars: 2,
    blendMode: 'soft-light',
    foilAlpha: 0.35,
    frameFile: 'common.png',
    isPrismaticStar: false,
    isFullArt: false,
  },
  RARE: {
    stars: 3,
    blendMode: 'overlay',
    foilAlpha: 0.45,
    foilFile: 'rare.png',
    frameFile: 'rare.png',
    isPrismaticStar: false,
    isFullArt: false,
  },
  SUPER_RARE: {
    stars: 4,
    blendMode: 'color-dodge',
    foilAlpha: 0.55,
    foilFile: 'super_rare.png',
    frameFile: 'super_rare.png',
    isPrismaticStar: false,
    isFullArt: false,
  },
  ULTRA_RARE: {
    stars: 5,
    blendMode: 'hard-light',
    foilAlpha: 0.5,
    foilFile: 'ultra_rare.png',
    frameFile: 'ultra_rare.png',
    isPrismaticStar: true,
    isFullArt: false,
  },
  SECRET_RARE: {
    stars: 6,
    blendMode: 'color-dodge',
    foilAlpha: 0.6,
    foilFile: 'secret_rare.png',
    frameFile: 'ultra_rare.png',
    isPrismaticStar: true,
    isFullArt: false,
  },
  SIR: {
    stars: 7,
    blendMode: 'overlay',
    foilAlpha: 0.5,
    foilFile: 'sir.png',
    frameFile: 'mythic.png',
    isPrismaticStar: true,
    isFullArt: true,
  },
  MYTHIC: {
    stars: 8,
    blendMode: 'color-dodge',
    foilAlpha: 0.7,
    foilFile: 'mythic.png',
    frameFile: 'mythic.png',
    isPrismaticStar: true,
    isFullArt: true,
  },
};

// ─── LAYOUT ───────────────────────────────────────────────────────────────────
// Discord shows card images at roughly half size (~400 px wide), so body text is kept at
// 22 px or larger and headline text at 28 px or larger to stay readable at a glance.

const CONTENT_X = 32;
const CONTENT_W = CARD_WIDTH - CONTENT_X * 2;
const ART_Y = 132;
const FOOTER_Y = 790;
const FOOTER_BOTTOM = 1164;
const FONT_FAMILY = 'sans-serif';

export const TEXT_SCALE_MIN = 0.8;
export const TEXT_SCALE_MAX = 1.2;

export function clampTextScale(scale: number | undefined): number {
  if (scale === undefined || !Number.isFinite(scale)) return 1;
  return Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, scale));
}

function font(size: number, bold = false): string {
  return `${bold ? 'bold ' : ''}${Math.round(size)}px ${FONT_FAMILY}`;
}

function truncateText(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(truncated + '…').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated.trimEnd() + '…';
}

/** Shrinks a single line from `size` down to `minSize`, then truncates. Leaves ctx.font set. */
function fitLine(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  size: number,
  minSize: number,
  bold = false,
): { text: string; size: number } {
  let current = size;
  ctx.font = font(current, bold);
  while (current > minSize && ctx.measureText(text).width > maxWidth) {
    current -= 1;
    ctx.font = font(current, bold);
  }
  return { text: truncateText(ctx, text, maxWidth), size: current };
}

function wrapWords(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Wraps text into at most `maxLines`, shrinking from `size` to `minSize` before truncating
 * the last line. Leaves ctx.font set to the chosen size.
 */
export function fitWrappedText(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  size: number,
  minSize: number,
  bold = false,
): { lines: string[]; size: number } {
  let current = size;
  for (;;) {
    ctx.font = font(current, bold);
    const lines = wrapWords(ctx, text, maxWidth);
    if (lines.length <= maxLines) return { lines, size: current };
    if (current <= minSize) {
      const kept = lines.slice(0, maxLines);
      const rest = lines.slice(maxLines - 1).join(' ');
      kept[maxLines - 1] = truncateText(ctx, rest, maxWidth);
      return { lines: kept, size: current };
    }
    current -= 1;
  }
}

/** The MP badge already shows the cost, so drop a leading "Costs 35 MP." from the text. */
function stripMpPrefix(description: string): string {
  return description.replace(/^\s*costs\s+\d+\s*mp\.?\s*/i, '');
}

export class CardSynthesizer {
  private readonly assetsDir: string;
  private readonly fetch: typeof fetch;
  private readonly imageCache = new Map<string, Image>();

  constructor(options?: CardSynthesizerOptions) {
    this.assetsDir = options?.assetsDir ?? resolveWorkspacePath('assets/tcg');
    this.fetch = options?.fetchFn ?? globalThis.fetch;
  }

  /**
   * Main synthesis pipeline rendering an 800x1200 px physical-style TCG card.
   */
  async synthesizeCard(input: SynthesizeCardInput): Promise<Buffer> {
    const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
    const ctx = canvas.getContext('2d');

    const foilConfig = RARITY_FOIL_CONFIG[input.rarity] ?? RARITY_FOIL_CONFIG.COMMON;

    // 0. Base card clipping (24px radius)
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, 24);
    ctx.clip();

    // Layer 0: Elemental Aura & Base Canvas
    this.drawElementalAura(ctx, input.element);

    // Layer 1: Character Artwork
    await this.drawCharacterArtwork(ctx, input, foilConfig.isFullArt);

    // Layer 2: Glassmorphic Stat & Skill Footer
    this.drawFooter(ctx, input);

    // Layer 3: Card Frame & Metallic Borders
    await this.drawFrame(ctx, input.rarity, foilConfig.frameFile);

    // Layer 4: Holographic Foil Overlay
    await this.drawFoilOverlay(ctx, input.rarity, foilConfig);

    // Layer 5: Character Name Banner & Title Ribbon (Top)
    this.drawNameBanner(ctx, input);

    // Layer 6: Rarity Stars (Top-Right)
    await this.drawRarityStars(ctx, foilConfig.stars, foilConfig.isPrismaticStar);

    // Layer 7: Top-Left Element Emblem (24, 24)
    await this.drawElementEmblem(ctx, input.element);

    ctx.restore();

    return canvas.toBuffer('image/png');
  }

  // ─── LAYER 0: ELEMENTAL AURA ────────────────────────────────────────────────

  private drawElementalAura(ctx: SKRSContext2D, element: CardElement): void {
    const aura = ELEMENT_AURA_COLORS[element] ?? ELEMENT_AURA_COLORS.FIRE;

    // Solid dark base
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    // Radiant elemental aura in upper/middle region
    const grad = ctx.createRadialGradient(400, 480, 50, 400, 480, 600);
    grad.addColorStop(0, aura.primary);
    grad.addColorStop(0.5, aura.secondary);
    grad.addColorStop(1, '#090d16');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    // Subtle ambient glow ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(400, 480, 320, 0, Math.PI * 2);
    ctx.strokeStyle = aura.glow;
    ctx.lineWidth = 2;
    ctx.shadowColor = aura.glow;
    ctx.shadowBlur = 24;
    ctx.stroke();
    ctx.restore();
  }

  // ─── LAYER 1: CHARACTER ARTWORK ─────────────────────────────────────────────

  private async drawCharacterArtwork(
    ctx: SKRSContext2D,
    input: SynthesizeCardInput,
    isFullArt: boolean,
  ): Promise<void> {
    const art = await this.resolveCharacterImage(input);

    const x = isFullArt ? 0 : CONTENT_X;
    const y = isFullArt ? 0 : ART_Y;
    const w = isFullArt ? CARD_WIDTH : CONTENT_W;
    const h = isFullArt ? CARD_HEIGHT : FOOTER_Y - 8 - ART_Y;
    const radius = isFullArt ? 0 : 16;

    ctx.save();
    if (!isFullArt) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, radius);
      ctx.clip();
    }

    if (art && !input.isSilhouette) {
      // Cover fit preserving aspect ratio
      const imgW = art.width;
      const imgH = art.height;
      const scale = Math.max(w / imgW, h / imgH);
      const drawW = imgW * scale;
      const drawH = imgH * scale;
      const drawX = x + (w - drawW) / 2;
      // Anchor near the top: character portraits keep the face in the upper part.
      const drawY = y + (h - drawH) * 0.15;

      ctx.drawImage(art, drawX, drawY, drawW, drawH);
    } else {
      // Silhouette / Missing art fallback
      this.drawSilhouetteFallback(ctx, x, y, w, h, input.element);
    }

    // If full-art, add dark gradient on bottom half so footer text is crisp
    if (isFullArt) {
      const fadeTop = FOOTER_Y - 160;
      const bottomGrad = ctx.createLinearGradient(0, fadeTop, 0, CARD_HEIGHT);
      bottomGrad.addColorStop(0, 'rgba(9, 13, 22, 0)');
      bottomGrad.addColorStop(0.35, 'rgba(9, 13, 22, 0.7)');
      bottomGrad.addColorStop(1, 'rgba(9, 13, 22, 0.95)');
      ctx.fillStyle = bottomGrad;
      ctx.fillRect(0, fadeTop, CARD_WIDTH, CARD_HEIGHT - fadeTop);
    }

    ctx.restore();
  }

  private drawSilhouetteFallback(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    element: CardElement,
  ): void {
    const aura = ELEMENT_AURA_COLORS[element] ?? ELEMENT_AURA_COLORS.FIRE;

    // Dark backdrop
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x, y, w, h);

    // Elemental glow circle behind silhouette
    const glow = ctx.createRadialGradient(x + w / 2, y + h / 2, 40, x + w / 2, y + h / 2, 280);
    glow.addColorStop(0, aura.primary);
    glow.addColorStop(0.6, aura.secondary);
    glow.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x, y, w, h);

    // Stylized silhouette figure
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2 + 40);
    ctx.fillStyle = '#090d16';
    ctx.strokeStyle = aura.glow;
    ctx.lineWidth = 3;
    ctx.shadowColor = aura.glow;
    ctx.shadowBlur = 16;

    // Head
    ctx.beginPath();
    ctx.arc(0, -110, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Torso & shoulders
    ctx.beginPath();
    ctx.moveTo(-70, 70);
    ctx.lineTo(-40, -40);
    ctx.lineTo(40, -40);
    ctx.lineTo(70, 70);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // ─── LAYER 2: GLASSMORPHIC FOOTER ───────────────────────────────────────────

  private drawFooter(ctx: SKRSContext2D, input: SynthesizeCardInput): void {
    const s = clampTextScale(input.textScale);
    const x = CONTENT_X;
    const y = FOOTER_Y;
    const w = CONTENT_W;
    const h = FOOTER_BOTTOM - FOOTER_Y;
    const padX = 20;
    const innerW = w - padX * 2;
    const aura = ELEMENT_AURA_COLORS[input.element] ?? ELEMENT_AURA_COLORS.FIRE;

    ctx.save();

    // Container background
    const bgGrad = ctx.createLinearGradient(x, y, x, y + h);
    bgGrad.addColorStop(0, 'rgba(15, 23, 42, 0.9)');
    bgGrad.addColorStop(1, 'rgba(2, 6, 23, 0.97)');
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 16);
    ctx.fillStyle = bgGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // ── Stats row: small label on top, big value below, centered per box ──
    const statCols = [
      { label: 'HP', val: input.stats.hp, color: '#f87171' },
      { label: 'ATK', val: input.stats.attack, color: '#fb923c' },
      { label: 'DEF', val: input.stats.defense, color: '#60a5fa' },
      { label: 'SPD', val: input.stats.speed, color: '#4ade80' },
    ];
    const labelSize = 22 * s;
    const valueSize = 40 * s;
    const boxTop = y + 14;
    const boxH = labelSize + valueSize + 26;
    const gap = 10;
    const boxW = (innerW - gap * 3) / 4;
    ctx.textAlign = 'center';
    for (let i = 0; i < statCols.length; i++) {
      const col = statCols[i]!;
      const boxX = x + padX + i * (boxW + gap);
      ctx.fillStyle = 'rgba(30, 41, 59, 0.75)';
      ctx.beginPath();
      ctx.roundRect(boxX, boxTop, boxW, boxH, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const cx = boxX + boxW / 2;
      ctx.font = font(labelSize, true);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(col.label, cx, boxTop + 8 + labelSize);

      const value = fitLine(ctx, col.val.toLocaleString('en-US'), boxW - 12, valueSize, 22, true);
      ctx.fillStyle = col.color;
      ctx.fillText(value.text, cx, boxTop + boxH - 12);
    }
    ctx.textAlign = 'left';

    let cursor = boxTop + boxH + 14;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + padX, cursor);
    ctx.lineTo(x + w - padX, cursor);
    ctx.stroke();

    // ── Skill & passive blocks ──
    const skill = input.skill ?? {
      name: 'Elemental Strike',
      description: 'Deals 150% elemental damage.',
      mpCost: 35,
    };
    const passive = input.passive ?? {
      name: 'Inherent Affinity',
      description: '+10% elemental damage.',
    };

    const bottomBarY = FOOTER_BOTTOM - 16;
    const bottomDividerY = bottomBarY - 30;

    cursor = this.drawAbilityBlock(ctx, {
      top: cursor + 12,
      tag: 'SKILL',
      tagColor: aura.glow,
      tagFill: 'rgba(249, 115, 22, 0.2)',
      name: skill.name,
      nameSize: 32 * s,
      badge: `MP ${skill.mpCost ?? 35}`,
      description: stripMpPrefix(skill.description),
      descSize: 26 * s,
      descColor: '#e2e8f0',
      scale: s,
    });

    this.drawAbilityBlock(ctx, {
      top: cursor + 14,
      tag: 'PASSIVE',
      tagColor: '#a78bfa',
      tagFill: 'rgba(167, 139, 250, 0.2)',
      name: passive.name,
      nameSize: 30 * s,
      description: passive.description,
      descSize: 25 * s,
      descColor: '#cbd5e1',
      scale: s,
      maxBottom: bottomDividerY - 8,
    });

    // ── Bottom bar: collection number, rarity, attribution ──
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(x + padX, bottomDividerY);
    ctx.lineTo(x + w - padX, bottomDividerY);
    ctx.stroke();

    const collNum = String(input.collectionNumber ?? 1).padStart(4, '0');
    const maxColl = String(input.maxCollectionNumber ?? 350).padStart(4, '0');
    ctx.font = font(18 * s, true);
    ctx.fillStyle = '#fde047';
    const serial = `#${collNum}/${maxColl}`;
    ctx.fillText(serial, x + padX, bottomBarY);
    const serialW = ctx.measureText(serial).width;

    ctx.fillStyle = '#e2e8f0';
    const rarityLabel = input.rarity.replace(/_/g, ' ');
    ctx.fillText(rarityLabel, x + padX + serialW + 16, bottomBarY);
    const leftW = serialW + 16 + ctx.measureText(rarityLabel).width + 24;

    const attr = input.attributionText ?? 'Image source: waifu.im • Ririko TCG 2.0';
    ctx.font = font(15 * s);
    ctx.fillStyle = '#64748b';
    const attrText = truncateText(ctx, attr, innerW - leftW);
    ctx.textAlign = 'right';
    ctx.fillText(attrText, x + w - padX, bottomBarY);
    ctx.textAlign = 'left';

    ctx.restore();
  }

  /** Draws "[TAG] Name ....... [badge]" plus a wrapped description. Returns the block bottom. */
  private drawAbilityBlock(
    ctx: SKRSContext2D,
    block: {
      top: number;
      tag: string;
      tagColor: string;
      tagFill: string;
      name: string;
      nameSize: number;
      badge?: string;
      description: string;
      descSize: number;
      descColor: string;
      scale: number;
      maxBottom?: number;
    },
  ): number {
    const left = CONTENT_X + 20;
    const right = CONTENT_X + CONTENT_W - 20;
    const tagSize = 18 * block.scale;
    const pillH = Math.max(tagSize + 12, block.nameSize * 0.95);
    const headerMid = block.top + pillH / 2;

    // Tag pill
    ctx.font = font(tagSize, true);
    const tagW = ctx.measureText(block.tag).width + 20;
    ctx.fillStyle = block.tagFill;
    ctx.beginPath();
    ctx.roundRect(left, block.top, tagW, pillH, 6);
    ctx.fill();
    ctx.strokeStyle = block.tagColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = block.tagColor;
    ctx.textBaseline = 'middle';
    ctx.fillText(block.tag, left + 10, headerMid);

    // Badge (right aligned)
    let nameRight = right;
    if (block.badge) {
      ctx.font = font(22 * block.scale, true);
      const badgeW = ctx.measureText(block.badge).width + 20;
      const badgeX = right - badgeW;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
      ctx.beginPath();
      ctx.roundRect(badgeX, block.top, badgeW, pillH, 6);
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(block.badge, badgeX + 10, headerMid);
      nameRight = badgeX - 12;
    }

    // Name
    const nameX = left + tagW + 12;
    const name = fitLine(ctx, block.name, nameRight - nameX, block.nameSize, 22, true);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name.text, nameX, headerMid);
    ctx.textBaseline = 'alphabetic';

    // Description (up to 2 lines, shrinks before truncating)
    const lineGap = 1.28;
    let maxLines = 2;
    const descTop = block.top + pillH + 8;
    if (block.maxBottom !== undefined) {
      const fitting = Math.floor((block.maxBottom - descTop) / (block.descSize * lineGap));
      maxLines = Math.max(1, Math.min(maxLines, fitting));
    }
    const desc = fitWrappedText(ctx, block.description, right - left, maxLines, block.descSize, 18);
    const lineH = desc.size * lineGap;
    ctx.fillStyle = block.descColor;
    desc.lines.forEach((line, i) => {
      ctx.fillText(line, left, descTop + desc.size + i * lineH);
    });
    return descTop + desc.lines.length * lineH;
  }

  // ─── LAYER 3: CARD FRAME & METALLIC BORDERS ─────────────────────────────────

  private async drawFrame(
    ctx: SKRSContext2D,
    rarity: CardRarity,
    frameFile?: string,
  ): Promise<void> {
    if (frameFile) {
      const framePath = path.join(this.assetsDir, 'frames', frameFile);
      const img = await this.loadImageSafe(framePath);
      if (img) {
        ctx.drawImage(img, 0, 0, CARD_WIDTH, CARD_HEIGHT);
        return;
      }
    }

    // Procedural Metallic Border Fallback
    ctx.save();
    ctx.lineWidth = 18;
    const grad = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);

    switch (rarity) {
      case 'COMMON':
      case 'UNCOMMON':
        grad.addColorStop(0, '#64748b');
        grad.addColorStop(1, '#334155');
        break;
      case 'RARE':
        grad.addColorStop(0, '#f1f5f9');
        grad.addColorStop(0.5, '#94a3b8');
        grad.addColorStop(1, '#64748b');
        break;
      case 'SUPER_RARE':
        grad.addColorStop(0, '#fef08a');
        grad.addColorStop(0.5, '#fbbf24');
        grad.addColorStop(1, '#b45309');
        break;
      case 'ULTRA_RARE':
      case 'SECRET_RARE':
        grad.addColorStop(0, '#e9d5ff');
        grad.addColorStop(0.5, '#c084fc');
        grad.addColorStop(1, '#3b0764');
        break;
      case 'SIR':
      case 'MYTHIC':
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.3, '#fef08a');
        grad.addColorStop(0.7, '#ec4899');
        grad.addColorStop(1, '#8b5cf6');
        break;
    }

    ctx.strokeStyle = grad;
    ctx.strokeRect(9, 9, CARD_WIDTH - 18, CARD_HEIGHT - 18);

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.strokeRect(22, 22, CARD_WIDTH - 44, CARD_HEIGHT - 44);
    ctx.restore();
  }

  // ─── LAYER 4: HOLOGRAPHIC FOIL OVERLAY ──────────────────────────────────────

  private async drawFoilOverlay(
    ctx: SKRSContext2D,
    rarity: CardRarity,
    config: (typeof RARITY_FOIL_CONFIG)[CardRarity],
  ): Promise<void> {
    if (config.foilAlpha <= 0) return;

    ctx.save();
    ctx.globalCompositeOperation = config.blendMode;
    ctx.globalAlpha = config.foilAlpha;

    if (config.foilFile) {
      const foilPath = path.join(this.assetsDir, 'foils', config.foilFile);
      const img = await this.loadImageSafe(foilPath);
      if (img) {
        ctx.drawImage(img, 0, 0, CARD_WIDTH, CARD_HEIGHT);
        ctx.restore();
        return;
      }
    }

    // Procedural foil fallback
    this.drawProceduralFoil(ctx, rarity);
    ctx.restore();
  }

  private drawProceduralFoil(ctx: SKRSContext2D, rarity: CardRarity): void {
    if (rarity === 'RARE') {
      // Diagonal rainbow stripes
      ctx.save();
      ctx.translate(CARD_WIDTH / 2, CARD_HEIGHT / 2);
      ctx.rotate(-Math.PI / 4);
      const colors = [
        'rgba(239, 68, 68, 0.3)',
        'rgba(249, 115, 22, 0.3)',
        'rgba(234, 179, 8, 0.3)',
        'rgba(34, 197, 94, 0.3)',
        'rgba(59, 130, 246, 0.3)',
        'rgba(168, 85, 247, 0.3)',
      ];
      for (let y = -1200; y < 1200; y += 40) {
        ctx.fillStyle = colors[Math.abs(Math.floor(y / 40)) % colors.length]!;
        ctx.fillRect(-1200, y, 2400, 24);
      }
      ctx.restore();
    } else if (rarity === 'SUPER_RARE') {
      // Gold sparkles
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 150; i++) {
        const px = (i * 37) % CARD_WIDTH;
        const py = (i * 53) % CARD_HEIGHT;
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.shadowColor = '#facc15';
        ctx.shadowBlur = 6;
        ctx.fill();
      }
    } else if (rarity === 'ULTRA_RARE' || rarity === 'SECRET_RARE') {
      // Spectral rays
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 2;
      for (let x = -CARD_WIDTH; x < CARD_WIDTH * 2; x += 25) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 700, CARD_HEIGHT);
        ctx.stroke();
      }
    } else if (rarity === 'SIR' || rarity === 'MYTHIC') {
      // Cosmic celestial starlight
      const grad = ctx.createRadialGradient(400, 500, 50, 400, 600, 700);
      grad.addColorStop(0, 'rgba(253, 224, 71, 0.5)');
      grad.addColorStop(0.3, 'rgba(236, 72, 153, 0.45)');
      grad.addColorStop(0.7, 'rgba(99, 102, 241, 0.4)');
      grad.addColorStop(1, 'rgba(15, 23, 42, 0.2)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    }
  }

  // ─── LAYER 5: CHARACTER NAME BANNER (TOP) ───────────────────────────────────

  private drawNameBanner(ctx: SKRSContext2D, input: SynthesizeCardInput): void {
    const s = clampTextScale(input.textScale);
    const x = 132;
    const y = 24;
    const w = CARD_WIDTH - x - 32;
    const h = 100;
    const textW = w - 32;

    ctx.save();

    const bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, 'rgba(15, 23, 42, 0.92)');
    bg.addColorStop(1, 'rgba(2, 6, 23, 0.96)');
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 14);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Character name
    const name = fitLine(ctx, input.name, textW, 44 * s, 30, true);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 8;
    ctx.fillText(name.text, x + 16, y + 52);

    // Anime title
    ctx.shadowBlur = 0;
    const anime = fitLine(ctx, input.animeTitle ?? 'Waifu Collection', textW, 24 * s, 18);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(anime.text, x + 16, y + 86);

    ctx.restore();
  }

  // ─── LAYER 6: RARITY STARS (ABOVE THE FOOTER, CENTERED) ─────────────────────

  private async drawRarityStars(
    ctx: SKRSContext2D,
    starCount: number,
    isPrismatic: boolean,
  ): Promise<void> {
    const starFile = isPrismatic ? 'star_prismatic.png' : 'star.png';
    const starPath = path.join(this.assetsDir, 'stars', starFile);
    const starImg = await this.loadImageSafe(starPath);

    const starSize = 34;
    const gap = 6;
    const rowW = starCount * starSize + (starCount - 1) * gap;
    const startX = (CARD_WIDTH - rowW) / 2;
    const y = FOOTER_Y - starSize - 18;

    ctx.save();
    // Backing pill keeps stars visible over bright art
    ctx.fillStyle = 'rgba(2, 6, 23, 0.6)';
    ctx.beginPath();
    ctx.roundRect(startX - 14, y - 7, rowW + 28, starSize + 14, (starSize + 14) / 2);
    ctx.fill();

    for (let i = 0; i < starCount; i++) {
      const sx = startX + i * (starSize + gap);
      if (starImg) {
        ctx.drawImage(starImg, sx, y, starSize, starSize);
      } else {
        this.draw5PointStar(
          ctx,
          sx + starSize / 2,
          y + starSize / 2,
          starSize / 2,
          starSize / 4.5,
          isPrismatic,
        );
      }
    }
    ctx.restore();
  }

  private draw5PointStar(
    ctx: SKRSContext2D,
    cx: number,
    cy: number,
    rOut: number,
    rIn: number,
    isPrismatic: boolean,
  ): void {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI) / 5 - Math.PI / 2;
      const r = i % 2 === 0 ? rOut : rIn;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    if (isPrismatic) {
      const grad = ctx.createLinearGradient(cx - rOut, cy - rOut, cx + rOut, cy + rOut);
      grad.addColorStop(0, '#38bdf8');
      grad.addColorStop(0.5, '#fde047');
      grad.addColorStop(1, '#c084fc');
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = '#facc15';
    }

    ctx.shadowColor = '#eab308';
    ctx.shadowBlur = 6;
    ctx.fill();
  }

  // ─── LAYER 7: TOP-LEFT ELEMENT EMBLEM ───────────────────────────────────────

  private async drawElementEmblem(ctx: SKRSContext2D, element: CardElement): Promise<void> {
    const x = 24;
    const y = 24;
    const size = 96;

    const elFile = `${element.toLowerCase()}.png`;
    const elPath = path.join(this.assetsDir, 'elements', elFile);
    const elImg = await this.loadImageSafe(elPath);

    ctx.save();
    if (elImg) {
      // Glow behind emblem
      const aura = ELEMENT_AURA_COLORS[element] ?? ELEMENT_AURA_COLORS.FIRE;
      ctx.shadowColor = aura.glow;
      ctx.shadowBlur = 18;
      ctx.drawImage(elImg, x, y, size, size);
    } else {
      // Procedural emblem fallback
      const aura = ELEMENT_AURA_COLORS[element] ?? ELEMENT_AURA_COLORS.FIRE;
      const cx = x + size / 2;
      const cy = y + size / 2;
      const r = size / 2 - 4;

      const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
      grad.addColorStop(0, aura.primary);
      grad.addColorStop(1, aura.secondary);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.shadowColor = aura.glow;
      ctx.shadowBlur = 16;
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.font = 'bold 20px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 0;
      const char = element.charAt(0);
      const w = ctx.measureText(char).width;
      ctx.fillText(char, cx - w / 2, cy + 7);
    }
    ctx.restore();
  }

  // ─── ASSET & IMAGE RESOLUTION HELPERS ───────────────────────────────────────

  private async resolveCharacterImage(input: SynthesizeCardInput): Promise<Image | null> {
    if (input.imageBuffer) {
      try {
        return await loadImage(input.imageBuffer);
      } catch {
        return null;
      }
    }

    if (input.imagePath) {
      return await this.loadImageSafe(input.imagePath);
    }

    if (input.imageUrl) {
      try {
        const cached = this.imageCache.get(input.imageUrl);
        if (cached) return cached;

        const res = await this.fetch(input.imageUrl);
        if (!res.ok) return null;
        const arrayBuf = await res.arrayBuffer();
        const img = await loadImage(Buffer.from(arrayBuf));
        this.imageCache.set(input.imageUrl, img);
        return img;
      } catch {
        return null;
      }
    }

    return null;
  }

  private async loadImageSafe(filePath: string): Promise<Image | null> {
    try {
      if (!fs.existsSync(filePath)) return null;
      const cached = this.imageCache.get(filePath);
      if (cached) return cached;
      const img = await loadImage(filePath);
      this.imageCache.set(filePath, img);
      return img;
    } catch {
      return null;
    }
  }
}

/**
 * Top-level convenience export to synthesize a card buffer directly.
 */
export async function synthesizeCardImage(
  input: SynthesizeCardInput,
  options?: CardSynthesizerOptions,
): Promise<Buffer> {
  const synth = new CardSynthesizer(options);
  return synth.synthesizeCard(input);
}
