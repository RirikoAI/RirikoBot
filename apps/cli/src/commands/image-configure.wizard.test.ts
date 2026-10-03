import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

const rl = vi.hoisted(() => ({
  answers: [] as string[],
  prompts: [] as string[],
  closed: 0,
}));

const mock = vi.hoisted(() => ({
  generate: (async () => ({
    images: [{ buffer: Buffer.alloc(1234) }],
    durationMs: 7,
  })) as () => Promise<unknown>,
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
  MockImageProvider: class {
    generate() {
      return mock.generate();
    }
  },
}));

import {
  registerImageConfigureCommand,
  runInteractiveWizard,
  testImageProviders,
} from './image-configure.js';
import { readEnvFile } from '../utils/env-editor.js';

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

describe('image-configure providers and wizard (TASK-1252)', () => {
  let dir: string;
  let envPath: string;
  let out: string[];
  let fetchMock: ReturnType<typeof vi.fn>;

  const output = () => out.join('').replace(ANSI, '');

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ririko-image-configure-'));
    envPath = join(dir, '.env');
    out = [];
    rl.answers = [];
    rl.prompts = [];
    rl.closed = 0;
    mock.generate = async () => ({ images: [{ buffer: Buffer.alloc(1234) }], durationMs: 7 });
    fetchMock = vi.fn(async () => ({ status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      out.push(`${args.join(' ')}\n`);
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      out.push(`${args.join(' ')}\n`);
    });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('testImageProviders', () => {
    it('validates a standard Gemini key and reports the mock synthesizer size', async () => {
      await testImageProviders({ GEMINI_API_KEY: 'AIzaSyValidKey' });
      const text = output();
      expect(text).toContain('Google Gemini Imagen: API key structure validated');
      expect(text).toContain('Synthesis verified (Generated 1234 bytes in 7ms)');
      expect(text).toContain('ComfyUI / SD-WebUI: Not configured');
      expect(text).toContain('Replicate Cloud: Not configured');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('flags a non-standard Gemini key prefix and masks the Replicate token', async () => {
      await testImageProviders({
        GEMINI_API_KEY: 'custom-key',
        REPLICATE_API_TOKEN: 'r8_abcdefghijklmnopqrstuvwxyz',
      });
      const text = output();
      expect(text).toContain('Key configured (non-standard prefix)');
      expect(text).toContain('Token configured (r8_abc...****...wxyz)');
      expect(text).not.toContain('r8_abcdefghijklmnopqrstuvwxyz');
    });

    it('reports a missing Gemini key', async () => {
      await testImageProviders({});
      expect(output()).toContain('Not configured (GEMINI_API_KEY missing)');
    });

    it('probes ComfyUI /system_stats with the trailing slash removed', async () => {
      await testImageProviders({ COMFYUI_BASE_URL: 'http://127.0.0.1:8188///' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]![0]).toBe('http://127.0.0.1:8188/system_stats');
      expect(output()).toContain('Server responded (200 OK at http://127.0.0.1:8188///)');
    });

    it('falls back to the server root when /system_stats rejects', async () => {
      fetchMock
        .mockRejectedValueOnce(new Error('stats missing'))
        .mockResolvedValueOnce({ status: 404 });
      await testImageProviders({ COMFYUI_BASE_URL: 'http://sd:7860' });
      expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
        'http://sd:7860/system_stats',
        'http://sd:7860',
      ]);
      expect(output()).toContain('Server responded (404 OK at http://sd:7860)');
    });

    it('reports a server error status from ComfyUI', async () => {
      fetchMock.mockResolvedValue({ status: 503 });
      await testImageProviders({ COMFYUI_BASE_URL: 'http://sd:7860' });
      expect(output()).toContain('Server returned status 503 at http://sd:7860');
    });

    it('reports an unreachable ComfyUI server', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
      await testImageProviders({ COMFYUI_BASE_URL: 'http://sd:7860' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(output()).toContain('Could not reach http://sd:7860');
    });

    it('prints a failure when the mock synthesizer throws', async () => {
      mock.generate = async () => {
        throw new Error('canvas broke');
      };
      await testImageProviders({});
      expect(output()).toContain('Offline Mock Synthesizer: Failed (canvas broke)');
    });

    it('stringifies non-Error failures and stays quiet on an empty mock result', async () => {
      mock.generate = async () => {
        throw 'weird';
      };
      await testImageProviders({});
      expect(output()).toContain('Failed (weird)');

      out.length = 0;
      mock.generate = async () => ({ images: [], durationMs: 1 });
      await testImageProviders({});
      expect(output()).not.toContain('Offline Mock Synthesizer');
    });
  });

  describe('runInteractiveWizard', () => {
    it('saves a Gemini setup with a key and quota, and tests it', async () => {
      // provider, gemini key, quota, test
      rl.answers = ['', 'AIzaSyWizard1234', '45', 'y'];
      await runInteractiveWizard(envPath);
      expect(readEnvFile(envPath)).toEqual({
        IMAGE_DEFAULT_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'AIzaSyWizard1234',
        IMAGE_DAILY_QUOTA: '45',
      });
      const text = output();
      expect(text).toContain('IMAGE_DEFAULT_PROVIDER = gemini');
      expect(text).toContain('GEMINI_API_KEY = AIz****34');
      expect(text).toContain('Testing Image Generation Providers');
      expect(rl.closed).toBe(1);
    });

    it('stores the default ComfyUI URL when none is typed, and skips the test on "n"', async () => {
      // provider (by name), url, quota, test
      rl.answers = ['comfyui', '', '', 'n'];
      await runInteractiveWizard(envPath);
      expect(readEnvFile(envPath)).toEqual({
        IMAGE_DEFAULT_PROVIDER: 'comfyui',
        COMFYUI_BASE_URL: 'http://127.0.0.1:8188',
      });
      expect(output()).not.toContain('Testing Image Generation Providers');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('stores a typed ComfyUI URL', async () => {
      rl.answers = ['2', 'http://gpu:8188', '', 'no'];
      await runInteractiveWizard(envPath);
      expect(readEnvFile(envPath).COMFYUI_BASE_URL).toBe('http://gpu:8188');
    });

    it('configures Replicate and masks the token in the summary', async () => {
      rl.answers = ['3', 'r8_tokenvalue1234567890', '', 'n'];
      await runInteractiveWizard(envPath);
      expect(readEnvFile(envPath)).toEqual({
        IMAGE_DEFAULT_PROVIDER: 'replicate',
        REPLICATE_API_TOKEN: 'r8_tokenvalue1234567890',
      });
      expect(output()).toContain('REPLICATE_API_TOKEN = r8_tok...****...7890');
    });

    it('asks for no credentials for the mock provider', async () => {
      rl.answers = ['4', '12', 'n'];
      await runInteractiveWizard(envPath);
      expect(readEnvFile(envPath)).toEqual({
        IMAGE_DEFAULT_PROVIDER: 'mock',
        IMAGE_DAILY_QUOTA: '12',
      });
      expect(rl.prompts.some((p) => p.includes('API Key') || p.includes('Token'))).toBe(false);
    });

    it('asks for every credential under auto', async () => {
      // provider, gemini key, comfy url, replicate token, quota, test
      rl.answers = ['5', 'AIzaSyAuto', 'http://c:1', 'r8_auto', '9', 'n'];
      await runInteractiveWizard(envPath);
      expect(readEnvFile(envPath)).toEqual({
        IMAGE_DEFAULT_PROVIDER: 'auto',
        GEMINI_API_KEY: 'AIzaSyAuto',
        COMFYUI_BASE_URL: 'http://c:1',
        REPLICATE_API_TOKEN: 'r8_auto',
        IMAGE_DAILY_QUOTA: '9',
      });
    });

    it('defaults from the saved provider and keeps existing credentials', async () => {
      writeFileSync(
        envPath,
        [
          'IMAGE_DEFAULT_PROVIDER=replicate',
          'REPLICATE_API_TOKEN=r8_existingtoken123456',
          'IMAGE_DAILY_QUOTA=20',
          '',
        ].join('\n'),
      );
      rl.answers = ['', '', '', 'n'];
      await runInteractiveWizard(envPath);
      expect(rl.prompts[0]).toContain('(default: 3)');
      expect(rl.prompts[1]).toContain('keep: r8_exi...****...3456');
      expect(rl.prompts[2]).toContain('Press enter for: 20]');
      expect(readEnvFile(envPath)).toMatchObject({
        IMAGE_DEFAULT_PROVIDER: 'replicate',
        REPLICATE_API_TOKEN: 'r8_existingtoken123456',
        IMAGE_DAILY_QUOTA: '20',
      });
    });

    it.each([
      ['mock', '(default: 4)'],
      ['auto', '(default: 5)'],
      ['comfyui', '(default: 2)'],
    ])('defaults the provider prompt for a saved %s provider', async (saved, hint) => {
      writeFileSync(envPath, `IMAGE_DEFAULT_PROVIDER=${saved}\n`);
      rl.answers = ['4', '', 'n'];
      await runInteractiveWizard(envPath);
      expect(rl.prompts[0]).toContain(hint);
    });

    it('keeps a stored ComfyUI URL when Enter is pressed', async () => {
      writeFileSync(envPath, 'IMAGE_DEFAULT_PROVIDER=comfyui\nCOMFYUI_BASE_URL=http://old:9\n');
      rl.answers = ['', '', '', 'n'];
      await runInteractiveWizard(envPath);
      expect(rl.prompts[1]).toContain('Press enter for: http://old:9]');
      expect(readEnvFile(envPath).COMFYUI_BASE_URL).toBe('http://old:9');
    });

    it('keeps an existing Gemini key and prints its masked form', async () => {
      writeFileSync(envPath, 'GEMINI_API_KEY=fake-fake-fake-gemini\n');
      rl.answers = ['1', '', '', 'n'];
      await runInteractiveWizard(envPath);
      expect(rl.prompts[1]).toContain('keep: fake-f...****...mini');
      expect(readEnvFile(envPath).GEMINI_API_KEY).toBe('fake-fake-fake-gemini');
    });
  });

  describe('image-configure command', () => {
    const run = async (...args: string[]) => {
      const program = new Command();
      program.exitOverride();
      registerImageConfigureCommand(program);
      await program.parseAsync(['node', 'ririko', 'image-configure', ...args]);
    };

    it('--show prints the status and never writes', async () => {
      writeFileSync(envPath, 'IMAGE_DEFAULT_PROVIDER=mock\nIMAGE_DAILY_QUOTA=15\n');
      await run('--show', '--env-file', envPath);
      const text = output();
      expect(text).toContain('MOCK');
      expect(text).toContain('15 images/day');
      expect(text).toContain('Missing Key');
    });

    it('--test alone runs diagnostics against the stored environment', async () => {
      writeFileSync(envPath, 'COMFYUI_BASE_URL=http://sd:1\n');
      await run('--test', '--env-file', envPath);
      expect(fetchMock.mock.calls[0]![0]).toBe('http://sd:1/system_stats');
      expect(output()).toContain('Testing Image Generation Providers');
    });

    it('rejects an unknown provider with exit code 1', async () => {
      const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code}`);
      }) as never);
      await expect(run('--provider', 'dalle', '--env-file', envPath)).rejects.toThrow('exit:1');
      expect(exit).toHaveBeenCalledWith(1);
      expect(output()).toContain("Invalid provider: 'dalle'");
      expect(existsSync(envPath)).toBe(false);
    });

    it('updates with flags, masks secrets in the summary, then tests with --test', async () => {
      await run(
        '--provider',
        'AUTO',
        '--gemini-key',
        'AIzaSyFlagKey1234567',
        '--replicate-token',
        'r8_flagtoken1234567',
        '--comfyui-url',
        'http://c:8188',
        '--daily-quota',
        '25',
        '--test',
        '--env-file',
        envPath,
      );
      const text = output();
      expect(text).toContain('IMAGE_DEFAULT_PROVIDER = auto');
      expect(text).toContain('IMAGE_DAILY_QUOTA = 25');
      expect(text).toContain('COMFYUI_BASE_URL = http://c:8188');
      expect(text).toContain('GEMINI_API_KEY = AIzaSy...****...4567');
      expect(text).not.toContain('AIzaSyFlagKey1234567');
      expect(text).toContain('Testing Image Generation Providers');
      expect(readEnvFile(envPath).REPLICATE_API_TOKEN).toBe('r8_flagtoken1234567');
    });

    it('prints status and a tip when nothing is given outside a TTY', async () => {
      const original = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
      try {
        await run('--env-file', envPath);
      } finally {
        Object.defineProperty(process.stdin, 'isTTY', { value: original, configurable: true });
      }
      expect(output()).toContain('ririko image-configure -i');
      expect(existsSync(envPath)).toBe(false);
    });

    it('--interactive runs the wizard', async () => {
      rl.answers = ['4', '', 'n'];
      await run('--interactive', '--env-file', envPath);
      expect(readEnvFile(envPath).IMAGE_DEFAULT_PROVIDER).toBe('mock');
    });
  });
});
