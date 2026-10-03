import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { AiRepository } from './ai.repository.js';

const MISSING_UUID = '00000000-0000-4000-8000-000000000001';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const T0 = new Date('2026-05-01T10:00:00Z');
const MINUTE = 60_000;
const at = (minutes: number) => new Date(T0.getTime() + minutes * MINUTE);

const conversation = (userId: string, overrides: Record<string, unknown> = {}) => ({
  userId,
  provider: 'GEMINI',
  model: 'gemini-test',
  ...overrides,
});

describeDialects('AiRepository behaviour', (db) => {
  it('creates a conversation with a generated id and reads it back', async () => {
    const repo = new AiRepository(db.client);
    expect(await repo.findById(MISSING_UUID)).toBeNull();
    expect(await repo.exists(MISSING_UUID)).toBe(false);
    expect(await repo.count()).toBe(0);

    const created = await repo.create(conversation('u1', { guildId: 'g1' }));
    expect(created.id).toMatch(db.dialect === 'sqlite' ? /^conv_/ : UUID);
    expect(created.summary).toBeNull();
    expect(created.guildId).toBe('g1');

    expect((await repo.findById(created.id))?.model).toBe('gemini-test');
    expect(await repo.exists(created.id)).toBe(true);
    expect(await repo.count()).toBe(1);

    const fixed = randomUUID();
    const explicit = await repo.create(conversation('u2', { id: fixed }));
    expect(explicit.id).toBe(fixed);
  });

  it('updates a conversation, touching updatedAt, and throws for a missing one', async () => {
    const repo = new AiRepository(db.client);
    const created = await repo.create(conversation('u1', { updatedAt: at(0), createdAt: at(0) }));

    const updated = await repo.update(created.id, { summary: 'They like cats.' });
    expect(updated.summary).toBe('They like cats.');
    expect(updated.updatedAt.getTime()).toBeGreaterThan(at(0).getTime());

    await expect(repo.update(MISSING_UUID, { summary: 'x' })).rejects.toThrow(DatabaseError);
  });

  it('deletes a conversation together with its messages', async () => {
    const repo = new AiRepository(db.client);
    const kept = await repo.create(conversation('u1'));
    const doomed = await repo.create(conversation('u2'));
    await repo.addMessage({ conversationId: kept.id, role: 'USER', content: 'keep me' });
    await repo.addMessage({ conversationId: doomed.id, role: 'USER', content: 'bye' });

    expect(await repo.delete(doomed.id)).toBe(true);
    expect(await repo.delete(doomed.id)).toBe(false);
    expect(await repo.getMessages(doomed.id)).toEqual([]);
    expect(await repo.getMessages(kept.id)).toHaveLength(1);
    expect(await repo.count()).toBe(1);
  });

  it('maps a guild to its dedicated ai channel', async () => {
    const repo = new AiRepository(db.client);
    expect(await repo.getAiChannel('g1')).toBeNull();

    await repo.setAiChannel('g1', 'c1');
    expect(await repo.getAiChannel('g1')).toBe('c1');
    await repo.setAiChannel('g1', 'c2');
    expect(await repo.getAiChannel('g1')).toBe('c2');
    expect(await repo.getAiChannel('g2')).toBeNull();

    expect(await repo.removeAiChannel('g1')).toBe(true);
    expect(await repo.removeAiChannel('g1')).toBe(false);
    expect(await repo.getAiChannel('g1')).toBeNull();
  });

  it('finds the newest conversation for exactly one user, guild and channel context', async () => {
    const repo = new AiRepository(db.client);
    const dm = await repo.create(conversation('u1', { updatedAt: at(1), createdAt: at(1) }));
    const guildWide = await repo.create(
      conversation('u1', { guildId: 'g1', updatedAt: at(2), createdAt: at(2) }),
    );
    const inChannel = await repo.create(
      conversation('u1', { guildId: 'g1', channelId: 'c1', updatedAt: at(3), createdAt: at(3) }),
    );
    const newerInChannel = await repo.create(
      conversation('u1', { guildId: 'g1', channelId: 'c1', updatedAt: at(4), createdAt: at(4) }),
    );
    await repo.create(conversation('u2', { guildId: 'g1', channelId: 'c1' }));

    expect((await repo.findConversationByUserContext({ userId: 'u1' }))?.id).toBe(dm.id);
    expect((await repo.findConversationByUserContext({ userId: 'u1', guildId: 'g1' }))?.id).toBe(
      guildWide.id,
    );
    const found = await repo.findConversationByUserContext({
      userId: 'u1',
      guildId: 'g1',
      channelId: 'c1',
    });
    expect(found?.id).toBe(newerInChannel.id);
    expect(found?.id).not.toBe(inChannel.id);
    expect(await repo.findConversationByUserContext({ userId: 'u1', guildId: 'g2' })).toBeNull();
    expect(await repo.findConversationByUserContext({ userId: 'nobody' })).toBeNull();
  });

  it('reuses a conversation for the same context and creates one otherwise', async () => {
    const repo = new AiRepository(db.client);

    const first = await repo.getOrCreateConversation({ userId: 'u1', guildId: 'g1' });
    expect(first.provider).toBe('GEMINI');
    expect(first.model).toBe('gemini-2.5-flash');
    expect(first.channelId).toBeNull();

    const again = await repo.getOrCreateConversation({ userId: 'u1', guildId: 'g1' });
    expect(again.id).toBe(first.id);
    expect(again.updatedAt.getTime()).toBeGreaterThanOrEqual(first.updatedAt.getTime());

    const custom = await repo.getOrCreateConversation({
      userId: 'u1',
      guildId: 'g1',
      channelId: 'c9',
      provider: 'OPENAI',
      model: 'gpt-test',
    });
    expect(custom.id).not.toBe(first.id);
    expect(custom.provider).toBe('OPENAI');
    expect(custom.model).toBe('gpt-test');
    expect(await repo.count()).toBe(2);
  });

  it('clears the messages and summary of a conversation but keeps the conversation', async () => {
    const repo = new AiRepository(db.client);
    const conv = await repo.create(conversation('u1', { guildId: 'g1' }));
    const other = await repo.create(conversation('u2'));
    await repo.update(conv.id, { summary: 'old summary' });
    await repo.addMessage({ conversationId: conv.id, role: 'USER', content: 'hello' });
    await repo.addMessage({ conversationId: other.id, role: 'USER', content: 'untouched' });

    await repo.clearConversation(conv.id);
    expect(await repo.getMessages(conv.id)).toEqual([]);
    expect((await repo.findById(conv.id))?.summary).toBeNull();
    expect(await repo.getMessages(other.id)).toHaveLength(1);

    await repo.addMessage({ conversationId: conv.id, role: 'USER', content: 'again' });
    expect(await repo.clearUserContext({ userId: 'u1', guildId: 'g1' })).toBe(true);
    expect(await repo.getMessages(conv.id)).toEqual([]);
    expect(await repo.clearUserContext({ userId: 'nobody' })).toBe(false);
  });

  it('stores messages with defaults and touches the parent conversation', async () => {
    const repo = new AiRepository(db.client);
    const conv = await repo.create(conversation('u1', { updatedAt: at(0), createdAt: at(0) }));

    const message = await repo.addMessage({
      conversationId: conv.id,
      role: 'ASSISTANT',
      content: 'Konnichiwa',
      toolCalls: [{ name: 'get_current_time' }],
      tokenCount: 7,
    });
    expect(message.id).toMatch(db.dialect === 'sqlite' ? /^msg_/ : UUID);
    expect(message.tokenCount).toBe(7);
    expect(message.toolCalls).toEqual([{ name: 'get_current_time' }]);

    const fixedId = randomUUID();
    const plain = await repo.addMessage({
      id: fixedId,
      conversationId: conv.id,
      role: 'USER',
      content: 'hi',
    });
    expect(plain.id).toBe(fixedId);
    expect(plain.tokenCount).toBe(0);
    expect(plain.toolCalls).toBeNull();
    expect((await repo.findById(conv.id))?.updatedAt.getTime()).toBeGreaterThan(at(0).getTime());
  });

  it('reads messages oldest first and a sliding window of the latest ones', async () => {
    const repo = new AiRepository(db.client);
    const conv = await repo.create(conversation('u1'));
    for (let n = 1; n <= 5; n++)
      await repo.addMessage({
        conversationId: conv.id,
        role: n % 2 ? 'USER' : 'ASSISTANT',
        content: `m${n}`,
        createdAt: at(n),
      });

    expect((await repo.getMessages(conv.id)).map((m) => m.content)).toEqual([
      'm1',
      'm2',
      'm3',
      'm4',
      'm5',
    ]);
    expect((await repo.getMessages(conv.id, 2)).map((m) => m.content)).toEqual(['m1', 'm2']);
    expect((await repo.getSlidingWindowMessages(conv.id, 3)).map((m) => m.content)).toEqual([
      'm3',
      'm4',
      'm5',
    ]);
    expect(await repo.getSlidingWindowMessages(conv.id)).toHaveLength(5);
    expect(await repo.getSlidingWindowMessages(MISSING_UUID)).toEqual([]);
  });

  it('upserts guild preferences, keeping the fields a later upsert leaves out', async () => {
    const repo = new AiRepository(db.client);
    expect(await repo.getGuildPreferences('g1')).toBeNull();

    const created = await repo.upsertGuildPreferences('g1', { speakingStyle: 'FRIENDLY_ANIME' });
    expect(created.speakingStyle).toBe('FRIENDLY_ANIME');
    expect(created.toolsEnabled).toBe(true);
    expect(created.allowedTools).toEqual([]);
    expect(created.personalityPrompt).toBeNull();

    const changed = await repo.upsertGuildPreferences('g1', {
      personalityPrompt: 'Be kind.',
      allowedTools: ['get_current_time'],
      toolsEnabled: false,
      providerOverride: 'ollama',
      modelOverride: 'llama',
    });
    expect(changed.personalityPrompt).toBe('Be kind.');
    expect(changed.allowedTools).toEqual(['get_current_time']);
    expect(changed.toolsEnabled).toBe(false);
    expect(changed.providerOverride).toBe('ollama');

    const partial = await repo.upsertGuildPreferences('g1', { speakingStyle: 'FORMAL' });
    expect(partial.speakingStyle).toBe('FORMAL');
    expect(partial.personalityPrompt).toBe('Be kind.');
    expect((await repo.getGuildPreferences('g1'))?.modelOverride).toBe('llama');
    expect(await repo.getGuildPreferences('g2')).toBeNull();
  });

  it('upserts user preferences, keeping the fields a later upsert leaves out', async () => {
    const repo = new AiRepository(db.client);
    expect(await repo.getUserPreferences('u1')).toBeNull();

    const created = await repo.upsertUserPreferences('u1', { timezone: 'UTC' });
    expect(created.timezone).toBe('UTC');
    expect(created.languagePreference).toBe('en');
    expect(created.nickname).toBeNull();

    const changed = await repo.upsertUserPreferences('u1', {
      nickname: 'Ri',
      timezone: 'Asia/Tokyo',
    });
    expect(changed.nickname).toBe('Ri');
    expect(changed.timezone).toBe('Asia/Tokyo');

    const partial = await repo.upsertUserPreferences('u1', { languagePreference: 'ja' });
    expect(partial.languagePreference).toBe('ja');
    expect(partial.nickname).toBe('Ri');
    expect((await repo.getUserPreferences('u1'))?.timezone).toBe('Asia/Tokyo');
    expect(await repo.getUserPreferences('u2')).toBeNull();
  });
});
