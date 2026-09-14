# ADR-012: Durable work and external delivery recovery

## Status and context

Proposed future subsystem. No durable queue, worker, reminder engine or giveaway importer exists in the foundation. This decision responds to BP-16–21 and BP-49–51; it defines recovery semantics, not delivered uptime or sub-second timing.

Legacy reminders already persist and poll every 30 seconds. Twitch polls every minute; free games hourly; giveaways use `giveaways.json` through discord-giveaways. Moderation's cron is empty. Music refreshes a player message every ten seconds. These facts identify claim/delivery/lifecycle risks but do not measure lost/corrupted events. Do not rewrite history as if every legacy timer were memory-only.

## Alternatives and selection

| Option | Benefit | Cost / decision |
|---|---|---|
| Per-feature timers and recovery | Easy initial feature implementation | Duplicated claim/retry/timezone behavior; process uptime becomes implicit state |
| Precision in-memory timer queue | Efficient local wakeups | Does not survive restart or establish durable acceptance |
| Require Redis/BullMQ immediately | Established queue tooling and operating features | New service/backup/availability boundary; DB effects still need idempotency |
| PostgreSQL-only queue | Native transaction integration and concurrency options | Excludes supported SQLite mode unless separately designed |
| DB-backed contracts with dialect-specific claims | Minimal initial infrastructure, shared durable semantics | Requires careful lease/retry/retention implementation; proposed |

Use the database as authoritative scheduling/attempt state. Timers only wake bounded scans. Start with a small coordinator and explicitly registered job handlers; no enterprise event bus or one generic handler executing arbitrary payload code. An external queue can be added later behind the same acceptance/receipt contract when measured operation needs justify it.

## Proposed durable boundary

The [database catalog](../database.md) defines jobs, attempts, operation receipts, outbox events, consumer receipts and delivery attempts. [Adapters](../adapters.md) owns the common request/result taxonomy and transition table. These records are proposals, not installed tables.

A producer commits its domain change, durable work and resource reservation together where applicable. It says accepted only after commit. Each job has kind/payload version, owner/scope, operation identity, due/next-attempt time, status, attempt budget, lease owner/token/expiry and safe terminal reason. Request identity must survive worker retries; a different payload with the same key conflicts.

A worker claims a bounded batch atomically and commits before invoking any provider. It renews and completes using a fencing token, so an expired worker cannot overwrite a later attempt. Fencing only controls DB state; it cannot revoke an already in-flight remote side effect. Result reconciliation and destination idempotency are separate obligations.

SQLite claim is a short immediate transaction; PostgreSQL may use a reviewed row-locking or conditional-update strategy. Neither query nor lock syntax is assumed portable. Contention tests must use actual supported drivers. No scanner should load every due job into memory, and a handler must not hold a transaction while waiting for network/GPU work.

## Scheduling semantics

| Work class | Proposed schedule/recovery rule |
|---|---|
| One-shot reminder | Persist UTC due instant and destination policy; restart discovers overdue accepted work |
| Recurring local-time job | Store timezone, recurrence rule/version and next occurrence; explicitly resolve nonexistent/ambiguous DST times |
| Stream/free-game polling | Share creator/provider work; jitter within allowed freshness/rate budget; unknown fetch does not become empty/offline |
| Giveaway end | One conditional terminal transition and recorded draw; reroll is a separate audited operation |
| Retention/cleanup | Bounded cursor batches; resumable and reference-aware; no deletion of live holds/receipts |
| Reactive player display | Coalesce edits from state/events/user actions; durable recovery only if the view warrants it |

Recurring identity includes schedule ID and logical occurrence, not “whatever time this process woke.” Persist next occurrence with completion/advancement according to job semantics. Select and document whether downtime runs every occurrence, only latest, or skips expired ones. Bound catch-up to prevent hundreds of reminders/announcements flooding a channel. The blueprint does not mandate a universal catch-up choice or sub-second SLA.

Lease duration and heartbeat interval must reflect handler duration and deployment clock behavior. Prefer a single authoritative time basis for lease comparison; record clock assumptions and test jumps. A process-local monotonic clock helps elapsed timeouts but cannot by itself coordinate different hosts. Retrying cannot reset maximum job age, attempt count, quota or spending ceilings.

## Retry, cancellation and poison jobs

Classify known pre-submission failures separately from possible remote completion. Use bounded jittered backoff and provider reset guidance, persisting next-attempt time. Authentication/configuration failures pause the affected capability; they should not consume endless rapid attempts. Unknown paid generation or Discord delivery enters reconciliation rather than blind replay.

Cancellation first persists an authorized request. Unclaimed work can release unused reservation safely. Running work stops locally or asks provider cancellation only if supported and isolated to that job. Record confirmed cancellation separately from cancellation requested. A provider may already have completed/charged; a local abort is not proof otherwise.

Malformed/unsupported payload versions and repeatedly failing jobs enter terminal failure/quarantine with safe diagnostics and original identity. Operator retry/requeue is an audited decision preserving attempt history, original request and any new budget authorization. Do not delete poison jobs or invent a new operation ID to bypass duplicate/budget protection.

## Crash windows and reconciliation

| Crash point | Recovery obligation |
|---|---|
| Before producer commit | No durable acceptance; caller can retry under its request identity |
| After producer commit, before claim | Restart discovers job and existing reservation |
| After claim, before remote request | Lease expiry permits a new attempt after ownership checks |
| After remote acceptance, before receipt persists | Unknown submission; reconcile through provider identity where available |
| After asset write, before DB reference | Recover staged object or clean unreferenced payload |
| After Discord send, before result commit | Possible duplicate/lost acknowledgement; do not assert unsent |
| After completion commit, before reply | Return stored result; no repeat effect |
| Restore older DB | Reconcile external-effect window before enabling workers |

A destination may support an idempotency key or known message/prediction receipt; verify its exact behavior rather than assuming one generic mechanism. When verification is impossible, preserve explicit uncertainty and a documented retry/manual-resolution policy. At-least-once internal processing does not imply exactly-once messages, charges or rewards; reward correctness additionally depends on the domain transaction.

## Lifecycle, observability and acceptance

On startup, validate schema and handler versions, then discover scheduled/expired-lease work in bounded batches. During shutdown, stop admission/claiming, mark readiness appropriately, request cancellation/drain within a declared deadline and leave durable jobs recoverable. Do not mark jobs successful merely to empty the queue. The current bot shutdown has no global deadline; this worker lifecycle still needs implementation.

Observe queue depth/oldest eligible age, active leases, retries, unknown outcomes and terminal failures by bounded kind/provider labels. Correlation IDs connect logs/receipts but are not metric labels. Avoid prompts, tokens and raw provider errors in dashboards. Health distinguishes worker availability, job backlog and provider degradation; one failing provider should not hide unrelated progress.

Acceptance requires both-dialect overlapping claims, stale fencing, lease expiry, crash windows, poison payload, clock/DST/catch-up, cancellation isolation, bounded fairness, restart and shutdown. Run deterministic clock/transport tests plus real storage and optional authorized destination checks. Persistence alone cannot prove zero loss/duplication or no HTTP 429s.

Revisit external queue/process topology when measured backlog, contention, isolation or operating requirements exceed the initial design. Evaluate migration of outstanding identities/leases, broker outage behavior, recovery and retention before adding infrastructure. Preserve domain receipt/idempotency semantics across the change. See [stream ADR](ADR-007-stream-platform-notification-architecture.md), [image ADR](ADR-006-image-generation-and-canvas-synthesis.md), [migration scope](../migration-1.x-to-2.0.md) and [testing](../testing.md).
