# ADR-007: Stream capabilities and independent announcements

## Status

Proposed future subsystem. Twitch behavior is audited; new Twitch/TikTok/Facebook integrations and announcement persistence are not implemented or live-verified.

## Problem

Legacy streams are Twitch-only: minute polling, OAuth client credentials, subscriptions and persisted notification records. It substitutes dimensions into thumbnail URLs. Deduplication compares only `streamId` across all stored notifications, so delivery to one target can suppress a later delivery to another guild/channel. The audit does not establish that thumbnails frequently failed or that all restart deduplication was absent.

## Options considered

- Retain Twitch polling and add platform-specific cases to one service.
- Require equivalent public APIs/webhooks from every platform.
- Define independent capability-aware adapters with durable per-target announcement intent.

## Decision proposed

Target **Twitch, TikTok and Facebook** as independent integrations. Twitch EventSub is the preferred candidate with reconnect recovery and any justified polling fallback. **General-purpose official TikTok/Facebook live watcher access was not verified** in the dependency research. Investigate eligible APIs, scopes and access before implementing those adapters; show unavailable capability instead of fabricating a public endpoint or successful health check. Additional providers such as YouTube are separate optional work.

Normalize creator identity, live-session identity, status and available thumbnail metadata without assuming every provider offers the same events. Persist each announcement intent using **platform + stream ID + Discord guild ID + announcement target**. Delivery to two guilds is two independent announcements. Validate configured mention roles and target-channel access.

Use durable attempts/leases, bounded retries and a delivery receipt/reconciliation policy. Where permitted, fetch/cache validated thumbnail content with bounded size/type/redirect/network checks and retain attribution. Use a fallback when fetching or Discord upload fails; caching does not make an asset permanent or universally redistributable.

## Consequences

Notifications have **at-least-once processing** and an external-delivery ambiguity window: Discord may accept a send before the process records success. Reconciliation and a documented retry policy reduce duplicate/lost announcements; a unique database row does not provide exactly-once external delivery. Platform access restrictions can leave adapters unavailable. Cache storage requires retention and cleanup.

## Validation and evidence

Test two guilds/targets following the same stream, repeated provider events, token expiry, reconnects, concurrent workers, send/commit crash windows and thumbnail failures. Prove actual platform access with authorized live checks before enabling configuration. See [provider capability gaps](../dependency-evaluation.md), [Twitch legacy findings](../legacy-feature-inventory.md), and [scheduler semantics](ADR-012-job-scheduler-and-task-queue.md).
