# Architecture decision map — Ririko AI 2.0.0

The delivered foundation runs a bot and CLI over shared core/database/command packages. Only `ping`, `prefix`/`setprefix` and `help` are registered working commands. Music, AI, moderation, economy, TCG, dashboard and legacy import remain future implementation. The [requirement ledger](requirements.md) distinguishes design evidence from working feature evidence; this summary must not become a release-completion checklist.

## Decisions and their consequences

| Decision | Why it fits this project | Consequence and limit | Detailed contract |
|---|---|---|---|
| Preserve the audited interface and data, repair broken internals | Users depend on command spellings, aliases, options, assets and existing identity | 141 declared commands/68 reactions are an audit count, not runtime parity; eleven broken meme prefix paths need explicit repair | [Inventory](legacy-feature-inventory.md), [migration](migration-1.x-to-2.0.md) |
| One modular bot; CLI; later a web process | Shared services avoid duplicated policy and unnecessary network deployment | No API microservice, broker or Redis dependency is currently needed; future isolation must have measured or functional justification | [Architecture](architecture.md) |
| Node 24, ESM, pinned pnpm and strict TypeScript | Explicit package boundaries and predictable source/build behavior | Native drivers need OS/container validation; strict typing does not validate untrusted runtime input | [ADR-001](adr/ADR-001-runtime-and-monorepo-toolchain.md), [versions](dependency-evaluation.md) |
| Frameworks at application edges | Domain tests should not start Discord or a browser | `packages/discord` currently contains framework-neutral command logic; Discord.js presentation belongs to `apps/bot` | [Commands](commands.md), [modules](modules.md) |
| Shared settings service with restrictive command policy | Slash, prefix and operator paths should not drift | Local CLI is a trusted deployment operator, not fresh Discord-member authorization; planned web must authenticate separately | [ADR-013](adr/ADR-013-configuration-permissions-and-concurrency.md) |
| Revision-qualified writes plus atomic settings audit | Prevent concurrent writers overwriting each other silently | Five-second default cache permits stale reads; future stale browser forms also need caller-revision checking, which the current service lacks | [Database](database.md), [ADR-013](adr/ADR-013-configuration-permissions-and-concurrency.md) |
| PostgreSQL for production; SQLite for small single-process use | Keep self-hosting practical without pretending dialects are interchangeable | SQLite is the actual default and does not enable WAL in code; both dialects need the same behavioral tests | [ADR-003](adr/ADR-003-database-layer-and-dual-dialect-orm.md) |
| Durable domain state; replaceable presentation state | Restart must not invent rewards, lose ownership or repeat accepted work blindly | Help sessions/cooldowns are intentionally in memory; future jobs need persisted intent, leases, fencing and delivery reconciliation | [Architecture](architecture.md), [adapters](adapters.md) |
| Capability-aware provider adapters | Required sources and provider failures differ materially | Music metadata is not playable audio; Twitch/TikTok/Facebook each need an access assessment; fallback cannot silently change spending authority | [Music](music.md), [AI](ai.md), [adapters](adapters.md) |
| Application-mediated AI actions and server-held credentials | Generated text and browser input cannot grant authority | No implemented AI tool/vault/dashboard is claimed; secrets must never enter ordinary guild settings or client bundles | [AI](ai.md), [dashboard](dashboard.md) |

## Follow one operation through the system

For `/prefix newprefix:?`, the gateway defers the interaction, fetches actor/bot/channel permissions, then calls the shared dispatcher. The dispatcher applies canonical command policy and validates arguments. `SettingsService` checks guild-manager authority, reads the latest revision and calls a dialect repository. The repository commits the setting and audit together. The gateway then renders confirmation. A lost Discord reply after commit does not imply the settings transaction failed.

For a **future** reminder, the analogous service must commit scheduling intent before saying it was accepted; a worker later performs delivery. It must distinguish durable acceptance from external confirmation, and permission at enqueue from permission at execution. These concrete traces and crash windows are specified in [architecture](architecture.md).

## What is preserved, replaced and still gated

Preserve all 17 audited source tables plus giveaway JSON, IDs, global balances/XP, notes, subscriptions, playlists, role mappings, unknown/duplicate settings, assets and attribution. Replace Nest/TypeORM coupling with explicit composition and Drizzle repositories; replace flat-file jobs and unsafe secret storage with durable services and a compatible credential setup path. Do not silently discard old data or remove user-facing features. The foundation schema migrator refuses an unrecognized legacy database; it does not import one.

Current health routes are `/health/live` and `/health/ready`. Startup requires explicit completed migrations. Shutdown closes resources and waits for tracked handlers, but has no global deadline. Provider health, distributed quotas and restart-safe domain workers are not present. Container configuration and offline tests are distinct from live production evidence; use [deployment](deployment.md) and [testing](testing.md) for the actual gates.

Implementation order remains foundation → compatibility → rewritten systems → economy/XP/profile/games → TCG → dashboard → migration/release, with estimated tickets and only one active ticket. The [roadmap](implementation-roadmap.md) supplies acceptance/dependencies rather than invented delivery dates. Every epic/story delivery ends at the user's PR checkpoint, including a long session.
