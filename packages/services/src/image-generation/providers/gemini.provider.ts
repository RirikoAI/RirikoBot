import { GoogleGenAI } from '@google/genai';
import type {
  ImageGenerationCapabilities,
  ImageGenerationProvider,
  ImageGenerationRequest,
  ImageGenerationResult,
} from '../types.js';

export interface GeminiImageProviderOptions {
  readonly apiKey?: string | undefined;
  readonly defaultModel?: string | undefined;
}

export class GeminiImageProvider implements ImageGenerationProvider {
  public readonly id = 'gemini';
  public readonly name = 'Google Gemini Imagen';
  public readonly defaultModel: string;
  public readonly supportedModels = [
    'imagen-3.0-generate-002',
    'imagen-4.0-generate-001',
  ] as const;

  public readonly capabilities: ImageGenerationCapabilities = {
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    maxCount: 4,
    supportsNegativePrompt: true,
    supportsPromptEnhance: true,
  };

  private readonly apiKey?: string | undefined;
  private readonly client?: GoogleGenAI | undefined;

  constructor(options: GeminiImageProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
    this.defaultModel = options.defaultModel ?? 'imagen-3.0-generate-002';

    if (this.apiKey) {
      this.client = new GoogleGenAI({ apiKey: this.apiKey });
    }
  }

  public get isAvailable(): boolean {
    return Boolean(this.apiKey && this.client);
  }

  public async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    if (!this.client) {
      throw new Error('Google Gemini API key is not configured (GEMINI_API_KEY missing).');
    }

    const startTime = Date.now();
    const model = request.model ?? this.defaultModel;
    const count = Math.max(1, Math.min(request.count ?? 1, this.capabilities.maxCount));

    // Map aspect ratio string to valid Imagen aspect ratio
    let aspectRatio: '1:1' | '3:4' | '4:3' | '9:16' | '16:9' = '1:1';
    if (request.aspectRatio) {
      switch (request.aspectRatio) {
        case '16:9':
        case '9:16':
        case '4:3':
        case '3:4':
        case '1:1':
          aspectRatio = request.aspectRatio;
          break;
        default:
          aspectRatio = '1:1';
      }
    }

    try {
      const response = await this.client.models.generateImages({
        model,
        prompt: request.prompt,
        config: {
          numberOfImages: count,
          aspectRatio,
          outputMimeType: 'image/png',
          ...(request.negativePrompt ? { negativePrompt: request.negativePrompt } : {}),
        },
      });

      const generatedImages = response.generatedImages ?? [];
      if (generatedImages.length === 0) {
        throw new Error('Gemini Imagen returned zero images in response.');
      }

      const images = generatedImages.map((img) => {
        const base64Bytes = img.image?.imageBytes;
        if (!base64Bytes) {
          throw new Error('Missing imageBytes payload in Gemini response.');
        }
        return {
          buffer: Buffer.from(base64Bytes, 'base64'),
          mimeType: 'image/png',
          seed: request.seed,
        };
      });

      return {
        images,
        providerId: this.id,
        model,
        prompt: request.prompt,
        negativePrompt: request.negativePrompt,
        durationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Gemini Imagen error: ${message}`, { cause: err });
    }
  }
}
