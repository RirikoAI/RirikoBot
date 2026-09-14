# ADR-012: Durable work and external delivery recovery

## Status

Proposed future subsystem. The foundation has no durable job table/worker, reminder engine or giveaway importer. This ADR defines required recovery semantics, not delivered uptime or timing guarantees.

## Problem

Legacy reminders already persist in the database and poll every 30 seconds; Twitch polls every minute, free games hourly, and giveaways use `giveaways.json` through discord-giveaways. The moderation cron is empty. Music uses a 10-second player-message refresh. Risks include missing claims, ambiguous sends, premature free-game notification marking and ephemeral interactive sessions; the audit does not prove a count of lost or corrupted events.

## Options considered

- Keep process-only timers and let each feature manage its own recovery.
- Require Redis/BullMQ or a PostgreSQL-only queue immediately.
- Start with database-backed work contracts and dialect-specific claiming, adding an external queue only when demonstrated operational needs justify it.

## Decision proposed

Persist due times, status, owner/target, payload version, operation key, attempts, retry deadline, lease owner/expiry and terminal error category as required by each job type. Memory timers only wake workers. Reconcile overdue/leased work on startup, use bounded concurrency/backoff and terminal failure/dead-letter handling, and stop accepting work during graceful shutdown.

Use **at-least-once processing**, with atomic claim/lease and idempotent database state transitions. Define SQLite and PostgreSQL claiming independently and test overlapping workers. Schedule recurring work using explicit timezone/DST rules and a recorded next occurrence rather than relying on process uptime. Do not promise sub-second delivery without measurements and deployment requirements.

Separate a committed state transition from an external Discord/provider effect. A crash after a successful send but before recording success creates an ambiguity window. Use available destination receipts/idempotency, persisted delivery intent and reconciliation; document the retry policy when the destination cannot prove prior delivery. A transaction around a local row cannot make an external send exactly once.

Player UI changes should follow player events/user actions and coalesce transport edits. General rate limiting remains necessary. Add a broker/queue adapter only with explicit deployment, recovery and dialect consequences.

## Consequences

Durable jobs require schema, retention, lease-clock and retry-budget design. Reprocessing is expected; duplicate external effects or missed effects must be reconciled according to destination capabilities. Neither database persistence nor a queue product guarantees zero loss, zero duplication or zero HTTP 429 responses. Giveaways require a separate import path for real flat-file state.

## Validation and evidence

Test crash windows before/after claim, state commit and external send; lease expiry; concurrent workers; poison jobs; clock/timezone changes; retries; restart and shutdown. Verify provider idempotency assumptions with integration tests. See [legacy scheduler inventory](../legacy-feature-inventory.md), [database](ADR-003-database-layer-and-dual-dialect-orm.md), [stream announcements](ADR-007-stream-platform-notification-architecture.md), and [migration scope](../migration-1.x-to-2.0.md).
