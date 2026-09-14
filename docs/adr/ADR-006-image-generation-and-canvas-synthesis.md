# ADR-006: Image generation and deterministic graphics

## Status and context

Proposed future subsystem; no renderer migration, image adapter or durable generation queue is implemented. BP-14–15 and BP-78 require capability-aware generation, an actually useful open/free option, configurable defaults and safe assets. BP-24 requires retained attribution for TCG artwork.

Legacy graphics depend on canvas and native image/font packages. The audited manifest has 11 active meme commands, 96 meme JPGs and 94 badge files; the prefix meme paths require repair. `imagine` creates Replicate inside the command, uses an application-level plaintext token and defaults to `luma/photon`. This is not a user-specific secret vault. Install failure frequency, throughput and render quality improvements have not been measured.

## Alternatives

| Option | Benefit | Cost / selection |
|---|---|---|
| Keep canvas and repair input/packaging | Existing rendering behavior is familiar | Still requires native deployment verification; valid fallback if replacement fails visual gates |
| Evaluate `@napi-rs/canvas` | Candidate native renderer with maintained upstream implementation | Font/SVG/pixel/platform differences require fixtures; preferred evaluation, not automatic replacement |
| Browser-based rendering | Reuses web layout for some cards | Larger runtime/worker footprint and browser lifecycle; only if actual templates justify it |
| Remote service for every card/meme | Isolates CPU work | Adds network/privacy/cost dependence to otherwise local deterministic work |
| One hard-coded generation vendor | Small initial adapter | Fails replaceability, capability and operator-choice requirements |
| Local ComfyUI plus verified optional paid adapters | Open operator-controlled path with explicit model/workflow boundaries | Hardware/licenses and workload limits remain operator responsibilities; proposed |

## Proposed decision

Separate deterministic rendering from generative inference. A renderer consumes validated template/text/asset data; generation consumes a normalized model/workflow request through the [common provider contract](../adapters.md). They may share safe asset storage and worker infrastructure but not quota, billing or credential assumptions.

Evaluate pinned `@napi-rs/canvas` candidate from [dependency evidence](../dependency-evaluation.md) using representative fonts/formats and all active templates. Preserve all audited assets, not just currently wired backgrounds. The [upstream project](https://github.com/Brooooooklyn/canvas) is evidence for its implementation/support, not proof of zero installation failures or a universal 2x speedup. Retaining the current engine remains acceptable until measured fidelity/deployment gates favor replacement.

Use operator-hosted ComfyUI as the preferred open-generation candidate. Submit only reviewed workflows with typed allowlisted inputs. Workflow/model/custom-node versions are part of execution provenance; user prompts cannot install nodes, download arbitrary models or submit arbitrary graph code. Store remote prompt ID and recover through history. ComfyUI's official routes provide queue/history/communication operations, but cancellation scope must be verified for the pinned server before use. [ComfyUI server routes](https://docs.comfy.org/development/comfyui-server/comms_routes).

Gemini, OpenAI and Replicate are optional paid candidates, not automatic fallbacks. Select a model only after verifying account access, request schema, supported negative prompts/seeds/editing, limits, pricing, retention and output handling. A model does not inherit every feature of its vendor. Hosted free allocation may supplement experiments but cannot be advertised as a permanent unlimited service. Open software still consumes hardware/energy and model licenses apply.

## Image-specific contracts

The main [adapter specification](../adapters.md) owns illustrative request/result schemas, retries, quota reservations, SSRF controls and storage. This decision adds these image-specific constraints:

- Persist final prompt digest and preset/model/workflow version. Compose configurable positive/negative defaults once; retries must not append them again. Respect permitted opt-out. Unsupported negative prompts are visible, not silently ignored.
- Validate dimensions/ratio, count, seed range, quality/guidance and edit/mask compatibility before admission. Count and pixel budgets apply together. Source/mask assets require ownership and safe decode.
- Reserve quota on durable acceptance; capture known completed work and reconcile unknown charge/completion. Partial outputs have per-asset results; delivery failure must retry existing assets rather than regenerate.
- Cancellation is a request until acknowledged or known safe locally. Never issue a shared-backend interrupt that may terminate another user's generation. Expired leases cannot authorize another remote submission without reconciliation.
- Run heavy decode/render/inference outside the gateway event loop through bounded workers. Queue fairness, per-guild/user admission and total memory/disk limits protect the rest of the bot.
- Keep source provenance/credits separate from byte deduplication. Removal tombstones images and invalidates derivatives without deleting owned cards or historical results.

## Visual and deployment acceptance

| Gate | Required evidence |
|---|---|
| Legacy fidelity | Every active meme plus rank/welcome fixtures; exact preserved source hashes; reviewed wrapping/cropping/font differences |
| Text/layout | Long Unicode/RTL names, emoji fallback, missing fonts, truncation and readable credits |
| Input safety | MIME spoofing, decompression bombs, excessive pixels/frames, SVG external references, redirect/DNS rebinding rejection |
| Worker behavior | Memory ceiling, long render timeout, cancellation isolation, queue fairness and gateway responsiveness under load |
| Provider capabilities | Invalid dimensions, unsupported seed/negative prompt/edit, quota races, partial/unknown output, known receipt recovery |
| Storage/delivery | Stage-write crash, missing object, removed source, expired transport URL, upload-limit fallback and no duplicate generation |
| Platform support | Actual Windows/Linux/container install and fixture execution for selected runtime/renderer |

Visual comparison tolerances must be deliberate: different font engines can change pixels without breaking layout, while a passing image hash alone can miss incorrect metadata/credit. Keep representative golden images and structured layout checks. No visual fixtures were rendered during this documentation task.

## Consequences and reconsideration

A renderer change introduces native packaging and output compatibility risk; separate adapter boundaries make rollback possible without replacing generation or ownership data. Local GPU generation provides operator control but adds resource planning, backend security and version pinning. Paid adapters introduce billing/retention uncertainty and cannot promise successful remote cancellation.

Revisit the engine when fixtures or measured latency/memory show a concrete failure. Revisit backend/process topology when workload isolation or hardware utilization requires it. Record before/after evidence, compatibility plan and retained old template/model versions. Revert through reviewed configuration/dependency changes; do not discard source assets or rewrite old job provenance. See [scheduler decision](ADR-012-job-scheduler-and-task-queue.md) and [asset manifest](../legacy-command-manifest.json).
