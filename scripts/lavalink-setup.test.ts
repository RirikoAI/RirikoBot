import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DOCKER_LAVALINK_CONFIG,
  DOCKER_LAVALINK_VALUES,
  renderLavalinkConfig,
  renderYouTubeCipherConfig,
} from './lavalink-setup';

describe('renderYouTubeCipherConfig', () => {
  it.each([undefined, '', '   '])('keeps the built-in cipher when the URL is %j', (url) => {
    const block = renderYouTubeCipherConfig(url);
    // Every line is a YAML comment, so the plugin gets no remoteCipher setting.
    expect(block.split('\n').every((line) => line.trimStart().startsWith('#'))).toBe(true);
    expect(block).toContain('#   url: "https://example.com/"');
  });

  it('writes a remoteCipher block for a configured yt-cipher server', () => {
    expect(renderYouTubeCipherConfig(' https://cipher.internal:8001/ ')).toBe(
      [
        '    # yt-cipher server for signature deciphering (LAVALINK_YOUTUBE_CIPHER_URL)',
        '    remoteCipher:',
        '      url: "https://cipher.internal:8001/"',
        '      userAgent: "ririko-bot"',
      ].join('\n'),
    );
  });

  it('quotes the URL so it cannot break out of the YAML value', () => {
    const block = renderYouTubeCipherConfig('https://x/"\nlavalink: evil');
    expect(block).toContain(String.raw`url: "https://x/\"\nlavalink: evil"`);
    expect(block.split('\n')).toHaveLength(4);
  });
});

describe('docker/lavalink/application.yml', () => {
  it('matches the renderer, with secrets left to the container environment', () => {
    // Git may check the file out with CRLF line endings on Windows.
    const committed = readFileSync(DOCKER_LAVALINK_CONFIG, 'utf8').replaceAll('\r\n', '\n');
    // Regenerate with: node scripts/lavalink-setup.ts --docker-config
    expect(committed).toBe(renderLavalinkConfig(DOCKER_LAVALINK_VALUES));
    expect(committed).toContain('password: "${LAVALINK_PASSWORD}"');
    expect(committed).toContain('clientSecret: "${SPOTIFY_CLIENT_SECRET:}"');
  });
});
