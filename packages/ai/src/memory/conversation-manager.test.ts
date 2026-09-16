import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient, AiRepository } from '@ririko/database';
import type { SqliteDatabaseClient } from '@ririko/database';
import { ConversationManager } from './conversation-manager.js';
import type { UserContext } from '../types/index.js';

describe('ConversationManager — Per-User Context Isolation & Memory (TASK-0611)', () => {
  let client: SqliteDatabaseClient;
  let aiRepo: AiRepository;
  let conversationManager: ConversationManager;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    // Initialize database schema
    client.raw.exec(`
      CREATE TABLE ai_channels (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL
      );

      CREATE TABLE ai_conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        guild_id TEXT,
        channel_id TEXT,
        provider TEXT NOT NULL DEFAULT 'GEMINI',
        model TEXT NOT NULL,
        summary TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE ai_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_calls TEXT,
        token_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE ai_guild_preferences (
        guild_id TEXT PRIMARY KEY,
        personality_prompt TEXT,
        speaking_style TEXT NOT NULL DEFAULT 'FRIENDLY_ANIME',
        allowed_tools TEXT NOT NULL DEFAULT '[]',
        model_override TEXT
      );

      CREATE TABLE ai_user_preferences (
        user_id TEXT PRIMARY KEY,
        nickname TEXT,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        language_preference TEXT NOT NULL DEFAULT 'en'
      );
    `);

    aiRepo = new AiRepository(client);
    conversationManager = new ConversationManager({
      repository: aiRepo,
      defaultWindowSize: 20,
    });
  });

  afterEach(async () => {
    await client.close();
  });

  describe('1. Strict Per-User Context Isolation in Shared Channels', () => {
    it('ensures Alice and Bob in the same #ririko-ai channel never share or leak memory', async () => {
      const aliceContext: UserContext = {
        userId: 'user-alice-111',
        guildId: 'guild-anime-club',
        channelId: 'channel-ririko-ai',
        username: 'Alice',
      };

      const bobContext: UserContext = {
        userId: 'user-bob-222',
        guildId: 'guild-anime-club',
        channelId: 'channel-ririko-ai',
        username: 'Bob',
      };

      // Alice chats with Ririko
      await conversationManager.recordTurn(
        aliceContext,
        'My secret favorite anime is Madoka Magica.',
        'Madoka Magica is a masterpiece! Homura did nothing wrong!',
      );

      // Bob chats with Ririko in the exact same channel
      await conversationManager.recordTurn(
        bobContext,
        'Do you know what anime Alice likes?',
        'I do not know, each user has their own private conversation!',
      );

      // Verify Alice context contains ONLY Alice turns
      const aliceMessages = await conversationManager.getContextMessages(aliceContext);
      expect(aliceMessages).toHaveLength(2);
      expect(aliceMessages[0]).toEqual({
        role: 'user',
        content: 'My secret favorite anime is Madoka Magica.',
      });
      expect(aliceMessages[1]).toEqual({
        role: 'assistant',
        content: 'Madoka Magica is a masterpiece! Homura did nothing wrong!',
      });

      // Verify Bob context contains ONLY Bob turns
      const bobMessages = await conversationManager.getContextMessages(bobContext);
      expect(bobMessages).toHaveLength(2);
      expect(bobMessages[0]).toEqual({
        role: 'user',
        content: 'Do you know what anime Alice likes?',
      });
      expect(bobMessages[1]).toEqual({
        role: 'assistant',
        content: 'I do not know, each user has their own private conversation!',
      });
    });

    it('isolates user memory across different guilds for the same user', async () => {
      const aliceGuild1: UserContext = {
        userId: 'user-alice-111',
        guildId: 'guild-1',
        channelId: 'channel-1',
      };

      const aliceGuild2: UserContext = {
        userId: 'user-alice-111',
        guildId: 'guild-2',
        channelId: 'channel-2',
      };

      await conversationManager.recordTurn(aliceGuild1, 'Hello from Guild 1', 'Hi Guild 1!');
      await conversationManager.recordTurn(aliceGuild2, 'Hello from Guild 2', 'Hi Guild 2!');

      const g1Messages = await conversationManager.getContextMessages(aliceGuild1);
      const g2Messages = await conversationManager.getContextMessages(aliceGuild2);

      expect(g1Messages[0]?.content).toBe('Hello from Guild 1');
      expect(g2Messages[0]?.content).toBe('Hello from Guild 2');
    });
  });

  describe('2. Sliding Window Context Truncation', () => {
    it('truncates message history to the specified windowSize in chronological order', async () => {
      const userContext: UserContext = {
        userId: 'user-charlie',
        guildId: 'guild-gaming',
        channelId: 'channel-ai',
      };

      // Record 15 turns (30 messages)
      for (let i = 1; i <= 15; i++) {
        await conversationManager.recordTurn(
          userContext,
          `User Turn ${i}`,
          `Assistant Response ${i}`,
        );
      }

      // Default window size is 20
      const defaultWindow = await conversationManager.getContextMessages(userContext);
      expect(defaultWindow).toHaveLength(20);
      // Oldest message in this window should be User Turn 6
      expect(defaultWindow[0]?.content).toBe('User Turn 6');
      expect(defaultWindow[19]?.content).toBe('Assistant Response 15');

      // Custom window size of 4 messages
      const customWindow = await conversationManager.getContextMessages(userContext, 4);
      expect(customWindow).toHaveLength(4);
      expect(customWindow[0]?.content).toBe('User Turn 14');
      expect(customWindow[1]?.content).toBe('Assistant Response 14');
      expect(customWindow[2]?.content).toBe('User Turn 15');
      expect(customWindow[3]?.content).toBe('Assistant Response 15');
    });

    it('returns empty array when no conversation exists yet', async () => {
      const emptyContext: UserContext = {
        userId: 'user-nobody',
        guildId: 'g-unknown',
      };

      const messages = await conversationManager.getContextMessages(emptyContext);
      expect(messages).toEqual([]);
    });
  });

  describe('3. Tool Calls & Custom Messages', () => {
    it('preserves tool calls in assistant messages', async () => {
      const userContext: UserContext = {
        userId: 'user-dave',
        guildId: 'guild-1',
      };

      const toolCalls = [
        {
          id: 'call_time_1',
          name: 'get_current_time',
          arguments: { timezone: 'Asia/Tokyo' },
        },
      ];

      await conversationManager.recordTurn(
        userContext,
        'What time is it in Tokyo?',
        'Let me check the time for you.',
        { toolCalls },
      );

      const messages = await conversationManager.getContextMessages(userContext);
      expect(messages).toHaveLength(2);
      expect(messages[1]?.toolCalls).toEqual(toolCalls);
    });

    it('supports individual addMessage calls', async () => {
      const userContext: UserContext = {
        userId: 'user-eve',
      };

      await conversationManager.addMessage(userContext, {
        role: 'system',
        content: 'You are Ririko, a friendly anime assistant.',
      });

      await conversationManager.addMessage(userContext, {
        role: 'user',
        content: 'Hi!',
      });

      const messages = await conversationManager.getContextMessages(userContext);
      expect(messages).toHaveLength(2);
      expect(messages[0]?.role).toBe('system');
      expect(messages[1]?.role).toBe('user');
    });
  });

  describe('4. Memory Clearing & Persistence', () => {
    it('clears memory for a specific user without affecting another user', async () => {
      const userA: UserContext = { userId: 'user-a', guildId: 'g1' };
      const userB: UserContext = { userId: 'user-b', guildId: 'g1' };

      await conversationManager.recordTurn(userA, 'Msg A', 'Resp A');
      await conversationManager.recordTurn(userB, 'Msg B', 'Resp B');

      const cleared = await conversationManager.clearMemory(userA);
      expect(cleared).toBe(true);

      const messagesA = await conversationManager.getContextMessages(userA);
      expect(messagesA).toEqual([]);

      // User B remains intact
      const messagesB = await conversationManager.getContextMessages(userB);
      expect(messagesB).toHaveLength(2);
    });
  });

  describe('5. Preferences Integration', () => {
    it('manages user preferences', async () => {
      await conversationManager.setUserPreferences('user-frank', {
        timezone: 'America/New_York',
        nickname: 'Frankie',
      });

      const prefs = await conversationManager.getUserPreferences('user-frank');
      expect(prefs?.timezone).toBe('America/New_York');
      expect(prefs?.nickname).toBe('Frankie');
    });

    it('manages guild preferences', async () => {
      await conversationManager.setGuildPreferences('guild-test', {
        personalityPrompt: 'Be a stern senpai.',
        speakingStyle: 'TSUNDERE',
        allowedTools: ['get_current_time'],
      });

      const prefs = await conversationManager.getGuildPreferences('guild-test');
      expect(prefs?.personalityPrompt).toBe('Be a stern senpai.');
      expect(prefs?.speakingStyle).toBe('TSUNDERE');
      expect(prefs?.allowedTools).toEqual(['get_current_time']);
    });
  });
});
