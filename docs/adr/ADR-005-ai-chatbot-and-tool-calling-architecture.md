# ADR-005: AI providers, scoped memory and mediated tools

## Status and scope

**Proposed future subsystem.** This ADR defines an implementation contract; no new AI provider, conversation persistence, dedicated-channel listener or tool runner exists in the current 2.0 foundation. The selected documentation epic does not authorize implementing or enabling them. [ai.md](../ai.md) owns detailed contracts, candidate limits, examples and acceptance; this ADR explains the tradeoffs and conditions for revisiting them.

Requirements: blueprint BP-11, BP-74, BP-75 and BP-79–81. Read the corresponding full [blueprint](../../BLUEPRINT.md), [legacy inventory](../legacy-feature-inventory.md), [database](../database.md), [adapters](../adapters.md) and [configuration/authorization ADR](ADR-013-configuration-permissions-and-concurrency.md).

## Problem and evidence

Legacy 1.4.0 selects Ollama, Google AI, OpenRouter or OpenAI through a factory. Its `userPrompts` memory belongs to the command instance and uses only user ID, so histories can mix channels/guilds and disappear on restart. Slash selects a guild model override while prefix omits it. Chunk-count-based streaming does not model Discord pacing, and raw provider failures can reach user output.

The post-reply musical-note detector does not establish functioning music tools: its action implementation logs that playback is unimplemented. The replacement must preserve useful chat/model interfaces without certifying unfinished legacy behavior. Source is pinned in [ai.md](../ai.md); no production conversation export or live provider baseline was supplied.

The platform needs an opted-in shared AI channel with per-user memory, minimal safe Discord identity, separately configurable personality, a real clock, pluggable models and selected bot actions. The difficult boundary is that model output can suggest an action but cannot supply authorization, reliable completion evidence or a trustworthy transaction boundary.

## Alternatives considered

| Alternative | Benefit | Cost/failure mode | Disposition |
|---|---|---|---|
| Repair command-local arrays and provider code | Smallest initial patch; minimal schema | Restart loss, cross-context risk, weak ordering/deletion and duplicated transport behavior | Rejected as the target architecture; narrow compatibility adapters may aid migration |
| One provider-specific agent framework owns state/tools | Fast access to native capabilities and hosted orchestration | Couples data lifecycle and domain effects to one provider; difficult cross-provider semantics and local-only policy | Not the initial application authority; adapter may use vendor APIs internally |
| Universal SDK abstraction pretending all models are equivalent | Small apparent interface | Hides unsupported tools, context/usage differences, refusals and unknown cancellation outcomes | Rejected; expose capability/terminal outcome differences |
| Application-owned scope/store/turn coordinator with small provider adapters | Shared policy, explicit persistence, independent tool authorization and receipts | Requires schemas, leases, test fixtures and maintained vendor mappings | Proposed choice |
| One conversation shared by an entire channel | Natural group conversation | Violates requested per-user isolation and can leak prior private context | Rejected default; a future explicit group feature needs its own privacy contract |
| Concurrent turns within one user's scope | Lower perceived latency for bursts | Out-of-order summaries/replies, duplicate tool intents and reset races | Serialize per scope; allow bounded concurrency across independent scopes |
| Automatic cloud fallback after any failure | Higher apparent availability | Unexpected data export, repeated charges/effects and refusal bypass | Restrict to approved destinations and established safe retry boundaries |

## Proposed decisions

### 1. Application owns identity and turn lifecycle

Use a discriminated guild/channel/user scope and a separate explicit DM scope. Database queries bind full identity plus conversation generation; IDs from user/model text cannot select another session. Dedicated-channel opt-in is explicit, while slash/prefix/mention routes share one service/model path. Public channel visibility remains public even when stored memory is isolated.

Each accepted turn receives a durable sequence, deduplicated input identity and budget reservation. Execute one turn per scope, with bounded pending turns. A lease/fencing mechanism coordinates multiple processes; short transactions reserve/commit state around external model calls. Reset/deletion advances generation and invalidates summaries, queued work and late completion authority.

This adds coordination overhead but makes the Alice-turn-41/reset-generation-8 scenario testable. A stale model stream may consume provider resources; it cannot write into the new session or trigger a new authorized tool. A reset cannot undo an already committed queue operation. Minimal domain receipts remain separate from deleted prompt content.

### 2. Provider adapters expose capabilities and uncertain outcomes

Keep provider/model selection explicit, using real configured/account-available models and evidence-dated capability metadata. Responses distinguish text, complete tool calls, usage, refusal, length truncation, failure and unknown completion. Streamed argument fragments are never executable. Native continuation metadata stays inside the adapter boundary; a generic string history must not discard provider-required state silently.

OpenAI documents application-executed function calls and strict schema constraints; those constrain syntax, not the caller's authority. [Official function-calling guide](https://developers.openai.com/api/docs/guides/function-calling). Gemini and Ollama also document tool support, while OpenRouter adds an intermediary/provider-routing policy; their current evidence and activation requirements are linked in [ai.md](../ai.md). No fixed “best” model, current price, free allowance or guaranteed local/offline execution is inferred from a provider label.

A typed failure taxonomy drives bounded retry. Known pre-submit failure may retry; timeout after submission can leave charge/completion unknown. Refusal is not routed elsewhere to evade it. A fallback must satisfy model capability, remaining budget and configured data-destination policy. Local-only intent cannot silently become hosted processing.

### 3. Tools call existing domain authorization and idempotency

An application registry defines each tool's schema, version, module, actor checks, disclosure class, timeout, result size and effect/idempotency contract. The model sees only allowed installed tools. Runtime validation and fresh execution-time authorization remain mandatory even with provider strict schemas.

Initial proposed tools are `get_time` (optional `get_current_time` alias), `search_anime`, `check_balance` and `queue_song` after their services exist. Clock reads actual time; search returns bounded untrusted data; balance derives caller identity and respects private disclosure; music returns a queue receipt only after the music service accepts it. No administrative ban/kick/member-removal, transfer, arbitrary wagering, shell, SQL, filesystem, generic HTTP or model-download tool is initially available.

Provider call IDs are evidence, not the sole side-effect key: regenerated calls can use new IDs. Domain operation identity must prevent repeated effects for the same requested action, while permitting an explicitly requested new action. Presentation failures retry presentation only. This costs persistent receipts and careful intent binding, but avoids enqueueing twice after a successful tool call whose model/Discord response was lost.

### 4. Memory is bounded and deletable

Store recent complete turns plus an optional versioned summary with covered sequence range, generation and expiry. Summaries are untrusted derived content and cannot outlive deletion/retention of their source facts. Context budgeting reserves instructions/tool schemas/current input/output first, then selects history within the actual model limit. Never remove policy instructions to fit more history.

Candidate limits in ai.md are tuning proposals requiring tests and product review, not current defaults or latency guarantees. Application deletion, backup retention and provider-side retention are distinct; the UI must disclose the actual selected provider policy. No requirement is satisfied by silently preserving deleted facts in summaries or operational logs.

### 5. Discord delivery is a separate bounded operation

Acknowledge slash interactions before provider work, coalesce streaming edits with backpressure and honor actual Discord rate limits. Candidate edit intervals are application pacing, not a fixed platform guarantee. Split within message limits, suppress mentions and bound follow-up count. Prefix/channel messages cannot promise ephemeral privacy.

Cancellation stops unstarted actions and stale delivery authority; it cannot guarantee a remote provider stopped or refunded the request. Keep partial output visibly incomplete and account for uncertain usage. AI success, domain effect success and Discord presentation success are separate recorded outcomes.

## Consequences and operational obligations

The design introduces conversation/turn/tool/reservation persistence before AI becomes available. It requires domain-owner review for music/economy tools, endpoint/secret controls, model capability fixtures and multi-process/reset tests. Provider SDK upgrades must preserve these contracts rather than silently altering tool or data-retention behavior.

Structured calls do not guarantee correct intent, truthful answers or immunity to prompt injection. Names, personality, summaries and retrieved/tool data stay untrusted; application rules enforce scope and effects. A synopsis asking for a privileged tool cannot manufacture user consent. Security tests must show no forbidden service call, not merely that a model often refuses.

Operator diagnostics should expose configuration/capability verification, queue/lease age, reservation/usage reconciliation, latency and safe outcome codes. They must omit prompts, raw tool results and credentials. Logs/receipts need retention and redaction. Hosted fallback or live probes may incur costs and disclose data; enable only under the reviewed provider policy.

## Validation before changing status to accepted

1. Implement and test shared slash/prefix/channel admission, explicit opt-in and complete scope isolation, including DM separation and duplicate events.
2. Exercise ordered same-scope turns, independent users, stale leases, reset during streaming/tool execution and deletion/summary expiry without revival.
3. Run each installed provider through text/tool/refusal/usage/partial-stream/error fixtures; record separate bounded live evidence for actual account/model access.
4. Prove malformed/unknown/extra tool arguments fail before service calls, permissions are rechecked, and repeated provider call IDs/intents yield one domain effect.
5. Verify approved-data fallback, no refusal bypass, concurrent budget reservations and unknown paid completion handling.
6. Test Unicode/message splitting, rate-limit backpressure, mention suppression, cancelled/deleted channel delivery and incomplete-output state.
7. Review private balance/result disclosure and retained audit data with [the secrets ADR](ADR-011-secrets-management-and-credential-security.md); verify no prompt/credential leakage in diagnostics.

No new tests or live AI requests are claimed by this documentation. Existing foundation unit success is not AI readiness.

## Revisit triggers

Revisit the decision if measured single-scope queueing exceeds acceptable UX, provider capabilities require a richer normalized event model, multi-process ownership fails load/fault tests, retention requirements conflict with an enabled provider, or domain effects cannot supply an idempotent receipt. Consider a larger orchestration framework only after its concrete advantage is measured and application authorization/data ownership can remain explicit.

A future shared group conversation, vision/attachment ingestion, autonomous moderation, paid game action or arbitrary external tool is a new capability with its own scope/privacy/security review. It is not covered by this ADR's safe-tool list. Keep implementation tickets groomed and honor the standing one-epic/story PR checkpoint before expanding scope.
