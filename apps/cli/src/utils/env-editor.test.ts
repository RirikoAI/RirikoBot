import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  formatEnvLine,
  maskSecret,
  readEnvFile,
  resolveEnvFilePath,
  updateEnvFile,
} from './env-editor.js';

describe('env-editor utility', () => {
  const testEnvPath = resolve(tmpdir(), 'test-ririko-env-editor.env');

  beforeEach(() => {
    if (existsSync(testEnvPath)) {
      rmSync(testEnvPath, { force: true });
    }
  });

  afterEach(() => {
    if (existsSync(testEnvPath)) {
      rmSync(testEnvPath, { force: true });
    }
  });

  describe('maskSecret', () => {
    it('handles empty and null values safely', () => {
      expect(maskSecret()).toBe('(not set)');
      expect(maskSecret(null)).toBe('(not set)');
      expect(maskSecret('')).toBe('(not set)');
      expect(maskSecret('   ')).toBe('(empty)');
    });

    it('masks short keys', () => {
      expect(maskSecret('12345')).toBe('****');
      expect(maskSecret('12345678')).toBe('****');
    });

    it('masks medium keys (9-16 chars)', () => {
      const masked = maskSecret('abcdefghijklmno');
      expect(masked).toBe('abc****no');
    });

    it('masks long keys (> 16 chars)', () => {
      const masked = maskSecret('AIzaSyD-1234567890abcdefghijklmn_X9');
      expect(masked).toBe('AIzaSy...****...n_X9');
    });
  });

  describe('formatEnvLine', () => {
    it('formats simple values without quotes', () => {
      expect(formatEnvLine('FOO', 'bar')).toBe('FOO=bar');
    });

    it('formats values containing spaces with quotes', () => {
      expect(formatEnvLine('GREETING', 'hello world')).toBe('GREETING="hello world"');
    });

    it('escapes quotes inside quoted values', () => {
      expect(formatEnvLine('MSG', 'hello "friend"')).toBe('MSG="hello \\"friend\\""');
    });
  });

  describe('readEnvFile & updateEnvFile', () => {
    it('reads and parses existing .env file', () => {
      const sample = [
        '# Header comment',
        'DISCORD_TOKEN=secret_token',
        'PORT=3000',
        'QUOTED="with spaces and symbols #1"',
      ].join('\n');
      writeFileSync(testEnvPath, sample, 'utf-8');

      const parsed = readEnvFile(testEnvPath);
      expect(parsed.DISCORD_TOKEN).toBe('secret_token');
      expect(parsed.PORT).toBe('3000');
      expect(parsed.QUOTED).toBe('with spaces and symbols #1');
    });

    it('updates existing keys in-place and preserves comments', () => {
      const sample = [
        '# Core Settings',
        'DISCORD_TOKEN=initial_token',
        'GEMINI_API_KEY=old_gemini_key',
        '',
        '# Database Settings',
        'DATABASE_URL=./data/ririko.sqlite',
      ].join('\n');
      writeFileSync(testEnvPath, sample, 'utf-8');

      const result = updateEnvFile(testEnvPath, {
        GEMINI_API_KEY: 'new_gemini_key_123',
        DEFAULT_AI_PROVIDER: 'gemini',
      });

      expect(result.updatedKeys).toContain('GEMINI_API_KEY');
      expect(result.addedKeys).toContain('DEFAULT_AI_PROVIDER');

      const updatedContent = readFileSync(testEnvPath, 'utf-8');
      expect(updatedContent).toContain('GEMINI_API_KEY=new_gemini_key_123');
      expect(updatedContent).toContain('DISCORD_TOKEN=initial_token');
      expect(updatedContent).toContain('DATABASE_URL=./data/ririko.sqlite');
      expect(updatedContent).toContain('DEFAULT_AI_PROVIDER=gemini');
      expect(updatedContent).toContain('# Core Settings');
    });

    it('uncomments commented out variable if present', () => {
      const sample = ['# GEMINI_API_KEY=', 'DEFAULT_PREFIX=!'].join('\n');
      writeFileSync(testEnvPath, sample, 'utf-8');

      const result = updateEnvFile(testEnvPath, {
        GEMINI_API_KEY: 'fresh_key',
      });

      expect(result.updatedKeys).toContain('GEMINI_API_KEY');
      const updatedContent = readFileSync(testEnvPath, 'utf-8');
      expect(updatedContent).toContain('GEMINI_API_KEY=fresh_key');
      expect(updatedContent).not.toContain('# GEMINI_API_KEY=');
    });

    it('creates file if it does not exist', () => {
      const result = updateEnvFile(testEnvPath, {
        DEFAULT_AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-test1234567890',
      });

      expect(result.addedKeys).toContain('DEFAULT_AI_PROVIDER');
      expect(result.addedKeys).toContain('OPENAI_API_KEY');
      expect(existsSync(testEnvPath)).toBe(true);

      const parsed = readEnvFile(testEnvPath);
      expect(parsed.DEFAULT_AI_PROVIDER).toBe('openai');
      expect(parsed.OPENAI_API_KEY).toBe('sk-test1234567890');
    });
  });

  describe('resolveEnvFilePath', () => {
    it('resolves custom path when provided', () => {
      const path = resolveEnvFilePath('custom.env');
      expect(path).toBe(resolve(process.cwd(), 'custom.env'));
    });
  });
});
