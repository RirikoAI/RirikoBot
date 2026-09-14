# Ririko 1.4.0 to 2.0 migration design and runbook

Status: audited design. This document does not claim a production importer exists or that production data has been migrated. Foundation schema migration is a separate operation and must refuse a legacy database. Cutover requires every retained feature importer and a rehearsal with representative operator data.

Audit date: 2026-09-14. Source: [RirikoAI/RirikoBot master at 0d8be25b17e25dfa61812d6e7b5aaf8497687257](https://github.com/RirikoAI/RirikoBot/tree/0d8be25b17e25dfa61812d6e7b5aaf8497687257), package version 1.4.0. The audit clone `.audit/RirikoBot` and any `.local/RirikoBot` checkout are read-only. Source paths below are relative to that pinned legacy repository.

## Evidence and limitations

All 17 entities, 12 historical SQL migrations, persistence services, environment configuration, deployment mounts, giveaway storage and application state were examined. [The data manifest](legacy-data-manifest.json) records migration hashes and exact final DDL: 108 columns, defaults, nullability, indexes and 11 foreign keys.

The static `queryRunner.query` SQL literals in migration `up()` methods were replayed against an empty in-memory SQLite 3.50.4 database with foreign keys enabled. Result: 17 application tables, `integrity_check = ok`, no FK violations. This verifies empty-schema SQL replay only. It does not execute TypeORM, its migration ledger, entity synchronization, populated upgrades or a 2.0 importer. Legacy `src/database/migrations.spec.ts` mocks SQL calls rather than validating a real database.

No representative SQLite database, deployed schema or `giveaways.json` was supplied. Production counts, malformed values, custom keys, duplicates and active giveaways remain unknown. Never substitute sample counts for measured results.

The deployed database is authoritative: `DATABASE_SYNCHRONIZE` is configurable and database configuration accepts non-SQLite types. Inspect schema, storage types and TypeORM migration history before selecting an adapter. Unexpected tables/columns or a different dialect stop import until mapped; they are not silently ignored.

## Locate and preserve every source

| Source | Observed location and evidence | Treatment |
|---|---|---|
| Local SQLite | `.env.example`: `DATABASE_TYPE=better-sqlite3`, `DATABASE_NAME=ririko.db` | Resolve actual process environment and working directory; do not assume `database.sqlite`. |
| Compose SQLite | Both Compose files mount `./data:/app/data`, database `/app/data/ririko.db` | Capture consistent database backup including required journal state. |
| Render SQLite | `render.yaml`: mounted disk `/data`, database `/data/ririko.db` | Capture disk and actual deployment configuration. |
| Giveaways | `giveaways.service.ts`: `./giveaways.json`; Docker working directory `/app` | Obtain from running deployment before replacing its container. `/app/giveaways.json` is outside both supplied persistent mounts. Absence does not prove no giveaways existed. |
| Credentials | Deployment environment, `.env`, `configuration`, TLS key/cert files | Secure backup and vault/env transfer; never expose values in reports or ordinary settings. |
| Media | `assets/`, custom profile/welcome/farewell URLs, item images, Discord attachments | Preserve local custom files with checksums and source URLs. URLs are not content backups. |
| DB metadata | TypeORM migration history, `sqlite_sequence`, possible query cache table | Archive provenance and sequence values; rebuild caches. Do not import TypeORM history as Drizzle history. |
| External services | Ollama models, optional Lavalink configuration, provider accounts | Record deployment references; these are not embedded in SQLite. |

Legacy Docker startup runs migrations, seed runner and the bot. Do not start it against an audit copy: it can modify schemas and send Discord events. The checked-in seed runner has no seed actions; customized deployments still need inspection.

## Complete table mapping

Target names are proposed domain destinations, not assertions that these schemas/importers exist. Every row requires a tracked destination or recoverable preservation record. A preserved but unresolved required feature record prevents successful cutover.

| Legacy table | Complete source columns | Destination and transformation |
|---|---|---|
| `user` | `id`, `username`, `displayName`, `backgroundImageURL`, `karma`, `coins`, `pointsSuspended`, `commandsSuspended`, `doNotNotifyOnLevelUp`, `warns`, `createdAt`, `updatedAt` | User profile, global economy account and preferences. Preserve all fields; `coins` is exact opening wallet, `karma` exact historical XP/karma. Invert only the explicitly renamed notification preference. |
| `guild` | `id`, `name`, `prefix` | Guild identity/settings. Preserve exactly. No historical owner/join date is stored. |
| `guild_config` | `id`, `name`, `value`, `guildId` | Preserve all raw rows, then project recognized settings. Unknown keys and duplicates survive. |
| `configuration` | `applicationId`, `twitchClientId`, `twitchClientSecret`, `stableDiffusionType`, `stableDiffusionApiToken` | Provider metadata and encrypted credentials, retaining application scope. Secure transfer is required; plaintext settings copies are prohibited. |
| `user_note` | `id`, `note`, `createdBy`, `createdAt`, `updatedAt`, `guildId`, `userId` | Moderation notes retaining actor, content, target, scope and dates. ID is an integer despite its TypeScript string declaration, not a UUID. |
| `voice_channel` | `id`, `name`, `parentId`, `guildId` | AVC generators/managed channels. String `parentId='0'` means generator; other values identify generator voice channels, not Discord categories. Null remains unknown. |
| `music_channel` | `id`, `name`, `guildId` | Dedicated music-channel configuration. No persisted player-message ID or volume. SQL permits multiple rows per guild. |
| `playlist` | `id`, `name`, `userId`, `author`, `authorTag`, `public`, `plays`, `createdAt`, `updatedAt` | Music playlists preserving ownership, visibility and metadata. No `guildId`. Writer stores `author=interaction.user.id`, not a display name. |
| `track` | `id`, `name`, `url`, `playlistId` | Playlist entries preserving IDs, URLs, relation and duplicates. No position column or explicit eager-load ordering exists. Ascending legacy-ID import order is a documented approximation. |
| `stream_subscription` | `id`, `twitchUserId`, `channelId`, `createdAt`, `updatedAt`, `guildId` | Twitch subscriptions with original identifier/destination. `twitchUserId` stores a streamer login, not a guaranteed numeric provider ID. |
| `stream_notification` | `id`, `twitchUserId`, `channelId`, `streamId`, `notified`, `createdAt`, `updatedAt`, `guildId` | Preserve notification history. Sender stores `user_name` display name here. Derive future deduplication per platform/session/guild/channel without deleting duplicate history. |
| `twitch_streamer` | `twitchUserId`, `isLive`, `createdAt`, `updatedAt` | Preserve status snapshot then mark stale. Audited poller does not use this repository as truth; old live state must not cause a fresh alert. |
| `reaction_role` | `id`, `messageId`, `emoji`, `roleId`, `guildId` | Preserve bindings and exact Unicode/custom emoji form. No channel ID is stored; reconcile message locations without discarding unresolved rows. |
| `reminder` | `id`, `userId`, `channelId`, `guildId`, `message`, `scheduledTime`, `sent`, `timezone`, `createdAt`, `updatedAt` | Durable reminders preserving UUID string, destinations, instant, timezone and sent state. There is no `repeat` field; recurrence is new. |
| `free_game_notification` | `id`, `gameId`, `gameName`, `source`, `notified`, `guildId`, `createdAt`, `updatedAt` | Preserve notification state/identity. Epic uses `id`, `productSlug` or `urlSlug`; Steam uses URL. Do not coerce all game IDs to numbers. |
| `item_category` | `id`, `name` | Item categories with retained identity. |
| `item` | `id`, `name`, `price`, `description`, `rarity`, `hidden`, `purchaseLimit`, `purchasable`, `sellable`, `findable`, `imageUrl`, `createdAt`, `updatedAt`, `categoryId` | Catalog with every flag, limit, rarity, price, image and relation. This is not ownership inventory or the new TCG catalog. |

Keep Discord snowflakes as decimal strings through drivers, JavaScript and JSON. Most internal IDs are SQLite autoincrement integers; reminders use UUID strings. Preserve IDs where feasible, otherwise retain unique `(sourceSnapshotId, table, sourcePrimaryKey) -> targetId` mappings including source key type. Verify child references and advance target identity sequences after explicit-ID import.

Legacy FKs use `NO ACTION`; most relationships are nullable. Final SQL makes `stream_notification.guildId` and `free_game_notification.guildId` non-null. Playlist owners, reminder destinations and note authors do not all have FKs. Never invent users/guilds, cascade-delete or silently null invalid relationships to satisfy the target. Preserve/report orphan rows and resolve before activation. Detect PostgreSQL-incompatible values such as text containing NUL; never silently sanitize them.

### Economy and profile meaning

Coins and karma are global per user. There are no per-guild balance/XP histories, bank balances, transaction ledger or inventory ownership rows. Import one opening position, not one copy per guild. New local accounts use documented new-system defaults; historical guild ranks cannot be reconstructed from these tables.

Opening ledger entries describe migration initialization with provenance and a system opening account; they do not fabricate past transactions. Validate storage type and exact integer range. Negative, fractional, oversized or malformed values block activation rather than being rounded, clamped or reset. `warns` is an aggregate, not evidence for invented cases or automatic punishment.

`ProfileExtension.getUser()` uses Discord account creation time for `createdAt`; do not relabel it as bot registration. Some playlist writers pass `Date.now()` to datetime properties: inspect SQLite storage classes and normalize recognized encodings only. Record assumptions for naive dates; never apply reminder timezone twice to an absolute instant.

`EconomyUtil.getCurrentLevel()` compares karma to individual thresholds, while progress display uses cumulative thresholds. Preserve karma and compatibility level calculation until a separately documented leveling change rather than silently changing existing ranks.

### Guild settings

`guild_config` has an integer PK, non-null name/value, nullable guild ID and no `(guildId,name)` uniqueness. Legacy `.find()` is unordered. Conflicting duplicates are ambiguous; last-row-wins is not a lossless policy.

| Exact key | Encoding | Projection/absence behavior |
|---|---|---|
| `welcomer_enabled`, `farewell_enabled` | Strings `true` / `false` | Typed toggles; missing means off in event handlers. Report other values. |
| `welcomer_channel`, `farewell_channel` | Discord ID string | Preserve destination, reconcile missing channels. |
| `welcomer_bg`, `farewell_bg` | Image URL | Preserve reference and separately verify media. |
| `karma-notification-enabled` | `enabled` / `disabled` | A row must exist and differ from `disabled` for legacy notifications; missing means off. Report malformed values before stricter interpretation. |
| `ai_model` | Opaque model name | Override paired with source `AI_SERVICE_TYPE`; absence uses provider default. |
| `stablediffusion_model` | Opaque Replicate model name | Preserve backend/model pairing, no automatic preset replacement. |
| `twitch_channel` | Discord ID string | Default for future subscriptions; existing subscription channel IDs remain authoritative. |
| `freeGamesChannelId` | Discord ID string | Presence enables alerts; removal disables them. |

Preserve unknown keys under protected migration provenance without executing them. Equal duplicate rows may project to one setting only if all raw rows have mappings. Conflicts require explicit resolution records. New prefix restrictions must report incompatible existing prefixes before activation.

### Credentials

Dropping `configuration` without securely transferring its secrets loses functionality. Transfer non-null credentials into an AES-256-GCM vault with external master key, unique nonce and authenticated application/provider identity, or an operator-managed secret store. Reports contain presence, source ID, destination reference and verification status only. Protect backups, rejected rows and raw archives; never export plaintext configuration rows in a public JSON report.

`ConfigService.getAllConfig()` reads `APPLICATION_ID` but creates rows using `DISCORD_APPLICATION_ID`. Inventory every application ID and resolve explicitly instead of selecting the first row. Preserve `stableDiffusionType` even though the image command directly constructs Replicate. Provider reauthentication/rotation follows verified transfer. The legacy backup remains unchanged under the documented secure retention policy.

## Flat-file, external and memory state

Giveaway import needs actual deployed JSON and the locked `discord-giveaways` storage format; no sample was available. Preserve the original file and unknown fields; map IDs, times, prize, winners/ended state and eligibility/reroll information where present. The configured reaction is 🎉. Participants may require fetching all reactions from original Discord messages: JSON alone must not be assumed complete. Missing messages, incomplete pagination or missing winner data block activation of affected giveaways. Dry-run/import never roll winners.

| State | Evidence | Cutover action |
|---|---|---|
| AI context | `ai.command.ts`: user-keyed `userPrompts` array with persistence TODO | Drain requests. No DB history exists; do not invent history by scraping private messages. New persistent sessions need correct user/channel/guild scope. |
| Image jobs | `imagine.command.ts`: `currentUserPrompts` array and provider requests | Drain/reconcile in-flight requests; no durable job/result ledger exists. |
| Music queues/volume | `music.service.ts`: guild volume/interval array and adapter state | Channels/playlists migrate; live position/queue/filter state needs a separate supported runtime export or drained shutdown. Reconcile Discord control messages. |
| Twitch auth | In-memory access token/login/retry state | Reauthenticate from transferred credentials. |
| Item discoveries | `items.extension.ts` only logs random finds; ownership write TODO | No inventory rows exist. Do not generate ownership from logs. |
| Games/collectors/pages | Command-level in-memory collectors | Finish/expire active interactions before switching deployments. |
| AVC ownership/permissions | DB linkage; Discord overwrites/membership | Preserve rows and reconcile actual channels. A cache miss alone is not proof of deletion. |

Free-games code records `notified=true` before sending; Twitch/reminders persist sent state after sending. Those flags are not proof of exactly-once external delivery. Preserve them, suppress historical replay and report ambiguous recent/pending rows. SQL rollback cannot undo external sends.

## Execution contract

Planned CLI interfaces below must only be advertised as working once implementation/tests exist. Foundation schema migration does not imply legacy import support.

```text
ririko migrate legacy --source <snapshot.db> --giveaways <snapshot.json> --dry-run
ririko migrate legacy --source <snapshot.db> --target <new-database> --plan <approved-plan>
ririko migrate verify --run <run-id>
ririko migrate rollback --run <run-id>
```

Use a new destination database/schema by default. Resolve paths, symlinks and hardlinks and reject source/target identity or unresolved aliases. Never run Drizzle creation in a detected 1.x database. Schema migrations and data import have separate checksummed histories.

### Backup and preflight

1. Inventory actual driver/schema/version, row/storage types, mounts, JSON, custom assets and application IDs. Unsupported source dialect/schema requires a dedicated adapter.
2. Rehearse on an isolated snapshot with Discord login, schedulers, provider jobs and network effects disabled.
3. At final cutover, stop new writes and drain old jobs. Freeze DB and giveaway JSON at the same application boundary; database-only live backup cannot make the separate file consistent.
4. Use SQLite backup API or coordinated offline snapshot preserving required journals. Never copy only a live DB and discard WAL, which can contain committed data. Open the resulting snapshot read-only; never checkpoint, VACUUM or migrate the original. See [SQLite backup API](https://sqlite.org/backup.html) and [WAL guidance](https://sqlite.org/wal.html).
5. Record hashes/sizes/schema fingerprint/history and JSON/media hashes. Restrict/encrypt backups and prove isolated restoration. Hash the frozen snapshot before/after import; compare original hashes only after writes have stopped.
6. Back up any existing target and rehearse restore. PostgreSQL `pg_dump` produces a consistent database snapshot; roles/cluster globals, media and secrets need separate backup. See [pg_dump documentation](https://www.postgresql.org/docs/current/app-pgdump.html).

### Dry-run and validation

Dry-run writes no application/source data and performs no external actions. It may write an explicitly selected redacted report or encrypted staging artifact. Source adapters use read-only connections. Do not use `immutable=1` as a shortcut for reading a live WAL database.

Build a versioned plan with per-table measured counts, transformations, errors and unresolved identities. Classify each row: ready, preserved awaiting resolution, securely transferred credential, or explicitly deprecated recoverable metadata. There is no silent `skip invalid` success path. Unknown columns, unsafe numeric conversions, conflicting settings, invalid required relations, unavailable active-giveaway data and missing required secrets block activation.

Bind the plan to snapshot hash and transformer version. Canonical checksums preserve null vs empty, text bytes, integer precision, timestamp encoding and duplicate multiplicity. Redact content from notes/credentials/conversations. Unknown input is never evaluated as SQL, code, shell commands or template expressions.

### Import, resume and concurrency

Maintain a run ledger and source-to-target mappings. Each batch transaction commits transformed rows, opening ledger entries and its checkpoint together. Unique source identity prevents duplicate replay. Interrupted transactions commit neither rows nor progress; activation waits for every batch to verify.

Same snapshot/transformer/target must produce the same IDs, values and counts. Changed snapshot means a new import decision. Conflicting target records fail: never overwrite post-import balances/settings via blind upsert. Explicit merge support requires before-images and separate tests; start with empty-target support. Serialize runs and exclude application writers until activation.

Load roots before dependent records: guild/user/category/playlist, then domain rows, projected settings, opening balances and paused jobs. Keep protected raw provenance; archiving rows alone does not satisfy functional parity.

### Independent verification and activation

- Read target independently of importer counters. Compare source identity multisets and canonical field checksums for all 17 tables, nullable FKs, duplicate tracks/settings, dates and item flags.
- Verify each user's exact coins/karma and opening-ledger accounting; equal aggregate totals alone cannot detect swapped users.
- Verify note content/author/scope, playlist ownership/visibility/multiplicity, reminder timezone/state, reaction binding IDs and AVC classification.
- Verify creator identities, destinations and notification evidence without sending. Explicitly reconcile ambiguous delivery states.
- Verify giveaway object coverage, participant completeness, ended/winner state and original message linkage. Test reroll behavior without changing production giveaways.
- Verify credential references/decryptability with redacted output and asset checksums. External provider tests are separate authorized actions.
- Verify source hashes unchanged, target constraints and sequence state, import/schema histories. Successful full migration requires no unresolved required records.

Run retained-feature staging smoke tests through both Slash and Prefix commands. Only one deployment may send events. Activate paused jobs after a reviewed reconciliation boundary to avoid replaying all overdue reminders/giveaways/streams at once.

### Rollback

Before activation, roll back the current uncommitted batch or discard the isolated target while retaining verified backups. Before 2.0 accepts writes or sends, stop it and restart the pinned legacy deployment against its unchanged source snapshot and giveaway file, preserving credential/env compatibility for the rollback window.

After 2.0 accepts writes, restoring 1.x would discard new balances/settings/notes/ownership. Rollback must refuse blind downgrade. Freeze both systems, back up new state, reconcile supported deltas and choose an explicit recovery plan. New TCG/trade/economy records may have no 1.x representation; forward repair may be the only lossless recovery. Discord messages, roles, voice channels and provider jobs require separate reconciliation.

TypeORM `down()` methods drop tables/columns; they are not this rollback strategy. Do not run legacy `migration:revert` to convert 2.0 data back into 1.4.0.

## Release gates still required

- Real importer/verifier with read-only enforcement, redaction, deterministic provenance and conflict handling.
- Fixtures for all 12 schema steps and customized/malformed schemas, nullable/orphan FKs, duplicates, Unicode, oversized integers, bad dates and secrets.
- SQLite/PostgreSQL integration tests: replay, fault after each checkpoint, changed source/transformer, target conflicts and interrupted credential transfer.
- Realistic giveaway JSON/participant fixtures and ambiguous reminder/Twitch/free-game delivery cases.
- Backup/restore rehearsal and proof dry-run/import/verify never change source files or external services.
- Sanitized representative operator DB and giveaway state, per-record comparison and working retained-feature smoke tests.
- Review of custom source extensions and measured cutover/rollback window. No migration-complete or zero-data-loss claim before these gates pass.

## Import implementation specification (planned)

The remainder makes the execution contract concrete for a future importer ticket. None of the run states, provenance tables, report fields or recovery operations below is implemented by the foundation CLI. They are separate from Scrum ticket statuses and the existing version-1 schema ledger. Follow [migrations.md](migrations.md) for what can actually be run today.

### Inventory, dependency order and activation tests

Import every source row into protected staging before projecting domain data. Staging order can be independent; application projection order must respect both actual foreign keys and semantic identity requirements. The audited 11 foreign keys are in [legacy-data-manifest.json](legacy-data-manifest.json); absence of a legacy FK does not mean any target identity is valid.

| Table | Projection prerequisite | Activation/reconciliation check beyond row count |
|---|---|---|
| `configuration` | Resolved application identity and secret destination | Every non-null credential transferred or explicitly resolved; backend type retained; no plaintext report |
| `guild` | None | Exact ID/name/prefix, including prefixes rejected by new validation |
| `user` | None | Exact per-user global coins/karma/preferences; distinguish account-created date semantics |
| `item_category` | None | Source integer identity and name preserved |
| `playlist` | Owner identity resolution; no source FK enforces it | User ID versus author/authorTag preserved, visibility/plays/dates unchanged |
| `twitch_streamer` | Provider identity resolution | Preserve original identifier/status as stale evidence; never replay a live alert from this snapshot |
| `guild_config` | Guild map when non-null | Every raw row represented; conflicting duplicate keys unresolved until explicit decision |
| `user_note` | Guild/user maps when non-null; separate author resolution | Exact note bytes, source integer ID, actor, scope and timestamps; no invented UUID/history |
| `voice_channel` | Guild map and second-pass generator links | Preserve `parentId='0'` roots, null unknowns and child generator references; reconcile Discord state without deletion on cache miss |
| `music_channel` | Guild map when non-null | Preserve multiple legacy rows; a future one-per-guild constraint needs conflict resolution |
| `track` | Playlist map when non-null | IDs, URLs and duplicate multiplicity; imported order labeled approximation because source has no position column |
| `stream_subscription` | Guild map when non-null; streamer login resolution | Destination preserved; unresolved login-to-provider-ID mapping blocks scheduling, not raw preservation |
| `stream_notification` | Required guild map; notification/session identity | Preserve every history row and original display-name identifier; no lossy deduplication of history |
| `reaction_role` | Guild map when non-null; external role/message checks | Exact emoji/role/message IDs; missing channel cannot be fabricated |
| `reminder` | Semantic user/guild/channel validation; no source FK | UUID, text, instant, timezone and sent state; recurrence must not be invented |
| `free_game_notification` | Required guild map | Opaque source-specific game ID, source, state and dates; suppress historical replay |
| `item` | Category map when non-null | Every price/flag/limit/rarity/image/date retained; no conversion into owned items or TCG cards |

Use two passes for relationships that reference another row of the same domain: preserve nodes first, then validate links. A null optional legacy relation remains null/unknown in provenance; it is not permission to attach the row to a convenient guild. A stronger target constraint needs a recorded resolution or a blocked activation. Do not temporarily disable foreign keys to hide invalid mappings.

### Snapshot identity and canonical rows

A source snapshot is a bundle: consistent database, giveaway file, schema/migration fingerprint, selected media and a protected deployment inventory. Give the bundle a stable ID derived from its manifest of file digests and capture boundary. The original files remain immutable. A new backup after more legacy writes is a **different snapshot**, even when filenames match.

A proposed canonical row encoding uses an ordered array of columns in the inspected source-schema order. Each value carries its storage type and a lossless representation:

```json
{
  "encodingVersion": 1,
  "table": "user",
  "primaryKey": [["id", "text", "100"]],
  "values": [
    ["id", "text", "100"],
    ["coins", "integer", "1250"],
    ["backgroundImageURL", "null", null]
  ]
}
```

This shortened synthetic record illustrates encoding only; an actual canonical row contains **every** source column. Integer payloads are decimal strings obtained without first passing through an unsafe JavaScript Number. Null and empty text remain distinct. Preserve text code points/bytes without trimming, Unicode normalization or date conversion. Blobs use a defined binary encoding; REAL values need an explicitly lossless representation and type inspection, not rounded JSON numbers. Preserve unexpected storage classes for review rather than coercing them into the expected SQL declaration.

Compute a raw-row digest from versioned canonical bytes. Separately compute an expected normalized projection digest after a named transformation; raw and transformed hashes should not be compared as though the representation were unchanged. Whole-table verification uses a deterministic **multiset** of source identities and row digests, retaining duplicate payloads and their multiplicity. Sort using a defined typed key order, not locale-sensitive text sorting or driver-dependent row order. Keyless/custom tables need a separately reviewed stable identity strategy; do not use unstable query offsets as durable keys.

Digests are integrity checks, not anonymization. Moderation text, credentials and other sensitive raw rows remain encrypted/access-controlled, including quarantine. Public/redacted reports contain IDs, counts and error categories; restricted keyed digests may be used for sensitive comparisons, with key identifiers recorded privately. Do not publish raw secret hashes that permit guessing, or store plaintext secret fields in an otherwise “redacted” staging dump.

### Proposed staging and run records

The exact physical schema must be reviewed alongside [database.md](database.md). The following logical records are requirements, not existing tables:

| Logical record | Required data and uniqueness |
|---|---|
| Import run | Run ID, snapshot bundle ID/digest, transformer/config version, target identity/schema version, operator, plan digest, state, creation/update times, lease/fencing generation |
| Source row | Snapshot/table/typed primary key, raw digest, encrypted payload reference, classification and transformation version; unique stable source identity |
| Mapping | Source identity → target entity type/ID, expected projection digest and applied target version; one source can map to several named target entities |
| Batch checkpoint | Run/table/key range, input digest/count, last committed typed cursor, target digest/count, transaction result and attempt metadata |
| Anomaly | Stable code, source identity/field, severity, required-feature impact, redacted explanation, resolution decision/actor/time and revalidation status |
| Secret transfer | Application/provider identity, source presence, deterministic transfer key, target vault reference/version and verification state; no secret value |
| Activation record | Verified run/plan/report digests, approved boundary, job reconciliation result, active deployment identity and first-write/send boundary |

Required uniqueness spans snapshot/table/key and target mapping role, not merely an attempt-specific run ID. Retrying the same bundle under a new process/run identifier must not mint a second opening balance. Every source row is classified as ready, protected pending resolution, securely transferred credential or explicitly deprecated recoverable metadata. “Archived” does not mean a required user feature works.

A useful run state model is `captured → inspected → planned → applying → verifying → verified → activated`, with `blocked`/`failed` outcomes preserving the last committed checkpoint. Resume returns to the interrupted phase only after the snapshot, transformer, target and approved plan still match. Activation is explicit. A successful dry-run does not authorize applying a changed plan, and successful import does not authorize starting schedulers.

### Dry-run and anomaly resolution

Dry-run opens the captured source read-only, checks source/target identity aliases, inventories actual schema, stages/validates all rows, and produces a plan without writing domain data or sending network effects. Report/staging writes require an explicitly selected protected location. It must not connect the bot, start TypeORM lifecycle hooks, roll giveaway winners, fetch remote media blindly or test paid provider calls.

Use redacted anomaly records with actionable codes rather than a single “bad rows” count:

| Candidate code | Meaning | Required resolution |
|---|---|---|
| `SOURCE_SCHEMA_DRIFT` | Extra/missing/type-changed column/table relative to supported adapter | Inspect deployment; add a reviewed adapter/mapping; no silent column dropping |
| `UNSAFE_INTEGER` | Fractional, negative where disallowed, malformed or out-of-range value | Preserve exact value and obtain domain resolution; never clamp/round/reset |
| `DUPLICATE_CONFIG_CONFLICT` | Same guild/key has competing values | Preserve all rows and record explicit chosen projection with provenance |
| `ORPHAN_REFERENCE` | Required target identity cannot be resolved | Restore missing evidence or define reviewed compatibility handling; no invented entity |
| `AMBIGUOUS_TIME` | Unsupported or timezone-ambiguous representation | Preserve raw value and document interpretation decision before scheduling |
| `SECRET_TRANSFER_REQUIRED` | Non-null legacy secret lacks verified destination | Secure transfer/reauthentication; affected provider cannot activate |
| `GIVEAWAY_INCOMPLETE` | Storage/message/entry/winner information insufficient | Reconcile with actual deployment and complete participant evidence |
| `DELIVERY_AMBIGUOUS` | A flag cannot prove whether a recent external send occurred | Separate operator reconciliation; never bulk replay historical jobs |
| `TARGET_CONFLICT` | Existing target does not match the intended idempotent projection | Stop; preserve both versions; no blind upsert over later writes |

Resolution records amend the transformation plan without altering the frozen source. Re-run validation and produce a new plan digest after any decision. Required unresolved anomalies block cutover; acknowledged missing optional metadata needs a precise, recoverable disposition rather than an unqualified “zero loss” claim.

### Apply, resume and transaction boundaries

Default to an isolated target containing only the approved schema, with application writers and workers excluded. Reconfirm the target database/schema identity, source bundle hashes and transformer/plan versions immediately before applying. A candidate initial batch limit is **500 rows or a configured byte limit, whichever comes first**; this is a tuning starting point, not measured throughput or a fixed universal transaction size. Large text/media references can make a row-count-only limit unsafe. Record observed transaction duration/bytes and tune within the reviewed plan.

For each batch, the target transaction must atomically persist domain rows, source-to-target mappings, opening ledger entries, anomaly dispositions relevant to the committed rows, and its checkpoint. Advance a cursor only after those writes succeed together. Never write a progress file first and infer the database commit later. Re-read the database checkpoint on restart; process output is not the authoritative receipt.

The resume key is the same frozen snapshot plus transformer/plan/target identity. Replay finds matching mappings and verifies target projections instead of reapplying rewards. Existing target content that differs is a conflict, not an invitation to overwrite it. Cross-table cursors follow the dependency order above. A changed source or transformation requires a new reviewed run/plan, with explicit treatment of existing target work.

The target needs a single active import owner across processes. For PostgreSQL, use a reviewed lock/lease protocol plus a monotonically increasing fencing generation checked in every batch transaction; a transaction-only lock released between batches cannot alone own the entire import. For SQLite, keep one local importer and short immediate write transactions, with ownership/fencing stored and checked in the target. Exclude application writers explicitly; a file lock or advisory lock does not cause unrelated application code to honor an import freeze. Leases require safe owner-death verification and stale-worker rejection before takeover.

Do not hold a database transaction open while waiting for Discord, fetching media or transferring secrets to an external vault. External secret transfer requires its own idempotent key and receipt: create/reuse the expected vault entry, then transactionally record the verified reference. If the process dies between those steps, reconcile the deterministic external reference before another transfer. Do not delete or rotate the source credential during import; rotation is a separately coordinated post-transfer operation.

| Crash/failure point | Durable outcome to detect | Resume/recovery |
|---|---|---|
| Before batch transaction | Previous checkpoint only | Reprocess next batch from frozen source |
| During rows, before mapping/checkpoint | Whole current batch rolls back | Retry after correcting cause; no reward counted from process memory |
| After commit, before CLI success output | Rows and checkpoint may already exist | Read committed checkpoint/mappings and verify; do not issue a second opening credit |
| Between tables | Prior dependency tables committed, later tables absent | Resume next verified cursor with jobs still disabled |
| During external secret transfer | Vault entry may exist without target receipt | Reconcile by transfer key/reference and verify access; never print the secret |
| During report write | Database verification state may exist without complete report | Regenerate the report from independent checks and bind its digest before activation |
| Owner lease expires while old process resumes | Two processes may attempt writes | Fencing rejects old generation; only reviewed owner continues |
| Failure after activation/new writes | Import baseline is no longer entire target state | Freeze, back up both generations and apply the post-activation recovery policy |

### Worked reconciliation example

These are synthetic values, not measured production counts. Three legacy users have:

| Source user ID | Coins | Karma | Required target opening state |
|---|---:|---:|---|
| `100` | 1250 | 80 | Global wallet 1250; historical karma 80 |
| `200` | 750 | 20 | Global wallet 750; historical karma 20 |
| `300` | 0 | 0 | Explicit zero opening position/preserved provenance |

The source coins sum is **2000**. Target user wallets must sum to 2000 and each user must match individually. A proposed double-entry initialization credits user balances by +1250/+750 and offsets them against a dedicated migration opening account by -2000, giving a balanced net movement of zero. The opening system account is not a user wallet; no bank balance or historical purchase is invented. Zero balances still need provenance even when the ledger policy omits a zero-value posting.

Swapping users 100 and 200 passes an aggregate sum but fails the per-user mapping/digest. Copying the same wallets into two Discord guilds creates 4000 and fails both scope and conservation. Splitting karma into two independently spendable reward fields would fabricate value; preserve the original meaning and derive any future display projections explicitly.

Assume two batches: users 100/200, then 300. If the first commits but the process loses its response, resuming must observe its two mappings and opening transaction, then process only the remaining user. A fresh attempt must still produce one opening transaction per mapped account. If source user 200 instead contains a malformed or negative value, report that row and block activation; do not publish an accepted-subset sum as the total migrated economy.

For configuration, suppose two raw rows express the same `welcomer_enabled=true` value. They may project to one typed setting only while both source IDs remain mapped/preserved. A third row for the same guild/key with `false` creates a conflict: choosing the largest ID as “latest” is unsupported by unordered legacy reads. The verifier checks raw row coverage separately from typed-setting count and requires a resolution record for the conflict.

A report should therefore include per-table source identities/count, mapped/preserved/unresolved counts, raw/projection digest results, per-user financial mismatches, FK violations, secret-transfer coverage and giveaway coverage. Do not compare total target row count with total source count: one user maps to profile, wallet and provenance records, while duplicate settings can map to one projection.

### Giveaway reconciliation and delivery boundaries

The audited service configures `discord-giveaways` storage at `./giveaways.json`, reaction 🎉, and `botsCanWin: false`. The package manifest specifies a version range; inspect the actual deployed lockfile/library format before parsing a production file. Do not assume the repository range proves the precise deployed storage version.

For every giveaway object, preserve unknown fields and classify active/paused/ended state, original message/guild/channel IDs, deadlines, prize, winner data, eligibility and reroll metadata where available. Store participant evidence as a separate capture with pagination/completeness status and capture time. Never deduce “zero entries” from a failed Discord fetch or a missing file. An ended giveaway without winner evidence is unresolved; dry-run cannot repair it by rolling again.

Database and JSON freeze together at an application boundary. Discord reactions can still change after the old process stops; define the cutover eligibility cutoff and final reconciliation explicitly. If historical entry timing cannot be reconstructed, record that uncertainty and obtain the operator's resolution instead of claiming an exact historical roster. Only authorized read operations should fetch original messages/entries; no import phase edits/deletes messages or announces winners.

Existing sent/notified flags have different crash windows: free-games marks notified before sending, while Twitch/reminders persist after sending. Preserve the flag and source evidence but do not reinterpret it as exactly-once proof. Separate imported historical records, pending future work and ambiguous recent events. Activation must leave unresolved/overdue work paused until its policy is reviewed, with bounded release of due jobs and one active sender.

## Cutover and restore decision record (planned operations)

A production rehearsal must produce an operator-approved run sheet with identities, artifacts and observed timing rather than a generic “take a backup” step. PostgreSQL dumps capture a consistent database snapshot but not all cluster globals or external files; capture required roles/configuration/media/secrets separately. SQLite snapshots must account for WAL/journals. Follow the official backup references above and test restoration with the deployed tool/engine versions.

| Checkpoint | Required evidence before proceeding |
|---|---|
| C0 — rehearsal ready | Importer/verifier exist; supported source schema; synthetic and representative fixtures; isolated network-disabled target |
| C1 — freeze | Old writers/collectors/jobs drained or explicitly reconciled; no competing 2.0 writer; giveaway/DB boundary and active external work recorded |
| C2 — capture | Immutable source bundle hashes, protected secret/archive references, backup sizes, storage headroom and successful isolated restore |
| C3 — plan | Full row coverage, approved transformations, no unresolved required anomalies, exact source/target/plan digests |
| C4 — import | Committed batch receipts and mapping coverage; workers remain disabled; unchanged source hashes |
| C5 — independent verify | Per-record and financial reconciliation, schema constraints/sequences, secrets, media, giveaways and retained-feature staging checks |
| C6 — activate | Actual operator cutover approval, one deployment identity, job-release policy and documented first new write/send boundary |
| C7 — observe | Critical slash/prefix flows, configuration persistence, notification ambiguity handling and health observed; rollback limitations acknowledged |

Measure capture, import, verification and restore duration on representative data before promising downtime. Define who can order a freeze and who verifies restoration. Record deployment commit, native/runtime versions, database engine/schema version, source bundle, target backup, vault key references and original giveaway file so another operator can reproduce recovery without chat history. Keep secret values outside the run sheet.

A restore rehearsal succeeds only when the restored isolated system opens the expected schema, passes integrity/reconciliation checks, resolves required secret references and can execute controlled retained-feature checks without reaching production Discord/provider destinations. Merely creating a dump file is insufficient. Record restore duration and usable recovery point as measurements, not assumed RTO/RPO claims.

Before any 2.0 write/send, the original source bundle and compatible legacy deployment can be the rollback boundary. After that boundary, never remove import-tagged rows and assume new data survives: new rows may reference imported users/items, and new balances may already incorporate transactions against opening funds. Freeze both versions, capture the current 2.0 state and external effects, then choose tested forward repair or a reviewed delta conversion. New TCG/ledger facts may have no legacy representation. TypeORM down-migrations and blind restore cannot provide lossless reversal of those facts.

The remaining blocker is concrete: there is no implemented full importer/verifier and no representative operator database/giveaway file or measured restore rehearsal. This documentation deepens the design; it does not remove those release gates or authorize a live cutover.
