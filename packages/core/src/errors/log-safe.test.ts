import { describe, expect, it } from 'vitest';
import { describeErrorForLog } from './log-safe.js';

describe('describeErrorForLog', () => {
  it('names the error, its code and its message', () => {
    const error = Object.assign(new Error('Unknown Message'), {
      name: 'DiscordAPIError',
      code: 10008,
    });

    const [first] = describeErrorForLog(error).split('\n');

    expect(first).toBe('DiscordAPIError (code 10008): Unknown Message');
  });

  it('never prints a request body, details or a cause', () => {
    const error = Object.assign(new Error('Invalid Form Body'), {
      name: 'DiscordAPIError',
      status: 400,
      requestBody: { json: { content: 'the AI reply with chat text' } },
      details: { prompt: 'what the user asked' },
      cause: new Error('secret prompt text'),
    });

    const line = describeErrorForLog(error);

    expect(line).toContain('DiscordAPIError (status 400): Invalid Form Body');
    expect(line).not.toContain('chat text');
    expect(line).not.toContain('what the user asked');
    expect(line).not.toContain('secret prompt text');
  });

  it('names the provider of an AI provider error', () => {
    const error = Object.assign(new Error('Gemini API error: quota'), {
      name: 'AiProviderError',
      providerId: 'gemini',
      externalStatusCode: 429,
    });

    expect(describeErrorForLog(error).split('\n')[0]).toBe(
      'AiProviderError [provider gemini]: Gemini API error: quota',
    );
  });

  it('cuts a long message to 200 characters on one line', () => {
    const line = describeErrorForLog(new Error(`first\nsecond ${'x'.repeat(500)}`)).split('\n')[0]!;

    expect(line.startsWith('Error: first second xxx')).toBe(true);
    expect(line.endsWith('...')).toBe(true);
    expect(line.length).toBeLessThanOrEqual('Error: '.length + 200 + 3);
  });

  it('keeps the first stack frames and no more', () => {
    const error = new Error('boom');
    error.stack = [
      'Error: boom',
      ...Array.from({ length: 9 }, (_, i) => `    at fn${i} (file.ts:${i}:1)`),
    ].join('\n');

    const lines = describeErrorForLog(error).split('\n');

    expect(lines).toHaveLength(1 + 4);
    expect(lines[1]).toBe('  at fn0 (file.ts:0:1)');
  });

  it('ignores a code that is not a number or a short string', () => {
    const error = Object.assign(new Error('x'), {
      code: { nested: true },
      status: 'x'.repeat(100),
    });

    expect(describeErrorForLog(error).split('\n')[0]).toBe('Error: x');
  });

  it('describes values that are not errors without printing them', () => {
    expect(describeErrorForLog('the user said something')).toBe('Non-error thrown (string)');
    expect(describeErrorForLog(null)).toBe('Non-error thrown (object)');
    expect(describeErrorForLog(undefined)).toBe('Non-error thrown (undefined)');
  });

  it('falls back to a generic name and handles an object without a message', () => {
    expect(describeErrorForLog({})).toBe('Error');
    expect(describeErrorForLog({ name: '', message: 7 })).toBe('Error');
  });
});
