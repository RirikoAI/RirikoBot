import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createProgram } from '../program.js';
import { printStreamStatus } from './stream-configure.js';
import { readEnvFile } from '../utils/env-editor.js';

describe('stream-configure command (STORY-080 Reinforcement)', () => {
  const testEnvPath = resolve(tmpdir(), 'test-stream-configure.env');

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

  it('prints stream configuration status with masked secrets without throwing', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printStreamStatus(
      {
        TWITCH_CLIENT_ID: 'twitch_test_client_id_123',
        TWITCH_CLIENT_SECRET: 'twitch_test_secret_abc123',
        YOUTUBE_API_KEY: 'AIzaSyTestKeyForYouTube123',
        TIKTOK_SESSION_ID: '7392819284729183749',
        STREAM_CHECK_INTERVAL_MS: '45000',
      },
      testEnvPath,
    );
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('updates Twitch, YouTube, TikTok and interval via non-interactive CLI flags', async () => {
    const program = createProgram();
    await program.parseAsync([
      'node',
      'ririko',
      'stream-configure',
      '--twitch-client-id',
      'my_twitch_id_123',
      '--twitch-client-secret',
      'my_twitch_secret_456',
      '--youtube-key',
      'AIzaSyMyYouTubeKey_789',
      '--tiktok-session-id',
      'my_tiktok_session_abc',
      '--check-interval',
      '30000',
      '--env-file',
      testEnvPath,
    ]);

    const env = readEnvFile(testEnvPath);
    expect(env.TWITCH_CLIENT_ID).toBe('my_twitch_id_123');
    expect(env.TWITCH_CLIENT_SECRET).toBe('my_twitch_secret_456');
    expect(env.YOUTUBE_API_KEY).toBe('AIzaSyMyYouTubeKey_789');
    expect(env.TIKTOK_SESSION_ID).toBe('my_tiktok_session_abc');
    expect(env.STREAM_CHECK_INTERVAL_MS).toBe('30000');
  });

  it('supports stream:configure alias', async () => {
    const program = createProgram();
    await program.parseAsync([
      'node',
      'ririko',
      'stream:configure',
      '--youtube-key',
      'AIzaSyNewYtKey_999',
      '--env-file',
      testEnvPath,
    ]);

    const env = readEnvFile(testEnvPath);
    expect(env.YOUTUBE_API_KEY).toBe('AIzaSyNewYtKey_999');
  });

  it('supports --show flag to display current configuration', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const program = createProgram();
    await program.parseAsync([
      'node',
      'ririko',
      'stream-configure',
      '--show',
      '--env-file',
      testEnvPath,
    ]);

    expect(consoleSpy).toHaveBeenCalled();
  });
});
