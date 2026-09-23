import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createProgram } from '../program.js';
import {
  IMAGE_PROVIDER_METADATA,
  SUPPORTED_IMAGE_PROVIDERS,
  printImageStatus,
  testImageProviders,
} from './image-configure.js';
import { readEnvFile } from '../utils/env-editor.js';

describe('image-configure command (CHORE-1321)', () => {
  const testEnvPath = resolve(tmpdir(), 'test-image-configure.env');

  beforeEach(() => {
    if (existsSync(testEnvPath)) {
      rmSync(testEnvPath, { force: true });
    }
  });

  afterEach(() => {
    if (existsSync(testEnvPath)) {
      rmSync(testEnvPath, { force: true });
    }
    vi.restoreAllMocks();
  });

  it('defines metadata for all supported image providers', () => {
    expect(SUPPORTED_IMAGE_PROVIDERS).toEqual(['gemini', 'comfyui', 'replicate', 'mock', 'auto']);
    for (const provider of SUPPORTED_IMAGE_PROVIDERS) {
      const meta = IMAGE_PROVIDER_METADATA[provider];
      expect(meta).toBeDefined();
      expect(meta.name).toBeTruthy();
      expect(meta.description).toBeTruthy();
    }
  });

  it('prints image configuration status without throwing', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printImageStatus(
      {
        IMAGE_DEFAULT_PROVIDER: 'gemini',
        IMAGE_DAILY_QUOTA: '40',
        GEMINI_API_KEY: 'AIzaSyFakeKey1234567890',
        COMFYUI_BASE_URL: 'http://127.0.0.1:8188',
        REPLICATE_API_TOKEN: 'r8_fakeToken123456',
      },
      testEnvPath,
    );
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('updates provider and credentials via non-interactive CLI flags', async () => {
    const program = createProgram();
    await program.parseAsync([
      'node',
      'ririko',
      'image-configure',
      '--provider',
      'comfyui',
      '--comfyui-url',
      'http://192.168.1.100:8188',
      '--daily-quota',
      '50',
      '--env-file',
      testEnvPath,
      '--yes',
    ]);

    const env = readEnvFile(testEnvPath);
    expect(env.IMAGE_DEFAULT_PROVIDER).toBe('comfyui');
    expect(env.COMFYUI_BASE_URL).toBe('http://192.168.1.100:8188');
    expect(env.IMAGE_DAILY_QUOTA).toBe('50');
  });

  it('updates Gemini and Replicate credentials via image:configure alias', async () => {
    const program = createProgram();
    await program.parseAsync([
      'node',
      'ririko',
      'image:configure', // Test alias
      '--provider',
      'gemini',
      '--gemini-key',
      'AIzaSyTestKey999888',
      '--replicate-token',
      'r8_testtoken123456',
      '--env-file',
      testEnvPath,
      '--yes',
    ]);

    const env = readEnvFile(testEnvPath);
    expect(env.IMAGE_DEFAULT_PROVIDER).toBe('gemini');
    expect(env.GEMINI_API_KEY).toBe('AIzaSyTestKey999888');
    expect(env.REPLICATE_API_TOKEN).toBe('r8_testtoken123456');
  });

  it('runs provider test diagnostics without throwing', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await testImageProviders({
      GEMINI_API_KEY: 'AIzaSyValidFormatKey',
      REPLICATE_API_TOKEN: 'r8_validToken',
    });
    expect(consoleSpy).toHaveBeenCalled();
  });
});
