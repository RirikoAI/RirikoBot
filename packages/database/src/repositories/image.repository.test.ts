import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { SqliteDatabaseClient } from '../client/types.js';
import { ImageRepository } from './image.repository.js';
import { SQLITE_SCHEMA_DDL } from '../schema/sqlite/ddl.js';

describe('ImageRepository (TASK-1321)', () => {
  let client: SqliteDatabaseClient;
  let repo: ImageRepository;

  beforeEach(async () => {
    const raw = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = raw;
    client.raw.exec(SQLITE_SCHEMA_DDL);
    repo = new ImageRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  describe('Job Management', () => {
    it('creates and retrieves an image job', async () => {
      const job = await repo.create({
        userId: 'user-123',
        guildId: 'guild-456',
        providerId: 'gemini',
        prompt: 'anime magical girl',
        negativePrompt: 'blurry, low quality',
      });

      expect(job.id).toBeDefined();
      expect(job.userId).toBe('user-123');
      expect(job.providerId).toBe('gemini');
      expect(job.prompt).toBe('anime magical girl');
      expect(job.status).toBe('QUEUED');

      const found = await repo.findById(job.id);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(job.id);
      expect(found?.status).toBe('QUEUED');
    });

    it('updates job status and stores result or error', async () => {
      const job = await repo.create({
        userId: 'user-123',
        providerId: 'replicate',
        prompt: 'cyberpunk city at dusk',
      });

      await repo.updateJobStatus(job.id, 'PROCESSING');
      const processing = await repo.findById(job.id);
      expect(processing?.status).toBe('PROCESSING');

      await repo.updateJobStatus(job.id, 'COMPLETED', {
        resultUrl: 'attachment://imagine.png',
      });
      const completed = await repo.findById(job.id);
      expect(completed?.status).toBe('COMPLETED');
      expect(completed?.resultUrl).toBe('attachment://imagine.png');
      expect(completed?.completedAt).toBeInstanceOf(Date);
    });

    it('finds active job for a user', async () => {
      const job = await repo.create({
        userId: 'user-active',
        providerId: 'gemini',
        prompt: 'active test',
      });

      const active = await repo.findActiveJob('user-active');
      expect(active?.id).toBe(job.id);

      await repo.updateJobStatus(job.id, 'COMPLETED');
      const noneActive = await repo.findActiveJob('user-active');
      expect(noneActive).toBeNull();
    });

    it('lists recent jobs in descending order', async () => {
      const t1 = new Date('2026-09-24T00:00:00Z');
      const t2 = new Date('2026-09-24T00:01:00Z');
      await repo.create({ userId: 'u1', providerId: 'gemini', prompt: 'prompt 1', createdAt: t1 });
      await repo.create({ userId: 'u1', providerId: 'gemini', prompt: 'prompt 2', createdAt: t2 });
      await repo.create({ userId: 'u2', providerId: 'gemini', prompt: 'prompt other' });

      const u1Jobs = await repo.findRecentJobs('u1', 5);
      expect(u1Jobs).toHaveLength(2);
      expect(u1Jobs[0]?.prompt).toBe('prompt 2');
      expect(u1Jobs[1]?.prompt).toBe('prompt 1');
    });
  });

  describe('Quota and Usage Tracking', () => {
    it('increments usage and checks daily reset window', async () => {
      const usage1 = await repo.incrementUsage('user-quota', 'gemini');
      expect(usage1.imagesGeneratedToday).toBe(1);

      const usage2 = await repo.incrementUsage('user-quota', 'gemini');
      expect(usage2.imagesGeneratedToday).toBe(2);

      const fetched = await repo.getUsage('user-quota', 'gemini');
      expect(fetched?.imagesGeneratedToday).toBe(2);
    });

    it('resets usage if resetWindowMs has elapsed', async () => {
      await repo.incrementUsage('user-reset', 'gemini');

      // Use a 0ms window to simulate elapsed time
      const reset = await repo.incrementUsage('user-reset', 'gemini', 0);
      expect(reset.imagesGeneratedToday).toBe(1);
    });
  });

  describe('Presets Management', () => {
    it('saves and retrieves an image preset', async () => {
      await repo.savePreset({
        name: 'anime',
        positivePromptPrefix: 'high quality anime illustration',
        negativePromptPreset: 'bad hands, low quality',
        isSystemPreset: true,
      });

      const preset = await repo.getPresetByName('anime');
      expect(preset).not.toBeNull();
      expect(preset?.name).toBe('anime');
      expect(preset?.positivePromptPrefix).toBe('high quality anime illustration');

      const all = await repo.listPresets();
      expect(all.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Providers Configuration', () => {
    it('upserts and retrieves image providers', async () => {
      await repo.upsertProvider({
        id: 'gemini',
        name: 'Google Gemini Imagen',
        isEnabled: true,
        isFreeTier: false,
        rateLimitPerMin: 15,
        capabilities: ['prompt', 'aspect_ratios'],
      });

      const provider = await repo.getProviderById('gemini');
      expect(provider).not.toBeNull();
      expect(provider?.name).toBe('Google Gemini Imagen');
      expect(provider?.rateLimitPerMin).toBe(15);

      await repo.upsertProvider({
        id: 'gemini',
        name: 'Google Gemini Imagen 3',
        isEnabled: true,
        isFreeTier: false,
        rateLimitPerMin: 20,
        capabilities: ['prompt', 'aspect_ratios'],
      });

      const updated = await repo.getProviderById('gemini');
      expect(updated?.name).toBe('Google Gemini Imagen 3');
      expect(updated?.rateLimitPerMin).toBe(20);
    });
  });
});
