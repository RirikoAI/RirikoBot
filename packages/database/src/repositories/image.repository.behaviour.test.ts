import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { ImageRepository } from './image.repository.js';

const MISSING_UUID = '00000000-0000-4000-8000-000000000001';
const T0 = new Date('2026-07-01T10:00:00Z');
const HOUR = 3_600_000;

const job = (userId: string, overrides: Record<string, unknown> = {}) => ({
  userId,
  providerId: 'gemini',
  prompt: 'a castle in the clouds',
  ...overrides,
});

describeDialects('ImageRepository behaviour', (db) => {
  it('creates a job with defaults and reads it back', async () => {
    const repo = new ImageRepository(db.client);
    expect(await repo.findById(MISSING_UUID)).toBeNull();
    expect(await repo.exists(MISSING_UUID)).toBe(false);
    expect(await repo.count()).toBe(0);

    const created = await repo.create(job('u1', { guildId: 'g1', negativePrompt: 'blurry' }));
    expect(created.status).toBe('QUEUED');
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.guildId).toBe('g1');
    expect(created.negativePrompt).toBe('blurry');
    expect(created.resultUrl).toBeNull();
    expect(created.completedAt).toBeNull();

    expect((await repo.findById(created.id))?.prompt).toBe('a castle in the clouds');
    expect(await repo.exists(created.id)).toBe(true);
    expect(await repo.count()).toBe(1);
  });

  it('updates a job and throws for a missing one', async () => {
    const repo = new ImageRepository(db.client);
    const created = await repo.create(job('u1'));

    const updated = await repo.update(created.id, { prompt: 'a castle at night' });
    expect(updated.prompt).toBe('a castle at night');

    await expect(repo.update(MISSING_UUID, { prompt: 'x' })).rejects.toThrow(DatabaseError);
  });

  it('moves a job through its statuses, stamping completion for final ones', async () => {
    const repo = new ImageRepository(db.client);
    const created = await repo.create(job('u1'));

    const processing = await repo.updateJobStatus(created.id, 'PROCESSING');
    expect(processing.status).toBe('PROCESSING');
    expect(processing.completedAt).toBeNull();

    const done = await repo.updateJobStatus(created.id, 'COMPLETED', {
      resultUrl: 'attachment://image.png',
    });
    expect(done.resultUrl).toBe('attachment://image.png');
    expect(done.completedAt).toBeInstanceOf(Date);

    const failed = await repo.create(job('u1'));
    const marked = await repo.updateJobStatus(failed.id, 'FAILED', {
      errorMessage: 'provider down',
      completedAt: T0,
    });
    expect(marked.errorMessage).toBe('provider down');
    expect(marked.completedAt?.getTime()).toBe(T0.getTime());
  });

  it('deletes a job once', async () => {
    const repo = new ImageRepository(db.client);
    const created = await repo.create(job('u1'));

    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.delete(created.id)).toBe(false);
    expect(await repo.count()).toBe(0);
  });

  it('lists recent jobs newest first with a limit, and finds the active one', async () => {
    const repo = new ImageRepository(db.client);
    const at = (hours: number) => new Date(T0.getTime() + hours * HOUR);
    const oldest = await repo.create(job('u1', { createdAt: at(1), status: 'COMPLETED' }));
    const middle = await repo.create(job('u1', { createdAt: at(2), status: 'FAILED' }));
    await repo.create(job('u2', { createdAt: at(3) }));
    expect(await repo.findActiveJob('u1')).toBeNull();

    const queued = await repo.create(job('u1', { createdAt: at(4) }));
    const processing = await repo.create(job('u1', { createdAt: at(5), status: 'PROCESSING' }));

    expect((await repo.findRecentJobs('u1')).map((j) => j.id)).toEqual([
      processing.id,
      queued.id,
      middle.id,
      oldest.id,
    ]);
    expect((await repo.findRecentJobs('u1', 2)).map((j) => j.id)).toEqual([
      processing.id,
      queued.id,
    ]);
    expect((await repo.findActiveJob('u1'))?.id).toBe(processing.id);
    expect(await repo.findActiveJob('nobody')).toBeNull();
  });

  it('counts completed jobs since a moment, per guild or everywhere', async () => {
    const repo = new ImageRepository(db.client);
    const at = (hours: number) => new Date(T0.getTime() + hours * HOUR);
    await repo.create(job('u1', { guildId: 'g1', status: 'COMPLETED', createdAt: at(1) }));
    await repo.create(job('u1', { guildId: 'g1', status: 'COMPLETED', createdAt: at(3) }));
    await repo.create(job('u1', { guildId: 'g2', status: 'COMPLETED', createdAt: at(4) }));
    await repo.create(job('u1', { guildId: 'g1', status: 'FAILED', createdAt: at(4) }));
    await repo.create(job('u2', { guildId: 'g1', status: 'COMPLETED', createdAt: at(4) }));

    expect(await repo.countCompletedJobsSince('u1', at(0))).toBe(3);
    expect(await repo.countCompletedJobsSince('u1', at(2))).toBe(2);
    expect(await repo.countCompletedJobsSince('u1', at(0), 'g1')).toBe(2);
    expect(await repo.countCompletedJobsSince('u1', at(0), 'g9')).toBe(0);
    expect(await repo.countCompletedJobsSince('nobody', at(0))).toBe(0);
  });

  it('counts per-provider usage and resets it after the window', async () => {
    const repo = new ImageRepository(db.client);
    expect(await repo.getUsage('u1', 'gemini')).toBeNull();

    const first = await repo.incrementUsage('u1', 'gemini');
    expect(first.imagesGeneratedToday).toBe(1);
    const second = await repo.incrementUsage('u1', 'gemini');
    expect(second.imagesGeneratedToday).toBe(2);
    expect(second.lastResetAt.getTime()).toBe(first.lastResetAt.getTime());

    const other = await repo.incrementUsage('u1', 'replicate');
    expect(other.imagesGeneratedToday).toBe(1);
    expect((await repo.getUsage('u1', 'gemini'))?.imagesGeneratedToday).toBe(2);

    await new Promise((resolve) => setTimeout(resolve, 5));
    const reset = await repo.incrementUsage('u1', 'gemini', 1);
    expect(reset.imagesGeneratedToday).toBe(1);
    expect(reset.lastResetAt.getTime()).toBeGreaterThan(first.lastResetAt.getTime());
  });

  it('saves guild settings, replacing them on a later save', async () => {
    const repo = new ImageRepository(db.client);
    expect(await repo.getGuildSettings('g1')).toBeNull();

    const saved = await repo.saveGuildSettings({
      guildId: 'g1',
      defaultProvider: 'gemini',
      memberDailyLimit: 5,
      defaultPreset: null,
    });
    expect(saved.defaultProvider).toBe('gemini');
    expect(saved.memberDailyLimit).toBe(5);

    const replaced = await repo.saveGuildSettings({
      guildId: 'g1',
      defaultProvider: null,
      memberDailyLimit: null,
      defaultPreset: 'anime',
    });
    expect(replaced.defaultProvider).toBeNull();
    expect(replaced.memberDailyLimit).toBeNull();
    expect((await repo.getGuildSettings('g1'))?.defaultPreset).toBe('anime');
    expect(await repo.getGuildSettings('g2')).toBeNull();
  });

  it('saves presets and finds them by name', async () => {
    const repo = new ImageRepository(db.client);
    expect(await repo.listPresets()).toEqual([]);
    expect(await repo.getPresetByName('anime')).toBeNull();

    const anime = await repo.savePreset({ name: 'anime', positivePromptPrefix: 'anime style, ' });
    await repo.savePreset({
      name: 'photo',
      positivePromptPrefix: 'photo, ',
      negativePromptPreset: 'cartoon',
      isSystemPreset: true,
    });

    expect(anime.isSystemPreset).toBe(false);
    expect((await repo.getPresetByName('anime'))?.id).toBe(anime.id);
    expect((await repo.getPresetByName('photo'))?.negativePromptPreset).toBe('cartoon');
    expect((await repo.listPresets()).map((p) => p.name).sort()).toEqual(['anime', 'photo']);
  });

  it('upserts providers by id', async () => {
    const repo = new ImageRepository(db.client);
    expect(await repo.getProviders()).toEqual([]);
    expect(await repo.getProviderById('GEMINI')).toBeNull();

    const created = await repo.upsertProvider({
      id: 'GEMINI',
      name: 'Gemini',
      capabilities: ['text-to-image'],
    });
    expect(created.isEnabled).toBe(true);
    expect(created.rateLimitPerMin).toBe(10);
    expect(created.capabilities).toEqual(['text-to-image']);

    const updated = await repo.upsertProvider({
      id: 'GEMINI',
      name: 'Gemini Pro',
      isEnabled: false,
      rateLimitPerMin: 30,
    });
    expect(updated.name).toBe('Gemini Pro');
    expect(updated.isEnabled).toBe(false);
    expect(updated.rateLimitPerMin).toBe(30);

    await repo.upsertProvider({ id: 'REPLICATE', name: 'Replicate' });
    expect((await repo.getProviders()).map((p) => p.id).sort()).toEqual(['GEMINI', 'REPLICATE']);
    expect((await repo.getProviderById('GEMINI'))?.name).toBe('Gemini Pro');
  });
});
