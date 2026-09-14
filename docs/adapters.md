# Provider Adapter Architecture & Integrations (Ririko AI 2.0.0)

## 1. Overview & Architectural Principles
In compliance with Sections 45, 80, and 81 of `BLUEPRINT.md`, external services are strictly abstracted behind **Provider Adapters**. Domain logic never couples directly to a specific API client, SDK, or remote vendor.

### Key Tenets:
1. **Capability Discovery**: Adapters declare capabilities explicitly via typed flags. The UI and command parsers dynamically adapt or hide options.
2. **Fallback Chains**: Critical services define a `Primary -> Fallback -> Graceful Degradation` chain.
3. **Resilience & Circuit Breakers**: Timeouts, retries with exponential backoff, and circuit breakers prevent external API outages from hanging bot operations.

---

## 2. Capability Discovery Model

```typescript
export interface ProviderCapabilities {
  readonly canStream: boolean;
  readonly canSearch: boolean;
  readonly supportsPlaylists: boolean;
  readonly supportsLyrics: boolean;
  readonly supportsImageEditing: boolean;
  readonly supportsImageGeneration: boolean;
  readonly maxImageBatchSize: number;
}
```

UI components and command dispatchers inspect these capabilities at runtime to omit unsupported select menus, options, and buttons.

---

## 3. Subsystem Provider Adapters

### 3.1. AI Chat Model Adapters (`ChatModelProvider`)
- **Google Gemini Adapter** (`@google/genai`): Primary flagship adapter for high-speed chat, streaming, and function calling (Gemini 2.5 Flash / Pro).
- **OpenAI Adapter** (`openai`): Standard adapter for GPT-4o and GPT-4o-mini.
- **Local Ollama / OpenAI-Compatible Adapter**: Connects to self-hosted Ollama instances or custom inference proxies.

### 3.2. Image Generation Adapters (`ImageGenerationProvider`)
```typescript
export interface ImageGenerationCapabilities {
  prompt: boolean;
  negativePrompt: boolean;
  aspectRatios: string[];
  maxCount: number;
  imageToImage: boolean;
}

export interface ImageGenerationProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ImageGenerationCapabilities;
  
  generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}
```
- **Free-Tier / Local Adapter**: Self-hosted ComfyUI / Stable Diffusion WebUI (via local REST API) or Hugging Face Inference free allocation with verified quota handling.
- **Paid Cloud Adapters**: Google Gemini Imagen, OpenAI DALL-E 3, Replicate.
- **Default Anime Prompts**:
  - *Positive*: `"high quality anime illustration, detailed character design, beautiful composition, clean line art, expressive eyes, cinematic lighting, detailed background"`
  - *Negative*: `"low quality, blurry, distorted anatomy, bad hands, missing fingers, cropped, watermark"`
- **Asynchronous Queue**: Image requests are enqueued in `image_jobs` with concurrency throttling to prevent server lockups.

### 3.3. Streamer Platform Adapters (`StreamPlatformAdapter`)
```typescript
export interface StreamPlatformAdapter {
  readonly id: string;
  readonly name: string;
  
  resolveStreamer(input: string): Promise<Streamer>;
  getCurrentStream(streamer: Streamer): Promise<LiveStream | null>;
  subscribe(streamer: Streamer, webhookUrl: string): Promise<void>;
  unsubscribe(streamer: Streamer): Promise<void>;
}
```
- **Twitch**: EventSub Webhooks with fallback polling.
- **YouTube Live**: Official Data API v3 & RSS PubSubHubbub subscription.
- **TikTok Live & Facebook**: Live status endpoints with scraping fallback where API access is restricted.
- **Idempotency & Thumbnail Caching**:
  - Idempotency Key: `platform + stream_id + guild_id + announcement_target`.
  - Stream thumbnails are downloaded, validated for dimensions, saved to local storage/CDN, and uploaded directly to Discord as attachments to prevent broken/expired embeds.

### 3.4. Music Source Adapters (`MusicSourceAdapter`)
- **YouTube Extractor**: Native audio streaming with anti-bot token rotation.
- **Spotify Extractor**: Metadata lookup mapped to high-fidelity audio streams.
- **SoundCloud Extractor**: Direct native HTTP Opus streaming.
- **Deezer Extractor**: Metadata matching and preview fallback.

### 3.5. Free Game Announcers (`FreeGameProvider`)
```typescript
export interface FreeGameProvider {
  readonly id: string;
  fetchFreeGames(): Promise<FreeGame[]>;
}
```
- **Epic Games Store**: Official promotional feed API.
- **Steam**: Official Steam store featured specials feed.
- **GOG**: Official giveaways catalog feed.
- Duplicate detection guarantees notifications are dispatched exactly once per guild per promotion.
