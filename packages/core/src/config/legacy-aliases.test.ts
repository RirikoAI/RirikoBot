import { describe, expect, it } from 'vitest';
import { applyLegacyAliases } from './schema.js';
import { loadConfig } from './loader.js';

describe('1.4.0 AI_SERVICE_* aliases', () => {
  it('maps google_ai to Gemini with its key and model', () => {
    const env = applyLegacyAliases({
      AI_SERVICE_TYPE: 'google_ai',
      AI_SERVICE_API_KEY: 'gemini-key',
      AI_SERVICE_DEFAULT_MODEL: 'gemini-2.5-flash',
    });
    expect(env).toMatchObject({
      DEFAULT_AI_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'gemini-key',
      DEFAULT_AI_MODEL: 'gemini-2.5-flash',
    });
    expect(env).not.toHaveProperty('OPENAI_API_KEY');
  });

  it('maps openai to the OpenAI key and base URL', () => {
    const env = applyLegacyAliases({
      AI_SERVICE_TYPE: 'openai',
      AI_SERVICE_API_KEY: 'openai-key',
      AI_SERVICE_BASE_URL: 'https://proxy.example/v1',
    });
    expect(env).toMatchObject({
      DEFAULT_AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'openai-key',
      OPENAI_BASE_URL: 'https://proxy.example/v1',
    });
    expect(env).not.toHaveProperty('GEMINI_API_KEY');
  });

  it('runs openrouter on the OpenAI provider with the OpenRouter base URL', () => {
    expect(
      applyLegacyAliases({ AI_SERVICE_TYPE: 'openrouter', AI_SERVICE_API_KEY: 'or-key' }),
    ).toMatchObject({
      DEFAULT_AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'or-key',
      OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
    });
  });

  it('maps ollama and its base URL without using the API key', () => {
    const env = applyLegacyAliases({
      AI_SERVICE_TYPE: 'Ollama',
      AI_SERVICE_API_KEY: 'unused',
      AI_SERVICE_BASE_URL: 'http://ollama:11434',
    });
    expect(env).toMatchObject({
      DEFAULT_AI_PROVIDER: 'ollama',
      OLLAMA_BASE_URL: 'http://ollama:11434',
    });
    expect(env).not.toHaveProperty('GEMINI_API_KEY');
    expect(env).not.toHaveProperty('OPENAI_API_KEY');
  });

  it('never overrides values that are already set', () => {
    expect(
      applyLegacyAliases({
        AI_SERVICE_TYPE: 'google_ai',
        AI_SERVICE_API_KEY: 'old-key',
        AI_SERVICE_DEFAULT_MODEL: 'old-model',
        DEFAULT_AI_PROVIDER: 'openai',
        DEFAULT_AI_MODEL: 'new-model',
        GEMINI_API_KEY: 'new-key',
      }),
    ).toMatchObject({
      DEFAULT_AI_PROVIDER: 'openai',
      DEFAULT_AI_MODEL: 'new-model',
      GEMINI_API_KEY: 'new-key',
    });
  });

  it('ignores an unknown type and leaves the input object unchanged', () => {
    const input = { AI_SERVICE_TYPE: 'something-else', AI_SERVICE_API_KEY: 'key' };
    expect(applyLegacyAliases(input)).toEqual(input);
    expect(applyLegacyAliases(undefined)).toBeUndefined();
  });

  it('never maps DATABASE_NAME onto the 2.0 database', () => {
    expect(applyLegacyAliases({ DATABASE_NAME: '/app/data/ririko.db' })).not.toHaveProperty(
      'DATABASE_URL',
    );
  });

  it('feeds the loaded config', () => {
    const config = loadConfig({
      DISCORD_BOT_TOKEN: 'legacy-token',
      DISCORD_APPLICATION_ID: 'legacy-app-id',
      AI_SERVICE_TYPE: 'openai',
      AI_SERVICE_API_KEY: 'openai-key',
    });
    expect(config.DEFAULT_AI_PROVIDER).toBe('openai');
    expect(config.OPENAI_API_KEY).toBe('openai-key');
  });
});
