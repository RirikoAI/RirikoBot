import { RateLimiter, fetchWithRetry } from '../../http/rate-limiter.js';
import type {
  ImageGenerationCapabilities,
  ImageGenerationProvider,
  ImageGenerationRequest,
  ImageGenerationResult,
} from '../types.js';

export interface ReplicateImageProviderOptions {
  readonly apiToken?: string | undefined;
  readonly defaultModel?: string | undefined;
  readonly maxPollAttempts?: number | undefined;
  readonly pollIntervalMs?: number | undefined;
}

export class ReplicateImageProvider implements ImageGenerationProvider {
  public readonly id = 'replicate';
  public readonly name = 'Replicate Cloud AI';
  public readonly defaultModel: string;
  public readonly supportedModels = [
    'black-forest-labs/flux-schnell',
    'stability-ai/sdxl',
    'luma/photon',
  ] as const;

  public readonly capabilities: ImageGenerationCapabilities = {
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    maxCount: 4,
    supportsNegativePrompt: true,
    supportsPromptEnhance: true,
  };

  private readonly apiToken?: string | undefined;
  private readonly maxPollAttempts: number;
  private readonly pollIntervalMs: number;
  private readonly limiter = new RateLimiter(200);

  constructor(options: ReplicateImageProviderOptions = {}) {
    this.apiToken = options.apiToken ?? process.env.REPLICATE_API_TOKEN;
    this.defaultModel = options.defaultModel ?? 'black-forest-labs/flux-schnell';
    this.maxPollAttempts = options.maxPollAttempts ?? 45;
    this.pollIntervalMs = options.pollIntervalMs ?? 1500;
  }

  public get isAvailable(): boolean {
    return Boolean(this.apiToken);
  }

  public async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    if (!this.apiToken) {
      throw new Error('Replicate API token is not configured (REPLICATE_API_TOKEN missing).');
    }

    const startTime = Date.now();
    const model = request.model ?? this.defaultModel;

    // Create prediction via Replicate REST API
    const createUrl = `https://api.replicate.com/v1/models/${model}/predictions`;
    const input: Record<string, unknown> = {
      prompt: request.prompt,
    };
    if (request.aspectRatio) {
      input.aspect_ratio = request.aspectRatio;
    }
    if (request.negativePrompt) {
      input.negative_prompt = request.negativePrompt;
    }
    if (request.seed !== undefined) {
      input.seed = request.seed;
    }
    if (request.count && request.count > 1) {
      input.num_outputs = Math.min(request.count, this.capabilities.maxCount);
    }

    const createRes = await fetchWithRetry(
      createUrl,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input }),
      },
      { limiter: this.limiter, timeoutMs: 15000, maxRetries: 2 },
    );

    if (!createRes.ok) {
      const errText = await createRes.text().catch(() => createRes.statusText);
      throw new Error(`Replicate API creation failed (${createRes.status}): ${errText}`);
    }

    let prediction = (await createRes.json()) as {
      id: string;
      status: string;
      output?: string | string[];
      error?: string;
      urls?: { get?: string };
    };

    // If prediction is not completed immediately, poll the prediction URL
    let attempts = 0;
    while (
      prediction.status !== 'succeeded' &&
      prediction.status !== 'failed' &&
      prediction.status !== 'canceled' &&
      attempts < this.maxPollAttempts
    ) {
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));

      const pollUrl = prediction.urls?.get ?? `https://api.replicate.com/v1/predictions/${prediction.id}`;
      const pollRes = await fetchWithRetry(
        pollUrl,
        {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
          },
        },
        { limiter: this.limiter, timeoutMs: 15000, maxRetries: 2 },
      );

      if (pollRes.ok) {
        prediction = (await pollRes.json()) as typeof prediction;
      }
    }

    if (prediction.status !== 'succeeded') {
      const errorMsg = prediction.error ?? `Prediction ended with status: ${prediction.status}`;
      throw new Error(`Replicate image generation failed: ${errorMsg}`);
    }

    const outputs: string[] = Array.isArray(prediction.output)
      ? prediction.output
      : prediction.output
        ? [prediction.output]
        : [];

    if (outputs.length === 0) {
      throw new Error('Replicate prediction succeeded but returned no output URLs.');
    }

    // Download image buffers directly from CDN
    const images = await Promise.all(
      outputs.map(async (imageUrl) => {
        const imgRes = await fetch(imageUrl, {
          signal: AbortSignal.timeout(25000),
        });
        if (!imgRes.ok) {
          throw new Error(`Failed to download Replicate image from ${imageUrl} (status: ${imgRes.status})`);
        }
        const arrayBuf = await imgRes.arrayBuffer();
        const contentType = imgRes.headers.get('content-type') || 'image/webp';
        return {
          buffer: Buffer.from(arrayBuf),
          mimeType: contentType,
          seed: request.seed,
        };
      }),
    );

    return {
      images,
      providerId: this.id,
      model,
      prompt: request.prompt,
      negativePrompt: request.negativePrompt,
      durationMs: Date.now() - startTime,
    };
  }
}
