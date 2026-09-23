import path from 'node:path';
import fs from 'node:fs';
import { createCanvas, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import { resolveWorkspacePath, NotFoundError, ValidationError } from '@ririko/core';
import {
  type MemeTemplateConfig,
  type MemeTextBox,
  getMemeTemplate,
  MEME_TEMPLATES,
} from './memes.catalog.js';

export interface MemeSynthesizerOptions {
  /** Root directory where meme template images are stored. */
  assetsDir?: string | undefined;
}

export interface MemeRenderResult {
  buffer: Buffer;
  template: MemeTemplateConfig;
  mimeType: 'image/png';
}

/**
 * Fits text within a maximum width and line count by wrapping words and dynamically scaling font size.
 */
export function fitMemeText(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  maxLines = 4,
  preferredSize = 38,
  minSize = 16,
): { lines: string[]; fontSize: number } {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return { lines: [], fontSize: preferredSize };
  }

  let size = preferredSize;
  while (size > minSize) {
    ctx.font = `bold ${size}px Impact, "Arial Black", sans-serif`;
    const lines: string[] = [];
    let currentLine = '';
    let overflow = false;

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        currentLine = candidate;
      } else {
        // If an individual word exceeds the box width by itself, step down font size
        if (!currentLine && ctx.measureText(word).width > maxWidth) {
          overflow = true;
          break;
        }
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        }
        if (lines.length >= maxLines) {
          overflow = true;
          break;
        }
      }
    }

    if (!overflow) {
      if (currentLine) lines.push(currentLine);
      if (lines.length <= maxLines) {
        return { lines, fontSize: size };
      }
    }

    size -= 2;
  }

  // Fallback at minSize: wrap and truncate if necessary
  ctx.font = `bold ${minSize}px Impact, "Arial Black", sans-serif`;
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      currentLine = candidate;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
      if (lines.length >= maxLines - 1) {
        break;
      }
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  return { lines, fontSize: minSize };
}

/**
 * Production-grade meme synthesizer powered by @napi-rs/canvas.
 * Renders dynamic captions onto 11 legacy template backgrounds with auto-wrapping,
 * font scaling, drop shadows, and high-contrast stroke outlines.
 */
export class MemeSynthesizer {
  private readonly assetsDir: string;
  private readonly imageCache = new Map<string, Image>();

  constructor(options: MemeSynthesizerOptions = {}) {
    this.assetsDir = options.assetsDir ?? resolveWorkspacePath('assets/memes');
  }

  /**
   * Loads and caches a template background image from disk.
   */
  public async loadTemplateImage(fileName: string): Promise<Image> {
    const cached = this.imageCache.get(fileName);
    if (cached) return cached;

    const fullPath = path.isAbsolute(fileName) ? fileName : path.join(this.assetsDir, fileName);
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundError(`Meme template background image not found: ${fullPath}`);
    }

    const image = await loadImage(fullPath);
    this.imageCache.set(fileName, image);
    return image;
  }

  /**
   * Generates a synthesized meme PNG buffer from a template ID/config and an array of text strings.
   *
   * @param templateNameOrConfig Name, ID, alias, or MemeTemplateConfig object.
   * @param texts Ordered array of text strings corresponding to template text boxes.
   */
  public async generateMeme(
    templateNameOrConfig: string | MemeTemplateConfig,
    texts: (string | undefined)[],
  ): Promise<MemeRenderResult> {
    const template =
      typeof templateNameOrConfig === 'string'
        ? getMemeTemplate(templateNameOrConfig)
        : templateNameOrConfig;

    if (!template) {
      throw new NotFoundError(
        `Unknown meme template "${String(templateNameOrConfig)}". Available templates: ${Object.keys(
          MEME_TEMPLATES,
        ).join(', ')}`,
      );
    }

    const cleanedTexts = texts.map((t) => (t ? t.trim() : ''));
    const hasAnyText = cleanedTexts.some((t) => t.length > 0);
    if (!hasAnyText) {
      throw new ValidationError(`At least one non-empty text string must be provided for meme template "${template.id}".`);
    }

    const bgImage = await this.loadTemplateImage(template.fileName);
    const canvas = createCanvas(bgImage.width, bgImage.height);
    const ctx = canvas.getContext('2d');

    // 1. Draw base background template
    ctx.drawImage(bgImage, 0, 0, bgImage.width, bgImage.height);

    // 2. Render each configured text box
    template.textBoxes.forEach((box, index) => {
      const text = cleanedTexts[index];
      if (!text) return;

      this.drawTextBox(ctx, text, box);
    });

    const buffer = canvas.toBuffer('image/png');
    return {
      buffer,
      template,
      mimeType: 'image/png',
    };
  }

  /**
   * Renders a styled, wrapped caption into a specific text box on the canvas.
   */
  private drawTextBox(ctx: SKRSContext2D, text: string, box: MemeTextBox): void {
    const maxLines = box.maxLines ?? 4;
    const preferredSize = box.fontSize ?? 38;
    const { lines, fontSize } = fitMemeText(ctx, text, box.width, maxLines, preferredSize);

    if (lines.length === 0) return;

    ctx.font = `bold ${fontSize}px Impact, "Arial Black", sans-serif`;
    ctx.textAlign = box.align ?? 'center';
    ctx.textBaseline = 'top';

    const strokeWidth = Math.max(3, Math.round(fontSize * 0.09));
    const lineHeight = Math.round(fontSize * 1.18);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const y = box.y + i * lineHeight;

      // Draw drop shadow and heavy stroke outline for legibility
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 3;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = strokeWidth;
      ctx.lineJoin = 'round';
      ctx.strokeText(line, box.x, y);
      ctx.restore();

      // Draw white crisp text fill
      ctx.fillStyle = '#ffffff';
      ctx.fillText(line, box.x, y);
    }
  }

  /**
   * Clears in-memory image cache (e.g. for testing or hot-reload).
   */
  public clearCache(): void {
    this.imageCache.clear();
  }
}
