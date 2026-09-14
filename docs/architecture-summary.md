# First deliverable: architecture summary

1. **Preserve:** all inventoried user-facing features, exact command names/aliases/options, profile/meme assets and source attribution. The audit records 141 commands and 68 reactions; declared handlers are not proof of working behavior.
2. **Rewrite:** mutable command dispatch, settings/permission checks, unreliable background jobs, AI memory/tools, moderation, reward protection and notification delivery. Repair broken prefix handlers explicitly.
3. **Replace:** Nest/TypeORM coupling with explicit TypeScript composition and Drizzle repositories; flat-file giveaway persistence and fragile provider coupling with durable services/adapters. Music/image engine choices require real validation.
4. **Migrate:** all 17 source tables plus giveaway JSON, preserving Discord IDs, global balances/XP, notes, subscriptions, playlist records, role mappings and unknown/duplicate settings. Retain raw data and verify reconciliation; no legacy importer is claimed implemented.
5. **Deprecate with compatibility:** plaintext API-secret persistence. Retain owner setup entry points in the compatibility plan, route storage to environment/vault, and never print or silently discard credentials. No user-facing feature is silently removed.
6. **Structure:** bot/CLI and planned web apps; core/database/discord packages implemented; AI/music/domain/graphics packages added when they contain working code. Domains stay independent of Discord transport.
7. **Database:** production PostgreSQL, single-process SQLite, separate Drizzle schemas/drivers behind the same repository contracts, checked revisions and atomic audit. Explicit checksummed migrations; refuse legacy schemas in the foundation runner.
8. **Providers:** capability-aware adapters, bounded requests/retries/quotas and configured fallback/disabled states. Distinguish music metadata from audio; validate TikTok/Facebook API access independently; AI authority comes from application services.
9. **Deployment:** Node24, pinned pnpm, non-root multi-stage Docker, optional PostgreSQL Compose, writable data volume, separate liveness/readiness and graceful shutdown. No mandatory Redis/API microservice; Docker execution remains unverified locally.
10. **Phases:** audit → foundation → compatibility → rewritten systems → economy/XP/profile/games → TCG → dashboard → migration/release. Source audit and an executable foundation are delivered; the full release remains pending in the [roadmap](implementation-roadmap.md).

See [architecture](architecture.md), [source inventory](legacy-feature-inventory.md), [migration plan](migration-1.x-to-2.0.md), [dependencies](dependency-evaluation.md), [ADRs](adr/ADR-001-runtime-and-monorepo-toolchain.md), and [validation evidence](testing.md).
