import { randomUUID } from 'node:crypto';
import { imageDailyLimit } from '@ririko/core';
import type { ImageRepository } from '@ririko/database';
import type {
  ImageGenerationProvider,
  ImageGenerationRequest,
  ImageGenerationResult,
} from './types.js';
import { applyStylePreset } from './presets.js';
import { ImageJobQueue } from './queue.js';
import { MockImageProvider } from './providers/mock.provider.js';
import { GeminiImageProvider } from './providers/gemini.provider.js';
import { ComfyUiImageProvider } from './providers/comfyui.provider.js';
import { ReplicateImageProvider } from './providers/replicate.provider.js';

export interface ImageGenerationServiceOptions {
  readonly repository?: ImageRepository | undefined;
  readonly defaultProviderId?: string | undefined;
  readonly queueConcurrency?: number | undefined;
  readonly dailyQuotaPerUser?: number | undefined;
  readonly providers?: ImageGenerationProvider[] | undefined;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export class ImageGenerationService {
  private readonly repository?: ImageRepository | undefined;
  private readonly defaultProviderId: string;
  private readonly dailyQuotaPerUser: number;
  private readonly queue: ImageJobQueue;
  private readonly providers = new Map<string, ImageGenerationProvider>();

  constructor(options: ImageGenerationServiceOptions = {}) {
    this.repository = options.repository;
    this.defaultProviderId = options.defaultProviderId ?? 'gemini';
    this.dailyQuotaPerUser = options.dailyQuotaPerUser ?? 30;
    this.queue = new ImageJobQueue({ concurrency: options.queueConcurrency ?? 2 });

    if (options.providers && options.providers.length > 0) {
      for (const p of options.providers) {
        this.registerProvider(p);
      }
    } else {
      // Default standard provider suite
      this.registerProvider(new GeminiImageProvider());
      this.registerProvider(new ComfyUiImageProvider());
      this.registerProvider(new ReplicateImageProvider());
      this.registerProvider(new MockImageProvider());
    }
  }

  public registerProvider(provider: ImageGenerationProvider): void {
    this.providers.set(provider.id.toLowerCase(), provider);
  }

  public getProvider(id: string): ImageGenerationProvider | undefined {
    return this.providers.get(id.toLowerCase());
  }

  public getAvailableProviders(): ImageGenerationProvider[] {
    return Array.from(this.providers.values()).filter((p) => p.isAvailable);
  }

  public resolveProvider(preferredId?: string): ImageGenerationProvider {
    if (preferredId && preferredId !== 'auto') {
      const specific = this.getProvider(preferredId);
      if (specific && specific.isAvailable) {
        return specific;
      }
    }

    // Try default configured provider
    const defaultProv = this.getProvider(this.defaultProviderId);
    if (defaultProv && defaultProv.isAvailable) {
      return defaultProv;
    }

    // Fallback search: Gemini -> ComfyUI -> Replicate -> Mock
    const priority = ['gemini', 'comfyui', 'replicate', 'mock'];
    for (const id of priority) {
      const p = this.getProvider(id);
      if (p && p.isAvailable) return p;
    }

    // Ultimate fallback: return first available or mock
    const anyAvailable = this.getAvailableProviders()[0];
    if (anyAvailable) return anyAvailable;

    return new MockImageProvider();
  }

  public async generateImage(
    request: ImageGenerationRequest & {
      readonly preset?: string | undefined;
      readonly providerId?: string | undefined;
    },
  ): Promise<ImageGenerationResult> {
    const jobId = randomUUID();
    // The member's choices win; otherwise the guild's defaults from the dashboard apply.
    const guild =
      request.guildId && this.repository
        ? await this.repository.getGuildSettings(request.guildId)
        : null;
    const requestedProvider =
      request.providerId && request.providerId !== 'auto' ? request.providerId : undefined;
    const provider = this.resolveProvider(requestedProvider ?? guild?.defaultProvider ?? undefined);
    const preset = request.preset ?? guild?.defaultPreset ?? undefined;

    // 1. Daily limits (if repository attached)
    await this.checkDailyLimits(request.userId, request.guildId, guild?.memberDailyLimit);

    // 2. Style Preset Application
    const { prompt: appliedPrompt, negativePrompt: appliedNegative } = applyStylePreset(
      request.prompt,
      request.negativePrompt,
      preset,
    );

    const enrichedRequest: ImageGenerationRequest = {
      ...request,
      prompt: appliedPrompt,
      negativePrompt: appliedNegative,
    };

    // 3. Persist Job in DB
    if (this.repository) {
      await this.repository.create({
        id: jobId,
        userId: request.userId,
        guildId: request.guildId ?? null,
        providerId: provider.id,
        prompt: enrichedRequest.prompt,
        negativePrompt: enrichedRequest.negativePrompt ?? null,
        status: 'QUEUED',
      });
    }

    // 4. Enqueue & Execute Job
    try {
      const result = await this.queue.enqueue(jobId, async () => {
        if (this.repository) {
          await this.repository.updateJobStatus(jobId, 'PROCESSING');
        }

        try {
          return await provider.generate(enrichedRequest);
        } catch (primaryErr) {
          // If primary provider fails and was not explicitly pinned, try mock/fallback
          if (!request.providerId || request.providerId === 'auto') {
            const fallbackProvider = this.getProvider('mock');
            if (fallbackProvider && fallbackProvider.id !== provider.id) {
              console.warn(
                `[ImageGenerationService] Primary provider '${provider.id}' failed, falling back to mock provider:`,
                primaryErr,
              );
              const fallbackResult = await fallbackProvider.generate(enrichedRequest);
              return {
                ...fallbackResult,
                providerName: `${fallbackProvider.name} (Fallback)`,
              };
            }
          }
          throw primaryErr;
        }
      });

      // 5. Success Recording (completed jobs are what the daily limits count)
      if (this.repository) {
        await this.repository.updateJobStatus(jobId, 'COMPLETED', {
          resultUrl: 'attachment://imagine.png',
        });
      }

      return {
        ...result,
        jobId,
        providerName: result.providerName ?? provider.name,
        preset: preset ?? 'anime',
        aspectRatio: request.aspectRatio ?? '1:1',
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (this.repository) {
        await this.repository.updateJobStatus(jobId, 'FAILED', {
          errorMessage: errorMsg,
        });
      }
      throw err;
    }
  }

  /**
   * Refuses a request past the bot's quota (images in 24 hours anywhere, from any provider) or
   * past the guild's per-member limit, which can only be lower.
   */
  private async checkDailyLimits(
    userId: string,
    guildId: string | undefined,
    guildLimit: number | null | undefined,
  ): Promise<void> {
    if (!this.repository) return;
    const since = new Date(Date.now() - DAY_MS);
    if (this.dailyQuotaPerUser > 0) {
      const used = await this.repository.countCompletedJobsSince(userId, since);
      if (used >= this.dailyQuotaPerUser) {
        throw new Error(
          `Daily image generation quota reached (${this.dailyQuotaPerUser}/${this.dailyQuotaPerUser} images in the last 24 hours). Please try again later.`,
        );
      }
    }
    const limit = guildId ? imageDailyLimit(this.dailyQuotaPerUser, guildLimit) : 0;
    if (guildId && guildLimit && limit > 0) {
      const used = await this.repository.countCompletedJobsSince(userId, since, guildId);
      if (used >= limit) {
        throw new Error(
          `This server allows ${limit} images per member every 24 hours (${used}/${limit} used). Please try again later.`,
        );
      }
    }
  }

  public getQueueStats() {
    return {
      activeJobs: this.queue.activeCount,
      queuedJobs: this.queue.queuedCount,
    };
  }
}
