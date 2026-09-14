# Module contracts, ownership and recovery

Only **core** is installed in the current runtime. It supplies ping, prefix and help through the shared command layer. Everything labelled **proposed** below is a design contract for future implementation, not a working service, database table, dashboard toggle or background scheduler. Requirements: [blueprint](../BLUEPRINT.md) sections 9, 13, 16–17, 21, 37, 49–50, 59, 62 and 84; [ledger](requirements.md); [roadmap](implementation-roadmap.md).

## 1. Current module mechanism

[ModuleDefinition](../packages/core/src/contracts.ts) contains `id`, `name`, `description`, `defaultEnabled` and optional `essential`. [SettingsService](../packages/core/src/settings.ts) receives the implemented module list and applies defaults to `GuildSettings.modules`. Essential modules are forced enabled on reads; `setModule` rejects an unknown module or disabling an essential one. The default list has only `core`. Each application must compose the same installed catalog; a persisted flag cannot load absent code.

Commands declare their owning module in metadata. The dispatcher checks the guild's module flag before execution, including aliases/context routes. The current shape is `modules: Record<string, boolean>`, not separately implemented `music.enabled` or `imageGeneration.enabled` properties. Names in the proposed catalog are candidate stable IDs; map blueprint labels to them during implementation. Do not expose fictional modules in live discovery.

The current system has no runtime module loader, dependency resolver, `start/stop` plugin API, durable worker, shared event bus or per-module health endpoint. Disabling today's flags controls command access; it does not by itself stop listeners, cancel provider work, settle escrow or delete Discord resources. Those are mandatory future lifecycle behaviors.

## 2. Common proposed lifecycle

A module consists of a declared capability set and an explicitly composed service, not an independent microservice by default. Keep the first implementations in cohesive packages/directories as described in [architecture](architecture.md). Separate **installed** (code exists), **enabled** (guild permits new use), **configured** (valid required settings), **available** (dependencies usable) and **recovering** (existing work is reconciling). A provider outage must not silently turn a guild's saved preference off.

A proposed module descriptor extends discovery with versioned configuration schema, required capabilities, owned commands/events/jobs, administrative policy and recovery procedures. Do not add a dependency until the feature actually uses it. Dependency cycles are rejected; startup checks required migrations/configuration before registering handlers. A failure in optional image generation must not prevent core help/prefix administration from remaining usable.

```text
installed + disabled
  → validate configuration/dependencies
  → reconcile retained work
  → enabled and accepting new actions
  → disabling: reject new actions, stop new claims
  → settle/cancel/reconcile existing obligations
  → disabled with retained history
```

This is a proposed state machine, not a current enum. A module may be unavailable during recovery while the persisted preference remains enabled. Record the reason and a safe operator action rather than claiming it is healthy. Enablement updates carry expected configuration revision and actor audit; races with an in-flight operation use the revision captured at admission plus a final policy/state check at the irreversible boundary.

### Durable work contract

For work where duplication or loss matters, the owning service must persist an operation ID, guild/resource scope, initiating actor where relevant, idempotency key, payload schema version, configuration/rules revision, state, due time, attempt count, lease owner/expiry, last classified error and terminal result/receipt. These are logical requirements; [database design](database.md) owns physical schemas.

A timer only wakes a worker. Claim due work atomically; commit domain transitions and any delivery intent together. Release or expire leases after a crash. Use bounded retries with jitter for transient failures, explicit permanent failure for invalid configuration/deleted resources, and operator-visible ambiguous outcomes when external success cannot be established. Do not retry a provider payment, Discord channel creation or reward grant just because the response was lost.

Disablement blocks **new benefit/admission**, while a narrowly authorized recovery lane may complete prior obligations: refund escrow, expire a temporary role, remove a bot-owned empty channel or reconcile a recorded delivery. These maintenance operations validate ownership and current bot capability and cannot initiate new rewards. Re-enable does not replay every historical event. Retention/deletion is a distinct administrative policy, not a side effect of a boolean toggle.

### Configuration ownership

| Layer/actor | May control | Cannot override |
|---|---|---|
| Process/operator | Installed modules, credentials, provider allowlist, hard resource limits | A guild's consent to enable optional behavior |
| Guild administrator | Enabled modules, target channels, role policy, bounded feature parameters | Operator limits or bot/actor Discord permissions |
| Delegated module manager | Explicitly delegated actions/resources within that guild | Delegation policy itself, unrelated modules or global economy rules |
| Channel restriction | Narrow where an enabled command/event may operate | A guild/module denial |
| User preference | Opt-in delivery, locale, allowed presentation/model selection | Guild security, spend ceilings, moderation policy |
| Invocation/component | Values allowed by current schema and authority | Saved ownership, prices, role grants or rule revision |

All mutations use shared services from bot, CLI and future dashboard. A user supplied guild/channel ID is a lookup scope, not permission evidence. Role administration requires current bot/actor capabilities and hierarchy; a bot can only manage roles below its highest role. Managed/integration roles and privileged role combinations need rejection by the service. [Discord permissions](https://docs.discord.com/developers/topics/permissions#role-hierarchy).

## 3. Full required module catalog

Every row except core is a **proposed module/capability boundary**. Blueprint “Commands” is a shared installed mechanism within core today; “Cards” and “Waifu TCG” separate catalog/ownership from gameplay responsibilities, not a promise of separate processes. Slash/prefix contracts are in [commands](commands.md); specialist documents own detailed schemas and business rules.

| Blueprint capability / candidate ID | Inputs and authoritative state | Ownership, permissions and configuration | Jobs, disable/recovery and acceptance |
|---|---|---|---|
| Core / `core` | Ping/help/prefix; current registry and guild settings | Essential; `ManageGuild` for prefix | Implemented settings transaction/cache. Cannot disable; conflicting write does not overwrite |
| Commands / core capability | Normalized invocations and current metadata | Shared access policy; never a parallel source of command truth | Implemented routing/help; future nested compiler. Registry collision fails atomically |
| Moderation / `moderation` | Staff actions, targets, case records and prior overwrite snapshots | Staff policy plus Discord permissions/hierarchy | Scheduled sanctions and reconciliation; disable admission, preserve cases and complete safe reversals. See [moderation](moderation.md) |
| Auto Moderation / `auto-moderation` | Message/member events, versioned rules and decision evidence | Restricted channels/roles and explicit exemptions | Bounded detection; no reprocessing old messages after enable; failed action retains case outcome separately from detection |
| Music / `music` | Play/control requests, queue/session and source IDs | Voice membership, DJ policy, bot voice capability, provider limits | Stop new enqueues on disable; explicit drain/stop policy; restore metadata without claiming playback resumed. See [music](music.md) |
| AI / `ai` | Prompt/session/tool requests; scoped memory and job receipts | Guild/channel/user isolation, approved models/tools, quotas | Cancel queued work, bound running work, stop tool admission after disable; never replay private prompts indiscriminately. See [AI](ai.md) |
| Image Generation / `image-generation` | Validated generation requests and asset/job state | Provider allowlist, credentials, content/size/storage quotas | Queued cancel; classify already submitted jobs; preserve receipt/cost. Never submit twice after ambiguous provider response |
| Economy / `economy` | Reward/spend events and conserved ledger | Service-only mint policy, bounded guild rules, owner-scoped balances | Disable new rewards/wagers; settle existing obligations. No negative balance or duplicate grant. See [economy](economy.md) |
| EXP / `exp` | Eligible message/voice events and progress | Anti-spam rules, opted-out channels, guild/global projection policy | Idempotent grants; disable stops accrual without deleting earned XP |
| Ranking / `ranking` | XP/economy projections and profile query | Public/private visibility and scoped leaderboard filters | Incremental projections/rebuild cursor; mark stale rather than scan all users per request |
| Cards / `cards` | Attributed source catalog, card instances and ownership | Ingestion policy; owner-authorized transfer only | Import checkpoints, safe asset caching; disable new drops while preserving collection/trade settlement |
| Waifu TCG / `waifu-tcg` | Battles, parties, items, energy, seasons and achievements | Own instances; scoped game administration; captured rules | Resolve or explicitly compensate active sessions; no silent rule change mid-battle. See [TCG](waifu-tcg.md) |
| Games / `games` | Start/move/finish requests, sessions and escrow | Participant authorization, cooldown, wager policy | Persist moves/deadlines; settle once or refund defined abort; old component cannot act in another game |
| Giveaways / `giveaways` | Scheduled giveaway, eligibility snapshot, entries and winner history | Manager policy, target-channel access, participant gates | Start/end/reroll jobs; disable admission and resolve existing giveaway by explicit policy; no redraw on send retry |
| Reaction Roles / `roles` | Join/verification/reaction/button/select/progression events and grants | Role hierarchy, exclusivity, grant source and expiry | Reconcile desired grants, retry boundedly, retain expiry cleanup on disable; never remove manually held role without ownership policy |
| Auto Voice / `auto-voice` | Voice joins/leaves, channel configuration and ownership records | Owner controls bounded by guild config; bot channel/move capability | Create/move reconciliation and empty cleanup; disable new creation, retain safe cleanup of tracked channels |
| Streams / `streams` | Provider live events and per-target subscriptions/delivery receipts | Guild targets, mention allowlist, provider capability | Poll/webhook reconciliation per provider/stream/guild/target; disable new announcements; no global notified flag. See [adapters](adapters.md) |
| Free Games / `free-games` | Region-aware promotion metadata and target receipts | Provider/channel/mention configuration | Due feed refresh and promotion-expiry checks; suppress expired backlog on restart; mark sent after confirmation |
| Anime / `anime` | Anime/manga/character/wallpaper/reaction queries and provider IDs | Content/channel restrictions and cache policy | Bounded adapter calls/cache; disable blocks new search/render, not shared cache deletion |
| Memes / `memes` | Template ID, bounded text/image inputs, render assets | Allowed templates, mention suppression and image validation | Bounded render pool; cancel queue on disable; preserve asset attribution and all source files |
| Welcome / `welcome` | Member-join event, template revision and delivery intent | Guild destination, human/bot filters, approved mentions | Deduplicate joins per event policy; skip old backlog; text fallback if render fails |
| Farewell / `farewell` | Member-leave event, minimal identity snapshot and delivery intent | Separate enable/channel/template settings from welcome | No member refetch assumption after leave; safe missing-avatar fallback; no repeated historic farewell |
| Reminders / `reminders` | Owner's text, due instant/timezone and delivery state | Owner-only list/cancel; permitted destination | Leased due dispatch, explicit ambiguous-send handling, expiry/retention; disable must explain pending reminders |
| Server Utilities / `server-utilities` | Guild/member/avatar queries and scoped configuration | Effective visibility; admin permissions for mutations | Read-only queries fail safely on deleted targets; no indiscriminate member enumeration |
| Logging / `logging` | Structured application events and moderation/config audit | Operator retention/redaction; restricted staff destinations | Durable business audit cannot be disabled by turning off optional Discord log copies; bounded export backlog |
| Dashboard Integration / `dashboard-integration` | Authenticated configuration/discovery requests | Fresh guild authorization and same shared schemas | No separate policy store; outage leaves bot settings usable. See [dashboard](dashboard.md) |
| Analytics / `analytics` | Minimized aggregate events and metrics | Retention/opt-out policy; no raw prompts in telemetry | Idempotent projections; disable collection without disabling mandatory security audit |

The table covers the required blueprint catalog, not live discovery. Exact implementation IDs/dependencies are finalized when the owning ticket is groomed. Candidate defaults are opt-in for optional modules until migrations, permissions and recovery are verified; installing code does not authorize contacting every provider or sending messages.

## 4. Automatic, interactive and temporary roles

Proposed role configuration has guild/rule ID, trigger kind, allowed human/bot population, target role, eligibility predicate, exclusive group, expiry policy and revision. Triggers include member join, verified membership, reaction add/remove, button toggle, select desired set, level/economy/activity eligibility, and temporary expiry. Verification must consume a trusted verification result; clicking an ordinary role button cannot impersonate verification.

Store a grant record keyed by guild/member/role/source-rule, plus desired/current state, expiry and last outcome. A member may hold the same role through multiple legitimate sources. Removing a reaction must remove only that rule's entitlement; do not remove the role while another entitlement still requires it. Manual grants need an explicit preservation policy. For exclusive groups, serialize changes per member/group and record the desired set before API changes; multiple Discord role writes are not one database transaction.

A select menu expresses the desired roles within its configured group, not arbitrary role IDs supplied by the user. Recheck channel/message binding, current member eligibility and bot hierarchy before edits. Temporary expiry is a recovery obligation even when new role grants are disabled; if hierarchy changes and removal fails, retain a retryable/needs-attention record and show the operator which role/member is affected.

| Failure | Required behavior/test |
|---|---|
| Two exclusive selections overlap | Last accepted revision wins; reconciliation converges to one allowed role |
| Remove succeeds, add fails | Persist partial outcome and reconcile desired set; never claim atomic Discord success |
| Member leaves during grant | Terminal missing-member outcome, no endless retry; rejoin policy decides new entitlement |
| Rule disabled or deleted | Stop new grants; show explicit keep/revoke-owned-grants choice through authorized configuration |
| Managed/high role requested | Reject before mutation and explain capability/hierarchy constraint |

## 5. Giveaways: entry, draw and delivery are separate

Proposed states are `scheduled → accepting → drawing → ended`, with explicit `cancelled` and recoverable failure states. A giveaway stores guild/channel/message mapping, prize text, start/end instants, winner count, eligibility/rule revision and manager audit. Entries are unique by giveaway/user; repeated entry clicks return existing membership. Record required/blocked roles, account and guild age, channel eligibility, bonus weights and exclusion reasons without retaining unnecessary profile data.

Evaluate eligibility at entry and revalidate at draw according to a published policy. A proposed conservative policy excludes departed/ineligible members at draw and records the reason; changed eligibility rules cannot retroactively alter weights without an audited manager action and visible notice. Snapshot the final candidate set/weights, draw without replacement, and persist winners plus draw revision before attempting announcement. Fewer eligible entrants than winners yields the available entrants and a clear shortfall, not invented winners.

End-early competes with scheduled end using one state transition. Cancellation and draw cannot both win. Reroll adds a new draw revision/history with explicit exclusions; retrying an announcement uses the saved draw and never selects different winners. Rerun creates a new giveaway linked to the original, not a reset that destroys history. Deleting the public message must not delete audit or imply prizes were delivered.

Disabling the module blocks creation/entry and asks the administrative UI to choose the documented policy for scheduled/active giveaways: cancel with retained history, or finish the already admitted giveaway through the recovery lane. The implementation must select and communicate a default before release; do not silently strand entries or announce completion when sending failed.

| Acceptance case | Evidence required |
|---|---|
| Duplicate entry/event replay | One participant/weight record |
| Concurrent early/scheduled end | One winning transition and draw revision |
| Crash after draw before announcement | Same saved winners sent/reconciled; no redraw |
| Crash after send before receipt | Ambiguous delivery recorded and reconciled according to notification policy |
| Deleted channel or lost send permission | Domain result retained; manager sees delivery failure and can choose a new authorized destination |
| Reroll after old button click | Old revision rejected; prior winner history unchanged |

## 6. Auto voice: reconcile tracked resources only

Proposed configuration includes join-to-create channel/category, safe name template, user limit, bitrate/region policy within actual Discord capability, owner controls and cleanup grace interval. Input is a qualifying voice-state transition; duplicate delivery or join churn must not create unlimited rooms. Persist a creation operation and per-member/guild admission guard before calling Discord.

Creation cannot be atomically committed with Discord. Persist the returned channel ID immediately; if response success is uncertain, reconcile candidate resources from the recorded operation and constrained guild/category context before retrying. A name match alone is insufficient ownership proof for deletion. Moving the member is a separate step: if they have already left, keep a tracked empty resource for cleanup rather than repeatedly moving an unwilling user.

Owner rename/lock/limit/transfer/delete actions act only on the tracked room and enforce guild limits. Ownership transfer is a revisioned update to an eligible present member with corresponding overwrite reconciliation. “Kick from room” must not become a general guild-member moderation API. Preserve the guild's preexisting permission policy; unlock restores the recorded owned override rather than blindly granting everyone access.

On restart, compare tracked channel IDs to current Discord state: missing channel is terminal cleanup; occupied tracked channel resumes management; empty tracked channel waits its configured grace then is deleted; uncertain ownership is reported. An unrelated empty channel is never garbage-collected. On disable, block new rooms, preserve ownership history and continue cleanup only for proven bot-owned resources. Test lost channel-create response, member leave-before-move, owner leave, transfer race, revoked permission and restart with an occupied room.

## 7. Reminders, welcome/farewell and free-game delivery

**Reminders:** preserve `/reminder` and `remindme` compatibility. Normalize relative durations or explicit calendar date/time to a UTC instant while retaining the user's timezone/display input. Reject impossible dates, ambiguous/nonexistent local times unless the user resolves them, and past times according to a documented tolerance. Natural-language parsing is a future capability needing bounded grammar and confirmation; the old parser's multiword split is a defect, not a supported specification.

Persist owner, original guild/channel scope, approved delivery destination, due instant, safe text and state. List/cancel require ownership; knowing a reminder ID grants nothing. Cancellation races with dispatch through a revision/state check. Recheck destination membership/access before sending; failure to DM is not permission to publish private reminder text in a channel. Retry transient failures within a bounded delivery window, then report terminal/ambiguous state. Disable blocks creation and explicitly handles pending records; it never deletes them unnoticed.

**Welcome/farewell:** use separate configurations and an event-specific delivery intent, snapshot the minimum required username/avatar/member-count data, validate/cache custom backgrounds, and escape template fields/mentions. Allow only configured mention roles; never expand user-controlled mention markup. Missing avatar or render failure may fall back to safe text; missing destination is a configuration failure. Rejoin/leave churn needs a deduplication/cooldown policy that does not mistake every later legitimate join for a permanent duplicate. Restart does not broadcast all historical joins. Banner assets follow the same validated storage path as profiles and memes.

**Free games:** keep source promotion ID distinct from game identity and delivery destination. A promotion records region, offer kind (permanent claim/free weekend), start/end instants and canonical claim URL. Do not label a free weekend as permanent ownership. Each guild/channel gets its own delivery key and outcome. Refreshing metadata is different from announcing; retrying one failed target must not suppress another. Before delivery, recheck end time, region and enabled provider, and avoid dumping expired promotions after downtime. Provider availability and feed legitimacy are assessed in [adapters](adapters.md); no unsupported scraping fallback is implied.

For all three systems, external send success and database commit have a crash gap. A delivery state must distinguish pending, claimed, confirmed, failed and ambiguous. Store Discord message IDs when returned. Reconciliation is bounded and must respect content retention/access; this document makes no exactly-once external-delivery promise.

## 8. Mini-games and social rendering

A proposed `MiniGame` contract accepts a typed start request, validates a participant move against session revision, and returns a typed update/terminal result. Shared orchestration owns deadlines, component binding, persistence, statistics and reward settlement; each game owns legal moves and deterministic resolution from recorded inputs/random draws. Randomness used in production must be unpredictable before commitment; deterministic replay of a saved draw is not proof of fairness or an “unbeatable” opponent.

| Game | State and move contract | Failure/reward boundary |
|---|---|---|
| Tic Tac Toe | Board, active player, legal cell, move sequence, opponent mode | Duplicate/occupied-cell move rejected; terminal win/draw settles once; bot strategy strength needs tests |
| Rock Paper Scissors | Participant commitments/hidden choices and deadline | Never reveal first choice before second commits; explicit timeout/forfeit policy |
| High/Low | Deck/draw sequence, guess, score and bust/cash-out state | Cannot cash out twice or predict a future uncommitted draw |
| Coin Flip | Choice, recorded unpredictable draw and terminal result | Idempotent solo/PvP settlement; reproducible audit without exposing next result |
| Dice | Declared die/rule version, draw and win condition | Validate bounds; no client-supplied winning result |

Wagers reserve funds in escrow before a match becomes active; successful finish releases the defined payout once. Abort/disconnect/timeout semantics are part of rules shown before acceptance, including whether refund or forfeit applies. Economy disable prevents new wager admission but must still settle existing escrow. XP/statistics consume an idempotent terminal game event so a retry cannot grant rewards again. Detailed ledger and abuse controls belong in [economy](economy.md).

Anime/manga/character search keeps provider IDs separate from display labels, paginates bounded results and reports stale/unavailable/no-result distinctly. Reaction selection preserves all **68** audited reaction commands, not the 60 listed in the comparison branch. Memes preserve all 11 wired generators and all 96 source assets with attribution; template aliases/arguments remain manifest-backed. Rendering uses validated input assets, bounded dimensions/text/workers/timeouts and deterministic fixtures where possible. Provider image failure yields a safe placeholder/error, never a blind unbounded remote download. Anime, reactions and memes remain unimplemented in this foundation.

## 9. Optional module evaluation, not release scope

Blueprint section 84 asks for evaluation rather than unconditional implementation. These candidates must not delay required parity. Admission needs a groomed ticket, data owner, access/retention model, module lifecycle, useful testable acceptance and a reason shared infrastructure is insufficient.

| Optional candidates | Reused boundary and distinct risk | Admission gate |
|---|---|---|
| Starboard, suggestions, polls | Message/reaction ingestion, vote identity and deduplicated projection | Deleted/private source handling, vote abuse and outcome locking |
| Support tickets | Private channel/thread creation and staff membership | Permission isolation, transcript retention and crash-safe closure |
| Custom embeds, tags, scheduled announcements | Validated templates and delivery jobs | Mention/URL restrictions, author rights and schedule cancellation |
| Birthdays, milestones, AFK | User preferences and due events | Opt-in personal data, timezone/retention and harassment/spam prevention |
| Statistics/counters | Aggregate projections and bounded channel updates | No update-per-event storm; acceptable stale-data display |
| Quests, achievements | Idempotent progress/reward events | Versioned rules, unique claims and abuse-resistant rewards |
| RSS/news and notification subscriptions | Provider fetch, subscription scope and delivery receipts | SSRF-safe feeds, content rights, deduplication and unsubscribe |
| Self-assignable roles, temporary channels | Existing roles/auto-voice capabilities | Extend the existing owner rather than create conflicting grant/cleanup engines |

## 10. Implementation and verification checklist

Before registering a new module, its owning story must provide a typed descriptor/configuration schema, real service and repository contracts, dependency/capability checks, slash/prefix metadata, permissions/hierarchy checks, disable/re-enable behavior and an operational handoff. The dashboard may expose the toggle only when those behaviors exist.

Minimum failure tests include duplicate input, concurrent state transition, stale configuration revision, missing/forbidden target, provider timeout, lease expiry, restart between domain commit and external response, disable during work, and re-enable without replay. Separate read-only discovery tests from mutation/settlement tests. Verify module data remains recoverable after disabling and essential administration stays reachable.

The current [core tests](../packages/core/src/core.test.ts) and [dispatcher tests](../packages/discord/src/dispatcher.test.ts) cover foundational settings/module flags and access, not the proposed services in this document. Use [testing](testing.md) for executed evidence, [ADR-013](adr/ADR-013-configuration-permissions-and-concurrency.md) for configuration concurrency and [ADR-012](adr/ADR-012-job-scheduler-and-task-queue.md) for the durable-work decision.

