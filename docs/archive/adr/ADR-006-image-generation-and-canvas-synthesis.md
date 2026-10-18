# ADR-006: Image Generation and Canvas Synthesis

## Status
Accepted

## Context
Ririko 1.4.0 relied on `node-canvas` for generating rank cards, welcome cards, and meme templates. `node-canvas` requires native system build dependencies (libcairo2-dev, libpango1.0-dev, libgif-dev) which frequently failed during container builds or Windows installs. Furthermore, the `imagine` command hardcoded the Replicate SDK directly into the command file and stored user tokens in plaintext in the database.

## Decision
1. **Canvas Engine**: Replace `node-canvas` with **`@napi-rs/canvas`**.
2. **Multi-Backend AI Image Generation**: Build an extensible `ImageGenerationService` with pluggable adapters:
   - Google Gemini Imagen
   - Local ComfyUI / Stable Diffusion WebUI
   - Replicate
   - Hugging Face Inference
3. **Meme Engine Modernization**: Retain all 11 legacy meme templates (and the 80+ background images in `assets/memes`) while refactoring the text layout engine to support dynamic auto-wrapping, font scaling, and drop shadows via `@napi-rs/canvas`.
4. **Asynchronous Job Queue**: Execute image generation tasks through a concurrency-limited queue with progress updates, preventing bot unresponsiveness during heavy generation load.

## Consequences
### Positive
- Zero native compilation errors during `pnpm install` or Docker builds.
- Up to 2x faster canvas image rendering for rank cards and memes.
- Pluggable image generation backends allow self-hosters to use local GPUs (ComfyUI) while cloud deployments can use Gemini Imagen or Replicate.

### Negative
- Minor API differences between `@napi-rs/canvas` and `node-canvas` requiring updates to gradient and filter helper calls.
