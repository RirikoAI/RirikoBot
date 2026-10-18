import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AiRepository,
  AuditLogRepository,
  createDatabaseClient,
  GuildRepository,
  ImageRepository,
  MusicRepository,
  type DatabaseClient,
} from '@ririko/database';
import { createBotServices } from './services.js';

const DAY_MS = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

describe('the data retention service in the bot services (TASK-1934)', () => {
  let db: DatabaseClient | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    await db?.close();
  });

  it('purges the four tables and the departed servers with the real repositories and the policy periods', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    db = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:', autoMigrate: true });
    const services = await createBotServices(db);

    // `addMessage` moves the conversation's updated_at to now, so the messages are written
    // first and the conversations, with their ages, afterwards.
    const ai = new AiRepository(db);
    const chat = async (id: string, days: number) => {
      await ai.addMessage({
        id: `msg_${id}`,
        conversationId: `conv_${id}`,
        role: 'USER',
        content: 'chat text',
        createdAt: daysAgo(days),
      });
      await ai.create({ id: `conv_${id}`, userId: 'u1', model: 'm', updatedAt: daysAgo(days) });
    };
    await chat('old', 91);
    await chat('new', 89);
    const music = new MusicRepository(db);
    const play = (title: string, days: number) => ({
      guildId: 'g1',
      userId: 'u1',
      trackTitle: title,
      trackUrl: `https://example.com/${title}`,
      durationSeconds: 60,
      sourceProvider: 'SPOTIFY',
      playedAt: daysAgo(days),
    });
    await music.recordHistory(play('old', 91));
    await music.recordHistory(play('new', 89));
    const images = new ImageRepository(db);
    const job = (status: string, days: number) => ({
      userId: 'u1',
      providerId: 'gemini',
      prompt: 'p',
      status,
      createdAt: daysAgo(days),
    });
    await images.create(job('COMPLETED', 91));
    await images.create(job('COMPLETED', 89));
    const audit = new AuditLogRepository(db);
    // 100 days is past the AI period but inside the audit period; 366 days is past both.
    await audit.create({ guildId: 'g1', actorUserId: 'a', action: 'kept' }, daysAgo(100));
    await audit.create({ guildId: 'g1', actorUserId: 'a', action: 'gone' }, daysAgo(366));

    // Two servers the bot left: one 91 days ago (its data goes), one 89 days ago (it stays), and
    // one the bot is in. A rejoined server has no left_at, so it is not listed at all.
    const guildRepo = new GuildRepository(db);
    const registration = (id: string) => ({
      id,
      name: id,
      iconUrl: null,
      ownerId: 'owner',
      joinedAt: daysAgo(200),
    });
    for (const id of ['left-91', 'left-89', 'present']) await guildRepo.upsert(registration(id));
    await guildRepo.markInactive(['left-91', 'left-89']);
    if (db.dialect !== 'sqlite') throw new Error('this test runs on SQLite');
    const setLeftAt = db.raw.prepare('UPDATE guilds SET left_at = ? WHERE id = ?');
    setLeftAt.run(daysAgo(91).getTime(), 'left-91');
    setLeftAt.run(daysAgo(89).getTime(), 'left-89');
    await music.recordHistory({ ...play('left-91-play', 1), guildId: 'left-91' });
    await music.recordHistory({ ...play('left-89-play', 1), guildId: 'left-89' });
    await music.recordHistory({ ...play('present-play', 1), guildId: 'present' });

    const counts = await services.dataRetentionService.runOnce();

    expect(counts).toEqual({ ai: 2, musicHistory: 1, imageJobs: 1, auditLog: 1, departedGuild: 1 });
    expect((await guildRepo.listAll()).map((row) => row.id).sort()).toEqual(['left-89', 'present']);
    expect(await music.getGuildHistory('left-91')).toHaveLength(0);
    expect(await music.getGuildHistory('left-89')).toHaveLength(1);
    expect(await music.getGuildHistory('present')).toHaveLength(1);
    expect(await ai.findById('conv_old')).toBeNull();
    expect(await ai.findById('conv_new')).not.toBeNull();
    expect(await music.getGuildHistory('g1')).toHaveLength(1);
    expect(await images.count()).toBe(1);
    expect(await audit.listByGuild('g1', { limit: 10 })).toHaveLength(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[DataRetention] Purge finished:'));

    await services.dataRetentionService.stop();
  });
});
