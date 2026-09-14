# ADR-002: Discord transport, command routing and interaction lifecycle

## Status and decision scope

**Accepted and implemented for the foundation:** Discord.js at the bot boundary, framework-neutral metadata/registry/dispatcher, shared access checks, and ping/prefix/help. **Proposed extension contracts:** nested subcommands, autocomplete, general components, durable feature operations and distributed rate limits. Acceptance of this architecture does not mean those capabilities exist.

Requirements: [blueprint](../../BLUEPRINT.md) sections 7–9, 63, 73 and 82–83. Detailed current/proposed APIs are in [commands](../commands.md); lifecycle and ownership are in [modules](../modules.md). This ADR explains why those boundaries exist and what would justify changing them.

## Context and observed failure modes

The immutable [legacy inventory](../legacy-feature-inventory.md) records 141 command files and 68 reactions at source commit `0d8be25b17e25dfa61812d6e7b5aaf8497687257`. Array/regex dispatch performs work across registered commands. More consequentially, prefix requests mutate shared command fields and asynchronous wrappers do not consistently await handlers. Concurrent callers can therefore interfere even if lookup is fast. Playlist and secret-setup commands lack prefix handlers; 11 meme prefix handlers are broken. A declared method or a matching regular expression cannot establish parity.

Help, slash registration, aliases, CLI discovery and the future dashboard need one metadata source. Policy must apply to every entry point, including components and AI-requested actions. Rich interactions also have transport-specific acknowledgment, visibility and target-resolution rules. Domain services should not depend on Discord objects to execute a transaction or be tested through a mock gateway for every operation.

## Alternatives assessed

| Alternative | Benefit | Cost and rejection/adoption rationale |
|---|---|---|
| Repair the legacy command hierarchy in place | Small initial changes; retains existing entry points | Shared mutable request fields, duplicated handlers and help metadata remain recurring risks; regex scanning is not the only problem |
| Adopt a full third-party command framework | Established decorators/plugins and convenience lifecycle | Requires evidence for exact legacy alias/nesting support, strict policy reuse, maintenance and clean service boundaries; no selected framework has demonstrated a net benefit here |
| Put all routing in Discord.js handlers | Direct access to resolved objects and builders | Prefix/slash/help behavior can drift; unit tests become tied to gateway shape and business services leak transport details |
| Framework-neutral registry/dispatcher plus Discord.js adapter | Shared semantics, bounded lookup, isolated tests and explicit composition | We own parser/compiler/lifecycle glue and must test it rigorously; **selected** |
| Separate HTTP interaction service now | Independent ingress and HTTP deployment options | Adds deployment/coordination overhead while voice, messages and other events still need a gateway; reconsider only with demonstrated requirements |

These are architecture tradeoffs, not a benchmark or an assertion that other frameworks are inherently unsafe. Discord.js version selection and support evidence belong in [dependency evaluation](../dependency-evaluation.md), not an unpinned `latest` recommendation in this ADR.

## Decision and invariants

### One normalized operation

Keep Discord.js imports, fresh actor/target resolution, acknowledgment and rendering in `apps/bot`. Put metadata, argument normalization, shared access decisions, canonical routing and result types in `packages/discord`. Keep configuration/identity contracts in `packages/core`; state mutations belong to owning application services/repositories.

Both slash and prefix normalize into a fresh invocation. Context menus route by type/name. A canonical command and its aliases share policy, handler and cooldown. Metadata snapshots are cloned/frozen during atomic registration. Actor arrays and normalized arguments are frozen per request; settings are cloned. Never store request parameters on a reusable command object or start an unawaited domain handler.

Map lookup replaces registry-size-dependent name scans. Prefix matching tries a two-word alias then a one-word route; tokenization remains proportional to input length and help filtering remains proportional to the registered catalog. Database/network time dominates many requests. **No sub-millisecond dispatch or end-to-end latency claim is accepted without measurement.**

### Authority survives every entry point

Runtime checks cover guild/settings scope, owner restriction, member and bot permissions, installed/enabled module policy, command policy, allowed roles and channel denial before handler execution. Ownership never bypasses guild requirements. Syntax-valid mention IDs are still untrusted targets. Future role/moderation/trade services revalidate target hierarchy/ownership and current policy at the irreversible boundary.

Help uses the same policy and hides internal entries. A component must bind to the intended actor/resource scope and reload state; stale UI cannot confer rights. Discord command-picker restrictions remain an additional transport control, not the application's only authorization mechanism. AI tools call authorized application services and never forge actor context or invoke arbitrary command text as an elevated user.

### Transport owns acknowledgment and presentation

The bot defers interactions before slow actor/service calls and selects public/private delivery from metadata before acknowledgment. Prefix messages cannot be ephemeral. An error after a public defer stays safely public; error content therefore must never depend on assumed privacy. Every event has a catch boundary and sanitized correlation metadata. Automatic mentions are suppressed unless an explicitly allowed notification operation opts in.

Discord's acknowledgment deadline and token lifetime constrain the adapter; long work needs a durable operation receipt instead of an indefinitely usable interaction token. [Discord interaction lifecycle](https://docs.discord.com/developers/interactions/receiving-and-responding). A successful transaction and successful Discord response are separate facts: retrying a failed reply must not rerun a debit, redraw winners or duplicate a provider request.

### Extend the actual contract before advertising features

Today's metadata supports flat primitive options only. The nested compiler must preserve source-backed names/options, reject ambiguous alias/path collisions, and enforce Discord's command/group/subcommand shape. For example, `tcg-admin config energy` is the route and `max-cap` is an option; another route layer is invalid. [Discord application command structure](https://docs.discord.com/developers/interactions/application-commands).

Autocomplete is authorized read-only search, with bounded results/work and execution-time revalidation; it is not an admission or payment step. Durable components use stored domain revision/idempotency, unlike disposable in-memory help sessions. These features require explicit typed contracts and tests before registration. Do not cast unsupported nested options into the current primitive interface.

### Separate enabled policy from registration and availability

Per-guild disablement blocks dispatch/help admission. It does not repeatedly unregister global commands or erase module state. Actual registration is an explicit operator operation derived from the same metadata and verified against the intended application/guild. Future modules expose installed/enabled/configured/available distinctions and retain narrowly scoped cleanup/settlement during disablement. A missing provider is an availability failure, not permission to bypass the provider allowlist.

## Consequences and costs

The selected design makes parser/access behavior independently testable and avoids duplicating service logic. Exact aliases and option identifiers remain a migration obligation, including formerly broken prefix paths. We must maintain the option-tree compiler and inspect registration drift as the catalog grows; source command counts cannot be treated as available Discord registration capacity.

The current cooldown map is bounded and claims synchronously before the handler, but resets at restart and is not shared across processes. It prevents local burst bypass, not economic double spending or a distributed provider budget overrun. The current help session map is requester-bound and bounded, but expires/restarts; high-value interactions need durable state. Current shutdown waits for tracked handlers but has no general per-feature cancellation deadline; future workers must define that behavior.

Framework independence is intentionally limited: it removes Discord objects from business logic, not every Discord-specific concept from the command contract. Guild permissions, interaction privacy and canonical slash names are meaningful product concepts. Avoid a universal transport abstraction that obscures them merely to claim portability.

## Validation and operational evidence

| Invariant | Existing source/test evidence | Additional acceptance before broader release |
|---|---|---|
| Immutable request isolation and awaited failures | [dispatcher tests](../../packages/discord/src/dispatcher.test.ts), [contracts](../../packages/discord/src/contracts.ts) | Same fixtures for every feature; no shared mutable request storage |
| Atomic collision rejection and canonical aliases | [registry](../../packages/discord/src/registry.ts) and dispatcher tests | Nested tree/legacy fixture and registration-budget validation |
| Consistent policy/help filtering | [access](../../packages/discord/src/access.ts), dispatcher tests | Fresh target hierarchy, denied AI/tool and general component paths |
| Private configuration acknowledgment before lookup | [gateway tests](../../apps/bot/src/gateway.test.ts) | Authenticated development-guild checks for slash/context/prefix and intent availability |
| Bounded cooldown/help memory | Dispatcher capacity tests and gateway bounded-map implementation | Help-capacity/expiry tests and load/heap evidence before setting an SLO; shared quota storage before multiple writers |
| Safe external effects | Foundation only returns ping/help/settings results | Crash-injection tests for domain commit/send/receipt windows and replay |

The documentation revision does not execute live Discord registration. [Testing](../testing.md) is the record of actual test runs; a mock interaction cannot prove production scopes, intents, provider support or gateway delivery. Log command identity/transport/outcome/correlation, not user content or credentials. Metrics should separate lookup, policy/storage, handler and response-delivery time before optimization.

## Revisit conditions and migration procedure

Reconsider the framework/adapter choice when a prototype demonstrates required lifecycle or legacy compatibility that is materially simpler with another framework, when upstream support becomes unsuitable, or when measured operating needs justify independent HTTP ingress. Reconsider process-local limits before deploying multiple command writers or admitting paid/wagered operations; their correctness cannot depend on this cooldown.

A replacement must pass the same canonical invocation, alias, permission, concurrency, help and failure fixtures. Compare desired command registration manifests, preserve command identifiers/options, and deploy first to an explicitly configured development guild. Retain a rollback build and compatible persisted state; do not delete the old registrations until the reviewed migration specifies how clients and prefix users retain access. Keep the application service contracts so reverting an adapter does not require rewriting domain transactions.
