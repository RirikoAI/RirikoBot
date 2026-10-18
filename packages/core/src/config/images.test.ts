import { describe, expect, it } from 'vitest';
import { configuredImageProviders, imageDailyLimit } from './images.js';
import { GuildConfigSchemas } from './guild-config.js';

describe('image settings (TASK-1163)', () => {
  it('never lets a guild raise the bot quota', () => {
    expect(imageDailyLimit(30, null)).toBe(30);
    expect(imageDailyLimit(30, 10)).toBe(10);
    expect(imageDailyLimit(30, 100)).toBe(30);
    // 0 is no bot quota, so the guild limit alone applies.
    expect(imageDailyLimit(0, 12)).toBe(12);
    expect(imageDailyLimit(0, null)).toBe(0);
  });

  it('offers only providers with credentials or an explicit server', () => {
    expect(configuredImageProviders({})).toEqual([]);
    expect(
      configuredImageProviders({ GEMINI_API_KEY: 'k', COMFYUI_BASE_URL: 'http://sd:8188' }),
    ).toEqual(['gemini', 'comfyui']);
  });

  it('parses CLI values and refuses the mock provider', () => {
    const schema = GuildConfigSchemas.images;
    expect(
      schema.parse({ defaultProvider: 'replicate', memberDailyLimit: '20', defaultPreset: 'none' }),
    ).toEqual({ defaultProvider: 'replicate', memberDailyLimit: 20, defaultPreset: 'none' });
    expect(
      schema.parse({ defaultProvider: '', memberDailyLimit: '', defaultPreset: 'none' }),
    ).toMatchObject({ defaultProvider: null, memberDailyLimit: null });
    const result = schema.safeParse({
      defaultProvider: 'mock',
      memberDailyLimit: 501,
      defaultPreset: 'vaporwave',
    });
    expect(result.success).toBe(false);
    expect(new Set(result.error?.issues.map((issue) => issue.path[0]))).toEqual(
      new Set(['defaultProvider', 'memberDailyLimit', 'defaultPreset']),
    );
  });
});
