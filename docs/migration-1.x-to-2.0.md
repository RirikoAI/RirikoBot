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
