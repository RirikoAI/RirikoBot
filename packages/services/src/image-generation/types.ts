export interface ImageGenerationCapabilities {
  readonly aspectRatios: readonly string[];
  readonly maxCount: number;
  readonly supportsNegativePrompt: boolean;
  readonly supportsPromptEnhance: boolean;
}

export interface ImageGenerationRequest {
  readonly prompt: string;
  readonly negativePrompt?: string | undefined;
  readonly aspectRatio?: string | undefined;
  readonly count?: number | undefined;
  readonly model?: string | undefined;
  readonly seed?: number | undefined;
  readonly userId: string;
  readonly guildId?: string | undefined;
}

export interface GeneratedImage {
  readonly buffer: Buffer;
  readonly mimeType: string;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly seed?: number | undefined;
}

export type ImageAspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

export interface ImageGenerationResult {
  readonly jobId?: string | undefined;
  readonly images: GeneratedImage[];
  readonly providerId: string;
  readonly providerName?: string | undefined;
  readonly model: string;
  readonly prompt: string;
  readonly negativePrompt?: string | undefined;
  readonly preset?: string | undefined;
  readonly aspectRatio?: string | undefined;
  readonly durationMs: number;
}

export interface ImageGenerationProvider {
  readonly id: string;
  readonly name: string;
  readonly isAvailable: boolean;
  readonly capabilities: ImageGenerationCapabilities;
  readonly defaultModel: string;
  readonly supportedModels: readonly string[];

  generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}

export interface ImageStylePreset {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly positivePrefix: string;
  readonly negativePreset?: string | undefined;
}

export interface QueuedImageJob {
  readonly id: string;
  readonly userId: string;
  readonly guildId?: string | undefined;
  readonly request: ImageGenerationRequest;
  readonly providerId: string;
  readonly enqueuedAt: Date;
}
