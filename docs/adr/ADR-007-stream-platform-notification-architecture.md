# ADR-007: Stream capabilities and independent announcements

## Status and problem

Proposed future subsystem. Legacy Twitch behavior is audited; no new watcher or durable announcement engine is implemented or live-verified. Required platforms are Twitch, TikTok and Facebook (BP-18); YouTube is an optional addition, not a substitute. BP-19–20 require independent subscriptions, deduplication and cached thumbnails.

Legacy Twitch polls every minute, stores subscriptions/notifications and substitutes dimensions into a thumbnail URL. Its duplicate check compares stream ID across all notifications, so an earlier guild delivery can suppress another target. The audit does not establish that all restart persistence was absent or that thumbnails frequently failed. The intended repair is precise target identity and explicit external-delivery recovery.

## Alternatives

| Option | Benefit | Cost / decision |
|---|---|---|
| Extend one Twitch-centric service with platform conditionals | Small initial change | Authentication, session identity and failure semantics become coupled |
| Require identical APIs/webhooks everywhere | Simple universal interface | Invents equivalence where access/capabilities differ; rejected |
| Automatic scraping fallback | Can appear to broaden coverage | Unverified authorization/stability and anti-bot dependence; not selected |
| Independent capability adapters plus common announcement engine | Source-specific truth and reusable target delivery | Must model unsupported/unknown results and test each source; proposed |
| Send directly from webhook/poll loop | Few internal steps | Couples provider acknowledgement to Discord latency and loses durable intent |
| Durable per-target intent and separate delivery | Restart/race recovery and independent failures | Requires leases, retention and ambiguity policy; proposed |

## Proposed decision

Use provider-neutral creator/session observations with explicit `live`, `offline` and `unknown`. A failed lookup is not offline. Normalize stable provider creator/session IDs; names/titles are presentation. Access capability is independent from configured credentials and recent health. Unsupported subscription methods return unavailable rather than fake success. Detailed schemas/assessment reside in [adapters](../adapters.md).

Twitch EventSub is preferred where authorized. Choose webhook or WebSocket according to deployment and authentication constraints. Webhook requires authenticated raw-body verification, replay protection and fast verified-event persistence; expensive thumbnail/delivery processing follows asynchronously. WebSocket requires session/keepalive/reconnect/revocation handling. A disconnect does not imply complete historical event replay. Official contracts: [webhook](https://dev.twitch.tv/docs/eventsub/handling-webhook-events/), [WebSocket](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/).

TikTok's reviewed developer catalog does not establish general-purpose arbitrary-creator LIVE access. Facebook Live Video documentation retrieval failed during this review, so scopes/eligibility/watcher support remain unverified. Neither becomes “supported” through an interface. Optional YouTube needs a specific authorized live/discovery route and project quota budget; video notification/RSS alone is not proof a current live session exists. These evidence limits are explicit in the main provider assessment.

## Identity and subscription ownership

There are three levels of deduplication:

1. Provider ingestion: event/message identity prevents processing the same delivery twice.
2. Domain observation: stable provider stream/session identity combines polling and event observations.
3. Application delivery: `(platform,streamId,discordGuildId,targetId)` creates independent announcement intent per target.

Alice in guild A and Bob in guild B each get an announcement. Two subscribers requesting the same guild/channel need a defined membership/ownership model around one target subscription rather than duplicate sends. Persist subscriber user/audit attribution, creator, platform, guild, target, state and configuration revision. Shared provider subscriptions are reference-managed so removing one target does not unsubscribe other guilds.

Late events and reconnect reconciliation update observed state monotonically according to provider identity/time semantics; title changes do not create a new live session. When a provider lacks a stable session ID, its adapter must define a reviewed session-identity strategy before deduplication is claimed. An unknown lookup does not close a known live event.

## Delivery and thumbnail policy

Commit each eligible target intent before sending. A worker rechecks current channel/guild/mention policy, claims a fenced attempt, obtains a permitted thumbnail and sends outside the DB transaction. Record message ID/result afterward. A crash after accepted send but before receipt is ambiguous; provider-event uniqueness cannot make Discord exactly-once. Reconcile by known identity where possible and expose unknown cases rather than treating them as certainly unsent.

Templates use allowlisted fields and bounded text. Provider titles cannot inject template code or unauthorized mentions. Role pings are explicit configured allowed roles; default mentions are suppressed. Missing/deleted/inaccessible channels pause only the affected subscription. Disabling a subscription stops future delivery according to a defined cutoff and does not silently delete unrelated history.

Cache thumbnails using the [safe asset pipeline](../adapters.md): bounded network/decode, content hash, stored provenance and controlled attachment output. A missing thumbnail normally permits a text/link fallback. Later image retry must not resend the announcement. Storage/CDN retention and source removal still apply; “thumbnails never expire” is not a guarantee. Domain receipt and cached bytes have different lifetimes.

## Acceptance and operational consequences

| Scenario | Required outcome |
|---|---|
| Same stream follows in two guilds | Independent intents and outcomes |
| Duplicate webhook plus poll observation | One session, no duplicate target delivery |
| Forged/replayed event | No accepted domain effect |
| Revoked subscription/token | Affected capability unavailable; bounded refresh/reconnect, no storm |
| Partial provider outage | Unknown observation; other creators/providers continue |
| Send succeeds then worker crashes | Durable ambiguity/reconciliation, not blind successful or unsent state |
| Concurrent target workers | One current lease; stale completion rejected |
| Deleted channel/role | Safe target failure without cross-guild impact |
| Title/thumbnail hostile input | Mention/network/decode restrictions hold |
| Restart with missed periods | Bounded catch-up/reconciliation, no channel flood |

Record authorized live tests for each enabled platform, including credentials/scopes, event lifecycle, quotas and actual thumbnails. Fake transport tests establish logic, not account access. Poll batching/rate budgets depend on current provider limits and distinct creator count, not number of guild subscribers. Avoid promises of zero duplicates, zero lost delivery or permanent cache availability.

Revisit the transport when deployment cannot receive webhooks or measured event coverage/quota favors another documented option. Add a platform only after capability/access evidence; a unavailable required platform remains an explicit release gap. Revisit ambiguity policy with real destination receipt support, never by weakening target uniqueness. See [job ADR](ADR-012-job-scheduler-and-task-queue.md), [database](../database.md) and [legacy evidence](../legacy-feature-inventory.md).
