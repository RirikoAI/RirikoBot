import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createProgram } from '../program.js';
import {
  PROVIDER_METADATA,
  SUPPORTED_PROVIDERS,
  printAiStatus,
  testAiProviders,
} from './ai-configure.js';
import { readEnvFile } from '../utils/env-editor.js';

describe('ai-configure command', () => {
  const testEnvPath = resolve(tmpdir(), 'test-ai-configure.env');

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

  it('defines metadata for all supported providers', () => {
    expect(SUPPORTED_PROVIDERS).toEqual(['gemini', 'openai', 'ollama']);
    for (const provider of SUPPORTED_PROVIDERS) {
      const meta = PROVIDER_METADATA[provider];
      expect(meta).toBeDefined();
      expect(meta.name).toBeTruthy();
      expect(meta.recommendedModel).toBeTruthy();
      expect(meta.supportedModels.length).toBeGreaterThan(0);
    }
  });

  it('prints status without throwing', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printAiStatus(
      {
        DEFAULT_AI_PROVIDER: 'gemini',
        DEFAULT_AI_MODEL: 'gemini-2.5-flash',
        GEMINI_API_KEY: 'AIzaSyFakeKey1234567890',
        OPENAI_API_KEY: 'sk-fakeOpenaiKey123456',
      },
      testEnvPath,
    );
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('updates provider and keys via non-interactive CLI flags', async () => {
    const program = createProgram();
    await program.parseAsync([
      'node',
      'ririko',
      'ai:configure',
      '--provider',
      'openai',
      '--model',
      'gpt-4o',
      '--openai-key',
      'sk-test1234567890abcdef',
      '--openai-base-url',
      'https://openrouter.ai/api/v1',
      '--env-file',
      testEnvPath,
      '--yes',
    ]);

    const env = readEnvFile(testEnvPath);
    expect(env.DEFAULT_AI_PROVIDER).toBe('openai');
    expect(env.DEFAULT_AI_MODEL).toBe('gpt-4o');
    expect(env.OPENAI_API_KEY).toBe('sk-test1234567890abcdef');
    expect(env.OPENAI_BASE_URL).toBe('https://openrouter.ai/api/v1');
  });

  it('updates Gemini keys and sets Gemini as primary', async () => {
    const program = createProgram();
    await program.parseAsync([
      'node',
      'ririko',
      'ai:config', // Test alias
      '--provider',
      'gemini',
      '--gemini-key',
      'AIzaSyTestKey123456789',
      '--env-file',
      testEnvPath,
      '--yes',
    ]);

    const env = readEnvFile(testEnvPath);
    expect(env.DEFAULT_AI_PROVIDER).toBe('gemini');
    expect(env.GEMINI_API_KEY).toBe('AIzaSyTestKey123456789');
  });

  it('updates Ollama base URL and provider', async () => {
    const program = createProgram();
    await program.parseAsync([
      'node',
      'ririko',
      'ai:configure',
      '--provider',
      'ollama',
      '--ollama-url',
      'http://192.168.1.100:11434',
      '--model',
      'deepseek-r1',
      '--env-file',
      testEnvPath,
      '--yes',
    ]);

    const env = readEnvFile(testEnvPath);
    expect(env.DEFAULT_AI_PROVIDER).toBe('ollama');
    expect(env.OLLAMA_BASE_URL).toBe('http://192.168.1.100:11434');
    expect(env.DEFAULT_AI_MODEL).toBe('deepseek-r1');
  });

  it('handles testAiProviders without throwing', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await testAiProviders({
      DEFAULT_AI_PROVIDER: 'ollama',
      OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
    });
    // Expected to run without unhandled rejections
  });
});
