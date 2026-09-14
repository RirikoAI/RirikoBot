# Ririko AI 2.0.0 architecture

## Status and evidence
This is a design and implementation contract, not a claim of release readiness. The starting workspace contained a console greeting and draft documentation. The source audit uses Ririko 1.4.0 at commit `0d8be25b17e25dfa61812d6e7b5aaf8497687257`, checked out read-only under `.audit/RirikoBot`. `.local/` remains immutable. See [the feature inventory](legacy-feature-inventory.md), [migration plan](migration-1.x-to-2.0.md), and [roadmap](implementation-roadmap.md) for evidence and remaining work.

## Structure and dependencies
Use one modular bot process and, when implemented, one dashboard process. No independent API service, mandatory Redis, message broker, or DI framework is needed for the initial deployment.

```text
apps/bot           Discord gateway, interaction conversion, lifecycle, health HTTP
apps/cli           Operator commands and developer generators
apps/web           Planned Next.js dashboard and server-side OAuth/API handlers
packages/core      Framework-free contracts, settings validation, permissions, config, logs
packages/database  Drizzle schemas, explicit migrations, repository implementations
packages/discord   Command registry/dispatch and Discord presentation/transport
packages/ai        Planned conversation orchestration and provider/tool adapters
packages/music     Planned source resolvers and replaceable playback engine
packages/services  Planned domain modules, separated by directory until size warrants packages
packages/graphics  Planned card/meme rendering and validated asset processing
docs               Evidence, development guides, ADRs, acceptance checklist
```

Only create a workspace when it contains working code. Applications compose dependencies explicitly. Core has no Discord, database-driver, or web-framework dependency. Database depends on core contracts. Domain services consume repositories through typed contracts; external providers implement capability-aware adapters. CLI, bot, and dashboard reuse the same settings service and schemas. Do not place transactions or provider-specific code in command handlers.

## Command and authorization flow
Both `/command` and the configured prefix invoke one handler with normalized, validated arguments and an actor context. The registry owns names, aliases, options, categories, descriptions, examples, permissions, cooldowns, and module membership. Help and synchronization derive from that metadata. Preserve legacy spellings and option names; document intentional permission corrections.

Before execution check guild context, module/channel enablement, command policy, owner restriction, member/bot permissions, configured roles, and bounded cooldown/rate-limit state. Administrative target operations additionally require actor and bot hierarchy checks at the application boundary. A model never supplies trusted actor identity or overrides permissions. Disabled commands remain inaccessible via aliases, components, or AI tools.

Discord adapters acknowledge interactions promptly, await execution, suppress unrequested mentions, and return safe errors with correlation IDs. Each event handler has an error boundary. Commands must not log message bodies or provider secrets. Help component state is bound to its requesting user; permissions are checked again on interaction.

## Configuration
Environment supplies process settings and secrets. System defaults feed validated guild settings, then channel restrictions. A user preference or invocation can only override explicitly delegated presentation/provider choices; it cannot relax guild security. Preserve unknown legacy key/value rows in migration staging rather than silently discarding them.

The foundation settings contract includes a guild ID, prefix, module flags, command policies, and revision. Updates use optimistic concurrency and an audit record in one transaction. Conflicting updates fail. The bot uses a bounded short-lived guild cache and invalidates its own writes; cross-process changes become visible within its documented lifetime. Database failures fail commands closed instead of resetting permissions to defaults.

## Database and migration
PostgreSQL is the production default; SQLite is a supported single-process mode. Drizzle has separate PostgreSQL and SQLite schemas/drivers: it does not make SQL or transaction semantics interchangeable. Maintain one repository contract and run the same behavior tests against both. Use parameterized queries, foreign keys, checked revisions, and explicit schema-version migrations; never enable production schema synchronization.

Only add tables needed by implemented services. Economy and card ownership need database transactions, unique idempotency keys, nonnegative integer amounts, and state constraints before command exposure. Never reconstruct balances from process memory. The legacy importer must use a consistent backup, preserve IDs/raw source rows, report anomalies, and verify counts/aggregates. It is distinct from the foundation schema migrator. Production cutover remains gated on representative data and a restore rehearsal.

## Providers and durable work
AI: provider-neutral requests/responses, user memory keyed by `(guildId, channelId, userId)`, separate personality and safety instructions, explicit bounded tools, execution-time permissions, a clock tool, and configured fallbacks. No arbitrary HTTP, SQL, filesystem, or shell tools.

Music: distinguish metadata resolution (including Spotify and Deezer) from playable sources. Evaluate Discord Player and Lavalink before enabling playback; required sources are YouTube, Spotify, Deezer, and SoundCloud. A metadata match is not evidence of playable/licensed audio. Reactive now-playing updates replace periodic message edits.

Images: capability-aware local ComfyUI and verified paid adapters; bounded queues, timeout, cancellation where supported, quotas, attribution, and provider-specific limits. Local hosting costs hardware/energy and model licenses still apply. No claim of unlimited hosted generation.

Streams: independent Twitch, TikTok, and Facebook capability assessments. Never present unofficial or unavailable endpoints as supported APIs. Persist delivery intent with a unique `(platform, streamId, guildId, targetId)` key and validated cached thumbnail. A database flag cannot guarantee exactly-once external delivery: crashes between Discord send and commit need reconciliation and a documented ambiguity policy.

Jobs: durable due times, leases, attempts, bounded backoff, and idempotent handlers for reminders, giveaways, images, announcements, and cleanup. Memory timers only wake workers; the database owns state. Separate state transition from external delivery and test crash windows. Add Redis only if measured needs justify it.

## Dashboard, security, and deployment
The planned Next.js dashboard uses Discord OAuth2, server-held tokens, opaque expiring sessions, secure HttpOnly cookies, CSRF/origin checks, and fresh authorization for each guild mutation. A supplied guild ID is never authorization. Only expose implemented modules, derive forms from shared schemas, mask credentials, and reuse configuration services.

Use Node 24 LTS, strict ESM TypeScript, pnpm, and pinned dependencies supported by [release evidence](dependency-evaluation.md). Rootless Docker with persistent database/media volumes is the baseline. Health separates process liveness from Discord/database readiness. CLI diagnostics do not print credentials or silently migrate data. Graceful shutdown closes the gateway, HTTP listener, workers and database connections.

## Validation and extension
Unit tests cover parsing, access decisions, settings, failure paths and deterministic rules. Integration tests cover persistence, optimistic conflicts, migrations, and both dialects. End-to-end tests cover actual CLI/transport flows now and browser OAuth/configuration when the dashboard exists. Live smoke tests and production migration evidence are tracked separately from offline tests.

Add a feature by defining its contract/schema, implementing its service with tests, binding command metadata/transport, documenting slash/prefix behavior, and adding any dashboard form with the same schema. Read the matching specialist instructions. Never mark parity or a phase complete from compilation or documentation alone.

