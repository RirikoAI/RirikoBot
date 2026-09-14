# Database contracts and schema design

## Scope and evidence boundary

**Installed schema version 1 has exactly three managed tables:** `guild_settings`, `settings_audit` and `ririko_schema_migrations`. Only settings and their actor audit have an implemented domain repository. Every catalog in section 4 is **proposed**, not installed SQL, generated APIs or completed features. The blueprint explicitly says to study real data and not blindly create every suggested table.

This document covers BP-23–41, BP-46–51, BP-54, BP-61, BP-76–78 and BP-85. See [requirements](requirements.md), [architecture](architecture.md), [roadmap](implementation-roadmap.md) and [ADR-003](adr/ADR-003-database-layer-and-dual-dialect-orm.md). Operational procedures belong in [migrations](migrations.md) and [the legacy import plan](migration-1.x-to-2.0.md); this document specifies invariants those procedures preserve.

The source audit covers 17 entity files and 12 migrations at legacy `0d8be25b17e25dfa61812d6e7b5aaf8497687257`. No representative production database was supplied. The [data manifest](legacy-data-manifest.json) distinguishes declarations from replayed migration DDL; neither proves a private deployment's rows. Preserve legacy global coins/karma/XP and original IDs rather than inventing per-Discord-guild balances during import.

## 1. Implemented persistence

### Drivers and connection lifecycle

Drizzle 0.45.2 uses separate schemas/repositories: PostgreSQL pairs `postgres` 3.4.9 with `drizzle-orm/postgres-js`; SQLite pairs `better-sqlite3` 13.0.3 with `drizzle-orm/better-sqlite3`. `drizzle-orm/node-postgres` belongs to the different `pg` driver. [Drizzle documents these pairings](https://orm.drizzle.team/docs/get-started-postgresql); current installation snippets do not override this repository's pinned versions.

`connectDatabase({dialect,url})` returns `settings`, `migrate`, `migrationStatus`, `healthCheck` and `close`. It never auto-migrates. PostgreSQL is the production target; SQLite at `data/ririko.db` is the actual config default, with `:memory:` for tests. Keep credentials out of command arguments/logs.

| Behavior | SQLite | PostgreSQL |
|---|---|---|
| Open/inspect | Lazy; missing file/directory remains absent during diagnostics; existing file initially read-only | Client construction; inspect current schema, normally `public`; use dedicated database/schema |
| Write | Writable handle for recognized settings write or explicit empty-DB migration | Transactional queries through pooled client |
| Limits | Five-second busy timeout; synchronous operations | Pool max 5; connect 10s, idle 20s, statement/lock 5s |
| Foreign keys | Enabled per opened connection | Server enforces declared constraints |
| Journal mode | No WAL/journal-mode change in code | Not applicable |
| Close | Idempotent; subsequent use rejected | End pool with five-second timeout |

SQLite remains a single-writer database; WAL can permit readers during a writer but does not create concurrent writers. Enabling WAL later requires a backup/checkpoint/volume decision. [SQLite isolation](https://www.sqlite.org/isolation.html). Foreign keys require per-connection enablement, as implemented. [SQLite foreign keys](https://www.sqlite.org/foreignkeys.html).

### Exact installed columns and constraints

Fixed SQL in [migrations.ts](../packages/database/src/migrations.ts) is installation authority. Drizzle [SQLite](../packages/database/src/schema/sqlite.ts) and [PostgreSQL](../packages/database/src/schema/postgres.ts) declarations support typed access. SQL has revision checks absent from those table-builder declarations; regenerating from declarations is not guaranteed to reproduce the installed schema.

All columns below are non-null unless marked nullable. Revisions use SQLite INTEGER / PostgreSQL BIGINT, mapped to bounded JavaScript numbers today.

| Table / column | SQL type | Constraint / meaning |
|---|---|---|
| `guild_settings.guild_id` | TEXT | Primary key; snowflake remains text |
| `.prefix` | TEXT | Application validates syntax; SQL only non-null |
| `.modules` | TEXT / JSONB | Module flags, parsed against application schema |
| `.commands` | TEXT / JSONB | Nested canonical command policies |
| `.revision` | INTEGER / BIGINT | CHECK between 1 and 9007199254740990; zero is unsaved defaults only |
| `settings_audit.id` | TEXT | Primary key; application-generated UUID text, not native UUID column |
| `.guild_id` | TEXT | FK to guild_settings; no cascade action declared |
| `.actor_id` | TEXT | Audit identity; no users table/FK exists |
| `.before_revision` | INTEGER / BIGINT | CHECK >= 0 |
| `.after_revision` | INTEGER / BIGINT | CHECK equals before_revision + 1 |
| `.before_settings` | TEXT / JSONB, nullable | Null for initial creation, otherwise prior snapshot |
| `.after_settings` | TEXT / JSONB | Full next snapshot |
| `.created_at` | TEXT | UTC ISO timestamp from application, no SQL timestamp/default |
| `ririko_schema_migrations.version` | INTEGER | Primary key; current history contains version 1 |
| `.checksum` | TEXT | Dialect SHA-256 of fixed statements joined with newlines |
| `.applied_at` | TEXT | Application-supplied UTC ISO timestamp |

Unique index `settings_audit_guild_revision(guild_id,after_revision)` prevents two audit rows per guild revision and supports ordered revision reads. Primary keys support identity lookup. No future-domain indexes exist. Append-only audit is application behavior: no trigger prevents a privileged direct update. SQLite JSON text has no `json_valid` SQL check in v1; runtime parsing remains necessary.

### Repository operations

`get(guildId)` validates the ID, requires recognized migration history, selects by primary key and parses returned settings. Absence is `undefined`; only the service converts absence to defaults. An error is not absence. The repository does not authenticate guild administrators.

`save(settings,expectedRevision,actorId)` validates inputs/revision equality and computes a safe next revision. In one transaction it reads the before snapshot, compares its revision (zero if absent), conditionally updates by guild ID **and expected revision** or conflict-safely inserts, then appends before/after snapshots with actor and timestamp. No returned row means `CONFLICT`. Audit failure rolls back settings. SQLite uses an immediate transaction; PostgreSQL uses conditional writes inside a transaction. No HTTP call holds that transaction open.

The service fresh-reads before its narrow prefix/module mutation, but does not accept the caller's displayed revision. A future stale browser form therefore needs another precondition; see [ADR-013](adr/ADR-013-configuration-permissions-and-concurrency.md).

### Migration recognition limits

An empty/missing SQLite DB or empty dedicated PostgreSQL schema reports `{current:0,latest:1}`. Unexpected objects cause `FOREIGN_SCHEMA`; partial managed objects cause `SCHEMA_INVALID`. Exactly three managed objects and one matching version-1 checksum row are required. Changed/missing/future history is refused rather than repaired.

This checks object names and recorded history, **not a live fingerprint of every column/index/constraint/privilege**. A matching ledger cannot prove no manual DDL drift occurred. PostgreSQL inspects current-schema relations, not the whole server; SQLite inspects noninternal tables/views/triggers and does not audit indexes. Operational integrity checks remain necessary. Never edit checksums to bypass failure.

The runner implements one foundation migration, not generic numbered-file discovery. PostgreSQL migration takes a transaction advisory lock derived from database/schema; SQLite uses an immediate transaction. Version 2 must deliberately extend history/object recognition, preserve v1 checksum and test upgrades/old-release refusal. Adding a Drizzle declaration alone neither installs a table nor migrates data.

## 2. Rules for proposed data models

These are future schema requirements, not changes to v1.

| Concern | Proposed convention | Reason |
|---|---|---|
| Identity | Snowflakes/provider IDs remain text; application entities have immutable IDs | No precision loss or cross-provider collision |
| Tenancy | Guild-local rows carry discord_guild_id; global/player ownership declared explicitly | Parent/route ID alone never establishes authorization |
| References | Composite uniqueness/FKs include tenant where relationships must share scope | Prevent cross-guild child links to otherwise valid IDs |
| Money/XP | Integer smallest units, currency and scope; proposed SQL signed 64-bit values mapped via BigInt/decimal strings | SQL bigint does not make JS number safe |
| Probability/rates | Integer weights/basis points with denominator and rounding rule | Deterministic rewards and replay |
| Time | UTC instants with explicit precision; API ISO UTC; reset periods store timezone/rule version | Avoid ambiguous local dates/DST resets |
| State | Named transitions, monotonic revision, conditional prior-state check | Stale accept/cancel/claim cannot win |
| Idempotency | Unique scope/operation/request-key plus canonical request digest and result ID | Same key/different payload conflicts; retries return original result |
| JSON | Bounded versioned optional/provider/content payload; relation/state/query keys stay columns | Opaque arrays cannot enforce ownership or efficient due-time queries |
| Deletion | Explicit retention/tombstone/cascade policy per FK | Profile deletion cannot erase settlement or ownership evidence |
| Pagination | Stable tuple ordering and keyset cursors, normally time + ID | Avoid whole-history scans and timestamp ties |

Proposed `account_scopes(scope_id,kind,discord_guild_id)` provides a real global scope identity instead of relying on nullable unique keys. Legacy global spendable balances remain global; guild rankings are projections, not duplicated funds. Player guilds use `waifu_guild_id` to avoid confusion with Discord guilds. Future amount mapping needs both-dialect overflow/serialization tests; keep it separate from existing number-based settings revisions.

## 3. Transaction patterns

A proposed transfer validates amount, actor, scope and account state, then visits accounts in deterministic ID order. In one transaction: deduplicate request, conditionally debit sufficient available funds, credit recipient, append balanced entries and finalize operation receipt. Any failure rolls back every part. A transfer of 100 with fee 3 records payer -103, recipient +100, treasury +3: sum zero in one currency/scope. Before/after account balances alone are **not** double-entry accounting. Mint/burn use identified source/sink accounts.

Row-local CHECK constraints are insufficient to prove a cross-row balanced ledger; service transaction logic and reconciliation must do that. [PostgreSQL constraint scope](https://www.postgresql.org/docs/current/ddl-constraints.html). A market purchase must settle ownership, debit, credit and fee together, not hope two independent service commits succeed.

Future jobs select eligible work using status/due-time, claim a lease with fencing token, commit before HTTP, then record outcome only if that token still owns the attempt. Unique intent is not exactly-once external delivery: after a successful send but before outcome commit, reconcile rather than assume retry is harmless. [Adapters](adapters.md) owns delivery ambiguity.

SQLite immediate transactions obtain write intent early and can return busy; keep them short and retry a whole known-safe operation with a bounded budget. [SQLite transactions](https://www.sqlite.org/lang_transaction.html). PostgreSQL Read Committed can observe newer committed data between statements; use conditional writes/locks for the invariant. Serializable may abort and require whole-transaction retries. [PostgreSQL isolation](https://www.postgresql.org/docs/current/transaction-iso.html). Isolation is not an idempotency policy. Lost response after possible commit requires receipt lookup before retry. Current settings code has no universal retry/error-classifier service.

## 4. Proposed catalog

**All rows in this section are proposals.** They describe a vocabulary for incremental migrations, not an instruction to create every table. PK is primary key, UQ uniqueness. Implementation must finish nullability, bounds, FK deletion actions and exact dialect DDL. Domain guides own gameplay/provider algorithms; this catalog owns relationships, identity and persistence invariants. Rarity/element candidates remain data rather than hard-coded SQL enums.

### Identity, configuration, secrets and audit

| Proposed records | Keys and fields | Invariant / principal query |
|---|---|---|
| `users` | PK user ID; display metadata, profile asset, privacy state, timestamps | Mutable name never identity; ordinary guild departure does not destroy global ownership |
| `discord_guilds` | PK guild ID; metadata/owner, bot membership, joined/left | Membership snapshot is not human authorization; no blind cascade of evidence |
| `guild_members` | PK guild/user; nickname/membership snapshot, observed_at | Snapshot roles not effect-time authority; user index for membership lookup |
| `account_scopes` | PK scope_id; global/discord-guild/player-guild kind and owner references | UQ logical scope, explicit legacy global identity |
| `guild_settings` evolution | Preserve existing key/revision; version additional validated config | Migration and mixed-reader strategy; never silently replace v1 |
| `command_settings` if normalized | UQ guild/scope-key/canonical-name; versioned policy | Registry remains code authority; DB cannot create executable commands |
| `provider_configs` | UQ scope/kind/provider; capabilities, enabled, secret_ref, limits/revision | Config is distinct from live health and credential bytes |
| `secret_records` | PK secret ID; owner/purpose, key version, nonce/ciphertext/tag, state/rotation time | Decryption key outside DB; authenticated scope/purpose; no plaintext settings/audit |
| `audit_events` | PK ID; scope, actor/source, action/subject, safe change summary, request ID/time | Restricted append behavior; index scope/time/ID; no raw secret payload |

A persisted `commands` registry snapshot may aid administration but never replaces code/help/synchronization. Browser configuration reads cannot share access to ciphertext/decryption APIs. Cryptographic lifecycle and key-recovery design belongs in [dashboard](dashboard.md).

### Durable work, delivery and import control

| Proposed records | Keys and fields | Invariant / index |
|---|---|---|
| `operation_receipts` | UQ scope/operation/request-key; digest, status/result ID, expiry | Different payload conflicts; retain through retry/replay safety horizon |
| `jobs` | PK ID; kind/payload version, scope, due/next-attempt, state, lease owner/token/until, attempts/cancel request | Compare state/token on completion; due index status/time/ID |
| `job_attempts` | UQ job/attempt; start/end, safe error code, external request ID/outcome | Explicit transient/permanent/ambiguous distinctions |
| `outbox_events` | PK event ID; scope, type/version, aggregate/revision, bounded payload/time | Commit with domain state; stable consumer identity |
| `consumer_receipts` | PK consumer/event; result ID, handled time | Duplicate processing protection; retention follows replay horizon |
| `delivery_attempts` | PK ID; delivery/target, external or message ID, state/times | Accepted/failed/unknown distinct; unknown not automatically retryable |
| `retention_runs` | PK ID; policy/version, cutoff, cursor, counts/state | Resumable bounded cleanup; do not delete live settlement references |
| `legacy_import_runs` | PK ID; source hash/fingerprint, mapping version, target identity, checkpoint/counts/state | Resume binds exact source/mapping; changes require review |
| `legacy_import_rows` / quarantine | UQ source-snapshot/table/typed-source-key/mapping-role; attempt run reference, protected raw payload/hash, target mapping, anomaly | Projection identity survives new attempt IDs, preventing duplicate grants; encrypt sensitive raw values and restrict access/retention |

Jobs reference durable records instead of huge duplicated snapshots, but retain the rules/content version required for replay. Diagnostics expose safe counts/IDs rather than prompts, raw import credentials or provider secrets.

### Moderation and guild safety

| Proposed records | Keys and fields | Invariant / query |
|---|---|---|
| `moderation_cases` | PK ID; UQ guild/case-number; actor/target/action/reason, policy version, state/times | Transactional case number; attempted action is not assumed Discord success |
| `moderation_action_attempts` | UQ case/attempt; external identity/outcome/error category | Operation-specific retry; execution-time permissions/hierarchy |
| `moderation_warnings` | PK ID; guild/target/case, severity/state/expiry | Audited revoke/expire; index guild/target/state/expiry |
| `moderation_warning_events` | PK event; warning/case, grant/revoke/expire, escalation episode, actor/time | Immutable facts update the warning projection atomically |
| `moderation_evidence` / `moderation_outbox` | Scoped evidence metadata with retention; unique case/notification intent | Restricted payload access; notification failure cannot repeat a sanction |
| `channel_lock_snapshots` | Operation/channel/revision; original allow/deny/inherit and owned changes | Restore only matching ownership and generation; preserve later staff changes |
| `moderation_rules` / revisions | Rule ID/version; guild/type, bounded thresholds/exemptions/action/enabled | Preserve decision version; validated data, not executable code |
| `moderation_notes` | PK ID; guild/target/author/content/revision, edited/deleted | Staff-only scope; edit evidence; no global warning-count substitute |
| `moderation_case_counters` | PK guild; next sequence/revision | Race-safe allocation, never COUNT(*) + 1 |

Escalation reads applicable active warnings and records its decision consistently; Discord acts outside the transaction. Retention separates private note/reason content from minimum action evidence. [Moderation](moderation.md) owns effect and escalation rules.

### Economy, banking, XP and ranking

| Proposed records | Keys and fields | Invariant / query |
|---|---|---|
| `economy_accounts` | PK ID; UQ scope/owner-kind/owner-ID/currency/pocket; posted/held units, status/revision | Explicit wallet/bank/escrow/treasury; spendable = posted - held |
| `economy_transactions` | PK ID; scope/currency/type, receipt/source-event/time | Immutable logical operation header |
| `economy_ledger_entries` | PK transaction/line; account, signed delta, before/after | Sum zero; query/index account + transaction/time; no cross-currency balancing |
| `economy_holds` | PK ID; account/source, units/state/expiry; UQ source identity | Reserve/capture/release once; held cannot exceed eligible funds |
| `reward_rules` / revisions | Rule/version; scope/event, integer amounts/weights/windows | Persist rule applied to decision; no executable formula payload |
| `economy_rewards` | UQ scope/source-event/logical-reward-kind; applied rule/version, decision reason, transaction/XP IDs | Changing rule version cannot remint an old event; rejected-event retry semantics explicit |
| `economy_cooldowns` / windows | UQ scope/user/reward/window-key; eligible_at/counters | Durable abuse control, independent from dispatcher's memory cooldown |
| `daily_claims` | UQ scope/user/claim-sequence; stable request identity, previous claim, eligible_at, streak, applied rules/ledger | Atomic rolling 24-hour eligibility and 36-hour continuity; no midnight or rule-edit extra claim |
| Interest settlements | UQ scope/account/logical-interest-kind/period; governing timezone, applied rules/ledger | Calendar identity independent of rule version; duplicate period cannot mint twice |
| `xp_accounts` | UQ scope/user; XP, level projection, formula version/revision | Explicit global/guild projections; no duplicated money |
| `xp_events` | PK ID; unique account/source/logical-reward-kind, applied rule/version, delta/time | Event and projection update atomic; rule changes cannot replay old awards; compensating corrections |
| `leaderboard_snapshots` / entries | Snapshot scope/metric/version/as_of; snapshot/user entries with rank | Stable tie-breaker; index snapshot/rank/user; bounded pages |

Bank movements transfer pockets; net worth is derived, not independently editable. Frozen accounts need a reviewed refund/settlement policy rather than stranded holds. Snapshot ranking is a read model, not a promise of O(1) freshly recalculated rank across arbitrary populations. [Economy](economy.md) owns reward, abuse, interest and correction rules.

### Music, AI, generation and media

| Proposed records | Keys and fields | Invariant / principal query |
|---|---|---|
| `music_guild_settings` / `music_channels` | Guild key; voice/text targets, DJ policy, limits/revision, display message | IDs verified at use; config survives restart, live voice session does not |
| `music_saved_playlists` | PK ID; owner scope/user, name, visibility/revision | Explicit personal/guild ownership; legacy duplicate names need mapping policy |
| `music_playlist_tracks` | PK ID; playlist, position, source metadata, duration_ms, asset ref | UQ playlist/position; reorder transaction; metadata URL is not permanent playable credential |
| `music_history` | PK ID; guild/requester/source, status/start/end | Index guild/start/ID; bounded history, no retained signed audio URL |
| `ai_channels` | PK guild/channel; enabled/policy version | Opt-in dedicated channel with independent authorization |
| `ai_conversations` | PK ID; guild/channel/user, generation, provider/model, summary/version/expiry | All lookups bind scope; reset generation cannot revive old private context |
| `ai_messages` | PK ID; UQ conversation/sequence; role/content/request/tool identity, token estimate/time | Stable order, bounded payload/retention; index conversation/sequence |
| `ai_tool_calls` | Unique application operation ID bound to conversation/generation and request digest; provider call IDs as attempt evidence; mediated actor, tool/version, safe args/result ref/state | Application supplies authority and semantic duplicate detection independently of model arguments or regenerated provider IDs |
| `ai_guild_preferences` / `ai_user_preferences` | Guild or user/scope key; personality/model/timezone fields/revision | User choices cannot weaken guild policy; personality is not authority |
| `image_providers` / `image_presets` | Provider or preset/version; capabilities/defaults/enabled | Configuration, not a promise of unlimited free availability; no embedded keys |
| `image_jobs` | PK ID; job FK, scope/user, provider/model/preset version, prompt ref, units/result assets/state | Accept reserves quota; ambiguous paid result reconciled before retry/fallback |
| `image_usage` / reservations | UQ scope/user/provider/period; reserved/completed/failed units/revision | Concurrent admission respects limit; capture/release once |
| `media_assets` | PK ID; hash/storage key/MIME/bytes/dimensions/scan state/time | Validated bytes; storage key not arbitrary path/URL; decoded-size bounds |
| `media_asset_references` | PK ID; asset, owner domain/entity, usage/expiry | Reference-aware deletion; no cleanup of still-required payload |

Provider JSON remains untrusted. Query scope and stable IDs rather than globally scanning private bodies. Signed URLs expire and confer access: persist asset identity and resolve delivery locations at use. Filesystem/object writes are not atomic with SQL; stage, verify, commit reference, then clean orphan stages. Removal combines a tombstone and physical deletion workflow. See [AI](ai.md), [music](music.md) and [adapters](adapters.md).

### Giveaways, streams and free promotions

| Proposed records | Keys and fields | Invariant / query |
|---|---|---|
| `giveaways` | PK ID; guild/channel/message, creator/prize, rules version, starts/ends/state/revision | Conditional end transition; one accepted draw identity |
| `giveaway_entries` | PK giveaway/user; eligibility snapshot/weight/time | No duplicate entry; bounded weight and defined cutoff |
| `giveaway_draws` / `giveaway_winners` | Draw ID/sequence, giveaway, receipt/RNG/replay metadata; winner slots | Reroll is a new audited draw, not overwritten history |
| `streamers` | PK ID; UQ platform/platform-user-ID; metadata, observed state/time | Twitch/TikTok/Facebook assessed independently; YouTube may be additional |
| `stream_subscriptions` | PK ID; UQ streamer/Discord-guild/target; template/mention policy, state/revision | Target-specific identity; fresh permission/mention policy before send |
| `stream_subscription_members` | PK subscription/requesting-user; membership state, actor and timestamps | Independent subscriber attribution; removing one member cannot remove another's subscription or duplicate a target delivery |
| `stream_events` | PK ID; UQ platform/external-stream-ID; streamer/start/end/metadata | Normalize stable provider identity; webhook/poll overlap deduplicates |
| `stream_announcements` | PK delivery ID; UQ event/Discord-guild/target; state/message/intent/outcome times | Unique intent and explicit unknown outcome, not exactly-once guarantee |
| `stream_assets` | Stream/asset relation; captured time, media asset/provenance | Payload removable independently of announcement history |
| `free_games` | PK promotion ID; UQ provider/external-offer/window; title/URL/start/end | Same game can have multiple offer periods; never dedupe forever by title |
| `free_game_announcements` | UQ promotion/guild/target; delivery state/message | Same attempt/reconciliation model as stream delivery |

A username, URL or title is mutable presentation, not reliable idempotency. Providers without stable stream IDs need a documented bounded session-identity policy before deduplication can be claimed. Preserve thumbnail provenance after caching. Delivery retention must outlast the period in which provider replay could otherwise repeat an announcement.

### TCG sources, catalog and ownership

| Proposed records | Keys and fields | Invariant / query |
|---|---|---|
| `waifu_sources` | PK source ID; attribution/terms-version reference/enabled | Source integration differs from permission to retain every asset |
| `waifu_source_images` | UQ source/source-image-ID; URL/metadata/credits/import time/removal state | Keep per-source provenance even when bytes deduplicate |
| `waifu_assets` | PK ID; media asset, source-image relation/hash/state | Shared bytes can carry multiple credits/removal obligations |
| `waifu_cards` / card versions | Card ID/version; asset, collection number, rarity/element keys, integer stats, skill/passive version | Definition separate from owned instance; historical combat uses immutable version |
| `rarity_definitions` / `element_definitions` | Stable key/rules version; label/display, weights/chart refs | Configurable data; candidate eight tiers do not freeze final balance into SQL |
| `element_interactions` | PK rules-version/attacker/defender; scaled integer multiplier | Complete/defaulted chart verified; deterministic denominator/rounding |
| `user_cards` | PK instance ID; owner/card-version/serial/level/XP/state/revision/acquired time | One owner; UQ serial under declared edition scope; index owner/state/ID |
| `card_favorites` | PK user/owned-card | Owner only; transfer invalidates previous favorite |
| `asset_reservations` | UQ asset-kind/owned-asset-ID; owner/operation/type/revision/expiry | One active reservation across exclusive uses; release requires matching operation |
| `card_ownership_events` | PK ID; instance/from/to/operation/time | Append mint/transfer/burn provenance; artwork removal preserves ownership/history |
| `card_drops` / claims | Drop ID, guild/channel/rules/card-version/window/state; unique winner | Claim checks eligibility and state atomically; parallel users cannot both win |

Deleting artwork tombstones the source, removes/replaces bytes and retains card usability/history. It must not cascade delete owned cards or combat results. Hash deduplication must preserve each source's attribution. A catalog definition is not the sellable instance. [TCG](waifu-tcg.md) owns art-removal UX, rarity choice and elemental rules.

### Equipment, consumables, energy and progression

| Proposed records | Keys and fields | Invariant / query |
|---|---|---|
| `game_items` / versions | Stable code/version; type/subtype/rarity, bounded stats/perks/effects, shop/trade flags | Versioned content, no executable arbitrary formula |
| `user_inventory_items` | PK equipment instance; owner/item-version/enhancement/state/revision | Unique equipment quantity one; stackable items use explicit stack model |
| `inventory_stacks` | UQ owner/item/version; available/reserved quantity | Nonnegative counts; conditional reservation/consumption |
| `card_equipment` | PK owned-card/slot; item instance/owner/revision | UQ equipped item; owner/slot compatibility; atomic state/reservation updates |
| `item_enhancement_attempts` | Unique request; item before/after, material/ledger refs, RNG/rules/result | Resource consumption and outcome once; retry cannot reroll |
| `player_energy` | PK user/scope; regular E, bonus B, cap/rules version, last UTC reset date/revision | Once per UTC day E becomes max(E, max(0, C-B)); spend B first; cap decrease preserves excess as B; capacity uses max(1, global level), without changing XP/display level |
| `energy_transactions` | PK ID; unique source; before/after/delta/reason/rules | Spend/replenish/refund trace; refund identity blocks double restoration |
| `game_achievements` / versions | Code/version; requirement/target/reward-bundle/visibility | Freeze version for progress/claim policy |
| `user_achievements` | UQ user/achievement/season-or-global-scope; progress/unlock/claim | Unlock and claim distinct; reward grant atomic with claim |
| `dungeon_seasons` | PK season; window/rules-content-version/theme/affix/scaling | Published content immutable for active runs |
| `dungeon_floors` | UQ season/floor/content-version; energy/gates/enemies/rewards | Positive ordering, valid refs, first-clear/boss rules explicit |
| `dungeon_runs` / turns | Run ID, user/season/floor/content, squad/RNG, state/revision; unique turn sequence | Start energy and run atomic; replay deterministic; finish/reward once |
| `user_dungeon_progress` | UQ user/season; highest clear/counts/first-last-clear | Monotonic under accepted rules; does not alone prove each first-floor reward |
| `dungeon_clear_rewards` | UQ user/season/floor/reward-kind; run/receipt | Parallel runs cannot duplicate first-clear award |

A potion consumption links inventory and energy/combat effect identity; it is not a UI decrement. Store rules/version/result before acknowledgement. Reset date is tied to persisted timezone/period, not unspecified server midnight. Energy values, scaling formulas and rarity weights remain game-design candidates requiring simulation/playtesting; the database provides deterministic storage, not balance validation.

### Trade, marketplace, player guilds and games

| Proposed records | Keys and fields | Invariant / query |
|---|---|---|
| `card_trades` | PK ID; parties/offer-revision/state/expiry/accepted-revision/receipt | Offer edit invalidates prior acceptance; settle only current offer |
| `trade_assets` | PK trade/side/kind/asset; quantity/reservation | Normalize asset rows, not trusted ID arrays; check owner/reservation |
| `trade_currency_offers` | PK trade/side/currency/scope; units/hold | Cancel/expire releases matching hold; settlement links ledger |
| `market_listings` | PK ID; seller/asset-reservation/price/currency/scope/fee-version/state/expiry/revision | One reserved asset; buy/cancel/expire contend on same state |
| `market_purchases` | UQ listing for single-item sale; request/buyer/ledger/ownership/fee | Ownership/payment/fee atomic; retry returns original purchase |
| `waifu_guilds` | PK player-guild ID; normalized name/leader/XP-level/account ref | Distinct from Discord guild; treasury uses ledger rather than independent mutable balance |
| `waifu_guild_members` | PK player-guild/user; rank/contribution/joined | Global single-membership UQ only if game rules choose it; leader transfer atomic |
| `waifu_guild_permissions` | Rank/policy-version/capabilities/spending ceiling | Membership not arbitrary treasury authority |
| `quests` / user instances | Template/version; user/period/progress/expiry/receipt | UQ user/template/period; source-event dedup and reward once |
| `bosses` / instances | Content/version plus instance/scope/window/HP/revision | Atomic damage, no negative HP or duplicate final-kill settlement |
| `boss_runs` / contributions | UQ request/run; instance/user/replay/applied-damage/reward | Simulated versus applied damage distinct; eligible contributors recorded |
| `mini_games` | Optional code-registry snapshot | Execution remains code; persist rules version per session |
| `game_sessions` / moves | ID/game-version/scope/parties/state/revision/deadline/wager-holds; move sequence | Authorized turn, stale control rejection, timeout/settlement once |
| `game_statistics` | UQ scope/user/game; wins/losses/ties and integer aggregates | Rebuildable from settled sessions; projection update cannot settle wager again |

Trade lock ordering covers participant accounts and all assets in canonical order. A listing references ownership instance, not catalog type. Player-guild spending requires account authority and records. Leader departure/deletion needs succession/freeze policy instead of orphaning a bank. Offer revision and durable holds are necessary beyond an `IN_TRADE` flag.

### Guild utilities and support records

| Proposed records | Keys and fields | Invariant / query |
|---|---|---|
| `reaction_roles` | UQ guild/message/component-or-emoji/role; channel/enabled/version | Same-guild role, assignable at effect time |
| `auto_voice_configs` | Guild/generator key; parent/category/template/limits | Validated channels/roles; bounded creation |
| `auto_voice_instances` | PK created channel; creator/config-version/lifecycle/cleanup job | Restart identifies owned channels; never delete unrelated channels |
| `reminders` | PK ID; owner/destination/body/due/recurrence-version/state/job | Durable acceptance; each recurrence unique; permission before delivery |
| `welcome_configs` / `farewell_configs` | Guild key; channel/template/assets/enabled/revision | Validated mentions/media; limited departed-member retention |
| `analytics_aggregates` | PK metric/scope/time-bucket; integer counters | Bounded aggregates rather than indefinite raw private activity |
| `profile_preferences` | User key; selected owned card/background asset/preferences/revision | No other user's equipment; raw image URL is not permanent trusted media |

## 5. Integrity, retention and recovery review

### Query/index design

Each proposed index needs an identified query and representative `EXPLAIN` evidence when implemented. Tenant filters normally lead tenant-local history indexes. Stable tie-breakers belong in pagination. Unique keys enforce identity, not just speed. Index FK columns used for joins/deletion, while measuring write amplification before adding every filter combination. JSON scans cannot substitute for normalized ownership/due/recipient keys.

Collections use owner/state/ID and bounded catalog joins; market browsing needs active-state/currency/price/ID with explicit sorting. No single index accelerates every search. Job claims use due-state/time and bounded batch size. Ranking queries use published snapshot IDs; rebuilds are background work, not all-user scans per profile request. Retain a diagnostic query catalog with fixture scale and plan evidence as domains are added.

### Retention policy

No foundation audit-pruning or retention worker exists. Future policies identify data class, administrator authority, default duration, minimum evidence horizon, deletion scope and resumable cleanup. Durations remain decisions rather than invented compliance guarantees.

Private AI messages/prompts need expiry and scoped deletion; minimal tool receipts may need separate retention. Notes/reasons differ from moderation outcomes. Economy/ownership history and active settlement identities must not vanish through a user FK cascade. Provider payloads and import quarantine need restricted access and post-verification retention. Secret row deletion does not erase ciphertext from every backup.

Artwork removal separates provenance tombstone, payload and ownership. Completed job payloads may be minimized while request identity survives the replay horizon. Every deletion test includes active/held/referenced records and interrupted cleanup. Domain policy should choose whether personal fields are removed, pseudonymized or retained for a stated purpose without corrupting balancing/ownership relationships.

### Failure and recovery matrix

| Condition | Required response |
|---|---|
| Unknown/legacy schema | Refuse foundation migration; use separate target/reviewed import |
| History/checksum mismatch | Stop, inspect trusted release/backup; never overwrite checksum to bypass |
| Live drift with valid history | Ledger insufficient; inspect actual DDL/integrity and reconcile/restore |
| Busy/lock/deadlock | Bounded operation-aware retry; no blind external repetition |
| Lost reply after possible commit | Lookup receipt/revision before resubmitting |
| Audit/ledger failure | Roll back coupled state; no success acknowledgement |
| Orphan staged media | Resume verified reference commit or controlled unreferenced cleanup |
| Old queued content version | Resolve stored version or quarantine; no silent latest-rules substitution |
| Restore older DB after external sends | Reconcile delivery window before workers resume; restore cannot undo Discord |

## 6. Validation gates

The [shared settings contract](../packages/database/test/settings-contract.ts) tests explicit/idempotent migration, nested values, snapshots, concurrent creation/update and invalid inputs on both real adapters. [SQLite tests](../packages/database/test/sqlite.integration.test.ts) additionally cover missing-path diagnostics, reopen persistence, immutable legacy bytes, checksum/incomplete-schema refusal, audit rollback and in-memory isolation. [PostgreSQL tests](../packages/database/test/postgres.integration.test.ts) isolate test schemas and cover foreign-schema refusal/audit rollback. [Migration tests](../packages/database/test/migrations.test.ts) verify object/history/revision guards.

Follow [testing](testing.md) for commands and exact evidence. PostgreSQL requires `TEST_POSTGRES_URL` to a dedicated test DB where the role may create/drop isolated schemas; absence explicitly skips cases. SQLite success is not PostgreSQL certification. Existing concurrency cases are not a measured multi-process production load test.

Before exposing a proposed domain, require both-dialect upgrade tests, tenant/FK/check/unique rejection, integer overflow/serialization, concurrent debit/claim/buy/cancel/expiry, same-key/different-payload conflict, rollback injection, replay/version checks, representative query plans and restore/external reconciliation. Schema review precedes consumer implementation. Record commands/database versions/skips; this design does not install or certify future tables.
