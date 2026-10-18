import { describe, it, expect } from 'vitest';
import { MockImageProvider } from '../providers/mock.provider.js';
import { GeminiImageProvider } from '../providers/gemini.provider.js';
import { ComfyUiImageProvider } from '../providers/comfyui.provider.js';
import { ReplicateImageProvider } from '../providers/replicate.provider.js';

describe('ImageGenerationProviders (TASK-1321)', () => {
  describe('MockImageProvider', () => {
    const provider = new MockImageProvider();

    it('generates a valid image result with deterministic dimensions', async () => {
      const result = await provider.generate({
        userId: 'u1',
        prompt: 'test anime prompt',
        aspectRatio: '1:1',
      });

      expect(result.providerId).toBe('mock');
      expect(result.images).toHaveLength(1);
      expect(result.images[0]?.mimeType).toBe('image/png');
      expect(result.images[0]?.buffer).toBeInstanceOf(Buffer);
      expect(result.images[0]?.buffer.length).toBeGreaterThan(100);
      expect(result.images[0]?.width).toBe(512);
      expect(result.images[0]?.height).toBe(512);
    });

    it('supports multiple aspect ratios and batch counts', async () => {
      const result = await provider.generate({
        userId: 'u1',
        prompt: 'wide scene',
        aspectRatio: '16:9',
        count: 2,
      });

      expect(result.images).toHaveLength(2);
      expect(result.images[0]?.width).toBe(640);
      expect(result.images[0]?.height).toBe(360);
    });
  });

  describe('GeminiImageProvider', () => {
    it('reports availability based on API key configuration', () => {
      const unavail = new GeminiImageProvider({ apiKey: '' });
      expect(unavail.isAvailable).toBe(false);

      const avail = new GeminiImageProvider({ apiKey: 'fake-test-key' });
      expect(avail.isAvailable).toBe(true);
    });

    it('throws descriptive error if generated without client', async () => {
      const unavail = new GeminiImageProvider({ apiKey: '' });
      await expect(unavail.generate({ userId: 'u1', prompt: 'test' })).rejects.toThrow(
        /GEMINI_API_KEY missing/i,
      );
    });
  });

  describe('ComfyUiImageProvider', () => {
    it('configures default baseUrl and is available', () => {
      const provider = new ComfyUiImageProvider({ baseUrl: 'http://127.0.0.1:7860' });
      expect(provider.isAvailable).toBe(true);
      expect(provider.id).toBe('comfyui');
    });

    it('throws error when server responds with non-200', async () => {
      const provider = new ComfyUiImageProvider({ baseUrl: 'http://localhost:9999' });
      await expect(provider.generate({ userId: 'u1', prompt: 'test' })).rejects.toThrow(
        /ComfyUI\/SD/i,
      );
    });
  });

  describe('ReplicateImageProvider', () => {
    it('reports availability based on token', () => {
      const unavail = new ReplicateImageProvider({ apiToken: '' });
      expect(unavail.isAvailable).toBe(false);

      const avail = new ReplicateImageProvider({ apiToken: 'r8_fake_token' });
      expect(avail.isAvailable).toBe(true);
    });

    it('throws error if generated without token', async () => {
      const unavail = new ReplicateImageProvider({ apiToken: '' });
      await expect(unavail.generate({ userId: 'u1', prompt: 'test' })).rejects.toThrow(
        /REPLICATE_API_TOKEN missing/i,
      );
    });
  });
});
