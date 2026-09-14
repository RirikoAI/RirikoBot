# Command, help and interaction contracts

This document separates **implemented behavior** from **proposed feature contracts**. Only `ping`, `prefix` and `help` are registered by the current bot. Remaining examples specify future work; they are not currently callable. Requirements: [blueprint](../BLUEPRINT.md) sections 7–9, 37, 63, 73, 82–83; gaps: [requirement ledger](requirements.md). The [legacy manifest](legacy-command-manifest.json) is the exact compatibility inventory, not a second live help catalog.

## 1. Commands available now

Replace `!` with the server's current prefix. All three commands have a **one-second cooldown**, shared across aliases and transports for the same canonical command, guild and user. Prefix dispatch is guild-only. The dispatcher accepts slash ping/help without a guild; actual visibility also depends on registration scope and Discord application configuration.

| Operation | Slash syntax | Prefix syntax | Result and access |
|---|---|---|---|
| Ping | `/ping` | `!ping` | `Pong!`, or response latency when supplied; no member permission requirement |
| View prefix | `/prefix` | `!prefix` | `Server prefix: !`; guild plus `ManageGuild` even for reading |
| Set prefix | `/prefix newprefix:?` | `!prefix ?`, `!setprefix ?` | `Server prefix is now ?`; shared service persists it |
| Browse help | `/help` | `!help` | Available commands, categories and paging controls |
| Search help | `/help command:prefix` | `!help prefix`, `!help --command prefix` | Case-insensitive substring match on name, description and aliases |
| Filter/page | `/help category:general page:1` | `!help --category general --page 1` | Optional category/page; only accessible commands appear |

Ping preserves the user menu **Ping from user context** and message menu **Ping from chat context**. Both resolve to ping and its cooldown. Latency is message/interaction age when supplied at dispatch, rounded to milliseconds; it is not WebSocket round-trip time or a benchmark. Context target data is not used by this ping implementation.

Prefix accepts 1–16 characters without whitespace, ASCII control characters or DEL. `setprefix` is the audited alias; `newprefix` is the audited slash option. Writes use settings revision and audit transaction. A conflicting writer receives an error rather than silently overwriting settings. This process invalidates its cache immediately; another process may retain an earlier value for the default five-second cache lifetime. Bot ownership does not bypass `ManageGuild`.

**Visibility:** slash help/prefix and ping context menus are deferred ephemerally. Slash ping is deferred publicly. Prefix replies are ordinary public channel messages, including help and prefix changes; a result's `ephemeral` property cannot make a message reply private. Never add a secret-bearing prefix command assuming this property hides its output.

## 2. Prefix grammar and normalization

The parser performs literal matching and tokenization, not shell execution. Prefix matching is case-sensitive at the beginning of the message; command lookup is case-insensitive. Ordinary messages and a prefix with no command return no result. An unknown command after a valid prefix returns `NOT_FOUND`.

| Input rule | Example | Interpretation |
|---|---|---|
| Single/double quotes retain spaces | `!help "server prefix"` | One search phrase |
| Backslash escapes the following character | `!help \"prefix\"` | Search includes literal quote characters |
| Named options | `!help --category=general --page 1` | Explicit category and integer page |
| Positional options fill unassigned declarations | `!help prefix --page 2` | `command=prefix`, `page=2` |
| End named parsing | `!prefix -- "--"` | Sets the literal two-dash prefix |
| Literal backslash | `!help "a\\b"` | One backslash between `a` and `b` |

Unquoted multiword strings are **not** automatically joined into a trailing argument. `!help server prefix` supplies `command=server` and `category=prefix`; quote the phrase to search both words together. Add explicit compatibility adapters for legacy free-text commands where needed; do not silently change the global grammar to repair one feature.

The command substring after the prefix is bounded to 4,000 characters and 100 tokens. Unterminated quotes, trailing escape characters, duplicate named options, unknown options and excess positional values fail validation. `--name=` supplies an empty value, which fails string validation. No variable, URL, Markdown or arithmetic expansion occurs.

The same `validateArguments` function normalizes slash and prefix input:

| Type | Accepted representation | Rejection boundary |
|---|---|---|
| String | Nonempty string, preserving supplied text | Over 4,000 characters or outside declared `min`/`max` length |
| Integer | Safe integer number or signed decimal integer string | Fraction, exponent string, boolean, unsafe integer or declared range violation |
| Boolean | Boolean or exact strings `true`/`false` | Other spelling such as `yes`; a bare declared prefix `--flag` means true |
| User/channel/role | Appropriate mention or 1–20 digit ID | Wrong mention kind or malformed ID; syntax does not establish existence |
| Choices | Declared choice value after coercion | Different value or type |

Option names are case-sensitive. Snowflakes remain strings. Required options must be supplied. Entity membership, target hierarchy, ownership and provider capabilities require service validation; a syntactically valid ID is not authorization.

## 3. Registry and execution boundary

Actual types: [Discord contracts](../packages/discord/src/contracts.ts) and [core contracts](../packages/core/src/contracts.ts). A definition contains canonical `name`, optional aliases, description, category, module, primitive options, scope/access flags, permissions, cooldown, paired examples, optional context-menu registrations and awaited `execute`. No generic middleware plugin API, nested option tree, autocomplete callback or distributed rate limiter exists yet.

[Registration](../packages/discord/src/registry.ts) validates identifiers, option uniqueness, description lengths, aliases/context collisions and cooldown values **before** inserting anything. Metadata is cloned/frozen against later caller mutation. Prefix aliases support one or two lowercase command words. A two-word route is tried first. Slash/context uses a map lookup; prefix uses at most two map probes. Parsing, permissions, help filtering, storage and external calls have separate costs; this is not a latency guarantee.

The current [dispatcher](../packages/discord/src/dispatcher.ts) executes this sequence:

1. Resolve the canonical command/context route; load guild settings if applicable.
2. Apply the shared [access policy](../packages/discord/src/access.ts): guild requirement; matching settings scope; owner restriction; member permissions; bot permissions; enabled module; command policy; allowed roles; blocked channel.
3. Parse/validate arguments. Prefix access is checked before parsing and again by execution. Unknown module flags fail closed for guild invocations.
4. Claim the canonical cooldown before awaiting the handler. Access/validation failures do not claim it; a handler failure retains a claimed cooldown.
5. Copy/freeze actor role/permission arrays, freeze normalized arguments, clone settings, and await the handler with canonical metadata and fresh request context.
6. Convert expected `AppError` failures to their stable code/public message; unexpected failures become safe `INTERNAL` errors.

`ActorContext` comes from an authenticated transport: user/guild/channel IDs, roles, effective channel permissions for actor and bot, and configured bot-owner status. The gateway fetches current member, bot member and channel information. Option text, component IDs and AI output never supply trusted identity. Discord picker visibility does not replace runtime checks. Target-changing services must additionally check target hierarchy immediately before mutation; those services remain unimplemented.

Cooldown state is process-local, keyed by `[canonicalName, guildId-or-null, userId]`, with capacity 10,000 by default. Expired entries are reclaimed at pressure. Full capacity returns `BUSY` rather than evicting active restrictions. Restart clears it; multiple processes do not share it. Economic, provider-budget and global rate limits must be enforced independently in their owning services/storage.

All current results contain `content` and `kind: text | help | error`. Help adds entries/categories/page/search; errors add `code` and ephemeral intent. [Presentation](../apps/bot/src/presentation.ts) uses consistent embeds and suppresses automatic mentions/reply pings. Large future results need pagination or a validated attachment, rather than relying on the present description truncation.

## 4. Acknowledgment, failure and shutdown

The [gateway](../apps/bot/src/gateway.ts) defers command interactions before fetching actor state or running services. Discord requires an initial response within three seconds; interaction tokens last fifteen minutes. Visibility is selected at acknowledgment. Longer work needs a durable receipt and separately authorized notification destination, rather than a permanently retained interaction token. [Discord interaction lifecycle](https://docs.discord.com/developers/interactions/receiving-and-responding).

| Failure window | Current behavior | Feature design obligation |
|---|---|---|
| Failure after public ping defer | Safe error in public response | No sensitive details; select privacy before acknowledgment |
| Handler rejects after defer | Dispatcher error or gateway correlation reference | Distinguish rejected transaction from uncertain external delivery |
| Reply/edit fails | Sanitized logging; error delivery attempted where possible | Do not rerun business mutation merely to repair its message |
| Gateway closes with pending work | Destroys client, waits for tracked promises, clears help sessions | Future workers need bounded drain/cancel deadlines and durable resumption |
| Prefix message from bot/webhook | Ignored | Event modules must separately prevent reward/notification loops |
| Message content unavailable | Prefix cannot reliably interpret input | Diagnose intent availability; slash is a distinct path |

The bot requests `Guilds`, `GuildMessages` and `MessageContent`. Member-join, reaction and voice listeners need an explicit intent/partial/cache review; a module flag alone does not subscribe to events. Message content is privileged and subject to Discord enablement/approval rules. [Gateway intents](https://docs.discord.com/developers/events/gateway#privileged-intents).

## 5. Interactive help and proposed extensions

`registry.getHelp` shares access policy, excludes hidden commands, sorts names/categories, clamps page size to 1–10 (default five), and clamps the requested page. Zero matches has a valid page count of one and an empty-state message. Categories come from accessible commands before search/category filters. A leading `!` in examples becomes the current prefix. Entries include aliases, member/bot permissions and cooldown.

The bot renders a category select and Previous/Next buttons. It shows `All categories` plus at most 24 named categories. Random-UUID sessions bind requester/guild/channel, expire after ten minutes, and have capacity 1,000 with oldest-session eviction. Restart clears them. Every click checks ownership/expiry, defers an update, reloads actor context and dispatches help again. Rapid clicks can meet help's cooldown and receive a private follow-up. An old menu listing a command never authorizes it after permission loss.

There is currently no search modal, inspector, dashboard link or autocomplete. Proposed extensions:

| Addition | Contract | Failure/acceptance example |
|---|---|---|
| Search modal | Bind requester/session, cap text, reuse registry filtering | Expiry requests new help; hidden matches remain hidden |
| Command inspector | Resolve canonical ID from current authorized results; show typed options and both syntaxes | Removed command becomes unavailable without stale metadata execution |
| Dashboard link | Link only to an implemented configuration page; dashboard separately authorizes | Missing page/access produces no misleading action |
| Many categories | Add category paging/filtering when 24 is exceeded | Every accessible category remains discoverable |
| Localization | Stable IDs separate from display text; validate translated examples | Missing translation falls back without identity changes |

Future general components need a versioned namespace and opaque session/action identifier, server-held state, actor/guild/channel/message binding where applicable, current authorization and expected state revision. Do not put prices, secrets or authority in `custom_id`. Discord limits custom IDs to 100 characters and string-select choices to 25; current help fits. [Component reference](https://docs.discord.com/developers/components/reference).

Read-only help may expire harmlessly. Trades, giveaway entries and game moves require persisted domain state and transactional action claims. A stale button reports the current outcome; duplicates cannot repeat a debit/reward/destructive action. Confirmation is a user-intent checkpoint, not an authorization bypass.

## 6. Planned nested routing and autocomplete

Discord supports `/command subcommand` and `/command group subcommand`; groups cannot nest inside groups. Options/choices have limits, required primitive options precede optional ones, and one option cannot combine autocomplete with fixed choices. The future registration compiler must validate the full tree before network writes. [Application command rules](https://docs.discord.com/developers/interactions/application-commands).

For example, use **`/tcg-admin config energy max-cap:500 potion-limit:3`**: `config` is a group, `energy` a subcommand, and `max-cap`/`potion-limit` options. Do not model `config → energy → max_cap` as three nested route nodes. The proposed prefix equivalent is `!tcg-admin config energy --max-cap 500 --potion-limit 3`; this three-word route requires a structured parser beyond today's two-word aliases.

Proposed normalization carries a canonical command ID, explicit group/subcommand path, primitive arguments and separately resolved targets. Domain operation identity remains stable through aliases. Reject ambiguous aliases/path collisions at startup. Preserve audited roots/options; do not silently rename `/play music name:...` into `/music play query:...`.

Autocomplete is read-only discovery: validate the focused option, scope lookup to the actor, bound/debounce work, cancel stale requests, return a small authorized set, and return no results on safe timeout. It cannot pull models, fetch arbitrary URLs, spend currency, start playback or authorize final execution. Execution revalidates selected ID, ownership, availability and price. Cache keys include authorization-relevant scope and never share private collections across users/guilds. No autocomplete implementation or performance benchmark is claimed.

## 7. Legacy fixtures and proposed feature syntax

These legacy entries are **not implemented in v2 yet**. They are representative manifest fixtures, not an exhaustive duplicated registry. Each port reads the complete manifest row, including options, menus and known broken handlers.

| Legacy canonical entry | Prefix compatibility | Porting obligation |
|---|---|---|
| `/get-avatar [user]`, `/guildinfo`, `/memberinfo [user]` | `!get-avatar`, `!guildinfo`/`!info`, `!memberinfo`/`!userinfo` | Preserve optional targets and guild authorization |
| `/balance` | `!balance`, `!bal`, `!money`, `!coins` | Preserve global legacy balance meaning; distinguish guild projections |
| `/profile view [user]`, `/profile set-banner url:...` | Corresponding `!profile` paths | Validate/cache images; retain old banner route if adding background terminology |
| `/reminder set time:1h message:study` | `!reminder set 1h "study"`; alias `remindme` | Repair multiword time parsing, timezone/calendar validation |
| `/giveaway-create prize:... winners:1 duration:1h channel:#events` | `!giveaway-create`, `!giveaway create`, `!gcreate` | Exact option names and spaced alias; durable lifecycle replaces flat file |
| `/giveaway-edit`, `/giveaway-end`, `/giveaway-delete`, `/giveaway-reroll` | `giveaway edit/end/delete/reroll`, `gedit/gend/gdelete/greroll` aliases | Preserve `message_id`; resolve guild-owned giveaway |
| `/setup-avc`, `/create-reaction-role`, `/reaction-roles` | `!setup-avc`/`!set-avc`; corresponding role paths | Hierarchy, recovery and message binding |
| `/admin-note add/list/remove`, `/delete amount:...` | `!admin-note`/`!note`, `!delete`/`!del` | Staff-only notes and execution-time destructive-target checks |
| `/play music name:...`, `/play playlist name:...`, `/back` | Audited play semantics; `!back`/`!previous` | Do not invent `p` alias or make `queue` a play alias |
| `/playlist create/delete/add-music/delete-music/list/lists` | Add matching prefix paths | Missing legacy prefix handler is a defect, not parity evidence |
| `/anime search:...`, `/manga search:...`, `/anime-character search:...` | Quote multiword search in matching prefix paths | Provider IDs, safe images, no-results behavior |
| Reaction and meme roots | Exact manifest identifiers | Preserve **68 reactions**, 11 wired meme generators and 96 source meme assets; repair 11 broken prefix paths |

New game/TCG operations below are **proposals**, not accepted balance values or callable commands. Their services/rules belong in [economy](economy.md) and [waifu TCG](waifu-tcg.md). Use stable item/card instance IDs; names are display labels.

| Proposed slash | Proposed prefix | Mandatory service checks |
|---|---|---|
| `/achievement list category:combat page:1` | `!achievement list --category combat --page 1` | Actor-scoped progress and stable paging |
| `/achievement claim id:first-win` | `!achievement claim first-win` | Unique claim receipt; rewards/progress commit consistently |
| `/shop list category:consumables` | `!shop list --category consumables` | Availability, current price and quota |
| `/shop buy item:energy-candy quantity:1` | `!shop buy energy-candy --quantity 1` | Price revision, integer quantity, stock/quota, atomic debit/grant; reconfirm changed quote |
| `/item inventory category:equipment` | `!item inventory --category equipment` | Owned instances and equipped/escrow/locked states |
| `/card equip-gear card:C123 item:I456 slot:weapon` | `!card equip-gear C123 I456 --slot weapon` | Own both instances, compatible slot, no trade/battle lock, one equip relation |
| `/item use item:I456 quantity:1` | `!item use I456 --quantity 1` | Eligible target/context and daily cap; duplicates cannot over-consume |
| `/energy status` | `!energy status` | Authoritative balance, cap, reset time and consumable allowance |
| `/dungeon seasons`, `/dungeon progress [season]` | `!dungeon seasons`, `!dungeon progress --season S1` | Current versus archived season; no fabricated progress |
| `/dungeon enter season:S1 floor:2` | `!dungeon enter --season S1 --floor 2` | Eligibility, energy debit, persisted battle/rules revision, duplicate-start protection |
| `/tcg-admin config energy max-cap:500 potion-limit:3` | `!tcg-admin config energy --max-cap 500 --potion-limit 3` | Shared schema; game-admin grant cannot change global policy |
| `/tcg-admin config dungeon scaling-model:hybrid growth-rate:0.08` | `!tcg-admin config dungeon --scaling-model hybrid --growth-rate 0.08` | Preview, audit/version; existing battles retain captured rules |
| `/tcg-admin config role manager:@TCGManager` | `!tcg-admin config role --manager @TCGManager` | Authorized guild administration delegates; manager cannot self-promote |
| `/tcg-admin shop restock` | `!tcg-admin shop restock` | Scoped quota/revision and idempotency; no silent global minting |

Administrative numbers illustrate syntax only. Ranges, defaults, economy effects and authority boundaries need the feature's decision/tests. Current primitive options also lack fractional-number support; the proposed `growth-rate` requires an explicit future numeric contract. Credentials belong in secure CLI/dashboard setup, never public command arguments or prefix messages.

## 8. Registration and acceptance gates

Registration is an explicit operator action through the CLI, not automatic deletion/recreation at each guild toggle. Installed commands may remain visible while policy blocks them. Proposed nested registration needs a reviewed desired-state manifest and remote diff, avoiding unrelated command deletion. Reconcile Discord quotas with audited global/guild roots before enabling the catalog: 141 source files do not automatically fit one global scope. [Command registration](https://docs.discord.com/developers/interactions/application-commands).

| Scenario | Required observation | Evidence or remaining gate |
|---|---|---|
| Slash/prefix/alias equivalence | Same normalized args, access and state outcome | Foundation [dispatcher tests](../packages/discord/src/dispatcher.test.ts); fixtures for every port |
| Overlapping callers | No actor/argument leakage; same-key cooldown claimed once | Foundation concurrency tests |
| Alias/context after disable | Same denial as canonical route | Foundation policy tests; durable settlement remains planned |
| Role loss after help opens | Refreshed help excludes restricted entry | Current gateway reloads actor; filtering tests exist; explicit role-loss-between-clicks test remains a gate |
| Invalid time/ID/quote/overflow | Safe error and no handler mutation | Parser tests now; timezone/resource checks per feature |
| Duplicate paid action/stale confirmation | One receipt or conflict; no repeated reward | Future transaction/component tests |
| Startup collision | No partial insertion | Registry tests now; nested tree/quota tests pending |
| Reply fails after commit | Saved result queryable without rerunning mutation | Future durable service integration tests |
| Development-guild registration | Correct names/options/privacy/intents/permissions | Authenticated live smoke test; mocks do not prove Discord acceptance |

This revision inspected source and deepened design. It does not certify live registration, autocomplete, parity, module installation or provider availability. [Testing](testing.md) records actual executions; [ADR-002](adr/ADR-002-discord-framework-and-interaction-routing.md) records tradeoffs and revisit conditions.
