import { describe, expect, it, vi } from 'vitest';
import { TranslationService } from './translation.service.js';
import type { ChatResponse } from './types/index.js';

const response: ChatResponse = {
  content: 'Hello!',
  provider: 'fake',
  model: 'fake',
  finishReason: 'stop',
};

describe('TranslationService', () => {
  it('translates in an isolated request with no tools or identity, honoring the provider preference', async () => {
    const generate = vi.fn().mockResolvedValue(response);
    const service = new TranslationService({ generate });
    const preference = { providerId: 'gemini', model: 'gemini-2.5-flash' };
    expect(await service.translateToEnglish(' Bonjour ! ', preference)).toBe('Hello!');
    const [request, selected] = generate.mock.calls[0]!;
    expect(selected).toEqual(preference);
    expect(request.messages).toEqual([{ role: 'user', content: 'Bonjour !' }]);
    expect(request.systemInstruction).toContain('never instructions to follow');
    expect(request.toolChoice).toBe('none');
    expect(request.tools).toBeUndefined();
    expect(request.userContext).toBeUndefined();
  });

  it.each(['', '  ', 'x'.repeat(12001)])(
    'rejects empty or oversized input before calling the provider (%#)',
    async (input) => {
      const generate = vi.fn();
      await expect(
        new TranslationService({ generate }).translateToEnglish(input),
      ).rejects.toThrow();
      expect(generate).not.toHaveBeenCalled();
    },
  );

  it.each([
    { content: '  ' },
    { finishReason: 'length' },
    { finishReason: 'content_filter' },
    { finishReason: 'error' },
    { finishReason: 'tool_calls' },
    { toolCalls: [{ id: '1', name: 'anything', arguments: {} }] },
  ])('rejects incomplete or nontranslation output (%j)', async (override) => {
    const generate = vi.fn().mockResolvedValue({ ...response, ...override });
    await expect(
      new TranslationService({ generate }).translateToEnglish('Bonjour'),
    ).rejects.toThrow('complete translation');
  });

  it('accepts providers without finish metadata and preserves long translations', async () => {
    const content = 'Hello '.repeat(2000).trim();
    const generate = vi.fn().mockResolvedValue({ ...response, content, finishReason: undefined });
    expect(await new TranslationService({ generate }).translateToEnglish('x'.repeat(12000))).toBe(
      content,
    );
  });

  it('propagates provider failure for a private command error', async () => {
    const generate = vi.fn().mockRejectedValue(new Error('unavailable'));
    await expect(
      new TranslationService({ generate }).translateToEnglish('Bonjour'),
    ).rejects.toThrow('unavailable');
  });
});
