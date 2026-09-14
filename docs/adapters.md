# Provider adapters, media and durable delivery

## Status and contract ownership

All adapters, image services and durable jobs below are **proposed**. The foundation contains no provider SDK integration, image renderer, stream watcher or job worker. Existing Discord REST configuration is not a general provider framework. This specification addresses BP-14–21, BP-45–46, BP-49–54, BP-58, BP-78–81. [Requirements](requirements.md) records gaps; [database](database.md) names proposed persistent records; [AI](ai.md), [music](music.md) and [moderation](moderation.md) own domain-specific behavior.

Preserve audited behavior without preserving unsafe coupling. Legacy `imagine` constructs Replicate in the command, reads an application-level plaintext token and defaults to `luma/photon`. Legacy Twitch stores subscriptions/notifications but deduplicates by stream ID alone; one guild can suppress another. Reminder rows already persist. Free-game collection includes an Epic storefront endpoint and Steam HTML parsing; source code is not proof of a supported public feed contract. See [legacy inventory](legacy-feature-inventory.md).

## 1. Adapter boundaries and versioning

Adapters translate provider authentication, DTOs and transport errors. Application services own authorization, limits, consent, job acceptance and result delivery. A provider cannot grant new capabilities to an LLM or command because its output names an action. Do not pass Discord objects, SQL clients or raw secrets through a provider-neutral request.

The following **illustrative TypeScript** is a proposed contract, not an exported API:

```ts
type FailureCode =
  | 'unsupported' | 'not_configured' | 'authentication' | 'forbidden'
  | 'invalid_request' | 'rate_limited' | 'quota_exhausted'
  | 'unavailable' | 'timeout' | 'cancelled' | 'invalid_response';

type ProviderResult<T> =
  | { kind: 'completed'; value: T; providerRequestId?: string }
  | { kind: 'accepted'; providerRequestId: string; nextCheckAt: string }
  | { kind: 'failed'; code: FailureCode; safeMessage: string;
      submission: 'not_submitted' | 'rejected'; retryAfterMs?: number }
  | { kind: 'unknown'; providerRequestId?: string;
      reason: 'connection_lost' | 'deadline' | 'unverifiable_result' };

interface ProviderCallContext {
  contractVersion: 1;
  operationId: string;
  attemptId: string;
  correlationId: string;
  scopeId: string;
  deadlineAt: string;
  signal: AbortSignal;
}

interface CapabilityEvidence {
  status: 'supported' | 'unsupported' | 'unverified';
  checkedAt: string;
  modelOrWorkflowVersion: string;
  documentationUrl: string;
}

interface ProviderHealth {
  checkedAt: string;
  state: 'healthy' | 'degraded' | 'unavailable' | 'unconfigured' | 'unknown';
  reasonCode?: string;
  nextProbeAt?: string;
}
```

`accepted` means the provider has an identifiable remote operation; it does not mean assets exist or Discord has received them. `unknown` means a side effect may have occurred: it is not a generic failure eligible for blind replay. Provider-known terminal failure belongs in a separate status lookup result with its actual receipt. A synchronous adapter may only return completed/failed/unknown; never manufacture asynchronous IDs.

Persist request schema/version, adapter version, selected model/workflow revision, normalized request digest and operation receipt. Old jobs either execute with supported versions or enter a visible unsupported-version quarantine. Do not reinterpret a previously accepted request under a newer model's defaults. Same operation key with different canonical payload must conflict; an attempt ID changes on retry while operation identity remains stable.

Capabilities, configuration and health are different facts. A documented editing API may be unsupported by the selected model; a healthy endpoint may reject the account; configured credentials may lack the required scope. UI options use the intersection of documented/model capabilities, configured access and guild policy. Health observations expire and include timestamps; “not configured” is not a provider outage. Probe with cheap authorized requests and never generate paid content merely to turn a dashboard indicator green.

## 2. Admission, deadlines, retry and fallback

Resolve an application request before provider submission: authenticate actor, authorize module/action, validate arguments and capability, select allowed provider/model, compute resource/cost bound, reserve quota, and persist job/operation identity. Recheck revocable policy before effects. The adapter obtains a credential through a restricted server-side resolver, not from the user request or ordinary settings JSON.

| Outcome | Required policy |
|---|---|
| Unsupported parameter/model | Reject before submission; show supported alternative explicitly |
| Missing/invalid credentials or forbidden scope | Disable affected capability pending configuration; no retry storm |
| Provider 429 | Honor documented retry/reset guidance; schedule durable retry within total budget |
| Transient failure proven before submission | Bounded retry if operation safe; preserve operation identity |
| Timeout/network loss after possible submission | Persist unknown outcome; query by receipt if available; do not blindly regenerate |
| Invalid response/output asset | Quarantine bounded diagnostic metadata; reconcile whether work was billed/completed |
| Cancellation requested | Stop local work when possible; distinguish request from confirmed remote cancellation |
| Provider recovery | Reprobe gradually and resume eligible work with remaining budget |

A retry policy has maximum attempts, maximum elapsed age, per-attempt timeout, rate budget and monetary/resource budget. Proposed backoff uses capped exponential delay with full jitter; provider `Retry-After` is a minimum wait when applicable. Store the next eligible instant instead of sleeping while holding a worker slot or database transaction. The budget is shared across retry/fallback attempts so changing providers cannot reset a user's quota.

Separate connection/request deadlines from durable job age. Propagate AbortSignal to capable HTTP clients and stop reading oversized/late responses. Local abort cannot prove the provider cancelled or avoided billing. On recovery, first query known provider operation IDs, then decide whether a new submission is allowed. A circuit breaker is a future local control per provider/credential/operation class: transient failures can open it, bounded probes can half-open it; invalid user input must not trip a provider-wide outage.

Fallback is explicit configuration with a permitted capability/model set, data-transfer policy and spending ceiling. Never silently send a private prompt to another vendor or substitute paid service for a local job outside that policy. Twitch/TikTok/Facebook are different sources, not interchangeable fallback implementations for the same creator. AI and music guides specify their own content/semantic fallback limits.

**Illustrative initial service limits, requiring implementation/load review:** metadata request deadline 10 seconds; at most two safe retries within a two-minute metadata budget; one image generation worker per local GPU initially; one heavy render worker initially; two pending image requests per user, twenty per guild and one hundred total. These are conservative design candidates, not installed defaults, guaranteed throughput or provider quotas. Generation deadlines must be model/workflow-specific rather than applying the metadata deadline to GPU jobs.

## 3. Durable job and delivery contract

Use proposed `operation_receipts`, `jobs`, `job_attempts`, `outbox_events`, `consumer_receipts`, `delivery_attempts` and domain records from [database](database.md). They are not installed. The coordinator/service commits accepted domain intent, quota reservation and durable work together. In-process timers only wake scanners; due times and attempts belong to the database.

```text
scheduled -> leased -> succeeded
                 |-> retry scheduled
                 |-> failed terminal
                 |-> reconciliation required
scheduled/leased -> cancellation requested -> cancelled (when confirmed safe)
```

The exact SQL status names are to be finalized in schema implementation. Distinguish “execution accepted”, “provider complete”, “assets persisted” and “application delivered” even if they are separate domain fields rather than more job states. A missing Discord reply must not erase a successfully generated asset or trigger another paid generation.

| Transition | Atomic check/effect | Recovery obligation |
|---|---|---|
| Accept | Request digest unique; scope allowed; reserve quota; insert job | Reply only after durable commit |
| Claim | Eligible due state; acquire lease owner/token/expiry; increment attempt | No remote call before claim commit |
| Renew | Matching token and unexpired ownership under defined clock policy | Lost lease stops new effects; old worker cannot overwrite newer state |
| Complete | Matching fencing token; record result/receipt; settle reservation; create delivery intent | Retry returns recorded result |
| Retry | Classify safe failure; consume shared attempt/age budget; record next time | Restart sees same schedule |
| Cancel | Match owner/authorized admin; persist request; release only safe unused reservation | Remote acceptance may remain unknown/chargeable |
| Terminal/quarantine | Persist safe reason and replay identity | Operator requeue is audited, preserving prior attempts and budget decision |

A DB fencing token prevents stale state commits; it cannot stop an expired worker from making a network call already in flight. Provider idempotency and reconciliation still matter. Claiming differs by dialect: PostgreSQL can use a reviewed locking/conditional-claim strategy; SQLite needs a short immediate transaction. Do not paste PostgreSQL locking SQL into SQLite. [ADR-012](adr/ADR-012-job-scheduler-and-task-queue.md) owns scheduling alternatives and recovery gates.

Crash cases to test: before acceptance commit; after claim before submission; after provider acceptance before receipt write; after asset write before DB reference; after Discord send before delivery receipt; after completion before user acknowledgement. A known message ID can support targeted verification/edit; absence of a matching message in a limited history scan does not prove no message was sent. When the destination cannot settle uncertainty, retain an explicit unknown result and apply a documented operator/user retry policy. Never claim universal exactly-once external delivery.

Fair admission rotates across guild queues and then users within a guild, with a bounded provider-specific concurrency pool. A large request consumes estimated work units, not merely one queue position. Priority changes require administrative policy and audit; ordinary users cannot buy priority through repeated submissions. Queue position is approximate and may change with eligibility/rate limits. Report accepted/queued/running/waiting-on-provider/reconciliation/complete states plainly.

## 4. Image generation contract

### Capabilities and request normalization

A proposed image descriptor identifies model/workflow version plus evidence for prompt, negative prompt, count, dimensions/aspect ratio, seed, quality, guidance, image-to-image, edit/mask and upscale. Each numeric feature declares min/max/step or an allowed set. Unsupported/unverified is different from optional omission. Do not advertise a provider-wide boolean when models differ.

```ts
interface ImageRequest {
  schemaVersion: 1;
  operationId: string;
  providerId: string;
  modelOrWorkflowVersion: string;
  positivePrompt: string;
  negativePrompt?: string;
  count: number;
  size: { width: number; height: number } | { aspectRatio: string };
  seed?: string;
  quality?: string;
  guidance?: number;
  sourceAssetId?: string;
  maskAssetId?: string;
  mode: 'generate' | 'image-to-image' | 'edit' | 'upscale';
}
```

This is a future application-normalized request. Trusted actor/credential/quota metadata stays in the service/call context. Seed is a validated canonical integer string with provider-specific range; it does not promise identical pixels across model/hardware versions. A mask requires an authorized validated source asset and dimensions compatible with that provider. If width/height and ratio conflict, reject rather than silently change composition. Count, pixel budget and estimated provider cost must fit every administrative ceiling.

### Prompt composition and presets

Store a versioned preset, optional guild additions, permitted user preferences and explicit invocation text separately from the final normalized prompt. Proposed positive default from BP-15: “high quality anime illustration, detailed character design, beautiful composition, clean line art, expressive eyes, cinematic lighting, detailed background.” A candidate negative preset may include blur, distorted anatomy and unwanted cropping; it is configurable rather than universal safety enforcement.

Resolve preset -> guild-configured additions -> permitted user preference -> invocation according to an explicit replace/append/opt-out rule. Do not append the same preset repeatedly on retry. Persist preset version and final digest so a queued job is reproducible. If the selected model lacks negative-prompt support, show that limitation and require an explicit supported configuration; do not quietly drop it or append negative text to the positive field. Content policy remains service enforcement, not a negative prompt string.

### Provider assessment, 2026-09-14

| Candidate | Verified documentation / intended role | Before enabling |
|---|---|---|
| Operator-hosted ComfyUI | Official local server exposes workflow queue submission, history and communication routes | Pin server/workflow/model/custom-node versions; verify GPU/memory, auth/network isolation, output contract and licenses |
| Gemini images | Official image-generation guide documents model-dependent generation/editing | Verify chosen model/account access, supported parameters, exact limits/cost/retention; no model version selected here |
| Replicate | Official prediction guide describes submitted predictions and lifecycle | Pin model/version, inspect input/output schema, polling/webhook/cancel contract, price/retention and auth scope |
| OpenAI images | Candidate named by blueprint; no account/model integration tested in this task | Complete official model-specific capability, access, cost/retention assessment before enablement |
| Hosted Hugging Face allocation | Optional candidate from dependency review | Credits/model availability change; no unlimited production promise |

References: [ComfyUI routes](https://docs.comfy.org/development/comfyui-server/comms_routes), [Gemini image guide](https://ai.google.dev/gemini-api/docs/image-generation), [Replicate prediction lifecycle](https://replicate.com/docs/topics/predictions/create-a-prediction). Documentation availability proves neither this deployment's access nor successful requests. [Dependency evaluation](dependency-evaluation.md) retains the dated package baseline and open cost/access checks.

ComfyUI adapter submits an **operator-approved workflow**, filling only allowlisted typed input nodes. It must not accept arbitrary user workflow JSON or install custom nodes/models from a prompt. Store returned prompt ID and map output nodes to expected assets. WebSocket progress is advisory; reconnect queries history rather than assuming interrupted progress means failure. Cancellation capability is verified for the pinned server: never call an interrupt that could stop another user's workflow. Local/open software still needs hardware, energy and suitable model licenses.

Quota lifecycle: reserve on durable acceptance; capture actual completed work and release unused safe reservations; retain uncertain charges pending reconciliation. Cancellation after provider acceptance is not automatic refund. Partial batch output records each valid asset and failed remainder; retrying the missing portion needs explicit remaining quota/budget. A delivery upload failure retries delivery from stored assets, not generation.

## 5. Deterministic graphics and safe asset pipeline

Rendering cards/memes from existing data differs from generative inference. Proposed renderer input is a validated template version, text/layout fields, authorized asset IDs and output bounds; it has no provider credentials. Evaluate `@napi-rs/canvas` against the legacy canvas fixtures before replacing it. The [upstream renderer](https://github.com/Brooooooklyn/canvas) documents implementation/platform support; no universal build-success or 2x performance result is established here.

Preserve all 96 meme JPGs and 94 badge assets, and visually port all 11 active meme templates plus profile/welcome output. Test long Unicode names, emoji fallback, RTL text, wrapping/truncation, transparent images, SVG/font behavior, missing asset fallback and readable attribution. Pin fonts/layout/template versions; record pixel/perceptual tolerances intentionally instead of assuming two engines produce identical bytes.

Proposed shared asset ingestion:

1. Authorize the source URL/asset reference and usage scope. Accept only allowed HTTP(S), reject userinfo and inappropriate ports; local provider addresses come from operator configuration, never public image input.
2. Resolve DNS and reject private/loopback/link-local/multicast/reserved destinations, including IPv6 and mapped forms. Validate **every redirect** and bind the connection to the validated address to prevent DNS rebinding; bound redirects and prohibit protocol downgrade outside explicit policy.
3. Stream with connection/body deadline and byte cap even when Content-Length is missing/false. Never trust filename or Content-Type alone.
4. Detect/decode in bounded worker isolation; validate format, dimensions, total pixels/frame count and decompression budget. Reject active SVG/external-resource behavior unless a separately hardened renderer explicitly supports it.
5. Strip unnecessary metadata, normalize only when the usage permits, hash bytes, store under generated content-addressed keys, and persist MIME/dimensions/provenance/scan state. Keep original source attribution independent from byte deduplication.
6. Atomically publish the DB reference after storage succeeds; clean orphan stages. Output responses use controlled asset IDs/attachment names, not arbitrary filesystem paths or credential-bearing URLs.

Private generated/edit input assets remain tenant/user-scoped. Object-store keys are not access control; serving routes authorize or issue short-lived scoped URLs. Discord attachments are transport copies, not permanent archival storage. Use actual request/guild upload limits at delivery, choosing bounded resize/compression or an authorized download link when necessary; no historic universal upload-size constant is promised.

Cache keys include source identity/version or content hash plus transformation/template version and dimensions. Shared public bytes can deduplicate; private prompt/output lookup must not cross tenants or reveal another user's image. Store source metadata, credit and removal state independently. Tombstone source removals, invalidate derived caches, schedule payload deletion and retain non-image ownership history. Lifecycle duration is configurable and still needs retention decisions; cached assets can expire or be removed.

## 6. Stream ingestion and independent subscriptions

### Normalized semantics

Proposed `resolveCreator` returns provider + stable external creator ID, display identity and canonical URL. A live lookup returns a tagged `live`, `offline` or `unknown` result with observed time; **request failure is unknown, never offline**. Live records include stable session ID where supported, start time, title/category, canonical stream URL and optional thumbnail metadata. Unsupported webhooks are a capability, not a stub that returns success.

Subscriptions persist requesting user, creator, platform, Discord guild, target channel, enabled/state, template/mention settings and revision. The proposed normalized DB catalog must include the requesting user/audit reference when implemented. One provider subscription may feed multiple independent application subscriptions; removing one guild's subscription must not revoke a shared provider subscription still in use.

Alice following creator X in guild A and Bob following X in guild B produce two delivery intents. The unique key is `(platform,streamId,discordGuildId,targetId)` or an equivalent normalized event FK plus guild/target. Preserve requesting-user attribution separately from target uniqueness. Multiple users requesting the same guild-target subscription need a defined ownership/membership model, not duplicate announcements.

### Platform assessment

| Platform | Evidence and proposed transport | Gate / limitation |
|---|---|---|
| Twitch, required | EventSub webhook or WebSocket; authorized Helix polling for reconciliation where useful | Account/app credentials, event scopes, subscription cost/limits and chosen transport validated before live enablement |
| TikTok, required | Official developer catalog reviewed | General-purpose arbitrary-creator LIVE watcher access not established; unverified/unavailable, no automatic scraping fallback |
| Facebook, required | Official Live Video API documentation URL attempted but retrieval failed | No scope/eligibility/general watcher access verified; remain unverified, not a claim no API can exist |
| YouTube, optional | Data API documentation and quota costs available | Specific authorized live/discovery endpoint and project quota must be validated; RSS/new-video signal alone is not proof a stream is live |

Sources: [Twitch EventSub](https://dev.twitch.tv/docs/eventsub/), [TikTok developer catalog](https://developers.tiktok.com/doc/), [Facebook documentation access point](https://developers.facebook.com/docs/live-video-api/), [YouTube quota costs](https://developers.google.com/youtube/v3/determine_quota_cost). No live credentials were used. Missing access cannot be replaced by invented public endpoints, anti-bot bypass or an unreviewed scraper. YouTube does not substitute for required Facebook assessment.

### Twitch ingestion/recovery

For webhooks, verify the HMAC over message ID + timestamp + raw body with timing-safe comparison, reject invalid/stale/replayed deliveries, and handle verification challenge and revocation distinctly. Authenticate before processing payloads. Persist verified event identity before acknowledging notifications quickly; thumbnail fetching and Discord sending happen later. Duplicate message IDs do not enqueue duplicate effects. [Official webhook contract](https://dev.twitch.tv/docs/eventsub/handling-webhook-events/).

For WebSocket, track welcome/session identity, keepalive deadline and reconnect instructions; process session reconnect/revocation and re-establish subscriptions when required by the documented lifecycle. Reconnect is not historical replay: reconcile observed creator state without fabricating missed start/end events. [Official WebSocket contract](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/).

Deduplicate provider ingestion by event identity, then domain session by stable stream identity, then application delivery by guild/target. These are three different keys. Refresh tokens under a shared single-flight operation, scope auth failure to affected credentials, and stop repeated unauthorized requests. Pool unique creators across guild subscribers for justified polls. Twitch exposes request-bucket headers and limits; use current values and cost budget rather than hard-coding a permanent per-minute allowance. [Twitch rate limits](https://dev.twitch.tv/docs/api/guide/#twitch-rate-limits).

### Templates, targets and thumbnails

Allowlisted placeholders can include `{streamer}`, `{title}`, `{game}`, `{url}` and `{role}`. Templates are bounded text, not executable expressions or arbitrary interpolation. Provider titles/usernames are escaped data. Role placeholder resolves only the configured, authorized guild role; default `allowedMentions` is empty and broad `@everyone`/`@here` needs explicit policy. Recheck target belongs to guild and bot can send/embed/attach before delivery. Missing/deleted target pauses that subscription visibly without blocking unrelated guilds.

On a new stream intent, fetch a permitted thumbnail through the shared safe pipeline, hash/cache, upload with the Discord message and use the returned attachment reference. Preserve source credits where required. A thumbnail failure should normally fall back to a text/link announcement; delivery must record whether media was omitted. Retrying a failed thumbnail later must not resend the original notification. Cache retention/removal can invalidate an asset; neither CDN upload nor a DB flag guarantees thumbnails never expire.

## 7. Free-game feeds

Normalize provider/offer identity, region/locale, claim window, canonical store URL, title, asset and classification: free-to-keep, temporary free-play, permanently free or unknown. A numeric zero price alone is insufficient to distinguish those products. Expired/upcoming offers retain dates; do not mutate title as the only “coming soon” marker. Dedupe by provider/offer/window and guild/target, so a later legitimate promotion can be announced again.

| Candidate | What this review establishes | Remaining access work |
|---|---|---|
| Epic | Legacy code calls `freeGamesPromotions`; attempted official Ecom docs retrieval failed | Storefront endpoint is not certified here as a stable authorized public feed; verify current terms, region and identity semantics |
| Steam | Official Steamworks Web API overview is available; legacy implementation parses store search HTML | No general official free-promotion feed contract verified; choose documented permitted source before enabling |
| GOG | Official developer documentation available | General giveaway catalog API access/terms/limits not established |

Reference entry points: [Steamworks APIs](https://partner.steamgames.com/doc/webapi_overview), [GOG developer docs](https://docs.gog.com/). A catalog's existence does not prove access to every promotion. Unsupported providers are visible as unverified; no fake empty-success feed or silently added scraper. A failed fetch returns unavailable/unknown, not “there are no games.”

Persist promotion observations, then per-target delivery intent, then confirmed/unknown send result. Never mark announced before Discord succeeds. Provider enablement, poll schedule, region, channel and mention role are guild-controlled within operator limits. Backfill policy after downtime must bound old promotions and avoid flooding a channel; expired offers are not sent as currently claimable.

## 8. Acceptance and operator evidence

| Scenario | Required result |
|---|---|
| Unsupported negative prompt/edit/seed | Reject before quota spend or provider submission |
| Same request key with changed prompt | Conflict, no second generation |
| Lost reply after provider acceptance | Receipt lookup/reconciliation, no blind paid retry |
| Cancel on shared GPU | Only the owning job is affected; otherwise cancellation reported unsupported/pending |
| Concurrent quota admissions | No oversubscription; reservation/capture/release balances reconcile |
| Oversized/deceptive/private-address image | Fetch/decode stopped before unsafe processing or network access |
| Worker dies after asset write | Orphan stage recovered/cleaned; no broken permanent reference |
| Same stream in two guilds | Two independent intents; duplicate event produces neither extra send |
| Bad webhook signature/replay | No domain event or queued delivery |
| Lost lease then stale completion | State commit rejected; external ambiguity reconciled separately |
| Provider unavailable | Unknown/degraded state, not false offline/empty catalog |
| Title contains mention syntax | No unauthorized ping; safe bounded template output |
| Thumbnail fails | Text/link delivery under policy; no later duplicate announcement |
| Source art removed | Payload/cache removed, credit/tombstone/ownership history retained appropriately |
| Restart/poison payload/new version | Durable recovery or explicit quarantine with bounded attempts |

Use deterministic fake transport/clock/storage tests, real SQLite/PostgreSQL claim/race tests and optional authorized provider smoke tests separately. No provider test suite exists yet. Record adapter/model version, access scopes, limits/price/retention evidence date, sanitized request/result shape and observed failure/cancellation behavior before enabling a capability. The [image ADR](adr/ADR-006-image-generation-and-canvas-synthesis.md), [stream ADR](adr/ADR-007-stream-platform-notification-architecture.md) and [job ADR](adr/ADR-012-job-scheduler-and-task-queue.md) contain design choices and reversal gates.
