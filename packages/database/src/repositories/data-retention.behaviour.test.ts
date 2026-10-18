import { describe, expect, it } from 'vitest';
import type { DatabaseClient } from '../client/types.js';
import { describeDialects } from '../testing/dialects.js';
import { AiRepository } from './ai.repository.js';
import { AuditLogRepository } from './audit-log.repository.js';
import { ImageRepository } from './image.repository.js';
import { MusicRepository } from './music.repository.js';
import { PURGE_BATCH_SIZE, deleteInBatches } from './retention.js';

/** The purge cutoff. Each table is tested one millisecond either side of it. */
const CUTOFF = new Date('2026-10-17T00:00:00.000Z');
const before = (ms = 1) => new Date(CUTOFF.getTime() - ms);
const after = (ms = 1) => new Date(CUTOFF.getTime() + ms);

/** Runs `select ... where x = ?`-style SQL on either dialect and returns the rows. */
async function query<T>(client: DatabaseClient, sql: string, params: unknown[] = []): Promise<T[]> {
  if (client.dialect === 'sqlite') return client.raw.prepare(sql).all(...params) as T[];
  let index = 0;
  const numbered = sql.replace(/\?/g, () => `$${++index}`);
  return (await client.raw.query(numbered, params)).rows as T[];
}

const count = async (client: DatabaseClient, table: string): Promise<number> =>
  Number((await query<{ n: number | string }>(client, `SELECT count(*) AS n FROM ${table}`))[0]?.n);

const ids = async (client: DatabaseClient, table: string, column = 'id'): Promise<string[]> =>
  (await query<Record<string, string>>(client, `SELECT ${column} FROM ${table}`))
    .map((row) => row[column]!)
    .sort();

describeDialects('Data retention purge', (db) => {
  describe('AI chat', () => {
    const conversation = (id: string, updatedAt: Date, summary: string | null = null) => ({
      id,
      userId: 'u1',
      guildId: 'g1',
      channelId: 'c1',
      model: 'gemini-pro',
      summary,
      createdAt: before(10_000),
      updatedAt,
    });
    const message = (id: string, conversationId: string, createdAt: Date) => ({
      id,
      conversationId,
      role: 'USER',
      content: 'secret chat text',
      createdAt,
    });

    // `addMessage` moves the conversation's updated_at to the real clock, which would hide the
    // times these tests set. Messages have no foreign key, so they are written first and the
    // conversation (with the time under test) afterwards.
    it('deletes messages older than the cutoff and keeps the one at it', async () => {
      const repo = new AiRepository(db.client);
      await repo.addMessage(message('msg_old', 'conv_live', before()));
      await repo.addMessage(message('msg_edge', 'conv_live', CUTOFF));
      await repo.addMessage(message('msg_new', 'conv_live', after()));
      await repo.create(conversation('conv_live', after(10_000)));

      const removed = await repo.deleteOlderThan(CUTOFF);

      expect(removed).toBe(1);
      expect(await ids(db.client, 'ai_messages')).toEqual(['msg_edge', 'msg_new']);
      expect(await ids(db.client, 'ai_conversations')).toEqual(['conv_live']);
    });

    it('deletes a conversation only when it is old and has no message left', async () => {
      const repo = new AiRepository(db.client);
      // Old, all messages old: the messages and then the conversation go.
      await repo.addMessage(message('msg_gone', 'conv_gone', before(5)));
      await repo.create(conversation('conv_gone', before()));
      // Old, empty from the start.
      await repo.create(conversation('conv_empty_old', before(2)));
      // Updated exactly at the cutoff and empty: stays.
      await repo.create(conversation('conv_empty_edge', CUTOFF));
      // Updated after the cutoff and empty: stays.
      await repo.create(conversation('conv_empty_new', after()));
      // Old, but it still has a message at the cutoff: stays with that message.
      await repo.addMessage(message('msg_kept', 'conv_kept', CUTOFF));
      await repo.create(conversation('conv_kept', before()));

      const removed = await repo.deleteOlderThan(CUTOFF);

      expect(removed).toBe(3); // msg_gone + conv_gone + conv_empty_old
      expect(await ids(db.client, 'ai_conversations')).toEqual([
        'conv_empty_edge',
        'conv_empty_new',
        'conv_kept',
      ]);
      expect(await ids(db.client, 'ai_messages')).toEqual(['msg_kept']);
    });

    it('clears the summary of every conversation not updated since the cutoff', async () => {
      const repo = new AiRepository(db.client);
      await repo.addMessage(message('msg_old', 'conv_old', CUTOFF)); // keeps the conversation
      await repo.create(conversation('conv_old', before(), 'They talked about a surprise party.'));
      await repo.create(conversation('conv_edge', CUTOFF, 'edge summary'));
      await repo.create(conversation('conv_new', after(), 'new summary'));

      await repo.deleteOlderThan(CUTOFF);

      const summaries = await query<{ id: string; summary: string | null }>(
        db.client,
        'SELECT id, summary FROM ai_conversations ORDER BY id',
      );
      expect(summaries).toEqual([
        { id: 'conv_edge', summary: 'edge summary' },
        { id: 'conv_new', summary: 'new summary' },
        { id: 'conv_old', summary: null },
      ]);
    });

    it('works through several batches and returns the total', async () => {
      const repo = new AiRepository(db.client);
      for (let i = 0; i < 7; i++)
        await repo.addMessage(message(`msg_${i}`, 'conv_a', before(i + 1)));
      await repo.create(conversation('conv_a', before()));
      await repo.create(conversation('conv_b', before()));
      await repo.create(conversation('conv_c', before(), 'old summary'));
      await repo.addMessage(message('msg_live', 'conv_live', after()));
      await repo.create(conversation('conv_live', after()));

      const removed = await repo.deleteOlderThan(CUTOFF, undefined, 2);

      expect(removed).toBe(7 + 3);
      expect(await ids(db.client, 'ai_conversations')).toEqual(['conv_live']);
      expect(await ids(db.client, 'ai_messages')).toEqual(['msg_live']);
    });

    it('does nothing on an empty database', async () => {
      expect(await new AiRepository(db.client).deleteOlderThan(CUTOFF)).toBe(0);
    });
  });

  describe('music history', () => {
    const play = (title: string, playedAt: Date) => ({
      guildId: 'g1',
      userId: 'u1',
      trackTitle: title,
      trackUrl: `https://example.com/${title}`,
      durationSeconds: 120,
      sourceProvider: 'SPOTIFY',
      playedAt,
    });
    const titles = async () =>
      (await query<{ t: string }>(db.client, 'SELECT track_title AS t FROM music_history'))
        .map((row) => row.t)
        .sort();

    it('deletes plays before the cutoff and keeps the one at it', async () => {
      const repo = new MusicRepository(db.client);
      await repo.recordHistory(play('old', before()));
      await repo.recordHistory(play('older', before(86_400_000)));
      await repo.recordHistory(play('edge', CUTOFF));
      await repo.recordHistory(play('new', after()));

      expect(await repo.deleteOlderThan(CUTOFF)).toBe(2);
      expect(await titles()).toEqual(['edge', 'new']);
    });

    it('works through several batches', async () => {
      const repo = new MusicRepository(db.client);
      for (let i = 0; i < 5; i++) await repo.recordHistory(play(`old${i}`, before(i + 1)));
      await repo.recordHistory(play('edge', CUTOFF));

      expect(await repo.deleteOlderThan(CUTOFF, undefined, 2)).toBe(5);
      expect(await titles()).toEqual(['edge']);
    });
  });

  describe('image jobs', () => {
    const job = (status: string, createdAt: Date) => ({
      userId: 'u1',
      providerId: 'gemini',
      prompt: 'private prompt',
      status,
      createdAt,
    });
    const statuses = async () =>
      (await query<{ s: string }>(db.client, 'SELECT status AS s FROM image_jobs'))
        .map((row) => row.s)
        .sort();

    it('deletes only COMPLETED and FAILED jobs older than the cutoff', async () => {
      const repo = new ImageRepository(db.client);
      await repo.create(job('COMPLETED', before()));
      await repo.create(job('FAILED', before()));
      await repo.create(job('QUEUED', before())); // unfinished jobs stay, whatever their age
      await repo.create(job('PROCESSING', before()));
      await repo.create(job('COMPLETED', CUTOFF)); // at the cutoff: stays
      await repo.create(job('FAILED', after())); // newer: stays

      expect(await repo.deleteOlderThan(CUTOFF)).toBe(2);
      expect(await statuses()).toEqual(['COMPLETED', 'FAILED', 'PROCESSING', 'QUEUED']);
      expect(await count(db.client, 'image_jobs')).toBe(4);
    });

    it('works through several batches', async () => {
      const repo = new ImageRepository(db.client);
      for (let i = 0; i < 5; i++) await repo.create(job('COMPLETED', before(i + 1)));
      await repo.create(job('COMPLETED', CUTOFF));

      expect(await repo.deleteOlderThan(CUTOFF, undefined, 2)).toBe(5);
      expect(await count(db.client, 'image_jobs')).toBe(1);
    });
  });

  describe('audit log', () => {
    const entry = (action: string, createdAt: Date) => ({ action, createdAt });
    const actions = async () =>
      (await query<{ a: string }>(db.client, 'SELECT action AS a FROM audit_logs'))
        .map((row) => row.a)
        .sort();

    it('deletes entries before the cutoff and keeps the one at it', async () => {
      const repo = new AuditLogRepository(db.client);
      for (const { action, createdAt } of [
        entry('old', before()),
        entry('edge', CUTOFF),
        entry('new', after()),
      ])
        await repo.create({ guildId: 'g1', actorUserId: 'a1', action }, createdAt);

      expect(await repo.deleteOlderThan(CUTOFF)).toBe(1);
      expect(await actions()).toEqual(['edge', 'new']);
    });

    it('works through several batches', async () => {
      const repo = new AuditLogRepository(db.client);
      for (let i = 0; i < 5; i++)
        await repo.create({ guildId: null, actorUserId: 'a1', action: `old${i}` }, before(i + 1));
      await repo.create({ guildId: null, actorUserId: 'a1', action: 'edge' }, CUTOFF);

      expect(await repo.deleteOlderThan(CUTOFF, undefined, 2)).toBe(5);
      expect(await actions()).toEqual(['edge']);
    });
  });
});

describe('deleteInBatches', () => {
  it('repeats until a batch comes back short and sums the batches', async () => {
    const batches = [5, 5, 3];
    const total = await deleteInBatches(5, async () => batches.shift() ?? 0);
    expect(total).toBe(13);
    expect(batches).toEqual([]);
  });

  it('runs one more batch after a full one, which ends it when it removes nothing', async () => {
    let calls = 0;
    const total = await deleteInBatches(2, async () => (++calls === 1 ? 2 : 0));
    expect(total).toBe(2);
    expect(calls).toBe(2);
  });

  it('rejects a batch size that is not a positive integer', async () => {
    for (const size of [0, -1, 1.5, Number.NaN])
      await expect(deleteInBatches(size, async () => 0)).rejects.toThrow(RangeError);
  });

  it('has a default batch size that keeps statements bounded', () => {
    expect(PURGE_BATCH_SIZE).toBe(5_000);
  });
});
