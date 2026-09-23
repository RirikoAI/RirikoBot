import { createCanvas } from '@napi-rs/canvas';
import type {
  ImageGenerationCapabilities,
  ImageGenerationProvider,
  ImageGenerationRequest,
  ImageGenerationResult,
} from '../types.js';

export class MockImageProvider implements ImageGenerationProvider {
  public readonly id = 'mock';
  public readonly name = 'Offline Mock Generator';
  public readonly isAvailable = true;
  public readonly defaultModel = 'mock-v1';
  public readonly supportedModels = ['mock-v1', 'mock-hd'] as const;

  public readonly capabilities: ImageGenerationCapabilities = {
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    maxCount: 4,
    supportsNegativePrompt: true,
    supportsPromptEnhance: true,
  };

  public async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const startTime = Date.now();
    const count = Math.max(1, Math.min(request.count ?? 1, this.capabilities.maxCount));

    // Determine dimensions from aspect ratio
    let width: number;
    let height: number;
    switch (request.aspectRatio) {
      case '16:9':
        width = 640;
        height = 360;
        break;
      case '9:16':
        width = 360;
        height = 640;
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

    const images = [];
    for (let i = 0; i < count; i++) {
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // Gradient background
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#1a103c');
      grad.addColorStop(0.5, '#2d1b69');
      grad.addColorStop(1, '#ff69b4');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Card border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 4;
      ctx.strokeRect(16, 16, width - 32, height - 32);

      // Header title
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✨ Ririko AI Image Generation ✨', width / 2, 60);

      // Subtitle with provider & model
      ctx.fillStyle = '#ffb6c1';
      ctx.font = '14px sans-serif';
      ctx.fillText(`[Mock Provider: ${request.model ?? this.defaultModel}]`, width / 2, 90);

      // Render prompt (wrapped or truncated)
      ctx.fillStyle = '#f0f0f0';
      ctx.font = 'italic 16px sans-serif';
      const cleanPrompt = request.prompt.length > 100
        ? `${request.prompt.slice(0, 97)}...`
        : request.prompt;
      ctx.fillText(`"${cleanPrompt}"`, width / 2, height / 2);

      // Footer
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '12px sans-serif';
      ctx.fillText(`Ratio: ${request.aspectRatio ?? '1:1'} | Size: ${width}x${height} | Seed: ${request.seed ?? 42}`, width / 2, height - 40);

      const buffer = await canvas.encode('png');
      images.push({
        buffer,
        mimeType: 'image/png',
        width,
        height,
        seed: request.seed ?? 42,
      });
    }

    return {
      images,
      providerId: this.id,
      model: request.model ?? this.defaultModel,
      prompt: request.prompt,
      negativePrompt: request.negativePrompt,
      durationMs: Date.now() - startTime,
    };
  }
}
