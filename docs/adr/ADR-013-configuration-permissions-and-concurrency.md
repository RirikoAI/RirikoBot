# ADR-013: Shared settings, permissions and concurrent edits

## Status and scope

Accepted and implemented for foundation settings, prefix/module service operations, command access checks, revisioned persistence and bounded cache. A complete policy editor, user/provider preference hierarchy, dashboard controls, immediate cross-process invalidation and legacy settings import remain future work. Relevant blueprint requirements: BP-07–09, BP-43, BP-47, BP-54, BP-59, BP-62, BP-72–77.

## Problem

Legacy settings are loosely typed key/value rows and command permission checks vary by handler/transport. Bot, CLI and future dashboard could otherwise disagree on allowed changes or overwrite one another. Reading the database for every command/message increases work, while an indefinite cache hides policy changes. A generic last-layer-wins configuration merge would allow personal/invocation preferences to weaken guild restrictions. Optimistic database writes alone also do not detect a user's stale browser form unless the caller carries its displayed revision.

The design must distinguish four facts: authentication of the caller, authorization of the operation, validation of requested values and concurrency of persistence. A validated JSON body establishes none of the first two. A bot-owner flag is not guild-manager authority. A valid database revision is not consent to reapply a stale edit.

## Options and decision

| Option | Advantage | Failure mode / tradeoff |
|---|---|---|
| Independent settings code per transport | Locally simple handlers | Drifting validation, permissions and audit behavior |
| Shared types, direct repository writes everywhere | Less schema duplication | Types do not enforce operation authorization; every caller must reproduce policy |
| One shared service and revision-aware store | One mutation boundary and consistent validation | Authenticated adapters still need independent identity checks; chosen |
| Read DB on every access | Fewer stale cache reads | Adds latency/load; still does not make external Discord permission and DB state atomic |
| Indefinite cache or mandatory Redis invalidation | Lower read traffic / possible cross-process fanout | Indefinite revocation delay or new availability/coordination dependency |
| Short bounded local cache plus fresh mutation reads | Simple foundation with documented staleness | High-impact future actions require stronger freshness explicitly; chosen |

Use core `ActorContext`, `GuildSettings`, `CommandPolicy`, `ModuleDefinition` and `GuildSettingsStore`. Applications construct a shared `SettingsService`; commands and operator mutations call it. Database adapters atomically save a revision and its audit record. Detailed request traces and future field resolution belong in [architecture](../architecture.md).

## Contract catalog

| Contract / field | Current rule | Meaning and limit |
|---|---|---|
| `ActorContext` | User ID, optional guild/channel, role IDs, actor/bot permission names, owner flag | Trusted adapter output; never user/model supplied authority |
| `guildId` / actor IDs | String of 1–20 decimal digits | Syntax check only; transport establishes real identity/scope |
| `prefix` | 1–16 JavaScript string code units; no whitespace/control characters | One guild prefix; no channel/user prefix override |
| `modules` | Name-to-boolean map; service toggles installed IDs only | Stored data does not load executable code |
| `commands` | Canonical-name-to-policy map | Aliases resolve to the same policy; complete editing surface is not implemented |
| `allowedRoleIds` | Up to 100 syntactically valid IDs | Empty/absent means no added role restriction; nonempty requires any matching role |
| `channels` | Channel-ID-to-boolean map | Only explicit false denies; true is not an exclusive allowlist |
| `revision` | Nonnegative bounded integer; zero for defaults | Store increments on save; revision rollover is rejected |
| `get(guildId)` | Return stored settings or absence | Absence permits defaults; failed read must propagate |
| `save(settings, expectedRevision, actorId)` | Validate matching input revision; conditionally write next revision plus audit | Conflict never silently overwrites another writer |

Schemas are strict at settings/policy object boundaries. Preserve unknown legacy data in migration staging rather than dropping it to satisfy the new schema. Module/command maps are extensible keyed structures, but an unknown persisted module flag does not make an uninstalled feature available. Source contracts: [contracts.ts](../../packages/core/src/contracts.ts), [settings.ts](../../packages/core/src/settings.ts), [validation.ts](../../packages/database/src/validation.ts).

## Authentication and authorization by entry point

The Discord adapter fetches actor/bot members and the channel, then constructs effective permissions and roles. The dispatcher verifies command policy. A settings mutation requires `ManageGuild` or `Administrator` in the service as well. `isOwner` alone never bypasses that check. `Administrator` satisfies named permission requirements but does not bypass Ririko module, command or configured-role restrictions.

The CLI is explicitly a trusted local deployment interface. Its administrative actor uses the first `BOT_OWNER_IDS` entry for attribution and supplies `ManageGuild`; it does not prove that ID has current guild membership through Discord. Access to the host/config/database is its trust boundary. This must be documented rather than falsely describing all transports as freshly authenticated guild managers. See [CLI source](../../apps/cli/src/cli.ts).

A future dashboard must authenticate a server-held session, validate CSRF/origin, obtain current Discord guild permissions and construct its own actor for every mutation. It must not call the CLI actor factory or accept `isOwner`/permissions from the browser. A future AI adapter likewise binds the authenticated human actor independently of tool arguments, then calls the same authorized service.

Target moderation/role operations add actor and bot hierarchy checks. Permission bits alone do not authorize acting on any member. The existing helper in [permissions.ts](../../packages/core/src/permissions.ts) is not a complete moderation workflow; fetch current target state and test protected targets, equal roles and guild-owner behavior before exposure. [Discord permission/hierarchy reference](https://docs.discord.com/developers/topics/permissions).

## Policy resolution and recovery

Current settings resolve operator default prefix and installed-module defaults into persisted guild settings. Essential core is forced enabled when read and cannot be disabled with `setModule`. This keeps the administration module available, but does **not** override an individual disabled `help` or `prefix` policy. The current CLI edits prefix/module state only and cannot repair every possible command-policy field. A future full policy editor must ship with a deliberate authenticated operator recovery path before it can lock administrators out.

Policy is restrictive composition: built-in command permissions AND module enabled AND command enabled AND any role/channel restriction. A channel entry of true never overrides command disabled; an allowed role never replaces `ManageGuild`. Example: a member in the allowed role but without Manage Server still cannot run `prefix`. A bot owner in a channel explicitly denied by policy also cannot run the command through Discord.

For future preferences, field-specific delegation replaces an unrestricted merge. Timezone may choose the most specific valid preference; quota ceilings must remain within administrative limits; provider choice must remain within operator/guild enabled capabilities. Secrets are server-side references with separate usage authority. None of these proposed fields exist in the foundation schema, and the ordering must be defined per field before implementing them.

## Cache and concurrent write semantics

`SettingsService` uses a five-second default TTL and at most 10,000 guild entries. It validates retrieved rows, checks guild scope, fills installed defaults and returns a defensive copy. Expiry is checked when read. Capacity eviction removes an oldest insertion; it is not a comprehensive distributed cache or background refresh service.

Local mutation deletes its cache entry before obtaining a fresh value and again in `finally`. An uncached DB failure rejects the operation rather than substituting default permissions. An unexpired cache hit can still serve during an outage. Another process's edit may remain unseen until a fetch after expiration. Concurrent in-flight reads can complete after invalidation; therefore neither invalidation nor TTL establishes linearizable policy reads. Future dangerous actions must define a stronger effect-time policy check and revocation tolerance.

### Worked race

| Step | Writer A | Writer B | Durable result |
|---|---|---|---|
| Read | Settings revision 12 | Settings revision 12 | Revision 12 |
| Prepare | Set prefix `?`, expected 12 | Toggle optional module, expected 12 | Unchanged |
| Commit A | Conditional update + audit succeeds | Waiting/racing | Revision 13; one audit row |
| Commit B | Finished | Expected revision no longer matches | Conflict; no second write/audit |
| Resolve | — | Reload current settings, review intended change, retry deliberately | New accepted save can become revision 14 |

SQLite performs settings work in an immediate transaction; PostgreSQL conditionally updates `WHERE guild_id AND revision` within a transaction. Initial insert uses conflict-safe insertion. The audit row records actor, guild, before/after revisions, before/after settings and timestamp. If audit insertion fails, the settings change rolls back. Both adapters satisfy the shared behavior contract; they do not claim identical SQL or lock semantics.

### Browser revision gap

The current public methods are `setPrefix(actor, prefix)` and `setModule(actor, moduleId, enabled)`. Their fresh read protects against overlapping repository writes but carries no revision from the caller's earlier read. If a dashboard opens revision 12, another admin commits 13, and the form submits later, the service can read 13 and apply stale intent without a conflict.

Before dashboard editing, extend the application contract with an explicit expected revision or equivalent precondition from the displayed state. Compare it before persisting and return a conflict containing safe current values. The UI should preserve the user's draft, show the changed fields and require explicit reapplication. Do not silently retry a whole stale snapshot, and do not implement this proposed API merely by calling repository writes directly from a web route. No such API is claimed implemented here.

## Failure and audit policy

| Failure | Current/required outcome | Operator or client action |
|---|---|---|
| Invalid prefix / unknown module | Typed validation/not-found error; no write | Correct request; no retry loop |
| Missing guild / insufficient permissions | Guild-only/forbidden; no write | Use authorized context |
| DB read fails or scope mismatches | Fail uncached access; no permissive default | Investigate DB/config, preserve old durable data |
| Concurrent update conflict | No overwrite; no false success | Reload/review and deliberately retry |
| Audit insert fails | Roll back settings | Treat operation as failed; inspect DB availability |
| Discord acknowledgement lost after commit | Database may already contain update | Read current state; do not auto-undo |
| Future queued action outlives permission | Reauthorize before new effect | Cancel/reject with durable reason when no longer allowed |
| Core command policy prevents recovery | Essential module alone is insufficient | Future policy editor must include reviewed recovery; no fabricated CLI command today |

Audit actors express the adapter's authenticated identity model; they are not cryptographic signatures of a human. Ordinary settings audit rows must never carry API keys or decrypted secrets. The current schema contains no secret fields. Credential lifecycle and redacted metadata belong to the [dashboard/secret design](../dashboard.md).

## Acceptance and reconsideration

Existing evidence includes [core tests](../../packages/core/src/core.test.ts), [dispatcher tests](../../packages/discord/src/dispatcher.test.ts), [gateway tests](../../apps/bot/src/gateway.test.ts) and the [shared dialect settings test contract](../../packages/database/test/settings-contract.ts). Exact run results are in [testing](../testing.md), not inferred from file existence.

Acceptance requires owner-versus-manager checks; alias policy identity; guild/channel/role/module restrictions; defensive copies and expiry; no default-on-error; scope/schema rejection; concurrent first-create/update conflicts; atomic audit rollback; and nonsecret errors. Future acceptance additionally covers stale displayed forms, policy recovery, fresh web authorization/CSRF, queued revocation and multiple process/cache races. These future scenarios are not certified by existing foundation tests.

Revisit the cache when measured read traffic or required revocation latency cannot tolerate current behavior. Revisit the mutation API before dashboard/full policy editing. A stronger invalidation scheme must specify missed notifications and restart behavior; adding Redis alone does not solve them. Changes to settings shape need migrations, mixed-version reader/writer compatibility and an operator rollback plan. Preserve legacy raw values until mappings are verified. See [database ADR](ADR-003-database-layer-and-dual-dialect-orm.md), [dashboard ADR](ADR-008-web-dashboard-architecture.md) and [migration plan](../migration-1.x-to-2.0.md).
