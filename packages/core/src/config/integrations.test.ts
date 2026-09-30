import { describe, expect, it } from 'vitest';
import { INTEGRATION_GROUPS, integrationStatus } from './integrations.js';

describe('integrationStatus (TASK-1164)', () => {
  const env = {
    DISCORD_TOKEN: 'discord-token-value-123456789',
    GEMINI_API_KEY: 'gemini-key-value-123456789',
    TWITCH_CLIENT_ID: 'twitch-id-value',
    REPLICATE_API_TOKEN: 'r8_replicate-token-value',
    SPOTIFY_DC: 'spotify-cookie-value',
    LAVALINK_HOST: 'lavalink.internal',
    LAVALINK_ENABLED: 'false',
  };

  it('reports whether each integration is configured', () => {
    const configured = Object.fromEntries(
      integrationStatus(env).map((status) => [status.id, status.configured]),
    );
    expect(configured).toEqual({
      discord: true,
      'ai.gemini': true,
      'ai.openai': false,
      'ai.ollama': false,
      'images.gemini': true,
      'images.replicate': true,
      'images.comfyui': false,
      // Twitch needs the secret as well as the ID.
      'streams.twitch': false,
      'streams.youtube': false,
      'streams.tiktok': false,
      'music.spotify': true,
      // Turned off even though a host is set.
      'music.lavalink': false,
      'music.private': false,
    });
  });

  it('never returns a configured value', () => {
    const output = JSON.stringify(integrationStatus(env));
    for (const value of Object.values(env)) {
      if (value.length > 5) expect(output).not.toContain(value);
    }
  });

  it('puts every integration in a known group', () => {
    for (const status of integrationStatus({})) {
      expect(INTEGRATION_GROUPS).toContain(status.group);
      expect(status.configured).toBe(false);
    }
  });
});
