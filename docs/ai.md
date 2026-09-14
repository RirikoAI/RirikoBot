# AI conversation, provider and tool design

**Status: proposed subsystem; not implemented in the 2.0 foundation.** There is no `packages/ai` implementation, conversation store, dedicated-channel listener, AI tool engine or registered AI command/provider in the current built-in factory. The database's AI records are proposed contracts. This guide specifies future behavior against blueprint sections 11, 74, 75 and 79–81; it does not claim working integrations or account access.

Read [architecture](architecture.md), [database](database.md), [adapters](adapters.md), [commands](commands.md) and [ADR-005](adr/ADR-005-ai-chatbot-and-tool-calling-architecture.md) together. Provider/module installation and application authorization precede exposure through commands, channel messages or tools.

## Legacy behavior to preserve and repair

The pinned 1.4.0 [AI command](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/ai/ai.command.ts) exposes `/ai prompt:<text>` and prefix `!ai <text>`; do not silently replace that interface with `/ai chat`. `ai-model` has set/pull/pull-default/reset behavior recorded in the [inventory](legacy-feature-inventory.md). A future interface may add capabilities while retaining a documented compatibility route.

The legacy factory selects Ollama, Google AI, OpenRouter or OpenAI from environment configuration. Its command-local `userPrompts` array is unbounded and keyed only by user ID, with persistence/limit TODOs. Slash passes a guild model override while prefix omits it. Both paths must use one model-selection service in 2.0. Legacy streaming schedules edits by chunk count; chunk arrival rate is not a transport rate limit. Raw provider errors must not be forwarded into Discord.

The musical-note regex detects suggested post-reply actions, but [PostReplyActions.play](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/ai/actions/post-reply.actions.ts) only logs that playback is unimplemented. Do not claim autonomous playback was working. Retain useful chat/model functionality while replacing marker-based execution with application-mediated tools.

## Trigger, identity and privacy contract

A guild manager may explicitly configure a dedicated AI channel. In that channel, eligible human messages invoke AI without prefix/mention. Outside it, only explicit compatible AI commands and separately enabled mention triggers qualify. Default is disabled, never global ambient listening. Ignore bot/webhook/self messages, known command messages already handled elsewhere and duplicate Discord event IDs. Resolve threads as their actual channel scope; do not inherit a parent's AI opt-in silently.

Check guild/module/channel policy, actor access, usable provider and quota before accepting a turn. Dedicated-channel permission to chat is not permission for every tool. Rate-limit rejected events without producing a reply loop. Edits/deletions of source messages have a documented policy: candidate default is no automatic regeneration on edit, and deletion cancels/removes retained content where supported; they must not silently execute the same action again.

```ts
// Proposed framework-independent identity; never supplied by model arguments.
type ConversationScope =
  | { kind: 'guild'; guildId: string; channelId: string; userId: string }
  | { kind: 'dm'; channelId: string; userId: string };
```

DM support is separately opt-in and has no guild music/admin tools. Do not encode missing guild as a shared empty-string key. Every repository query binds the complete scope, conversation ID and active generation; fetching by conversation ID alone is insufficient authorization. Guild/channel membership changes are rechecked at acceptance and before effects. Users sharing a channel never receive each other's stored conversation history as model input.

**Scoped memory does not make a public Discord channel private.** Replies and the user's source messages remain visible according to Discord channel permissions. The opt-in UI must explain the provider destination, retention and output visibility. Do not ingest unrelated channel history, quoted private material, attachments or another user's memory automatically. An explicit user quote is untrusted supplied text, not permission to retrieve the quoted person's backend session.

Transport-supplied username/display name and permitted guild display context can be presented as labeled data with length/control/mention handling. Names are mutable and can contain instructions; they are not policy. Internal authorization still uses IDs in trusted application context, but provider prompts need only minimal public identity. Do not send role lists, database identifiers, billing state, tokens or unrelated moderation notes merely to personalize a reply.

## Personality, time and configuration

System safety/tool rules remain application-owned. Guild personality is separately stored, validated untrusted configuration; user preferences may narrow tone/language within guild policy. Candidate default persona follows the blueprint: helpful anime-loving companion, casual American English, occasional Japanese phrases and restrained emoji. A personality saying “ignore permissions” has no effect on application rules. Store persona/config version on each accepted turn for reproducibility without retaining secrets.

Time is read from a real clock, not inferred by the model. Canonical proposed tool name is `get_time`; `get_current_time` can be a schema-identical compatibility alias for the blueprint wording. Resolve timezone from explicit validated user preference, then guild preference, then UTC. Validate an IANA timezone before formatting; never accept model-supplied offset arithmetic as authoritative. Return UTC instant, timezone, local display and offset at that instant. Daylight-saving ambiguity matters when creating future reminders, which needs its own service clarification policy.

| Proposed setting | Authority / validation | Runtime behavior |
|---|---|---|
| Enabled channels and trigger modes | Guild manager; existing readable text channel, explicit thread policy | Recheck before turn admission; disabling blocks new turns |
| Provider configuration reference | Bot owner installs endpoint/secret; guild selects allowed configuration | Never accept arbitrary user endpoint URLs |
| Allowed/default models | Verified catalog plus account access; no guessed fallback model | Same selection for slash/prefix/channel; unavailable model fails clearly |
| Tool allowlist | Intersection of installed tools, bot/guild policy and actor permission | Never expand capabilities from personality or tool output |
| Personality/language | Guild/user precedence with bounded text and revision | Changes affect new turns; cannot grant authority |
| User/guild timezone | Valid named timezone | Explicit time tool; invalid config reported |
| Memory retention/context limits | Operator/guild maximum; user may choose shorter/disabled retention | Reset/deletion invalidates old generations and summaries |
| Fallback providers/data destinations | Explicit allowed chain and disclosure policy | No local-to-cloud transfer unless policy permits it |
| Request/token/cost/concurrency budgets | Operator hard cap; guild/user narrower caps | Atomic admission/reservation, not in-memory counters only |

These fields are not present in the current configuration CLI/dashboard. The future UI must distinguish installed/configured/verified/unavailable states and record expected revisions to reject stale administrative intent. No `provider:test`, AI reset CLI or model provisioning command is implemented today. Local model download/pull can consume disk/network and remains an operator action; normal users must not trigger arbitrary model downloads.

## Provider contract and current source evidence

The interface must represent text, complete tool calls, refusal, usage and uncertain completion. A stream of `{text,isFinished}` alone loses essential safety/accounting information. Illustrative contract, requiring a future implementation ticket:

```ts
interface ChatCapabilities {
  text: boolean;
  streaming: boolean;
  tools: boolean;
  strictToolSchema: boolean;
  vision: boolean;
  cancellation: 'request-only' | 'confirmed' | 'unsupported';
  usage: 'reported' | 'estimated' | 'unavailable';
  contextTokens: number | null;
}
interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
}
interface ChatRequest {
  requestId: string;
  model: string;
  messages: readonly ModelMessage[];
  toolSchemas: readonly unknown[]; // Validated compiled schemas at adapter boundary.
  maxOutputTokens: number;
  deadlineAt: string;
  signal: AbortSignal;
}
type ChatEvent =
  | { kind: 'text-delta'; text: string }
  | { kind: 'tool-call'; callId: string; name: string; argumentsJson: string }
  | { kind: 'usage'; inputTokens: number | null; outputTokens: number | null }
  | { kind: 'complete'; responseId: string | null; reason: 'stop' | 'tools' | 'length' | 'refusal' }
  | { kind: 'failed'; code: string; outcome: 'not-submitted' | 'failed' | 'unknown'; retryAfterMs: number | null };
interface ChatModelProvider {
  readonly id: string;
  capabilities(model: string): Promise<ChatCapabilities>;
  stream(request: ChatRequest): AsyncIterable<ChatEvent>;
}
```

A non-streaming adapter can emit one bounded text delta followed by a terminal event. Validate event order, types, lengths and complete tool arguments; do not execute streamed JSON fragments. Preserve provider-specific call IDs and required opaque continuation metadata in the adapter's protected continuation state rather than pretending all APIs have identical roles/content. Do not expose hidden reasoning as user-visible output or store it as ordinary chat history. No trusted actor/guild permissions travel inside a model-editable request field.

Provider evidence reviewed 2026-09-14 establishes documented APIs, **not this repository's implementation, credentials, live access or performance**:

| Provider | Official evidence | Required implementation/access decision |
|---|---|---|
| Google Gemini | Native function-calling contract is documented; limits vary by model/project/tier. [Functions](https://ai.google.dev/gemini-api/docs/function-calling), [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) | Configure actual account-available model and API credential; validate schema/continuation semantics, streaming and usage for that model; record billing/data terms before activation |
| OpenAI | Function calls are application-executed; strict mode constrains supported argument schemas, not authorization. [Function calling](https://developers.openai.com/api/docs/guides/function-calling) | Choose supported API/model explicitly, compile compatible strict schemas, validate again locally and map stream/tool/refusal/usage events; never infer entitlement from a model name |
| Ollama | Local and cloud endpoints are distinct; tool calling is documented for supported models. [API](https://docs.ollama.com/api/introduction), [tools](https://docs.ollama.com/capabilities/tool-calling) | Verify installed model/runtime and actual execution destination; local inference needs hardware and model-license review and is not an unlimited zero-cost hosted service |
| OpenRouter | Routing can vary by provider and parameters; provider selection includes tool support and data-handling controls. [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection) | Hosted intermediary, not local Ollama; configure account/key, exact model/provider restrictions, fallback/data policy and spend limits |
| Other compatible endpoints | Compatibility is a protocol claim requiring a named vendor's current documentation | Bot-owner endpoint allowlist, TLS/network policy, model/capability conformance and retention/cost review before enabling; no arbitrary URL passthrough |

Do not bake stale Gemini/OpenAI model recommendations or prices into defaults. A catalog record includes provider/model ID, endpoint/API family, capability evidence date, context/output bounds, pricing reference/version, allowed data destinations, retention controls and last safe probe status. Catalog fetch failure does not invent an available model. A live test is separate, credentialed, bounded and explicitly authorized where it sends data or incurs cost.

Application retention and provider retention are separate. For OpenAI, evaluate the selected endpoint/account data controls rather than assuming local deletion deletes remote copies. [Official data controls](https://developers.openai.com/api/docs/guides/your-data). Apply the same documented review to each actual provider and any intermediary. Disable automatic cross-provider fallback when its data destination/policy is outside the user's configured allowance.

### Failure taxonomy and fallback

| Category | Retry/fallback policy |
|---|---|
| Invalid input/schema/model unsupported | Correct configuration/request; no repeated chargeable attempts |
| Authentication/permission | Mark configuration unavailable; no secret-value logging; do not try unrelated credentials |
| Rate limited | Honor bounded retry-after and total deadline/budget; fallback only if approved and safe |
| Pre-submit connection failure | May retry within budget when adapter can establish no submission |
| Timeout/disconnect after submission | Completion/charge may be unknown; retain reservation and reconcile before retry/fallback |
| Provider refusal/safety result | Return safe refusal; do not route to another provider to evade it |
| Malformed/truncated stream | Mark incomplete; never parse partial text into an action or pretend a complete answer |
| Cancel/reset/permission revoked | Stop new effects and abort transport where supported; do not promise remote cancellation or refund |

After visible partial output, candidate policy is no silent provider substitution. Mark the response interrupted; a user-requested retry is a new bounded turn with no automatic replay of previous tool effects. Fallback before output still must not repeat a committed tool operation. Provider retry attempts and domain tool execution have different idempotency identities.

## Memory, ordering, reset and retention

Use the proposed `ai_conversations`, `ai_messages`, `ai_tool_calls` and preferences records from [database.md](database.md). Store conversation scope, generation, turn sequence, config/provider/model version, summary version/coverage/expiry and status. Message uniqueness includes conversation/sequence; accepted input is deduplicated by transport event/request identity. Token estimates are metadata, not permission to retain content indefinitely.

Admission transaction claims the next turn sequence and reserves capacity against the active generation. Execute at most **one turn per conversation scope** at a time; queued follow-ups see the prior completed turn, not an interleaving of two assistants. Different users can run concurrently within global/guild/provider caps. Use durable ownership/lease fencing for multi-process workers, with short transactions around state changes rather than one transaction across network calls.

A worker captures generation/lease/config versions. Before appending final content, executing each tool or delivering a result, verify those versions and current authorization. A stale worker cannot write into a reset conversation. Reset increments generation, invalidates summaries and marks queued/running old-generation turns cancelled; deletion additionally removes/redacts retained content according to the retention policy. Resets cannot undo a song already queued or another committed domain action. Keep the minimum operation/audit receipt required to prevent duplicate effects without restoring deleted prompt text.

Candidate initial limits for review/testing, **not implemented or measured defaults**:

| Limit | Candidate policy |
|---|---|
| Pending turns per scope | 3, with clear busy rejection beyond capacity |
| Input | 8,000 characters maximum before token budgeting; attachments off initially |
| Model rounds / tool calls | At most 3 model rounds and 8 total calls per accepted turn; mutation calls serial |
| Turn deadline | 60 seconds total; tool deadlines fit inside remaining time |
| Retention | Explicitly disclosed opt-in policy; candidate 7-day message expiry and 100-message cap per scope, user may disable memory |
| Summary | At most 1,000 estimated tokens; versioned covered sequence range; never outlives source retention/deletion |
| Concurrent requests | Operator-configured global/guild/provider caps; a paid configuration without a budget remains disabled |

Context assembly reserves space for system/tool schemas, current input, bounded tool results and maximum output before selecting recent complete turns. Require `input budget + reserved output <= model context limit - safety margin`. Count using provider/model-appropriate tooling where available; estimates are marked as estimates. If the fixed instruction/tool/input portion does not fit, reject or ask for shorter input rather than deleting security instructions.

Summaries compress older complete turns only. Store source sequence range, generation, summarizer model/config and creation time; preserve a bounded recent verbatim window. Summaries are untrusted derived content, never system instructions, and may be wrong. Do not keep facts from deleted/expired messages alive solely through a summary: invalidate/rebuild affected summaries. Summary generation has its own metered cost within the turn/system budget. If unavailable, use a documented bounded recent-turn window, not unbounded history.

### Worked concurrent reset and cancellation

1. Alice's scope `(guild G, channel C, user A)` is generation 7. Turn 41 is streaming; Alice's second message is accepted as pending turn 42. Bob has a different scope and cannot load either turn.
2. Turn 41 proposes `queue_song`. The application verifies the explicit user request, actor voice state/module/bot permissions and creates operation receipt Q once. A repeated provider call references the same intended operation and returns Q rather than enqueueing again.
3. Alice resets memory. One transaction advances generation to 8, invalidates its summary and cancels old queued turn 42. The transport aborts turn 41 where possible; old-generation writes/delivery are fenced.
4. If Q committed before reset, the queue entry remains with its independent domain receipt. Reset does not remove it or claim playback stopped. If Q had not crossed the execution gate, it must not execute afterward.
5. A late model completion for generation 7 is discarded from new memory and no new public reply is sent. Any uncertain provider usage remains accounted for separately. Alice's next turn starts fresh in generation 8.

A cancel button is requester-bound and identifies turn/generation, not a raw provider key. Cancellation before submission releases the unused reservation; cancellation after submission may leave a pending usage settlement. Source-message deletion follows the same fencing path. A deleted Discord response does not justify recreating it indefinitely.

## Application-owned tool registry

Native function calling chooses a **proposal**. The application owns allowed names, strict runtime schemas, purpose/actor checks, timeout, output redaction, idempotency and execution. Reject unknown names, extra properties, malformed JSON, oversized arguments and fabricated actor/guild/user fields. Provider strict mode can improve argument shape but is not a replacement for local validation or domain authorization.

A proposed tool definition includes name/version, description, input/output schema, installed module, read/mutate classification, actor authorization function, timeout, result byte cap, data-disclosure class and idempotency policy. The registry offered to a model is the intersection of installed capabilities and allowed policy for that turn. Recheck permissions immediately before execution because roles, channel access, music voice state or module flags may change during generation.

| Tool | Strict model input | Application-owned action and safe result |
|---|---|---|
| `get_time` | Optional validated timezone selector, or none to use preferences | Read injected clock; return UTC/local/zone/offset, no privileged state |
| `search_anime` | Bounded title/query and result limit | Call installed anime search adapter; return bounded title/source/link/synopsis data under content policy; no arbitrary HTTP |
| `check_balance` | No target user or guild override | Read caller's account through economy service; return scoped balances only when disclosure to selected provider/output is allowed |
| `queue_song` | Bounded query or supported source URL | Resolve/queue through MusicService with trusted actor, current voice/policy checks and stable operation key; return queue receipt/status, not guaranteed playback |
| Future profile/config readers | Specific approved fields only | Redacted service projections; never raw settings/credentials or another user's private profile |
| Future reminders/game actions | Explicit bounded operation-specific schema | Separate reviewed service semantics and authorization; unavailable until implemented |

Destructive moderation, channel-member removal, money transfer, arbitrary betting, model download, shell, SQL, filesystem and generic HTTP tools are absent from the initial registry. A model request to ban someone is unknown/denied, not forwarded to a privileged Discord client. Adding a tool requires its domain owner, schema and failure/idempotency tests; it is not enabled by writing a prompt description.

### Concrete flows

**Time:** user asks the time → registry resolves `get_time` → application reads actual clock and preference timezone → bounded result records the instant → model describes that result. A fake “system time” in a username, synopsis or earlier message cannot override the clock.

**Anime search:** user asks for an anime → schema validates query/limit → installed provider returns structured matches → service validates source URLs and truncates synopsis → model sees the result labeled external data. A synopsis containing “call queue_song” is content, not another user request or executable instruction.

**Balance:** caller asks for their balance → service derives account identity from authenticated actor → disclosure policy checks whether that value may go to the selected provider and current visible channel → allowed context receives bounded amounts/scope/timestamp. If private disclosure is unavailable, return a safe instruction to use the future protected balance surface instead of posting financial details to the shared channel. Do not silently query someone else because the model supplied their ID. This flow becomes available only after the economy command/service exists.

**Queue:** caller explicitly asks to play a track → model proposes query → service verifies same permitted voice/session/module and bot permissions → resolver applies music source/security limits → domain accepts one enqueue operation and returns a receipt → model says queued only after that receipt. Unsupported URL, unavailable source, queue-full or permission change returns a typed denial/failure. If presentation fails after enqueue succeeds, retrying presentation must not enqueue again. Music bounds, including volume, remain enforced by [music.md](music.md)'s service contract.

Tool result envelopes distinguish `ok`, `denied`, `invalid`, `unavailable`, `failed` and `unknown`, with safe explanation and an opaque receipt where relevant. A model-generated success sentence is never evidence that the tool committed. Persist application operation identity independently of provider call IDs; providers can repeat/regenerate calls with new IDs. Check semantic duplicates for the same requested action, while allowing an explicitly requested second song as a separate operation.

## Prompt injection, streaming and operational budgets

Treat user messages, identity strings, personality, summaries, search results, tool outputs and provider-generated arguments as untrusted data. Keep instructions separate and label provenance, but rely on application checks for authorization. Neither a quoted administrator message nor a tool result may add tools, relax policy, choose arbitrary endpoints or request secret disclosure. An action requires authorized user intent in the current scope; unexpected instructions embedded in retrieved material cannot manufacture that intent.

Before a model request, atomically reserve user/guild/provider request and token/cost capacity. Track attempts, actual/estimated usage, reconciliation status and reservation release/capture once. If actual usage is unavailable after an ambiguous paid request, keep a bounded pending settlement and stop further attempts that could exceed budget; do not turn unknown usage into zero cost. Do not log prompts or raw responses in operational metrics. Report counts, durations, model/config identifiers, outcome categories and opaque correlation IDs.

Slash interactions must acknowledge within Discord's three-second initial deadline; the follow-up token has a 15-minute lifetime. Defer before provider work and use the shared transport adapter. [Discord interaction rules](https://docs.discord.com/developers/interactions/receiving-and-responding). Prefix/dedicated-channel messages can create one bounded thinking response; they cannot pretend to be ephemeral.

Coalesce streaming text into a single pending edit per response with backpressure. A candidate 1.5-second minimum edit interval is an application pacing choice, **not a guaranteed Discord rate limit**; honor actual route/global throttling and retry-after. Content is limited to 2000 characters per ordinary message; reserve room for status markers and split safely around Unicode/code fences. [Discord message API](https://docs.discord.com/developers/resources/message). Candidate maximum is four output messages per turn, then a clear truncated result; never create an unbounded follow-up stream.

Do not emit partial tool arguments, secret-bearing errors or hidden reasoning. Suppress unrequested mentions on every send/edit. Keep partial output explicitly incomplete after cancellation/timeout/refusal and never store it as a completed authoritative assistant turn. Streaming exposes text before full-response review; sensitive/read tools can require buffered/private presentation policy. Stop sending when the source/output channel becomes inaccessible. A provider succeeding after Discord delivery failure is a presentation incident with its own receipt, not a reason to buy another completion.

## Verification and rollout gates

All cases below are required future acceptance; existing foundation tests do not execute them:

| Boundary | Deterministic case and expected result |
|---|---|
| Trigger | Opted-in channel invokes once; another channel, bot/webhook, duplicate event and disabled module do not |
| Isolation | Same user across guilds/channels and two users in one channel never cross-load history; DM scope separate |
| Ordering | Two queued same-scope turns serialize; a second process cannot claim the same sequence/lease |
| Reset/delete | Late old-generation writes/tools/replies fenced; summaries do not revive deleted content |
| Context budget | Oversized input/tool result rejected or bounded; security instructions retained; summary failures use bounded fallback |
| Identity/personality injection | Crafted display name/persona cannot change actor, tools, endpoint or policy |
| Tool schema | Unknown/extra/partial/malformed arguments denied before service invocation |
| Tool authorization | Revoked role, changed voice channel, disabled module or cross-user balance request fails at execution |
| Tool replay | Repeated/new provider call IDs for same intent return one domain receipt; presentation retry has no second effect |
| Provider conformance | Text/tool/refusal/usage/terminal events and malformed stream handling tested for each installed adapter/model family |
| Failure/fallback | Rate limit bounded; refusal never rerouted to evade safety; unapproved data destination and unknown paid outcome stop fallback |
| Streaming | Split Unicode/fences, mention suppression, throttled edit coalescing, channel deletion and cancellation are bounded |
| Budget | Concurrent admission cannot exceed configured reservations; unknown usage is not free and capture/release is once |
| Retention | Expired messages/summaries cleaned; reset/deletion preserves only minimal operational receipts and obeys documented backup/provider limits |
| Live smoke | Explicit controlled prompt/tool sequence against actual account/model; operation/date/usage/privacy settings recorded separately from mocks |

Roll out one installed provider and read-only tools behind guild opt-in first, then separately verified music/economy integrations. This is an implementation sequencing proposal, not permission to cross the active workboard scope. Operator diagnostics should show configured versus verified capability, queue/lease age, budget usage/reservations, failures and last redacted probe without exposing conversation contents. Actual model, pricing, retention and account access remain verification tasks before activation.
