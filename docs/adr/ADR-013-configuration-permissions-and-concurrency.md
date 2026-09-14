# ADR-013: Shared settings, permissions and concurrent edits

## Status

Accepted and implemented for foundation guild settings, prefix/module service operations, access checks, revisioned persistence and bounded cache. Dashboard controls, a complete policy-editing interface and legacy settings import remain future work.

## Problem

Legacy settings are loosely typed key/value rows, and command permissions vary by handler/transport. A new bot, CLI and eventual dashboard can otherwise disagree on authorization or overwrite each other's settings. Re-reading the database on every Discord message also adds unnecessary work, while indefinite caches hide administrative changes.

## Options considered

- Keep independent transport-specific settings/authorization logic.
- Share types but let each transport write repositories directly.
- Share a validated settings service and trusted actor contract with revision-aware repositories and bounded caching.

## Decision

Use core `ActorContext`, `GuildSettings`, `CommandPolicy` and `GuildSettingsStore` contracts. A trusted transport supplies user/guild/channel IDs, member/bot permissions, roles and owner status. Request/model arguments never grant those facts. Guild mutation requires Manage Server (or Discord Administrator); bot ownership is not a bypass.

Resolve operator defaults and installed-module defaults into guild settings. Command/channel/role policy can narrow built-in access requirements; user preferences and invocation options cannot weaken them. Only installed modules are configurable. The essential core module cannot be disabled through the module service. Individual command policy still applies. A complete operator policy-recovery interface must accompany future command-policy editing; the current prefix/module CLI does not edit every policy field.

Cache at most **10,000** guild entries, with a **five-second default TTL**. Return copies, invalidate before/after local mutations and obtain a fresh revision before writing. Cross-process changes may remain visible through the previous value for the cache lifetime; this is documented bounded staleness, not immediate synchronization. Read failures fail closed rather than resetting permissions to permissive defaults.

Persist a settings change using the expected revision and an actor/before/after audit row in one database transaction. A stale update fails with a conflict; the caller must reload/review before retrying. Validate stored/returned scope and schema. Keep unknown legacy key/value data in migration staging until a deliberate mapping exists, rather than silently discarding it through a strict new settings schema.

## Consequences

Shared services reduce policy duplication but transports still authenticate identities and revalidate sensitive access. Short caches trade database work for bounded administrative delay. Optimistic concurrency needs conflict handling in CLI/dashboard UX and separate dialect implementations. Module discovery and help must describe installed working features only; schemas are not evidence that all configuration surfaces exist.

## Validation and evidence

Test permission/owner boundaries, command aliases and contexts, channel/role/module restrictions, cache invalidation/expiry, defensive copies, scope mismatch, concurrent revision conflicts and audit rollback on both dialects. A future dashboard must reuse this service and validate CSRF/current Discord access. See [implemented command behavior](../commands.md), [architecture](../architecture.md), [database decision](ADR-003-database-layer-and-dual-dialect-orm.md), and [dashboard plan](ADR-008-web-dashboard-architecture.md).
