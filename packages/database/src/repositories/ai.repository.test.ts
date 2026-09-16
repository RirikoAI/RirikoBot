import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { SqliteDatabaseClient } from '../client/types.js';
import { AiRepository } from './ai.repository.js';

describe('AiRepository — AI Conversations, Messages & Isolation (TASK-0611)', () => {
  let client: SqliteDatabaseClient;
  let aiRepo: AiRepository;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    // Create tables for AI subsystem
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
  });

  afterEach(async () => {
    await client.close();
  });

  describe('1. AI Dedicated Channel Mapping', () => {
    it('sets, gets and removes dedicated AI channel for guild', async () => {
      expect(await aiRepo.getAiChannel('guild-1')).toBeNull();

      await aiRepo.setAiChannel('guild-1', 'channel-ai-101');
      expect(await aiRepo.getAiChannel('guild-1')).toBe('channel-ai-101');

      // Update channel
      await aiRepo.setAiChannel('guild-1', 'channel-ai-102');
      expect(await aiRepo.getAiChannel('guild-1')).toBe('channel-ai-102');

      // Remove channel
      const removed = await aiRepo.removeAiChannel('guild-1');
      expect(removed).toBe(true);
      expect(await aiRepo.getAiChannel('guild-1')).toBeNull();
    });
  });

  describe('2. Strict Per-User Context Isolation', () => {
    it('creates distinct conversations for Alice and Bob in the same channel', async () => {
      const guildId = 'guild-shared';
      const channelId = 'channel-ririko-ai';

      const aliceConv = await aiRepo.getOrCreateConversation({
        userId: 'user-alice',
        guildId,
        channelId,
        provider: 'GEMINI',
        model: 'gemini-2.5-flash',
      });

      const bobConv = await aiRepo.getOrCreateConversation({
        userId: 'user-bob',
        guildId,
        channelId,
        provider: 'GEMINI',
        model: 'gemini-2.5-flash',
      });

      expect(aliceConv.id).not.toBe(bobConv.id);
      expect(aliceConv.userId).toBe('user-alice');
      expect(bobConv.userId).toBe('user-bob');
    });

    it('retrieves the existing conversation for the same user in the same context', async () => {
      const conv1 = await aiRepo.getOrCreateConversation({
        userId: 'user-alice',
        guildId: 'guild-1',
        channelId: 'channel-1',
      });

      const conv2 = await aiRepo.getOrCreateConversation({
        userId: 'user-alice',
        guildId: 'guild-1',
        channelId: 'channel-1',
      });

      expect(conv1.id).toBe(conv2.id);
    });

    it('isolates user DM context from guild context', async () => {
      const guildConv = await aiRepo.getOrCreateConversation({
        userId: 'user-alice',
        guildId: 'guild-1',
        channelId: 'channel-1',
      });

      const dmConv = await aiRepo.getOrCreateConversation({
        userId: 'user-alice',
        guildId: null,
        channelId: null,
      });

      expect(guildConv.id).not.toBe(dmConv.id);
    });
  });

  describe('3. Messages & Sliding Window', () => {
    it('appends messages and retrieves sliding window in chronological order', async () => {
      const conv = await aiRepo.getOrCreateConversation({
        userId: 'user-alice',
        guildId: 'g1',
        channelId: 'c1',
      });

      // Add 6 messages with increasing timestamps
      for (let i = 1; i <= 6; i++) {
        await aiRepo.addMessage({
          conversationId: conv.id,
          role: i % 2 === 1 ? 'USER' : 'ASSISTANT',
          content: `Message ${i}`,
          toolCalls: null,
          tokenCount: 10 * i,
          createdAt: new Date(1700000000000 + i * 1000),
        });
      }

      // Retrieve sliding window of 3 messages
      const window = await aiRepo.getSlidingWindowMessages(conv.id, 3);
      expect(window).toHaveLength(3);
      // Must be chronological: Message 4, Message 5, Message 6
      expect(window[0]?.content).toBe('Message 4');
      expect(window[1]?.content).toBe('Message 5');
      expect(window[2]?.content).toBe('Message 6');
    });

    it('stores and retrieves tool calls in message', async () => {
      const conv = await aiRepo.getOrCreateConversation({
        userId: 'user-alice',
      });

      const toolCalls = [
        { id: 'call_1', name: 'get_current_time', arguments: { timezone: 'UTC' } },
      ];

      const msg = await aiRepo.addMessage({
        conversationId: conv.id,
        role: 'ASSISTANT',
        content: '',
        toolCalls,
        tokenCount: 15,
      });

      expect(msg.toolCalls).toEqual(toolCalls);
    });

    it('clears conversation messages on clearConversation and clearUserContext', async () => {
      const conv = await aiRepo.getOrCreateConversation({
        userId: 'user-alice',
        guildId: 'g1',
        channelId: 'c1',
      });

      await aiRepo.addMessage({
        conversationId: conv.id,
        role: 'USER',
        content: 'Hello!',
      });

      expect(await aiRepo.getMessages(conv.id)).toHaveLength(1);

      const cleared = await aiRepo.clearUserContext({
        userId: 'user-alice',
        guildId: 'g1',
        channelId: 'c1',
      });

      expect(cleared).toBe(true);
      expect(await aiRepo.getMessages(conv.id)).toHaveLength(0);
    });
  });

  describe('4. Guild & User Preferences', () => {
    it('upserts and retrieves guild preferences', async () => {
      expect(await aiRepo.getGuildPreferences('guild-1')).toBeNull();

      const pref = await aiRepo.upsertGuildPreferences('guild-1', {
        personalityPrompt: 'Be tsundere and cute.',
        speakingStyle: 'TSUNDERE',
        allowedTools: ['get_current_time', 'games.coinflip'],
      });

      expect(pref.guildId).toBe('guild-1');
      expect(pref.speakingStyle).toBe('TSUNDERE');
      expect(pref.allowedTools).toEqual(['get_current_time', 'games.coinflip']);

      // Update
      const updated = await aiRepo.upsertGuildPreferences('guild-1', {
        speakingStyle: 'KUUDERE',
      });
      expect(updated.speakingStyle).toBe('KUUDERE');
    });

    it('upserts and retrieves user preferences', async () => {
      expect(await aiRepo.getUserPreferences('user-alice')).toBeNull();

      const pref = await aiRepo.upsertUserPreferences('user-alice', {
        nickname: 'Ali-chan',
        timezone: 'Asia/Tokyo',
        languagePreference: 'ja',
      });

      expect(pref.userId).toBe('user-alice');
      expect(pref.nickname).toBe('Ali-chan');
      expect(pref.timezone).toBe('Asia/Tokyo');
      expect(pref.languagePreference).toBe('ja');
    });
  });
});
