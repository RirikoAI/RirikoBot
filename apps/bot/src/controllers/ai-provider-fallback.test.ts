import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client, Message, TextChannel } from 'discord.js';
import { AiRateLimitError, type ChatModelProvider, type ChatToken } from '@ririko/ai';
import { createDatabaseClient, type DatabaseClient } from '@ririko/database';
import { createBotServices, type BotServices } from '../services.js';
import { AiChatController } from './ai-chat.controller.js';

/**
 * The provider wiring itself: createBotServices builds the real Gemini and OpenAI providers from
 * the environment, and the chat controller must fall back from a rate-limited Gemini to OpenAI.
 * Only the providers' network calls are replaced; the network stays blocked (vitest.setup.ts).
 */
describe('AI provider fallback through createBotServices', () => {
  let db: DatabaseClient;
  let services: BotServices;
  let controller: AiChatController;

  beforeEach(async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key');
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');
    vi.stubEnv('DEFAULT_AI_PROVIDER', '');
    vi.stubEnv('AI_PROVIDER', '');
    vi.stubEnv('DEFAULT_AI_MODEL', '');
    db = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:', autoMigrate: true });
    services = await createBotServices(db);
    await services.aiRepo.setAiChannel('guild-1', 'channel-ai');
    controller = new AiChatController({ user: { id: 'bot-1' } } as unknown as Client, services, {
      minEditIntervalMs: 0,
    });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await db.close();
  });

  /** A provider createBotServices registered; every built-in provider can stream. */
  function provider(id: string): Required<ChatModelProvider> {
    const found = services.fallbackChainManager.getProvider(id);
    if (!found?.stream) throw new Error(`createBotServices did not register ${id}`);
    return found as Required<ChatModelProvider>;
  }

  /** Replaces a provider's API calls: the controller streams, and synthesis may generate. */
  function answer(target: Required<ChatModelProvider>, reply: () => string) {
    const stream = vi.spyOn(target, 'stream').mockImplementation(async function* () {
      yield { text: reply(), isFinished: true } satisfies ChatToken;
    });
    const generate = vi.spyOn(target, 'generate').mockImplementation(async () => ({
      content: reply(),
      model: target.defaultModel,
      provider: target.id,
    }));
    return { stream, generate };
  }

  function ask(content: string) {
    const replies: string[] = [];
    const reply = {
      id: 'reply-1',
      edit: vi.fn(async (data: { content: string }) => {
        replies.push(data.content);
        return reply;
      }),
    };
    const message = {
      id: 'msg-1',
      content,
      channelId: 'channel-ai',
      channel: {
        id: 'channel-ai',
        sendTyping: vi.fn(async () => {}),
        send: vi.fn(async () => {}),
      } as unknown as TextChannel,
      guild: { id: 'guild-1', name: 'Test Guild', members: { me: null } },
      author: { id: 'user-1', username: 'Alice', displayName: 'Alice', bot: false },
      member: { voice: { channelId: null } },
      mentions: { has: () => false },
      reply: vi.fn(async (data: { content: string }) => {
        replies.push(data.content);
        return reply;
      }),
    } as unknown as Message;
    return { message, replies };
  }

  it('answers from OpenAI when Gemini is rate limited, then skips Gemini during its cooldown', async () => {
    expect(services.fallbackChainManager.getDefaultProviderId()).toBe('gemini');
    const gemini = provider('gemini');
    // A stream that fails on its first read, as the Gemini SDK does on HTTP 429.
    const geminiStream = vi.spyOn(gemini, 'stream').mockImplementation(() => ({
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(new AiRateLimitError('gemini', { retryAfterMs: 60_000 })),
      }),
    }));
    const geminiGenerate = vi
      .spyOn(gemini, 'generate')
      .mockRejectedValue(new AiRateLimitError('gemini', { retryAfterMs: 60_000 }));
    const openai = answer(provider('openai'), () => 'Hello from OpenAI!');

    const first = ask('Hi Ririko!');
    expect(await controller.handleAiMessage(first.message)).toBe(true);
    expect(first.replies.at(-1)).toContain('Hello from OpenAI!');
    expect(geminiStream).toHaveBeenCalledTimes(1);
    expect(services.fallbackChainManager.getProviderStatus('gemini')).toMatchObject({
      isInCooldown: true,
    });

    const second = ask('Still there?');
    expect(await controller.handleAiMessage(second.message)).toBe(true);
    expect(second.replies.at(-1)).toContain('Hello from OpenAI!');
    // Gemini is in cooldown, so the second request goes straight to OpenAI.
    expect(geminiStream).toHaveBeenCalledTimes(1);
    expect(geminiGenerate).not.toHaveBeenCalled();
    expect(openai.stream).toHaveBeenCalledTimes(2);
  });
});
