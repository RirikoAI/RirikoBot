import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./checks.js', () => {
  const make = (name: string) =>
    vi.fn(async (...args: unknown[]) => ({
      status: 'pass',
      message: `${name}:${JSON.stringify(args.slice(0, -1))}`,
    }));
  return {
    checkComfyUi: make('comfyui'),
    checkDatabase: make('database'),
    checkDiscordApplication: make('discord'),
    checkDiscordOAuthSecret: make('oauth'),
    checkGemini: make('gemini'),
    checkLavalink: make('lavalink'),
    checkOllama: make('ollama'),
    checkOpenAi: make('openai'),
    checkReplicate: make('replicate'),
    checkSpotify: make('spotify'),
    checkTwitch: make('twitch'),
    checkYouTube: make('youtube'),
  };
});

import { checkField, checkInputs, runInstallerCheck } from './check-runner.js';
import type { Answers, CheckId } from './steps.js';

const answers = (values: Record<string, string>): Answers => ({ values, switches: {} });

async function message(id: CheckId, a: Answers): Promise<string> {
  return (await runInstallerCheck(id, a)).message;
}

beforeEach(() => vi.clearAllMocks());

describe('runInstallerCheck', () => {
  it('calls the Discord checks with the entered values', async () => {
    const a = answers({
      DISCORD_TOKEN: 'tok',
      DISCORD_CLIENT_ID: '1',
      DISCORD_CLIENT_SECRET: 'sec',
    });
    expect(await message('discord-bot', a)).toBe('discord:[{"token":"tok","applicationId":"1"}]');
    expect(await message('dashboard-oauth', a)).toBe(
      'oauth:[{"applicationId":"1","clientSecret":"sec"}]',
    );
  });

  it('picks the AI check by provider', async () => {
    expect(
      await message('ai-provider', answers({ DEFAULT_AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'g' })),
    ).toBe('gemini:["g"]');
    expect(
      await message('ai-provider', answers({ DEFAULT_AI_PROVIDER: 'openai', OPENAI_API_KEY: 'o' })),
    ).toBe('openai:[{"apiKey":"o"}]');
    expect(
      await message(
        'ai-provider',
        answers({
          DEFAULT_AI_PROVIDER: 'openai',
          OPENAI_API_KEY: 'o',
          OPENAI_BASE_URL: 'https://x/v1',
        }),
      ),
    ).toBe('openai:[{"apiKey":"o","baseUrl":"https://x/v1"}]');
    expect(
      await message(
        'ai-provider',
        answers({ DEFAULT_AI_PROVIDER: 'ollama', OLLAMA_BASE_URL: 'http://h' }),
      ),
    ).toBe('ollama:["http://h"]');
  });

  it('picks the image check by provider', async () => {
    expect(
      await message(
        'image-provider',
        answers({ IMAGE_DEFAULT_PROVIDER: 'gemini', GEMINI_API_KEY: 'g' }),
      ),
    ).toBe('gemini:["g"]');
    expect(
      await message(
        'image-provider',
        answers({ IMAGE_DEFAULT_PROVIDER: 'replicate', REPLICATE_API_TOKEN: 'r' }),
      ),
    ).toBe('replicate:["r"]');
    expect(
      await message(
        'image-provider',
        answers({ IMAGE_DEFAULT_PROVIDER: 'comfyui', COMFYUI_URL: 'http://c' }),
      ),
    ).toBe('comfyui:["http://c"]');
  });

  it('calls the stream, Spotify and database checks', async () => {
    const a = answers({
      TWITCH_CLIENT_ID: 'ti',
      TWITCH_CLIENT_SECRET: 'ts',
      YOUTUBE_API_KEY: 'yk',
      SPOTIFY_CLIENT_ID: 'si',
      SPOTIFY_CLIENT_SECRET: 'ss',
      DATABASE_URL: 'postgresql://u:p@h/db',
    });
    expect(await message('twitch', a)).toBe('twitch:[{"clientId":"ti","clientSecret":"ts"}]');
    expect(await message('youtube', a)).toBe('youtube:["yk"]');
    expect(await message('spotify', a)).toBe('spotify:[{"clientId":"si","clientSecret":"ss"}]');
    expect(await message('postgres', a)).toBe(
      'database:[{"dialect":"postgres","url":"postgresql://u:p@h/db"}]',
    );
  });
});

describe('checkInputs and checkField', () => {
  const ids: CheckId[] = [
    'discord-bot',
    'ai-provider',
    'image-provider',
    'twitch',
    'youtube',
    'spotify',
    'postgres',
    'dashboard-oauth',
  ];

  it('changes the inputs when a value that the check reads changes', () => {
    const before = answers({
      DISCORD_TOKEN: 'a',
      DEFAULT_AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'k',
      IMAGE_DEFAULT_PROVIDER: 'comfyui',
      COMFYUI_URL: 'u',
    });
    const after = answers({
      ...before.values,
      DISCORD_TOKEN: 'b',
      OPENAI_API_KEY: 'k2',
      COMFYUI_URL: 'u2',
    });
    expect(checkInputs('discord-bot', before)).not.toEqual(checkInputs('discord-bot', after));
    expect(checkInputs('ai-provider', before)).not.toEqual(checkInputs('ai-provider', after));
    expect(checkInputs('image-provider', before)).not.toEqual(checkInputs('image-provider', after));
    for (const id of ids) expect(Array.isArray(checkInputs(id, before))).toBe(true);
  });

  it('reads the Ollama and Replicate values for those providers', () => {
    expect(
      checkInputs('ai-provider', answers({ DEFAULT_AI_PROVIDER: 'ollama', OLLAMA_BASE_URL: 'x' })),
    ).toEqual(['ollama', 'x']);
    expect(
      checkInputs(
        'image-provider',
        answers({ IMAGE_DEFAULT_PROVIDER: 'replicate', REPLICATE_API_TOKEN: 't' }),
      ),
    ).toEqual(['replicate', 't']);
  });

  it('names the field that shows each error', () => {
    expect(checkField('discord-bot', answers({}))).toBe('DISCORD_TOKEN');
    expect(checkField('ai-provider', answers({ DEFAULT_AI_PROVIDER: 'openai' }))).toBe(
      'OPENAI_API_KEY',
    );
    expect(checkField('ai-provider', answers({ DEFAULT_AI_PROVIDER: 'ollama' }))).toBe(
      'OLLAMA_BASE_URL',
    );
    expect(checkField('ai-provider', answers({ DEFAULT_AI_PROVIDER: 'gemini' }))).toBe(
      'GEMINI_API_KEY',
    );
    expect(checkField('image-provider', answers({ IMAGE_DEFAULT_PROVIDER: 'replicate' }))).toBe(
      'REPLICATE_API_TOKEN',
    );
    expect(checkField('image-provider', answers({ IMAGE_DEFAULT_PROVIDER: 'comfyui' }))).toBe(
      'COMFYUI_URL',
    );
    expect(checkField('image-provider', answers({ IMAGE_DEFAULT_PROVIDER: 'gemini' }))).toBe(
      'GEMINI_API_KEY',
    );
    expect(checkField('twitch', answers({}))).toBe('TWITCH_CLIENT_SECRET');
    expect(checkField('youtube', answers({}))).toBe('YOUTUBE_API_KEY');
    expect(checkField('spotify', answers({}))).toBe('SPOTIFY_CLIENT_SECRET');
    expect(checkField('postgres', answers({}))).toBe('DATABASE_URL');
    expect(checkField('dashboard-oauth', answers({}))).toBe('DISCORD_CLIENT_SECRET');
  });

  it('runs the Lavalink check with the entered address, password and connection type', async () => {
    const a = answers({
      LAVALINK_HOST: '192.0.2.10',
      LAVALINK_PORT: '2333',
      LAVALINK_PASSWORD: 'pw',
      LAVALINK_SECURE: 'true',
    });
    expect(await message('lavalink', a)).toBe(
      'lavalink:[{"host":"192.0.2.10","port":"2333","password":"pw","secure":true}]',
    );
    // Docker has no connection type: plain.
    expect(
      await message('lavalink', answers({ LAVALINK_HOST: 'h', LAVALINK_PORT: '1' })),
    ).toContain('"secure":false');
    expect(checkInputs('lavalink', a)).toEqual(['192.0.2.10', '2333', 'pw', 'true']);
  });

  it('shows a Lavalink password error under the password and any other error under the address', () => {
    const a = answers({});
    const status = (httpStatus?: number) => ({
      status: 'fail' as const,
      message: 'x',
      ...(httpStatus ? { detail: { httpStatus } } : {}),
    });
    expect(checkField('lavalink', a, status(401))).toBe('LAVALINK_PASSWORD');
    expect(checkField('lavalink', a, status(403))).toBe('LAVALINK_PASSWORD');
    expect(checkField('lavalink', a, status(500))).toBe('LAVALINK_HOST');
    expect(checkField('lavalink', a, status())).toBe('LAVALINK_HOST');
    expect(checkField('lavalink', a)).toBe('LAVALINK_HOST');
  });
});
