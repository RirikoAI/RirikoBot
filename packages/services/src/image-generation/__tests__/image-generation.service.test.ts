import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient } from '@ririko/database';
import type { SqliteDatabaseClient } from '@ririko/database';
import { ImageRepository } from '@ririko/database';
import { SQLITE_SCHEMA_DDL } from '../../../../database/src/schema/sqlite/ddl.js';
import { ImageGenerationService } from '../image-generation.service.js';
import { MockImageProvider } from '../providers/mock.provider.js';
import type {
  ImageGenerationProvider,
  ImageGenerationRequest,
  ImageGenerationResult,
} from '../types.js';

describe('ImageGenerationService (TASK-1321)', () => {
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

  it('generates an image, applies anime presets, and updates repository', async () => {
    const service = new ImageGenerationService({
      repository: repo,
      providers: [new MockImageProvider()],
      defaultProviderId: 'mock',
    });

    const result = await service.generateImage({
      userId: 'user-service-1',
      guildId: 'guild-1',
      prompt: 'cyber ninja',
      preset: 'anime',
    });

    expect(result.providerId).toBe('mock');
    expect(result.prompt).toContain('high quality anime illustration');
    expect(result.prompt).toContain('cyber ninja');
    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.buffer).toBeInstanceOf(Buffer);

    // Verify DB records
    const recent = await repo.findRecentJobs('user-service-1', 5);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.status).toBe('COMPLETED');
    expect(recent[0]?.resultUrl).toBe('attachment://imagine.png');

    // Verify usage tracking
    const usage = await repo.getUsage('user-service-1', 'mock');
    expect(usage?.imagesGeneratedToday).toBe(1);
  });

  it('enforces daily per-user generation quota', async () => {
    const service = new ImageGenerationService({
      repository: repo,
      providers: [new MockImageProvider()],
      defaultProviderId: 'mock',
      dailyQuotaPerUser: 2,
    });

    // 1st generation
    await service.generateImage({ userId: 'u-quota', prompt: 'prompt 1' });
    // 2nd generation
    await service.generateImage({ userId: 'u-quota', prompt: 'prompt 2' });

    // 3rd generation should throw quota exceeded
    await expect(
      service.generateImage({ userId: 'u-quota', prompt: 'prompt 3' }),
    ).rejects.toThrow(/Daily image generation quota reached/i);
  });

  it('falls back to secondary provider if primary throws and auto provider was requested', async () => {
    class FailingProvider implements ImageGenerationProvider {
      public readonly id = 'failing';
      public readonly name = 'Failing Test Provider';
      public readonly isAvailable = true;
      public readonly defaultModel = 'fail-v1';
      public readonly supportedModels = ['fail-v1'] as const;
      public readonly capabilities = {
        aspectRatios: ['1:1'],
        maxCount: 1,
        supportsNegativePrompt: false,
        supportsPromptEnhance: false,
      };
      async generate(_request: ImageGenerationRequest): Promise<ImageGenerationResult> {
        throw new Error('Primary provider network timeout');
      }
    }

    const service = new ImageGenerationService({
      repository: repo,
      providers: [new FailingProvider(), new MockImageProvider()],
      defaultProviderId: 'failing',
    });

    const result = await service.generateImage({
      userId: 'u-fallback',
      prompt: 'resilient prompt',
      providerId: 'auto',
    });

    expect(result.providerId).toBe('mock');
    expect(result.images[0]?.buffer).toBeInstanceOf(Buffer);
  });
});
