import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

type Resolved = { displayName: string } | null;

const rl = vi.hoisted(() => ({
  answers: [] as string[],
  prompts: [] as string[],
  closed: 0,
}));

const adapters = vi.hoisted(() => ({
  twitch: (async () => ({ displayName: 'Twitch' })) as (id: string) => Promise<Resolved>,
  youtube: (async () => ({ displayName: 'YouTube' })) as (id: string) => Promise<Resolved>,
  tiktok: (async () => ({ displayName: 'TikTok' })) as (id: string) => Promise<Resolved>,
  twitchOptions: [] as unknown[],
  youtubeOptions: [] as unknown[],
  tiktokOptions: [] as unknown[],
  lookups: [] as string[],
}));

vi.mock('node:readline/promises', () => ({
  createInterface: () => ({
    question: async (prompt: string) => {
      rl.prompts.push(prompt);
      return rl.answers.shift() ?? '';
    },
    close: () => {
      rl.closed += 1;
    },
  }),
}));

vi.mock('@ririko/services', () => ({
  TwitchStreamAdapter: class {
    constructor(options: unknown) {
      adapters.twitchOptions.push(options);
    }
    resolveStreamer(id: string) {
      adapters.lookups.push(`twitch:${id}`);
      return adapters.twitch(id);
    }
  },
  YouTubeStreamAdapter: class {
    constructor(options: unknown) {
      adapters.youtubeOptions.push(options);
    }
    resolveStreamer(id: string) {
      adapters.lookups.push(`youtube:${id}`);
      return adapters.youtube(id);
    }
  },
  TikTokStreamAdapter: class {
    constructor(options: unknown) {
      adapters.tiktokOptions.push(options);
    }
    resolveStreamer(id: string) {
      adapters.lookups.push(`tiktok:${id}`);
      return adapters.tiktok(id);
    }
  },
}));

import {
  printStreamStatus,
  registerStreamConfigureCommand,
  testStreamProviders,
} from './stream-configure.js';
import { readEnvFile } from '../utils/env-editor.js';

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

describe('stream-configure providers and wizard (TASK-1252)', () => {
  let dir: string;
  let envPath: string;
  let out: string[];

  const output = () => out.join('').replace(ANSI, '');

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ririko-stream-configure-'));
    envPath = join(dir, '.env');
    out = [];
    rl.answers = [];
    rl.prompts = [];
    rl.closed = 0;
    adapters.twitch = async () => ({ displayName: 'Twitch' });
    adapters.youtube = async () => ({ displayName: 'YouTube' });
    adapters.tiktok = async () => ({ displayName: 'TikTok' });
    adapters.twitchOptions = [];
    adapters.youtubeOptions = [];
    adapters.tiktokOptions = [];
    adapters.lookups = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      out.push(`${args.join(' ')}\n`);
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      out.push(`${args.join(' ')}\n`);
    });
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      out.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('printStreamStatus', () => {
    it('shows unconfigured platforms using their zero-credential fallbacks', () => {
      printStreamStatus({}, envPath);
      const text = output();
      expect(text).toContain('60000ms (60s)');
      expect(text).toContain('Missing Credentials (Live status checks skipped)');
      expect(text).toContain('Public Web & RSS Fallback Active');
      expect(text).toContain('Public Webcast Alive Checks Active');
      expect(text).toContain('(not set)');
    });

    it('shows configured platforms with masked secrets', () => {
      printStreamStatus(
        {
          TWITCH_CLIENT_ID: 'twitchclientid1234567890',
          TWITCH_CLIENT_SECRET: 'twitchsecretvalue123456',
          YOUTUBE_API_KEY: 'AIzaSyYouTubeKey123456',
          TIKTOK_SESSION_ID: 'tiktoksession1234567',
          TIKTOK_API_KEY: 'fake-fake-fake-tiktok',
          STREAM_CHECK_INTERVAL_MS: '30000',
        },
        envPath,
      );
      const text = output();
      expect(text).toContain('30000ms (30s)');
      expect(text).toContain('Configured (Helix API Active)');
      expect(text).toContain('Configured (Data API v3 Active)');
      expect(text).toContain('Session / API Configured');
      expect(text).toContain('Session ID:');
      expect(text).toContain('twitch...****...7890');
      expect(text).not.toContain('twitchsecretvalue123456');
      expect(text).not.toContain('tiktoksession1234567');
    });
  });

  describe('testStreamProviders', () => {
    it('resolves all three platforms and passes credentials to each adapter', async () => {
      await testStreamProviders({
        TWITCH_CLIENT_ID: 'tid',
        TWITCH_CLIENT_SECRET: 'tsecret',
        YOUTUBE_API_KEY: 'ykey',
        TIKTOK_SESSION_ID: 'tsession',
        TIKTOK_API_KEY: 'tkey',
      });
      const text = output();
      expect(text).toContain('Connected! (Resolved: Twitch)');
      expect(text).toContain('Connected via Data API v3! (Resolved: YouTube)');
      expect(text).toContain('Connected! (Resolved: TikTok)');
      expect(adapters.twitchOptions).toEqual([{ clientId: 'tid', clientSecret: 'tsecret' }]);
      expect(adapters.youtubeOptions).toEqual([{ apiKey: 'ykey' }]);
      expect(adapters.tiktokOptions).toEqual([{ sessionId: 'tsession', apiKey: 'tkey' }]);
      expect(adapters.lookups).toEqual(['twitch:twitch', 'youtube:YouTube', 'tiktok:tiktok']);
    });

    it('skips Twitch without credentials and uses the YouTube web fallback', async () => {
      await testStreamProviders({ TWITCH_CLIENT_ID: 'only-id' });
      const text = output();
      expect(text).toContain('Twitch: Skipping API test');
      expect(text).toContain('Connected via Public Web Fallback! (Resolved: YouTube)');
      expect(adapters.twitchOptions).toHaveLength(0);
    });

    it('reports adapters that resolve nothing', async () => {
      adapters.twitch = async () => null;
      adapters.youtube = async () => null;
      adapters.tiktok = async () => null;
      await testStreamProviders({ TWITCH_CLIENT_ID: 'a', TWITCH_CLIENT_SECRET: 'b' });
      const text = output();
      expect(text).toContain('Credentials accepted, but failed to resolve default user.');
      expect(text).toContain('Handshake succeeded, metadata could not be fetched.');
      expect(text).toContain('Public alive check active.');
    });

    it('reports adapters that throw, including non-Error values', async () => {
      adapters.twitch = async () => {
        throw new Error('401 invalid client');
      };
      adapters.youtube = async () => {
        throw new Error('quota exceeded');
      };
      adapters.tiktok = async () => {
        throw 'tiktok blocked';
      };
      await testStreamProviders({ TWITCH_CLIENT_ID: 'a', TWITCH_CLIENT_SECRET: 'b' });
      const text = output();
      expect(text).toContain('✖ Failed: 401 invalid client');
      expect(text).toContain('✖ Failed: quota exceeded');
      expect(text).toContain('✖ Failed: tiktok blocked');
    });

    it('stringifies a non-Error Twitch and YouTube failure', async () => {
      adapters.twitch = async () => {
        throw 'twitch string';
      };
      adapters.youtube = async () => {
        throw 'youtube string';
      };
      await testStreamProviders({ TWITCH_CLIENT_ID: 'a', TWITCH_CLIENT_SECRET: 'b' });
      expect(output()).toContain('✖ Failed: twitch string');
      expect(output()).toContain('✖ Failed: youtube string');
    });
  });

  describe('stream-configure command', () => {
    const run = async (...args: string[]) => {
      const program = new Command();
      program.exitOverride();
      registerStreamConfigureCommand(program);
      await program.parseAsync(['node', 'ririko', 'stream-configure', ...args]);
    };

    it('--show prints the stored configuration', async () => {
      writeFileSync(envPath, 'STREAM_CHECK_INTERVAL_MS=90000\n');
      await run('--show', '--env-file', envPath);
      expect(output()).toContain('90000ms (90s)');
      expect(adapters.lookups).toEqual([]);
    });

    it('--test alone prints status and tests every adapter', async () => {
      writeFileSync(envPath, 'YOUTUBE_API_KEY=ykey\n');
      await run('--test', '--env-file', envPath);
      const text = output();
      expect(text).toContain('Ririko Stream Watcher Configuration');
      expect(text).toContain('Testing Live Stream Adapters Connectivity');
      expect(adapters.lookups).toEqual(['youtube:YouTube', 'tiktok:tiktok']);
    });

    it('rejects a check interval below 5000ms with exit code 1', async () => {
      const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code}`);
      }) as never);
      await expect(run('--check-interval', '1000', '--env-file', envPath)).rejects.toThrow(
        'exit:1',
      );
      expect(exit).toHaveBeenCalledWith(1);
      expect(output()).toContain('Check interval must be a valid number of milliseconds');
      expect(existsSync(envPath)).toBe(false);
    });

    it('rejects a non-numeric check interval', async () => {
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code}`);
      }) as never);
      await expect(run('--check-interval', 'soon', '--env-file', envPath)).rejects.toThrow(
        'exit:1',
      );
    });

    it('saves every flag, masks secrets in the summary, and tests with --test', async () => {
      await run(
        '--twitch-client-id',
        'twitchclientid1234567890',
        '--twitch-client-secret',
        'twitchsecretvalue123456',
        '--youtube-key',
        'AIzaSyYouTubeKey123456',
        '--tiktok-session-id',
        'tiktoksession1234567',
        '--tiktok-key',
        'fake-fake-fake-tiktok',
        '--check-interval',
        '45000',
        '--test',
        '--env-file',
        envPath,
      );
      const env = readEnvFile(envPath);
      expect(env).toEqual({
        TWITCH_CLIENT_ID: 'twitchclientid1234567890',
        TWITCH_CLIENT_SECRET: 'twitchsecretvalue123456',
        YOUTUBE_API_KEY: 'AIzaSyYouTubeKey123456',
        TIKTOK_SESSION_ID: 'tiktoksession1234567',
        TIKTOK_API_KEY: 'fake-fake-fake-tiktok',
        STREAM_CHECK_INTERVAL_MS: '45000',
      });
      const text = output();
      expect(text).toContain('STREAM_CHECK_INTERVAL_MS = 45000');
      expect(text).toContain('TWITCH_CLIENT_SECRET = twitch...****...3456');
      expect(text).not.toContain('twitchsecretvalue123456');
      expect(text).not.toContain('tiktoksession1234567');
      expect(adapters.lookups).toEqual(['twitch:twitch', 'youtube:YouTube', 'tiktok:tiktok']);
    });

    it('prints status and a tip when no option is given', async () => {
      await run('--env-file', envPath);
      expect(output()).toContain('ririko stream-configure -i');
      expect(existsSync(envPath)).toBe(false);
    });

    describe('--interactive wizard', () => {
      it('saves every answer and runs the adapter tests on Enter', async () => {
        // twitch id, secret, youtube, tiktok, interval, test
        rl.answers = ['tid-123', 'tsecret-456', 'ykey-789', 'tsession-abc', '15000', ''];
        await run('--interactive', '--env-file', envPath);
        expect(readEnvFile(envPath)).toEqual({
          TWITCH_CLIENT_ID: 'tid-123',
          TWITCH_CLIENT_SECRET: 'tsecret-456',
          YOUTUBE_API_KEY: 'ykey-789',
          TIKTOK_SESSION_ID: 'tsession-abc',
          STREAM_CHECK_INTERVAL_MS: '15000',
        });
        expect(output()).toContain('Successfully saved stream configuration');
        expect(adapters.twitchOptions).toEqual([
          { clientId: 'tid-123', clientSecret: 'tsecret-456' },
        ]);
        expect(rl.closed).toBe(1);
      });

      it('skips the adapter tests when the answer is not yes', async () => {
        rl.answers = ['', '', 'ykey', '', '', 'n'];
        await run('-i', '--env-file', envPath);
        expect(readEnvFile(envPath)).toEqual({ YOUTUBE_API_KEY: 'ykey' });
        expect(adapters.lookups).toEqual([]);
      });

      it('runs the tests when the answer is "y"', async () => {
        rl.answers = ['', '', 'ykey', '', '', 'Y'];
        await run('-i', '--env-file', envPath);
        expect(adapters.lookups).toEqual(['youtube:YouTube', 'tiktok:tiktok']);
      });

      it('ignores a polling interval below 5000ms', async () => {
        rl.answers = ['', '', 'ykey', '', '100', 'n'];
        await run('-i', '--env-file', envPath);
        expect(readEnvFile(envPath)).toEqual({ YOUTUBE_API_KEY: 'ykey' });
      });

      it('leaves the file untouched when nothing is entered', async () => {
        rl.answers = ['', '', '', '', ''];
        await run('-i', '--env-file', envPath);
        expect(existsSync(envPath)).toBe(false);
        expect(output()).toContain('No changes entered');
        expect(rl.closed).toBe(1);
      });

      it('shows masked current values in the prompts', async () => {
        writeFileSync(
          envPath,
          [
            'TWITCH_CLIENT_ID=twitchclientid1234567890',
            'TWITCH_CLIENT_SECRET=twitchsecretvalue123456',
            'YOUTUBE_API_KEY=AIzaSyYouTubeKey123456',
            'TIKTOK_SESSION_ID=tiktoksession1234567',
            'STREAM_CHECK_INTERVAL_MS=20000',
            '',
          ].join('\n'),
        );
        rl.answers = [];
        await run('-i', '--env-file', envPath);
        expect(rl.prompts[0]).toContain('[twitch...****...7890]');
        expect(rl.prompts[1]).toContain('[twitch...****...3456]');
        expect(rl.prompts[2]).toContain('[AIzaSy...****...3456]');
        expect(rl.prompts[3]).toContain('[tiktok...****...4567]');
        expect(rl.prompts[4]).toContain('[20000]');
        expect(output()).toContain('No changes entered');
      });
    });
  });
});
