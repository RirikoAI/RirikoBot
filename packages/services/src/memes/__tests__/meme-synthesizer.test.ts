import { describe, it, expect, beforeEach } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import {
  MemeSynthesizer,
  fitMemeText,
  getMemeTemplate,
  searchMemeTemplates,
  MEME_TEMPLATES,
  MEME_TEMPLATE_NAMES,
} from '../index.js';
import { NotFoundError, ValidationError } from '@ririko/core';

describe('Meme Catalog', () => {
  it('should register exactly 11 legacy meme templates', () => {
    expect(MEME_TEMPLATE_NAMES).toHaveLength(11);
    expect(Object.keys(MEME_TEMPLATES)).toEqual([
      '0days',
      'allmyhomies',
      'always-been',
      'american-chopper',
      'chad',
      'everywhere',
      'getting-paid',
      'got-any-more',
      'train-bus',
      'undertaker',
      'woman-yelling-at-cat',
    ]);
  });

  it('should resolve templates by canonical id and legacy aliases', () => {
    expect(getMemeTemplate('0days')?.id).toBe('0days');
    expect(getMemeTemplate('zerodays')?.id).toBe('0days');
    expect(getMemeTemplate('always-been')?.id).toBe('always-been');
    expect(getMemeTemplate('alwaysbeen')?.id).toBe('always-been');
    expect(getMemeTemplate('american-chopper')?.id).toBe('american-chopper');
    expect(getMemeTemplate('chopper')?.id).toBe('american-chopper');
    expect(getMemeTemplate('chad')?.id).toBe('chad');
    expect(getMemeTemplate('gigachad')?.id).toBe('chad');
    expect(getMemeTemplate('non-existent')).toBeUndefined();
  });

  it('should search templates for autocomplete', () => {
    const all = searchMemeTemplates('', 25);
    expect(all).toHaveLength(11);

    const chopper = searchMemeTemplates('chopper', 5);
    expect(chopper.length).toBeGreaterThanOrEqual(1);
    expect(chopper[0]?.id).toBe('american-chopper');

    const cat = searchMemeTemplates('cat', 5);
    expect(cat.length).toBeGreaterThanOrEqual(1);
    expect(cat[0]?.id).toBe('woman-yelling-at-cat');
  });
});

describe('fitMemeText', () => {
  const canvas = createCanvas(800, 600);
  const ctx = canvas.getContext('2d');

  it('should return empty lines for empty text', () => {
    const res = fitMemeText(ctx, '', 300);
    expect(res.lines).toEqual([]);
    expect(res.fontSize).toBe(38);
  });

  it('should keep single line text at preferred font size', () => {
    const res = fitMemeText(ctx, 'Short meme', 500, 4, 38);
    expect(res.lines).toEqual(['Short meme']);
    expect(res.fontSize).toBe(38);
  });

  it('should wrap long text into multiple lines', () => {
    const res = fitMemeText(ctx, 'This is a longer line of text that needs wrapping', 200, 4, 30);
    expect(res.lines.length).toBeGreaterThan(1);
    expect(res.lines.length).toBeLessThanOrEqual(4);
  });

  it('should scale down font size when text is too long for box', () => {
    const longText =
      'Supercalifragilisticexpialidocious text that repeats many many times across the entire meme box area';
    const res = fitMemeText(ctx, longText, 250, 3, 38, 16);
    expect(res.fontSize).toBeLessThan(38);
    expect(res.lines.length).toBeLessThanOrEqual(3);
  });
});

describe('MemeSynthesizer', () => {
  let synthesizer: MemeSynthesizer;

  beforeEach(() => {
    synthesizer = new MemeSynthesizer();
    synthesizer.clearCache();
  });

  it('should synthesize a meme PNG buffer for 0days', async () => {
    const result = await synthesizer.generateMeme('0days', ['Accident free', 'Until Fariz arrived']);
    expect(result.mimeType).toBe('image/png');
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(1000);
    expect(result.template.id).toBe('0days');
  });

  it('should synthesize all 11 legacy templates successfully', async () => {
    const templates = Object.values(MEME_TEMPLATES);
    for (const t of templates) {
      const sampleTexts = t.textBoxes.map((_, i) => `Line ${i + 1}`);
      const res = await synthesizer.generateMeme(t.id, sampleTexts);
      expect(res.buffer).toBeInstanceOf(Buffer);
      expect(res.buffer.length).toBeGreaterThan(1000);
      expect(res.template.id).toBe(t.id);
    }
  });

  it('should reuse cached background images', async () => {
    const res1 = await synthesizer.generateMeme('everywhere', ['Bugs', 'Bugs everywhere']);
    const res2 = await synthesizer.generateMeme('everywhere', ['Tests', 'Tests everywhere']);
    expect(res1.buffer.length).toBeGreaterThan(1000);
    expect(res2.buffer.length).toBeGreaterThan(1000);
  });

  it('should throw NotFoundError for unknown template', async () => {
    await expect(synthesizer.generateMeme('unknown_meme_xyz', ['Test'])).rejects.toThrow(NotFoundError);
  });

  it('should throw ValidationError when all texts are empty', async () => {
    await expect(synthesizer.generateMeme('0days', ['', '   '])).rejects.toThrow(ValidationError);
  });

  it('should throw NotFoundError when background file is missing', async () => {
    const badSynth = new MemeSynthesizer({ assetsDir: 'non_existent_folder_xyz' });
    await expect(badSynth.generateMeme('0days', ['Hello'])).rejects.toThrow(NotFoundError);
  });
});
