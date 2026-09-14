# ADR-006: Image generation and deterministic graphics

## Status

Proposed future subsystem. Renderer migration, provider adapters and durable generation jobs are not implemented.

## Problem

Legacy rank/welcome/meme rendering uses canvas, with native image/font dependencies visible in its Dockerfile. There are **11 active meme commands and 96 meme JPG assets**, plus **94 badge files**. Meme prefix handlers are broken. `imagine` creates a Replicate client in the command and loads an application-level token from plaintext configuration; the default model string is `luma/photon`. Build-failure frequency and renderer speed were not measured.

## Options considered

- Retain canvas and repair packaging/input handling.
- Evaluate `@napi-rs/canvas` for compatible deterministic card/meme output.
- Move all rendering to an external service, adding deployment and data-transfer dependencies.

## Decision proposed

Evaluate `@napi-rs/canvas` against representative legacy assets, fonts and image formats before replacing canvas. Preserve all 96 meme images and badge variants, even when only 11 templates are currently wired. Port text wrapping/layout and implement working prefix input from shared command metadata. Keep source attribution with cached/generated derivative assets.

Use a separate capability-aware image-generation service. Operator-hosted **ComfyUI** is the preferred open deployment option, with explicitly configured workflows/models and bounded hardware use. Verify paid Gemini/OpenAI/Replicate adapters as needed. Hosted free allocations are optional experiments, not an unlimited production image service. Model availability, licenses, costs and editing capabilities require provider-specific evidence.

Persist bounded generation jobs with ownership, provider/job IDs, status, attempts, timeout, cancellation where supported and output retention. Validate remote image type/size and network destinations before fetching; expensive rendering must not monopolize the Discord event loop. Read provider credentials from the environment/vault boundary.

## Consequences

Prebuilt native artifacts may simplify supported installations, but do not guarantee compilation-free installs on every platform or any rendering speedup. Different renderers can change fonts, SVG behavior and pixels. Local generation still uses hardware/energy and licensed model assets. Durable jobs improve recovery but cannot force cancellation of a provider request already accepted remotely.

## Validation and evidence

Visual/regression tests must cover rank/welcome cards and every active meme template. Validate supported Windows/Linux/container builds and generation limits/failures before exposure. The [asset manifest](../legacy-command-manifest.json) preserves file hashes; [provider evaluation](../dependency-evaluation.md) separates researched candidates from connected services. Follow [durable job semantics](ADR-012-job-scheduler-and-task-queue.md).
