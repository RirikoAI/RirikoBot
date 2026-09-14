# Moderation actions, rules and recovery

Status: proposed implementation contract. The foundation supplies permission/hierarchy helpers but registers no moderation commands, cases or warning engine. Read [commands](commands.md), [database](database.md), [adapters](adapters.md) and [legacy inventory](legacy-feature-inventory.md). Numerical examples below are synthetic policy choices.

## Compatibility and authority

The six source commands are ban, kick, delete, lock, unlock and admin-note. Preserve manifest aliases and input intent. The old delete handler checks ManageChannels and includes the invocation in its amount; correct this to action-appropriate authority and explicit counting. Old lock/unlock uses nested promises and unconditional allow on restoration, losing prior overwrite state. The moderation service's empty scheduled method is not a warning engine.

| Proposed slash / prefix surface | Authority and outcome |
|---|---|
| `/ban user reason?` / `!ban @user [reason]` | BanMembers, actor/bot hierarchy; durable case |
| `/kick user reason?` / `!kick @user [reason]` | KickMembers, hierarchy; independently reported notification |
| `/delete amount` / `!delete amount` (del alias) | ManageMessages; exact selected/deleted/skipped/unknown counts |
| `/lock` / `!lock`; `/unlock` / `!unlock` | Overwrite mutation authority plus configured moderator gate; conflict-aware restoration |
| `/admin-note user note` / `!admin-note @user note` | Staff capability and restricted channel; no public sensitive echo |
| `/warn user reason severity?` / `!warn @user reason` | Configured warning capability; score and separate escalation outcome |
| `/timeout user duration` / `!timeout @user duration`; untimeout equivalents | ModerateMembers and hierarchy; captured absolute deadline |
| `/softban user` / `!softban @user`; `/unban user-id` / `!unban user-id` | BanMembers; softban is a recoverable two-step saga |
| `/purge amount filter?` / `!purge amount [filter]` | ManageMessages; bounded fixed target-ID selection |
| `/nick user nickname` / `!nick @user nickname` | ManageNicknames and hierarchy; restricted before/after history |
| `/history user` / `!history @user`; `/case id` / `!case id` | Guild-scoped staff reads and pagination |

These new routes are design targets, not registrations. Construct ActorContext from trusted ingress; never accept effective permissions, guild ownership or identity from a model/tool/form. Recheck guild/member/channel/bot authority immediately before submission. Application policy and Discord authority both apply; bot ownership is no guild bypass. Reject DMs, self/owner/equal-or-higher targets where applicable. A generic hierarchy helper is not sufficient proof for every action.

Prefix messages are public to their channel; an ephemeral flag cannot protect a staff note. Restrict sensitive prefix operations to configured staff channels and do not quote their payload in errors. Confirmation displays guild, target, duration, deletion range and consequences. DM notification failure never reverses a completed sanction.

Discord timeout deadlines may be at most 28 days ahead; owner/Administrator targets cannot be timed out. Ban history deletion is a separate 0–604800 second option. Reject invalid ranges rather than silently clamping. [Guild API](https://docs.discord.com/developers/resources/guild).

## Durable intent and uncertain outcomes

A proposed intent contains operationId, guildId, trusted actorId, action, target IDs, normalized arguments, bounded reason, policyVersion, ingress event ID, request digest and captured time. A reused ID with a changed digest conflicts. Separate these records:

| Record | Invariant |
|---|---|
| moderation_cases | Guild-scoped case number, intent, restricted reason and outcome |
| moderation_attempts | Submission boundary, lease/fence, redacted response category and correlation ID |
| moderation_evidence | Scoped reference, sensitivity, integrity metadata and retention deadline; separate payload |
| warning_events | Immutable grant/revoke/expire facts with escalation episode |
| moderation_outbox | Notification intent retried independently of sanction |
| channel_lock_snapshots | Original allow/deny/inherit bits and owned changes, channel and revision |

Allocate the case/idempotency receipt transactionally before HTTP. Never hold a database transaction across Discord calls. Claim an attempt with a bounded lease and fence; persist the result only while owning that claim. Completion and notification intent commit together. Fencing cannot retract a call already submitted by a stale worker.

| Failure boundary | Recovery |
|---|---|
| Intent transaction fails | No Discord call; retry same operation |
| Known pre-submission failure | Retry only eligible transient cause within budget |
| Timeout after submission | Mark unknown; reconcile before resubmission |
| Discord succeeds, database receipt fails | Inspect observable state and available audit evidence; state alone is not attribution |
| Receipt succeeds, notification fails | Retry notification only |
| Restart while submitted | Recover durable attempt, never infer new work from empty memory |
| Authority revoked while queued | Reject before submission and retain intent audit |

Domain outcomes distinguish pending, submitted, completed, rejected, unknown and partial. Unknown actions need a staff-visible reconciliation queue. An audit reason may include a nonsecret case reference but is not a Discord idempotency guarantee. No blanket retry middleware around punitive actions.

## Warnings and escalation

Guild configuration defines severity, expiry, thresholds, actions, exemptions and maximum escalation. Validate monotonic thresholds and supported duration/action ranges; save a versioned policy with each decision. Under one transaction: expire warnings against captured time, append the event, calculate score and reserve an escalation receipt unique to subject/policy/episode/crossed step.

The proposed policy executes only the highest newly crossed step when one event crosses several, while recording every crossing. This must be configurable and explicit; do not accidentally timeout, kick and ban from three independent comparisons. For a synthetic threshold of 3, concurrent +1 warnings from score 2 serialize to 3 then 4 with one reservation. A duplicate source event adds no score. Expiry lowering the score does not silently reset an episode: retrigger rules prevent repeated punishment as score oscillates. Revocation appends history; it does not erase it. Policy editing previews impact and does not retroactively punish existing members by default.

Escalations use the mediated action service and its authority/outcome handling. Capture an absolute timeout end in the original intent so retries cannot extend punishment. Failed escalation leaves the warning intact and visibly distinguishes reserved action from actual outcome.

## Action recovery contracts

**Softban:** persist ban and unban separately. Refuse a pre-existing ban so cleanup cannot remove another sanction. If unban fails after ban succeeds, report partial/still-banned and retain recovery work. Check for later independent staff bans before cleanup. Ambiguous attribution requires staff review. Resume only the eligible remaining step; do not repeat history deletion.

**Purge/delete:** select exact IDs before mutation using bounded pages, count, age and filter. A search cursor is not a stable deletion set. Discord bulk deletion accepts 2–100 unique IDs and rejects messages older than two weeks. Use single deletion for one eligible message; old messages require an explicit bounded slower policy or clear skip. [Message API](https://docs.discord.com/developers/resources/message).

Report requested, selected, deleted, already-absent, ineligible, failed and unknown counts. The proposed corrected amount counts target messages, with invocation handling separate and documented. Concurrent absence does not prove bot deletion. Retry only unresolved IDs under the same receipt and rate-limit budget.

**Lock/unlock:** snapshot allow/deny/inherit and overwrite existence; own only changed bits. Unlock compares current owned bits to this lock's applied state, restoring original bits only when unchanged. Surface conflicting staff edits instead of overwriting them. Serialize lock generations or refuse a second lock. Deleted channels become terminal with retained audit. Denying everyone SendMessages does not guarantee full lockdown when role/member overrides or thread/voice capabilities differ. Preview effective scope; never grant during unlock what was formerly inherited or denied. [Permissions](https://docs.discord.com/developers/topics/permissions), [channels](https://docs.discord.com/developers/resources/channel).

**Notes/nicknames:** staff-only reads, edit history, redaction and retention are separate requirements. Nickname rollback compares current value to this action's applied value to preserve a later legitimate change.

## Native AutoMod and custom rules

Use native enforcement where it fits. Track owned Discord rule IDs and fields; preview reconciliation differences and preserve staff-created rules/exemptions. AutoMod management requires ManageGuild, and timeout actions additionally require ModerateMembers. Validate current trigger/rule/exemption limits at activation rather than silently dropping configuration. [Auto Moderation API](https://docs.discord.com/developers/resources/auto-moderation).

A proposed ModerationRule evaluates normalized event and trusted scope, returning findings (rule/version, deterministic reason or confidence, bounded evidence reference, proposed action, expiry). It cannot directly ban/delete. The mediator aggregates findings and deduplicates native/custom reports by source event. Classifier confidence is not proof of intent.

| Rule family | Required control |
|---|---|
| Burst/repeated messages | Defined window, normalization, edits, user/channel scope, bounded counters and clock policy |
| Mentions/emoji | Parsed actual tokens and unique targets, not naive character counts |
| Invites/scam links | Normalized domains and exemption precedence; no arbitrary server-side URL fetch |
| Shorteners/attachments | Isolated optional scanner, redirect/DNS/SSRF, type/size limits and unavailable outcome |
| Raid signals | Multiple signals, staged restrictions, expiry and staff override; no mass permanent ban from one metric |
| Anti-nuke | Trusted administrative exceptions, delayed audit attribution, bounded containment and recovery |

Bound regex input/runtime, event memory and guild work. Distributed counters declare consistency. Missing message content is unavailable input, not a clean result. Scanner outages must not classify every message as abuse. Configure fail-open or temporary hold by risk, maximum hold and operator visibility. Roll out in shadow mode, review redacted disagreements/false positives, then use a limited cohort and reversible policy revision.

## Operations and acceptance

Observe unknown/partial actions, pending age, latency, evaluation budget, escalation reservations, permission rejections and notification backlog. Metric labels exclude message text, credentials and user IDs. Staff recovery is authenticated and guild-scoped. Module disable stops new admissions but retains committed reconciliation/audit/notification work. Evidence erasure leaves a tombstone; case references are never unrestricted content URLs.

Release acceptance includes: legacy argument/alias parity; private-prefix refusal; actor/bot hierarchy and revocation; duplicate/different-payload intent; concurrent case numbering; HTTP success/database failure; notification-only retry; concurrent warning thresholds and expiry; no policy-edit mass sanction; softban partial/later-ban recovery; purge 0/1/2/100/101 and exact age boundary; conflicting lock bits; scanner/missing-intent failures; cross-guild note access and retention; disable/restart recovery.

These are future tests, not executed runtime evidence. No live Discord sanction, production retention or warning migration was exercised in this epic. Do not invent historical warnings from the empty legacy service.
