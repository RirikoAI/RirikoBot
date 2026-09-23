import { RateLimiter, fetchWithRetry } from '../../http/rate-limiter.js';
import type {
  ImageGenerationCapabilities,
  ImageGenerationProvider,
  ImageGenerationRequest,
  ImageGenerationResult,
} from '../types.js';

export interface ComfyUiImageProviderOptions {
  readonly baseUrl?: string | undefined;
  readonly defaultModel?: string | undefined;
  readonly timeoutMs?: number | undefined;
}

export class ComfyUiImageProvider implements ImageGenerationProvider {
  public readonly id = 'comfyui';
  public readonly name = 'ComfyUI / Stable Diffusion WebUI';
  public readonly defaultModel: string;
  public readonly supportedModels = ['local-anime', 'sdxl-turbo', 'flux-local'] as const;

  public readonly capabilities: ImageGenerationCapabilities = {
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    maxCount: 2,
    supportsNegativePrompt: true,
    supportsPromptEnhance: true,
  };

  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly limiter = new RateLimiter(200);

  constructor(options: ComfyUiImageProviderOptions = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env.COMFYUI_URL ??
      process.env.SD_WEBUI_URL ??
      'http://127.0.0.1:7860'
    ).replace(/\/$/, '');
    this.defaultModel = options.defaultModel ?? 'local-anime';
    this.timeoutMs = options.timeoutMs ?? 60000;
  }

  public get isAvailable(): boolean {
    return Boolean(this.baseUrl);
  }

  public async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const startTime = Date.now();
    const count = Math.max(1, Math.min(request.count ?? 1, this.capabilities.maxCount));

    let width = 512;
    let height = 512;
    switch (request.aspectRatio) {
      case '16:9':
        width = 768;
        height = 432;
        break;
      case '9:16':
        width = 432;
        height = 768;
        break;
      case '4:3':
        width = 640;
        height = 480;
        break;
      case '3:4':
        width = 480;
        height = 640;
        break;
      default:
        width = 512;
        height = 512;
    }

    const payload = {
      prompt: request.prompt,
      negative_prompt: request.negativePrompt ?? '',
      steps: 25,
      width,
      height,
      batch_size: count,
      seed: request.seed ?? -1,
    };

    try {
      const response = await fetchWithRetry(
        `${this.baseUrl}/sdapi/v1/txt2img`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
        {
          limiter: this.limiter,
          timeoutMs: this.timeoutMs,
          maxRetries: 1,
        },
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`ComfyUI/SD HTTP ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as { images?: string[] };
      const rawImages = data.images ?? [];
      if (rawImages.length === 0) {
        throw new Error('ComfyUI/SD returned no images in payload.');
      }

      const images = rawImages.map((b64) => {
        // Strip data:image/...;base64, prefix if present
        const cleaned = b64.replace(/^data:image\/\w+;base64,/, '');
        return {
          buffer: Buffer.from(cleaned, 'base64'),
          mimeType: 'image/png',
          width,
          height,
          seed: request.seed,
        };
      });

      return {
        images,
        providerId: this.id,
        model: request.model ?? this.defaultModel,
        prompt: request.prompt,
        negativePrompt: request.negativePrompt,
        durationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`ComfyUI/SD-WebUI generation failed: ${msg}`, { cause: err });
    }
  }
}
