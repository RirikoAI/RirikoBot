import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

interface Health {
  healthy: boolean;
  latencyMs?: number;
  error?: string;
  models?: string[];
}

const rl = vi.hoisted(() => ({
  answers: [] as string[],
  prompts: [] as string[],
  closed: 0,
}));

const providers = vi.hoisted(() => ({
  gemini: (async () => ({ healthy: true, latencyMs: 11 })) as () => Promise<Health>,
  openai: (async () => ({ healthy: true, latencyMs: 22 })) as () => Promise<Health>,
  ollama: (async () => ({
    healthy: true,
    latencyMs: 33,
    models: ['llama3.3', 'mistral'],
  })) as () => Promise<Health>,
  openaiOptions: [] as unknown[],
  geminiOptions: [] as unknown[],
  ollamaOptions: [] as unknown[],
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

vi.mock('@ririko/ai', () => ({
  GeminiProvider: class {
    constructor(options: unknown) {
      providers.geminiOptions.push(options);
    }
    checkHealth() {
      return providers.gemini();
    }
  },
  OpenAIProvider: class {
    constructor(options: unknown) {
      providers.openaiOptions.push(options);
    }
    checkHealth() {
      return providers.openai();
    }
  },
  OllamaProvider: class {
    constructor(options: unknown) {
      providers.ollamaOptions.push(options);
    }
    checkHealth() {
      return providers.ollama();
    }
  },
}));

import {
  registerAiConfigureCommand,
  runInteractiveWizard,
  testAiProviders,
} from './ai-configure.js';
import { readEnvFile } from '../utils/env-editor.js';

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

describe('ai-configure providers and wizard (TASK-1252)', () => {
  let dir: string;
  let envPath: string;
  let out: string[];

  const output = () => out.join('').replace(ANSI, '');

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ririko-ai-configure-'));
    envPath = join(dir, '.env');
    out = [];
    rl.answers = [];
    rl.prompts = [];
    rl.closed = 0;
    providers.gemini = async () => ({ healthy: true, latencyMs: 11 });
    providers.openai = async () => ({ healthy: true, latencyMs: 22 });
    providers.ollama = async () => ({
      healthy: true,
      latencyMs: 33,
      models: ['llama3.3', 'mistral'],
    });
    providers.geminiOptions = [];
    providers.openaiOptions = [];
    providers.ollamaOptions = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      out.push(`${args.join(' ')}
`);
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      out.push(`${args.join(' ')}
`);
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

  describe('testAiProviders', () => {
    it('reports every healthy provider with latency and the Ollama model list', async () => {
      await testAiProviders({
        GEMINI_API_KEY: 'g-key',
        OPENAI_API_KEY: 'o-key',
        OPENAI_BASE_URL: 'https://proxy.example/v1',
        OLLAMA_BASE_URL: 'http://ollama.test:11434',
      });
      const text = output();
      expect(text).toContain('Google Gemini: ✔ Connected (11ms)');
      expect(text).toContain('OpenAI: ✔ Connected (22ms)');
      expect(text).toContain('Ollama (http://ollama.test:11434): ✔ Connected (33ms)');
      expect(text).toContain('[Models: llama3.3, mistral]');
      expect(providers.geminiOptions).toEqual([{ apiKey: 'g-key' }]);
      expect(providers.openaiOptions).toEqual([
        { apiKey: 'o-key', baseURL: 'https://proxy.example/v1' },
      ]);
      expect(providers.ollamaOptions).toEqual([{ baseURL: 'http://ollama.test:11434' }]);
    });

    it('skips keyed providers without keys and defaults the Ollama URL', async () => {
      providers.ollama = async () => ({ healthy: true, latencyMs: 5 });
      await testAiProviders({});
      const text = output();
      expect(text).toContain('(skipped - no GEMINI_API_KEY)');
      expect(text).toContain('(skipped - no OPENAI_API_KEY)');
      expect(text).toContain('Ollama (http://localhost:11434)');
      expect(text).toContain('[Models: none]');
      expect(providers.geminiOptions).toHaveLength(0);
      expect(providers.openaiOptions).toHaveLength(0);
    });

    it('prints failures from unhealthy providers', async () => {
      providers.gemini = async () => ({ healthy: false, error: 'bad key' });
      providers.openai = async () => ({ healthy: false, error: 'quota' });
      providers.ollama = async () => ({ healthy: false });
      await testAiProviders({ GEMINI_API_KEY: 'g', OPENAI_API_KEY: 'o' });
      const text = output();
      expect(text).toContain('✖ Failed: bad key');
      expect(text).toContain('✖ Failed: quota');
      expect(text).toContain('! Unreachable or no models: Server did not respond');
    });

    it('survives providers that throw, including non-Error values', async () => {
      providers.gemini = async () => {
        throw new Error('network down');
      };
      providers.openai = async () => {
        throw 'plain string failure';
      };
      providers.ollama = async () => {
        throw new Error('refused');
      };
      await testAiProviders({ GEMINI_API_KEY: 'g', OPENAI_API_KEY: 'o' });
      const text = output();
      expect(text).toContain('✖ Error: network down');
      expect(text).toContain('✖ Error: plain string failure');
      expect(text).toContain('! Unreachable: refused');
    });

    it('prints the Ollama error text when the server reports one', async () => {
      providers.ollama = async () => ({ healthy: false, error: 'ECONNREFUSED' });
      await testAiProviders({});
      expect(output()).toContain('! Unreachable or no models: ECONNREFUSED');
    });
  });

  describe('runInteractiveWizard', () => {
    it('saves a fresh Gemini setup and warns when no key is entered', async () => {
      // provider, key, model, fallback, test, save
      rl.answers = ['', '', '', '', 'n', ''];
      await runInteractiveWizard(envPath);
      const env = readEnvFile(envPath);
      expect(env).toEqual({
        DEFAULT_AI_PROVIDER: 'gemini',
        DEFAULT_AI_MODEL: 'gemini-2.5-flash',
      });
      expect(output()).toContain('Gemini API key is missing');
      expect(output()).toContain('Updated keys: DEFAULT_AI_PROVIDER, DEFAULT_AI_MODEL');
      expect(rl.closed).toBe(1);
      expect(providers.geminiOptions).toHaveLength(0);
    });

    it('stores a typed Gemini key and a custom model', async () => {
      rl.answers = ['1', 'AIzaSyWizardKey1234', 'gemini-2.5-pro', 'n', 'n', 'y'];
      await runInteractiveWizard(envPath);
      expect(readEnvFile(envPath)).toEqual({
        DEFAULT_AI_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'AIzaSyWizardKey1234',
        DEFAULT_AI_MODEL: 'gemini-2.5-pro',
      });
    });

    it('configures OpenAI with a base URL, fallback providers and a connectivity test', async () => {
      // provider, key, base url, model, fallback, gemini key, ollama url, test, save
      rl.answers = [
        '2',
        'sk-openai-secret-0001',
        'https://openrouter.ai/api/v1',
        '',
        'y',
        'AIzaSyFallbackKey',
        'http://gpu-box:11434',
        'y',
        'y',
      ];
      await runInteractiveWizard(envPath);
      expect(readEnvFile(envPath)).toEqual({
        DEFAULT_AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-openai-secret-0001',
        OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
        DEFAULT_AI_MODEL: 'gpt-4o-mini',
        GEMINI_API_KEY: 'AIzaSyFallbackKey',
        OLLAMA_BASE_URL: 'http://gpu-box:11434',
      });
      // Connectivity test ran against the merged (not yet saved) values.
      expect(providers.geminiOptions).toEqual([{ apiKey: 'AIzaSyFallbackKey' }]);
      expect(providers.openaiOptions).toEqual([
        { apiKey: 'sk-openai-secret-0001', baseURL: 'https://openrouter.ai/api/v1' },
      ]);
      expect(output()).toContain('Testing AI Provider Connections');
    });

    it('configures Ollama, defaulting the URL, with the OpenAI and Gemini fallback keys', async () => {
      // provider (by name), url, model, fallback, gemini key, openai key, test, save
      rl.answers = ['ollama', '', 'qwen2.5', 'yes', 'AIzaSyG', 'sk-O', 'no', ''];
      await runInteractiveWizard(envPath);
      expect(readEnvFile(envPath)).toEqual({
        DEFAULT_AI_PROVIDER: 'ollama',
        OLLAMA_BASE_URL: 'http://localhost:11434',
        DEFAULT_AI_MODEL: 'qwen2.5',
        GEMINI_API_KEY: 'AIzaSyG',
        OPENAI_API_KEY: 'sk-O',
      });
      expect(providers.ollamaOptions).toHaveLength(0);
    });

    it('accepts provider names and keeps existing keys when Enter is pressed', async () => {
      writeFileSync(
        envPath,
        [
          '# my env',
          'DEFAULT_AI_PROVIDER=openai',
          'DEFAULT_AI_MODEL=gpt-4o',
          'OPENAI_API_KEY=sk-exixxxxxxxxxxxxxxx6789',
          'OPENAI_BASE_URL=https://old.example/v1',
          '',
        ].join('\n'),
      );
      // default provider (openai), keep key, keep url, keep model, no fallback, no test, save
      rl.answers = ['', '', '', '', 'n', 'n', ''];
      await runInteractiveWizard(envPath);

      expect(rl.prompts[0]).toContain('(default: 2)');
      expect(rl.prompts[1]).toContain('keep current: sk-exi...****...6789');
      expect(rl.prompts[2]).toContain('keep: https://old.example/v1');
      expect(rl.prompts[3]).toContain('Press enter for: gpt-4o]');
      const content = readFileSync(envPath, 'utf-8');
      expect(content).toContain('# my env');
      expect(content).toContain('OPENAI_API_KEY=sk-exixxxxxxxxxxxxxxx6789');
      expect(readEnvFile(envPath).DEFAULT_AI_MODEL).toBe('gpt-4o');
    });

    it('defaults to Ollama when it is the configured primary provider', async () => {
      writeFileSync(envPath, 'DEFAULT_AI_PROVIDER=ollama\nOLLAMA_BASE_URL=http://box:1234\n');
      rl.answers = ['', '', '', 'n', 'n', ''];
      await runInteractiveWizard(envPath);
      expect(rl.prompts[0]).toContain('(default: 3)');
      expect(rl.prompts[1]).toContain('for: http://box:1234]');
      expect(readEnvFile(envPath).OLLAMA_BASE_URL).toBe('http://box:1234');
    });

    it('does not write the file when the save is declined', async () => {
      rl.answers = ['1', 'AIzaSyDiscarded', '', 'n', 'n', 'no'];
      await runInteractiveWizard(envPath);
      expect(existsSync(envPath)).toBe(false);
      expect(output()).toContain('Configuration changes discarded');
      expect(rl.closed).toBe(1);
    });
  });

  describe('ai:configure command', () => {
    const run = async (...args: string[]) => {
      const program = new Command();
      program.exitOverride();
      registerAiConfigureCommand(program);
      await program.parseAsync(['node', 'ririko', 'ai:configure', ...args]);
    };

    it('--show prints status with masked keys and does not test providers', async () => {
      writeFileSync(
        envPath,
        'DEFAULT_AI_PROVIDER=openai\nOPENAI_API_KEY=sk-exixxxxxxxxxxxxxxx6789\nOPENAI_BASE_URL=https://p/v1\n',
      );
      await run('--show', '--env-file', envPath);
      const text = output();
      expect(text).toContain('OPENAI');
      expect(text).toContain('sk-exi...****...6789');
      expect(text).not.toContain('sk-exixxxxxxxxxxxxxxx6789');
      expect(text).toContain('Base URL:          https://p/v1');
      expect(providers.openaiOptions).toHaveLength(0);
    });

    it('--show --test also checks provider health', async () => {
      writeFileSync(envPath, 'GEMINI_API_KEY=g\n');
      await run('--show', '--test', '--env-file', envPath);
      expect(output()).toContain('Google Gemini: ✔ Connected (11ms)');
    });

    it('--test alone shows status then tests', async () => {
      writeFileSync(envPath, 'GEMINI_API_KEY=g\n');
      await run('--test', '--env-file', envPath);
      const text = output();
      expect(text).toContain('Ririko AI Configuration Status');
      expect(text).toContain('Testing AI Provider Connections');
    });

    it('rejects an unknown provider with exit code 1 and writes nothing', async () => {
      const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code}`);
      }) as never);
      await expect(run('--provider', 'claude', '--env-file', envPath)).rejects.toThrow('exit:1');
      expect(exit).toHaveBeenCalledWith(1);
      expect(output()).toContain("Invalid provider: 'claude'");
      expect(existsSync(envPath)).toBe(false);
    });

    it('masks secrets in the update summary and tests afterwards with --test', async () => {
      await run(
        '--provider',
        'GEMINI',
        '--gemini-key',
        'AIzaSyAbcdefghijklmnop',
        '--model',
        'gemini-2.5-pro',
        '--test',
        '--env-file',
        envPath,
      );
      const text = output();
      expect(text).toContain('DEFAULT_AI_PROVIDER = gemini');
      expect(text).toContain('DEFAULT_AI_MODEL = gemini-2.5-pro');
      expect(text).toContain('GEMINI_API_KEY = AIzaSy...****...mnop');
      expect(text).not.toContain('AIzaSyAbcdefghijklmnop');
      expect(text).toContain('Testing AI Provider Connections');
      expect(readEnvFile(envPath).GEMINI_API_KEY).toBe('AIzaSyAbcdefghijklmnop');
    });

    it('prints status and a tip when no flags are given outside a TTY', async () => {
      const original = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
      try {
        await run('--env-file', envPath);
      } finally {
        Object.defineProperty(process.stdin, 'isTTY', { value: original, configurable: true });
      }
      expect(output()).toContain('Ririko AI Configuration Status');
      expect(output()).toContain('ririko ai:configure -i');
      expect(existsSync(envPath)).toBe(false);
    });

    it('--interactive runs the wizard', async () => {
      rl.answers = ['3', 'http://wiz:11434', '', 'n', 'n', ''];
      await run('--interactive', '--env-file', envPath);
      expect(readEnvFile(envPath).OLLAMA_BASE_URL).toBe('http://wiz:11434');
      expect(readEnvFile(envPath).DEFAULT_AI_PROVIDER).toBe('ollama');
    });

    it('writes the OpenAI base URL as a plain value in the summary', async () => {
      await run(
        '--openai-key',
        'sk-secretvalue12345',
        '--openai-base-url',
        'https://groq.example/v1',
        '--ollama-url',
        'http://o:1',
        '--env-file',
        envPath,
      );
      const text = output();
      expect(text).toContain('OPENAI_BASE_URL = https://groq.example/v1');
      expect(text).toContain('OLLAMA_BASE_URL = http://o:1');
      expect(text).toContain('OPENAI_API_KEY = sk-sec...');
      expect(readEnvFile(envPath).OPENAI_BASE_URL).toBe('https://groq.example/v1');
    });
  });
});
