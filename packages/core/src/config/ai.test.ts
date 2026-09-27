import { describe, expect, it } from 'vitest';
import {
  AI_MODEL_CHOICES,
  AI_TOOL_NAMES,
  allowedAiTools,
  configuredAiProviders,
  formatAiModelChoice,
  parseAiModelChoice,
  preferredAiModel,
  readAiModelChoice,
} from './ai.js';
import { GuildConfigSchemas } from './guild-config.js';

describe('AI model choices (TASK-1162)', () => {
  it('lists each provider and each of its models', () => {
    expect(AI_MODEL_CHOICES).toContain('gemini');
    expect(AI_MODEL_CHOICES).toContain('openai/gpt-4o');
    expect(AI_MODEL_CHOICES).toContain('ollama/llama3.3');
  });

  it('parses and formats listed choices only', () => {
    expect(parseAiModelChoice('openai/gpt-4o')).toEqual({ provider: 'openai', model: 'gpt-4o' });
    expect(parseAiModelChoice('gemini')).toEqual({ provider: 'gemini', model: null });
    expect(parseAiModelChoice('openai/gpt-2')).toBeNull();
    expect(formatAiModelChoice('gemini', 'gemini-2.5-pro')).toBe('gemini/gemini-2.5-pro');
    expect(formatAiModelChoice(null, 'gemini-2.5-pro')).toBeNull();
    expect(formatAiModelChoice('gemini', 'retired-model')).toBeNull();
  });

  it('reads what members type in Discord', () => {
    expect(readAiModelChoice('GPT-4o')).toBe('openai/gpt-4o');
    expect(readAiModelChoice('ollama/mistral')).toBe('ollama/mistral');
    expect(readAiModelChoice('default')).toBeNull();
    expect(readAiModelChoice('gpt-9')).toBeUndefined();
  });

  it('gives the fallback chain the stored preference', () => {
    expect(preferredAiModel({ providerOverride: 'openai', modelOverride: 'o3-mini' })).toEqual({
      providerId: 'openai',
      model: 'o3-mini',
    });
    expect(preferredAiModel({ providerOverride: 'ollama', modelOverride: null })).toEqual({
      providerId: 'ollama',
    });
    // A model saved before providers were stored was never used and stays unused.
    expect(preferredAiModel({ providerOverride: null, modelOverride: 'gpt-4o' })).toEqual({});
  });

  it('offers only providers with credentials', () => {
    expect(configuredAiProviders({})).toEqual([]);
    expect(
      configuredAiProviders({ OPENAI_API_KEY: 'sk-test', OLLAMA_BASE_URL: 'http://ollama:11434' }),
    ).toEqual(['openai', 'ollama']);
  });
});

describe('allowedAiTools (TASK-1162)', () => {
  it('allows every tool by default and none when tools are off', () => {
    expect(allowedAiTools(null)).toBeUndefined();
    expect(allowedAiTools({ toolsEnabled: true, allowedTools: [] })).toBeUndefined();
    expect(allowedAiTools({ toolsEnabled: true, allowedTools: ['music.play'] })).toEqual([
      'music.play',
    ]);
    expect(allowedAiTools({ toolsEnabled: false, allowedTools: ['music.play'] })).toEqual([]);
  });
});

describe('ai settings schema (TASK-1162)', () => {
  const schema = GuildConfigSchemas.ai;
  const base = {
    channelId: null,
    speakingStyle: 'FRIENDLY_ANIME',
    personalityPrompt: null,
    tools: [],
    model: null,
  };

  it('accepts CLI strings and keeps tools in a fixed order', () => {
    const parsed = schema.parse({
      ...base,
      tools: 'music.play,get_current_time',
      model: 'gemini/gemini-2.5-pro',
      personalityPrompt: '  Be brief.  ',
    });
    expect(parsed.tools).toEqual(['get_current_time', 'music.play']);
    expect(parsed.model).toBe('gemini/gemini-2.5-pro');
    expect(parsed.personalityPrompt).toBe('Be brief.');
    expect(schema.parse({ ...base, model: 'none', personalityPrompt: '' })).toMatchObject({
      model: null,
      personalityPrompt: null,
    });
  });

  it('rejects unknown tools, models and styles, and long prompts', () => {
    const result = schema.safeParse({
      ...base,
      tools: ['rm_rf'],
      model: 'openai/gpt-9',
      speakingStyle: 'YANDERE',
      personalityPrompt: 'x'.repeat(1501),
    });
    expect(result.success).toBe(false);
    const fields = new Set(result.error?.issues.map((issue) => issue.path[0]));
    expect(fields).toEqual(new Set(['tools', 'model', 'speakingStyle', 'personalityPrompt']));
    expect(AI_TOOL_NAMES).toHaveLength(6);
  });
});
