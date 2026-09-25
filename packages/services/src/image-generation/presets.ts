import type { ImageStylePreset } from './types.js';

export const IMAGE_STYLE_PRESETS: Record<string, ImageStylePreset> = {
  anime: {
    name: 'anime',
    label: 'Anime Illustration',
    description:
      'High quality anime style with detailed character art and expressive lighting (Default)',
    positivePrefix:
      'high quality anime illustration, detailed character design, beautiful composition, clean line art, expressive eyes, cinematic lighting, detailed background',
    negativePreset:
      'low quality, blurry, distorted anatomy, bad hands, missing fingers, cropped, watermark',
  },
  photoreal: {
    name: 'photoreal',
    label: 'Photorealistic',
    description: '8K UHD realistic photography with natural lighting and sharp focus',
    positivePrefix:
      'photorealistic, 8k uhd, highly detailed, professional photography, natural lighting, sharp focus',
    negativePreset: 'drawing, painting, illustration, cartoon, low quality, blurry, bad anatomy',
  },
  'pixel-art': {
    name: 'pixel-art',
    label: 'Pixel Art',
    description: 'Crisp 16-bit retro pixel sprite aesthetic with vibrant palette',
    positivePrefix:
      '16-bit pixel art, detailed pixel sprite, vibrant retro color palette, crisp pixels, game asset',
    negativePreset: 'blurry, 3d render, photorealistic, vector, anti-aliased, smoothing',
  },
  fantasy: {
    name: 'fantasy',
    label: 'Epic Fantasy',
    description: 'Painterly fantasy art with mystical luminescence and majestic atmosphere',
    positivePrefix:
      'epic fantasy digital painting, mystical atmosphere, magical luminescence, intricate details, masterwork',
    negativePreset: 'lowres, modern artifacts, watermark, deformed, ugly, flat colors',
  },
  cyberpunk: {
    name: 'cyberpunk',
    label: 'Cyberpunk & Sci-Fi',
    description: 'Futuristic neon cityscape with rain reflections and high-tech flair',
    positivePrefix:
      'cyberpunk aesthetic, glowing neon lights, futuristic cityscape, volumetric fog, cinematic reflections, high tech',
    negativePreset: 'low quality, vintage, sepia, dull colors, blurry, rustic',
  },
  none: {
    name: 'none',
    label: 'Raw Prompt',
    description: 'Executes pure prompt without automated aesthetic prefix or negative additions',
    positivePrefix: '',
    negativePreset: undefined,
  },
};

export const DEFAULT_PRESET_NAME = 'anime';

/**
 * Combines user prompt and negative prompt with the selected style preset.
 */
export function applyStylePreset(
  prompt: string,
  negativePrompt?: string | undefined,
  presetName = DEFAULT_PRESET_NAME,
): { prompt: string; negativePrompt?: string | undefined; presetUsed: string } {
  const normalizedKey = presetName.toLowerCase().trim();
  const preset = IMAGE_STYLE_PRESETS[normalizedKey] ?? IMAGE_STYLE_PRESETS[DEFAULT_PRESET_NAME]!;

  const finalPrompt = preset.positivePrefix
    ? `${preset.positivePrefix}, ${prompt.trim()}`
    : prompt.trim();

  let finalNegative = negativePrompt?.trim() || undefined;
  if (preset.negativePreset) {
    if (finalNegative) {
      finalNegative = `${preset.negativePreset}, ${finalNegative}`;
    } else {
      finalNegative = preset.negativePreset;
    }
  }

  return {
    prompt: finalPrompt,
    negativePrompt: finalNegative,
    presetUsed: preset.name,
  };
}
