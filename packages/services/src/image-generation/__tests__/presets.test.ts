import { describe, it, expect } from 'vitest';
import { applyStylePreset, IMAGE_STYLE_PRESETS, DEFAULT_PRESET_NAME } from '../presets.js';

describe('ImageStylePresets (TASK-1321)', () => {
  it('applies default anime preset when none is provided', () => {
    const result = applyStylePreset('silver haired shrine maiden');
    expect(result.presetUsed).toBe('anime');
    expect(result.prompt).toContain(IMAGE_STYLE_PRESETS[DEFAULT_PRESET_NAME]!.positivePrefix);
    expect(result.prompt).toContain('silver haired shrine maiden');
    expect(result.negativePrompt).toContain(IMAGE_STYLE_PRESETS[DEFAULT_PRESET_NAME]!.negativePreset!);
  });

  it('appends user negative prompt to preset negative prompt', () => {
    const result = applyStylePreset('cyberpunk runner', 'modern cars', 'anime');
    expect(result.negativePrompt).toContain('low quality');
    expect(result.negativePrompt).toContain('modern cars');
  });

  it('supports raw "none" preset without modifying prompt', () => {
    const result = applyStylePreset('simple geometric shapes', 'blue color', 'none');
    expect(result.presetUsed).toBe('none');
    expect(result.prompt).toBe('simple geometric shapes');
    expect(result.negativePrompt).toBe('blue color');
  });

  it('supports photoreal and cyberpunk presets', () => {
    const photo = applyStylePreset('mountain lake at sunrise', undefined, 'photoreal');
    expect(photo.presetUsed).toBe('photoreal');
    expect(photo.prompt).toContain('photorealistic');

    const cyber = applyStylePreset('night market in Neo Tokyo', undefined, 'cyberpunk');
    expect(cyber.presetUsed).toBe('cyberpunk');
    expect(cyber.prompt).toContain('neon lights');
  });

  it('gracefully falls back to default preset for unknown preset key', () => {
    const fallback = applyStylePreset('fantasy castle', undefined, 'non-existent-preset');
    expect(fallback.presetUsed).toBe('anime');
  });
});
