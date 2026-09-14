# Economy, progression and mini-game design

## Status and source boundary

This is a proposed implementation contract for blueprint sections 32–40 and 76–77, not a working economy. The foundation implements settings and the core `ping`, `prefix` and `help` commands; it has no economy tables, wallet service, bank, reward engine, inventory, wagers or profile renderer. Proposed command examples below are unavailable. [ADR-009](adr/ADR-009-centralized-transactional-economy-engine.md) records the transaction decision; [database](database.md) owns the proposed schema; [TCG](waifu-tcg.md) owns card, energy, dungeon and player-guild rules. [Requirements](requirements.md) and [roadmap](implementation-roadmap.md) retain the implementation gaps.

The comparison baseline is Gemini commit `1ba45ee3308b1bb5c7ecb4ea850c0009abb65d33`, `docs/economy.md`. Its event catalog, bank, daily streak, voice eligibility, profile and shop proposals are retained as design topics. Its numeric defaults are candidates, not accepted game balance. A descriptive transaction row is not a balanced ledger; a nonnegative CHECK alone does not prevent lost updates; sorted locks reduce rather than eliminate deadlocks; indexed snapshots do not guarantee constant-time fresh ranking.

Legacy evidence is the immutable `.audit/RirikoBot` snapshot `0d8be25b17e25dfa61812d6e7b5aaf8497687257`:

| Source | Verified behavior and migration consequence |
|---|---|
| `src/economy/karma/karma.extension.ts` | Non-gibberish messages receive 1 karma/coin below 10 space-separated words, otherwise 2. It reads, modifies and saves user fields; level notices can be sent before saving. This is evidence of race/failure risks, not a durable reward log or proof of production abuse. |
| `src/economy/coins/coins.extension.ts` | Balance reads and add/deduct operations use global user coins; the deduct helper does not locally enforce a nonnegative result. Future callers must use the transaction service. |
| `src/economy/items/items.extension.ts` | Random discovery logs rarity; inventory assignment is a TODO. Do not import fictitious owned items from this code. |
| `src/economy/profile/profile.extension.ts`, `src/util/economy/economy.util.ts` | Profile uses global karma/coins, badges and optional background. Level calculation compares individual thresholds while progress uses cumulative thresholds; preserve raw karma and record curve semantics before changing visible levels. |
| `src/command/economy/`, `src/command/games/` | Command compatibility is source-based, as listed below; legacy random games do not establish wagering or a settlement history. |

Preserve each legacy user's global coins and karma once. There is no reliable supplied historical ledger, bank balance, item inventory or guild XP allocation to reconstruct. An opening-balance transaction is a documented migration baseline, never an invented history of past messages. Preserve suspension flags and define their future enforcement explicitly. Representative production-data reconciliation remains unavailable; see [migration](migration-1.x-to-2.0.md).

## Account identity and integer units

An account key contains currency realm, owner kind/ID, currency and pocket. Keep authorization scope distinct from currency realm:

- Legacy `COIN` belongs to one global realm, with Discord user ID as owner. Display “coins”; “credits” can be a display alias. It does not create a second balance. No gems or exchange rate is implied.
- Wallet and bank are separate pockets of that same account owner. A player-guild treasury funded by global coins stays in the global COIN realm with owner kind `player-guild`; its roles govern authority, not a new currency realm. Player guilds and Discord guilds have different IDs and memberships.
- A future Discord-guild currency requires its own explicit policy and opening state. It cannot silently debit global COIN or clone it into each guild. Cross-currency conversion requires separately balanced legs, rates, rounding and authorization; it is outside this initial contract.
- XP is a non-spendable progression measure. New eligible events may update explicitly defined global and guild XP projections, but that must not mint two global coin rewards. Historical global karma cannot be distributed among guilds without evidence.

Proposed numeric representation: signed 64-bit integer storage, application arithmetic with `bigint`, and canonical decimal strings on JSON/API boundaries. PostgreSQL `bigint` has a finite signed range; enforce the same reviewed range in both adapters, including aggregate calculations and intermediate multiplication. No conversion through JavaScript `number` is allowed where precision could be lost. [PostgreSQL numeric types](https://www.postgresql.org/docs/current/datatype-numeric.html).

User amounts must be canonical positive integer strings: reject zero spend, negatives, fractions, exponent notation, whitespace ambiguity, overflow and amounts above a configured per-operation cap. Signed deltas are internal service output, not client-controlled amounts. Compute basis-point fees with integer arithmetic and one documented rounding rule, for example `floor(amount * feeBps / 10000)`; bound the multiplication before it happens. SQL constraints, codecs and service limits must agree. Driver round-trip tests are required before selecting this candidate representation.

### Ledger and hold invariants

Use the proposed `economy_accounts`, transaction headers, posting lines, holds, receipts and domain tables together:

| Invariant | Enforcement contract |
|---|---|
| Conservation | Each transaction balances to zero independently per currency realm and currency. Never offset a COIN debit with another currency's credit. |
| Player funds | Posted balance and active held total are nonnegative; available = posted − held; held never exceeds eligible posted funds. Bank capacity is a separate policy check. |
| Traceability | Header records transaction ID, user/actor, authority guild where applicable, operation type, source, rule version and time. Lines record account, signed delta and posted before/after. Hold transitions record held before/after separately. |
| Issuance | Rewards may debit a named system issuance counteraccount below zero and credit a user. This explicitly permitted counteraccount tracks cumulative supply creation; ordinary users and finite treasuries cannot go negative. |
| Treasury and sink | A finite house/player-guild treasury needs funds. Fees enter a named treasury or sink. Moving into a sink conserves recorded units while excluding them from circulating supply; analytics must distinguish issuance, circulation and fees. |
| One effect | Unique operation receipt and stable request digest bind the result. Same key/payload returns it; changed payload conflicts. A new transport attempt must not create a new operation identity. |
| Shared asset boundary | Ledger, inventory ownership/count, stock, achievement-claim flags, quest state and receipt commit together when one operation touches them. No “charge now, grant later” gap. |

A hold reserves funds without posting a debit. Capture reduces held and posts the debit once; release reduces held without changing posted balance. When a captured stake has moved into session escrow, it no longer remains a wallet hold. Never reserve both representations for the same liability. Immutable ledger history is corrected with linked compensating transactions; do not edit old lines or delete deduplication receipts to permit a retry.

The proposed service accepts authenticated actor context, operation key, canonical payload and expected domain revision. It returns a persisted result containing transaction/receipt IDs, resulting balances and domain revision, or a typed rejection such as `INSUFFICIENT_FUNDS`, `ACCOUNT_FROZEN`, `CAPACITY_EXCEEDED`, `STALE_OFFER`, `DUPLICATE_PAYLOAD_CONFLICT` or `RETRYABLE_CONFLICT`. SQL details and other users' private balances must not leak through errors. A rejected insufficient-funds request retains its outcome; a deliberate later attempt has a new identity, while a redelivered event keeps the old identity.

## Transaction and concurrency procedure

1. Resolve actor permissions and normalize input before opening a transaction. The domain derives prices, fees, recipients and reward amounts from trusted versioned rules, not button labels or AI text.
2. Find/create the receipt under its unique key. Lock or conditionally claim the operation and compare its digest. Handle concurrent first-insert uniqueness conflicts as retries of the same operation.
3. Lock relevant accounts and exclusive assets in one shared deterministic ordering of resource kind and stable ID. Re-read balances, holds, ownership, stock, suspensions, offer revisions and rule applicability inside the transaction.
4. Check integer bounds and available funds; calculate all posting lines and effects. Use guarded updates/revisions so a stale read cannot overwrite a concurrent debit. Validate both per-account and per-currency invariants.
5. Commit ledger, holds, asset/effect changes, durable cooldown/counter changes, receipt and outbox intent together. Make no Discord, image or provider requests inside the SQL transaction.
6. Present the stored outcome. A lost response after commit is resolved by receipt lookup. A transient conflict retries with the same identity, bounded attempts and jitter; exhausted retries report pending/retryable state without claiming a completed debit.

PostgreSQL row locks can coordinate account writers, but deadlocks still need bounded transaction retries. Locking an absent row is not enough: unique account identities and safe creation handle that race. [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS).

SQLite permits only one write transaction at a time. A short `BEGIN IMMEDIATE` transaction can acquire the write position before validation; handle `SQLITE_BUSY` with a bounded retry budget. Do not pretend SQLite offers PostgreSQL row locks. A memory mutex is useful locally but is not the cross-process correctness mechanism. [SQLite transactions](https://sqlite.org/lang_transaction.html).

### Worked operations — synthetic values, not reward defaults

| Operation | Atomic effects and result |
|---|---|
| Transfer 300 with fee 5 | Alice 1,000 → 695; Bob 200 → 500; fee treasury 0 → 5. Lines −305, +300, +5 sum to zero. Transfer and fee share one receipt. Reject self-transfer or define it as an explicit no-op without earning rewards. |
| Two concurrent spends of 80 from 100 | One transaction succeeds and leaves 20. The second rechecks available funds and fails; it cannot save a stale balance of 20 and grant a second item. Test with distinct operation keys and two database connections. |
| Deposit 400 | Wallet 1,000 → 600 and bank 50 → 450. Net worth remains 1,050; no XP or “earnings” event is emitted for moving pockets. Check bank capacity during the same transaction. |
| Reserve then capture 100 | Wallet posted 500/held 0 becomes posted 500/held 100, available 400. Capture becomes posted 400/held 0 plus escrow +100. Release before capture instead restores available 500 with no posting lines. |
| Buy three items at 40 | Buyer −120, shop treasury +120, stock −3, owned stack +3 and purchase receipt commit together. Two buyers competing for the last item cannot both succeed. Price and catalog version are fixed in the accepted quote. |
| Refund that purchase | Link to original receipt, return eligible unconsumed items/stock and reverse −120/+120. A unique refund identity and remaining-refundable counter prevent repeat or excess partial refunds. If items were consumed/transferred, reject automatic reversal and create a reviewed correction case. Never force an ordinary treasury negative. |
| Issue reward 25 | User +25; issuance counteraccount −25. Store eligible source and rule version. Supply reports increase circulating coins by 25; replay returns the existing award. |

PvP wager example: A and B each reserve 100; only after both accept the same rules/revision are both holds captured into one session escrow of 200. A winning settlement pays A 190 and fee treasury 10 while debiting escrow 200. A draw refunds 100 to each; cancellation before capture releases holds. If only one invitee accepts before expiry, release that hold without creating escrow. After capture, cancellation follows the recorded refund rule through escrow, never through an extra wallet credit alongside a hold release. A unique session settlement makes winner, timeout and cancellation mutually exclusive.

For a bot opponent, reserve the house's maximum net liability before accepting the player's stake. Record gross return versus net profit unambiguously: a 100 stake with a 200 gross winning return needs the player's 100 plus house liability 100. House reserve exhaustion rejects admission; it must not create an unfunded promise. Wagers remain disabled until policy, fairness, restart recovery and settlement tests pass.

## Central reward engine

A trusted event has `eventId`, schema version, event type, subject user, currency realm, optional originating guild/channel, occurred/observed times, source entity/revision and bounded evidence references. Client metadata never supplies authoritative reward amount or recipient. Source adapters validate authenticity; the engine loads a versioned rule and records eligibility reason, applied version, receipt/XP event IDs and counter changes.

A logical claim key remains stable across rule versions: editing a reward rule must not make an old message eligible a second time. Persist the applied version as evidence, not as a way to evade the logical uniqueness constraint. Rejected events retain their decision; replay after a cooldown does not make yesterday's denial a new reward. An explicitly authorized reevaluation uses a separate correction process linked to that decision.

| Source | Eligibility, deduplication and effect boundary |
|---|---|
| Text | Original message ID; edits/deletes do not create more awards. Require eligible human author, allowed channel and meaningful content. Apply durable user/global issuance windows as well as guild rules. |
| Voice | Unique user/channel eligible interval; intersect membership, live connection and eligible state. Persist completed interval identity so reconnect/restart cannot replay minutes. |
| Attachments | Parent message plus normalized attachment/content fingerprint; check supported content, reuse windows and bounded processing. Multiple duplicate files must not bypass text cooldowns or generate unlimited extra rewards. |
| Game | Terminal session/participant identity; server-validated outcome and opponent eligibility. Separate wager payout from participation reward; no reward for looping self-play, rejected moves or refunded invitations. |
| Quest / dungeon | Completed objective/run plus claim identity; objective progress, inventory/energy effects and final reward share durable authority. Progress events cannot count the same action twice. |
| Giveaway | Finalized giveaway/winner/prize identity from the giveaway service, not an arbitrary user-created event. Non-currency prizes must not also mint their nominal coin value. |
| Achievement | Achievement version and logical user milestone claim; flags and rewards commit once. Cosmetic equip, retries and level oscillation cannot claim it again. |
| TCG / shop | Card drop, claim, sale, consumable and purchase events notify the engine, but do not automatically earn coins/XP. Explicit rules prevent buy/sell/use/reward cycles that generate unbounded value. |
| Daily | The daily claim state machine below owns streak and eligibility; button repeats share one claim identity. |

Rule evaluation checks account/reward suspension, source age, allowed scope, cooldown, rolling count/value budget, repeated content, participant eligibility and global issuance ceiling before any reward. Denials record a bounded reason category; do not store full messages or raw attachment bytes in the ledger. Hashes and anti-abuse samples need an explicit retention period and restricted access. An unavailable moderation/evidence dependency can defer a decision; it must not silently grant an unverified award.

### Text, attachment and voice abuse policy

Candidate text tuning from Gemini includes a 60-second reward cooldown, minimum five meaningful characters and similarity against the previous three messages. These are examples for simulations, not universal language rules. An 80% string-similarity threshold can penalize legitimate short conversation; punctuation, emoji, scripts without spaces and accessibility patterns need fixtures. Timing regularity alone must not label a person a self-bot or silently punish them. Combine signals, expose an appropriate eligibility explanation and support staff review. A command dispatch cooldown in memory is insufficient: persistent counters survive reconnects, worker changes and process restarts.

Use bounded rolling windows for content signatures, attachment reuse, event count and total issued units. Global COIN budgets aggregate a user across guilds so guild hopping cannot multiply issuance. Guild budgets can additionally constrain local awards. Counter update and reward commit are one transaction, with an explicit overflow policy and retention horizon; expired counters may be compacted only after their events can no longer be replayed as eligible. Reject unexpectedly future timestamps; bound late-event handling instead of awarding an entire disconnected backlog.

Voice candidates are 60-second buckets with at least two eligible humans, excluding AFK channels and self/server muted or deafened users. Define eligible time as the intersection over the interval, not the state at its end; participant joins halfway through cannot earn a full minute. Gateway presence is an imperfect activity signal, so missing/stale evidence grants no assumed offline minutes. Cap overlapping user intervals globally and close intervals at disconnect or uncertain restart. A candidate eligible voice interval should grant more XP than one ordinary eligible chat award, subject to duration and daily caps; tune the actual amounts with simulations. Time spent muted, deafened or alone cannot be reclaimed by toggling state at the award boundary.

## Daily rewards, bank capacity and interest

All numbers in this section are explicit candidates requiring balance review. Persist governing rules, timing mode and period/claim identity; changing a timezone or restarting a scheduler cannot produce another claim.

For a rolling daily policy, store last successful claim time and sequence. Eligibility starts 24 hours after that claim; claiming within 36 hours preserves the streak, a longer gap restarts at day 1. This is distinct from calendar-midnight rewards; do not run both reset mechanisms. Compare using server time and lock the claim row. Backward clock movement must not shorten a recorded eligibility deadline.

A precise example resolves the baseline's ambiguous streak indexing: day `s >= 1` pays `floor(250 * (10000 + 500 * min(s - 1, 30)) / 10000)`. Day 1 pays 250, day 2 pays 262, and day 31 onward pays 625. This means 30 bonus increments, not reaching the full bonus on day 30. Store integer rounding and streak semantics with the rule version; a future accepted policy can choose different values. Two simultaneous claims produce one award and the same resulting eligibility time. XP, items or achievement milestones attached to daily claims use that same transaction identity.

A candidate bank capacity is `10,000 + 2,500 * level`, with bounded arithmetic and the chosen global level curve. Deposit checks the current capacity atomically. If a correction lowers the level below current holdings, retain the balance and disable further deposits until capacity permits; do not destroy funds. Withdrawal respects available bank funds and active reservations. “Bank” does not imply absolute security: access control, account compromise and database recovery still matter.

Interest is optional and disabled until its funding and inflation limits are accepted. Configure integer basis points, maximum per-account award, global issuance budget, eligible account states and one governing calendar/timezone. One candidate anti-hop basis is the minimum eligible bank balance observed during the period: initialize it at period opening, lower it on withdrawals, and do not raise it for late deposits. Maintain that minimum durably with bank movements; new accounts start at zero for their first incomplete period. Calculate `floor(basis * rateBps / 10000)` and clamp to remaining bank capacity and period caps. The period close record fixes its basis and rules before awarding once. A retry does not recalculate using a later balance. Rate changes apply at the next period boundary; disabled or exhausted-budget periods record an explicit result. This policy is a design choice, not implemented interest accounting.

## XP, levels, rankings and profile

Store global/guild `xp_accounts`, immutable deduplicated `xp_events`, curve version and level projection. Currency reward and XP can commit together but have different units and limits. Explicitly decide whether the same accepted event updates both global and originating-guild XP; do not derive past guild XP from global karma. Public “activity” is a defined metric/window, not an unexplained copy of all-time XP.

Legacy `calculateExp` starts at 0, 5, 10, 20, then a 1.5 growth region and a 1.1 growth region after level 13. Its current-level function and cumulative-progress calculation disagree. Preserve raw karma and a `legacy-v1` interpretation in migration evidence; do not advertise a seamless level conversion without previewing old/new results.

For a simple candidate new curve, let cumulative threshold `T(L) = 50 * L * (L + 1)`, with `T(0)=0`. Thresholds are 100, 300 and 600 for levels 1–3. At XP 450, level is 2 and progress is `(450−300)/(600−300)=50%`. Find the greatest bounded L with `T(L)<=XP`; use exact integer comparisons, not a floating estimate without correction. The actual curve, maximum level and reward amounts require review through the normal implementation ticket and simulations; this document does not select game balance.

Corrections create signed XP events linked to the original source and never permit XP below zero. Proposed policy allows a derived level to fall after correction, while retaining previously claimed milestone identities so oscillation cannot earn rewards again. Bank overcapacity and equipped-item eligibility need explicit grace/restriction rules; do not delete assets. Curve changes require before/after preview, a versioned rebuild, milestone policy and rollback evidence. Never reset raw XP merely to simplify a level migration.

For each scope/metric, publish indexed snapshots with `asOf`, population definition and metric version. Use stable ordering `metric DESC, user_id ASC`. Competition rank is `1 + count(users with greater metric)`; equal scores share rank, while stable row position handles pagination. A candidate percentile is `100 * (N − rank)/(N − 1)` for `N > 1`, and 100 for a singleton. Declare whether zero-score/inactive/suspended users are in N, and show that choice in diagnostics. A profile looks up the user's snapshot row rather than fetching every user. Snapshot production may perform substantial work; measure refresh time, indexes and staleness instead of claiming O(1) fresh rank.

Required profile fields: avatar/name, global and guild rank/percentile where applicable, XP/level/progress, wallet/bank/available/held coins, selected card, game/progression statistics, optional title and guild context, plus custom background. Define wealth metrics precisely: holdings include owned wallet/bank posted funds and any beneficial escrow stake once; active holds reduce availability but are not an additional asset or lost wealth. Do not add both the stake's old wallet amount and its escrow representation. Label snapshot timestamps and keep private balances out of unauthorized lookup surfaces.

Background URLs must use the reviewed [image fetch contract](adr/ADR-006-image-generation-and-canvas-synthesis.md): bounded download and decoded dimensions, allowed formats, redirect/DNS checks, cache and safe fallback. A proposed 1200×400 rendering canvas is a layout candidate, not permission to fetch arbitrary URLs. User images, names and titles must not become executable SVG/HTML or unbounded renderer input. Missing avatars/cards and stale rank snapshots should produce a useful partial profile without reissuing rewards.

## Inventory, shop and equipment

Item catalog versions define identity, display, stackability, eligibility, price/currency, effect parameters and availability. Unique equipment/card instances have one owner and revision; stackable consumables have available/reserved counts. Catalog deactivation prevents new purchases without erasing existing ownership. Equipped, listed, trading and otherwise reserved assets follow the shared exclusive-reservation rules in [TCG](waifu-tcg.md); UI state alone never locks an item.

A purchase quote binds item/version, quantity, price, expiry and shop-limit period. Settlement checks the same version or rejects for requote; it cannot silently charge a changed price. Consumption atomically decrements inventory, applies the effect, advances relevant counters and writes the receipt. If an energy potion would have no effect at the configured cap, the proposed default rejects consumption without item loss; any overflow policy belongs to the TCG rules. Equip requests verify current ownership, slot eligibility and reservation state; equip does not reroll stats or grant repeated acquisition rewards.

The baseline's minor energy-candy purchase limit of one per day and energy-potion use limit of three per day remain candidate rules. Their canonical counters and UTC reset semantics belong to the TCG service; the shop and economy must consult those same durable identities. These calendar counters are distinct from the rolling daily coin claim. Buying and consuming are different events: a three-use cap is not automatically a three-purchase cap. Coin-shop availability, progression-earned items, energy regeneration and dungeon costs must share one reviewed catalog, not independent defaults in command handlers. Rarity does not alone authorize sale or imply that a logged legacy discovery owns an item.

## Mini-game lifecycle and settlement

The required five games are Tic-Tac-Toe, Rock-Paper-Scissors, HighLow, CoinFlip and Dice. Rules and moves belong to a small typed `MiniGame` implementation; session persistence, deadlines, authorization, randomness and economy settlement belong to shared services. An illustrative contract, not an exported package API:

```ts
type GameOutcome =
  | { kind: 'win'; winnerId: string }
  | { kind: 'draw' }
  | { kind: 'cancel'; reason: string };

interface GameContext {
  sessionId: string;
  actorId: string;
  now: string;
  expectedRevision: number;
}

interface MiniGame<State, Move> {
  start(context: GameContext): State;
  handleMove(state: State, move: Move, context: GameContext): State;
  finish(state: State, context: GameContext): GameOutcome;
}
```

A concrete implementation must additionally validate move schemas and define when `finish` is legal. The interface cannot let an arbitrary caller select a winner. Persist participants, game/rule version, stake policy, accepted offer revision, state/revision, move sequence, deadlines, random outcomes needed for recovery and terminal receipt. Inject clock/randomness for deterministic tests; use an appropriate secure random source for production wagers and retain enough restricted evidence to audit results without exposing future hidden choices.

| Game | Required behavior and explicit edge policy |
|---|---|
| Tic-Tac-Toe | Bot and PvP modes; authorized alternating moves, bounded board coordinates, occupied-cell rejection, win/draw detection. No moves after terminal state. Bot difficulty and timeout forfeits are versioned rules. |
| Rock-Paper-Scissors | Bot/PvP; allowed move enum, one private locked choice per participant, reveal only after both choices or recorded expiry. Ties use a declared draw/refund or bounded replay policy; no endless paid rerolls. |
| HighLow | Validate an actual higher/lower guess against the recorded next draw; define range and equal-value outcome. A candidate equality rule is a draw/refund. Legacy merely reported whether the next 1–100 number was higher/lower/same; new scoring is an explicit behavior extension. |
| CoinFlip | Preserve heads/tails output. Optional pick/stake/multiplayer modes need declared odds, fee and gross payout; a failed presentation never causes another random draw. |
| Dice | Preserve integer 1–6 output. Optional prediction/duel modes define sides, ties and payout before consent; do not attach an undocumented wager to the legacy no-argument command. |

Sessions move through offered → waiting for acceptance → active → settling → settled, or a recorded cancelled/expired terminal path. Persist deadlines and guarded revisions. Moves bind actor/session/revision and stable action identity; duplicate clicks return prior results, stale buttons cannot act for a replacement session, and nonparticipants cannot alter it. Bot/PvP applicability and wagering are explicit mode capabilities, not assumptions that every game supports every combination.

Admission reserves funds only after consent to the current terms. A transactional active transition captures agreed holds into escrow. Finish validates the authoritative state and atomically writes terminal outcome, payout/refund, statistics and eligible reward identity. “Settling” must retain recoverable intent; it is not permission to credit participants twice. On restart, expired offers release holds; active sessions follow a declared resume or refund policy; committed settlements are redisplayed from their receipts. A timeout racing the last winning move uses one revision/settlement guard. An outbox retry can repair the Discord message without rerunning the game or payouts.

Games need persistent participation cooldowns, reward caps, opponent-pair abuse windows and statistics definitions separating completed, cancelled, bot and PvP sessions. A wager transfer is not XP eligibility by itself. Repeated losses, mutual transfers or refunded games cannot farm reward loops. Individual command handlers and collectors never directly adjust coins.

## Command compatibility and administration

The configured prefix replaces `!` in these examples. This table describes audited legacy interfaces, not available foundation commands:

| Legacy surface | Preserve when porting |
|---|---|
| `/balance`; `!balance`, `!bal`, `!money`, `!coins` | Own global coin balance; do not silently require a guild account or introduce a target-user argument. |
| `/profile view [user]`; `!profile`; user context `View profile` | Slash can select a user; legacy prefix displays the caller. New prefix target syntax is an explicit additive extension. |
| `/profile set-banner url` | Preserve the existing background setter with the reviewed image validation. No legacy prefix setter is established by the audited handler. |
| `/coin-flip`, `!coin-flip`; `/dice`, `!dice` | No-argument random result; no debit. |
| `/high-low`, `!high-low` | Starts comparison game and waits up to 15 seconds for the same user. Porting actual guess scoring and reliable timeout replies requires explicit tests and documented corrected behavior. |

Proposed new surfaces, all unavailable until implemented: `/bank deposit amount` ↔ `!bank deposit 100`, `/bank withdraw amount` ↔ `!bank withdraw 100`, `/transfer user amount` ↔ `!transfer @user 100`, `/daily` ↔ `!daily`, `/transactions` ↔ `!transactions`, `/shop buy item quantity` ↔ `!shop buy potion 1`, `/inventory` ↔ `!inventory`, `/equip item` ↔ `!equip item-id`, and game-specific `/tic-tac-toe`/`!tic-tac-toe` or `/rps`/`!rps` entry points. Register exact metadata, argument bounds, aliases, help, cooldowns and slash/prefix parity in the implementation ticket. These examples are design syntax, not commands to execute now.

| Policy catalog group | Authority and diagnostic contract |
|---|---|
| Realm/currency, supply and issuance caps | Bot-owner/service policy. Discord guild administrators cannot mint arbitrary global coins or edit another guild's treasury. |
| Local reward channels and participation | Authorized guild settings within global limits; effective value shows source, version and allowed override range. |
| Reward amounts, windows, daily and interest | Versioned rules with effective boundary, integer units, timezone/timing mode, caps and funding source. Global COIN interest remains bot-owner policy, not a guild administrator's minting privilege. Simulate effects before activation. |
| Bank/transfer fees, wager modes and stake limits | Explicit fee recipient, rounding, maximum liability and freeze policy. Show accepted terms before irreversible game admission. |
| Inventory/shop/energy | Shared catalog and TCG counter authority; no hidden duplicate reset scheduler. |
| Account actions | Separate permissions for inspect, freeze, unfreeze and compensating grant/reversal. Require reason and audit actor/source; privileged corrections still use balanced postings. |

Account freezes stop new spending/earning according to recorded policy, but allow narrowly authorized settlement/refund recovery so holds are not stranded. A guild moderator cannot seize a user's global wallet through a guild-only permission. Dashboard, Discord commands, CLI and AI tools all call the same services with authenticated actor context; no transport bypasses authorization. [AI tool policy](ai.md) requires model output to be treated as untrusted input.

Diagnostics should expose effective rule version, safe eligibility reason, next eligible time, relevant limit usage, receipt/transaction IDs, pending holds and snapshot age. Do not reveal other users' private activity samples or raw SQL. Admin adjustments use compensating postings and, where policy requires it, a reviewed case; no universal extra approval ritual is implied for ordinary authorized actions.

## Operations, reconciliation and acceptance

Monitor issued/burned/circulating units per currency, reward-denial categories, retry/conflict rates, oldest pending hold/settlement, outbox lag, snapshot age and reconciliation discrepancies. Avoid user IDs as unbounded metric labels. Alerts should identify an operation/realm and safe correlation ID without logging private message evidence.

A reconciliation pass verifies: posting sums per transaction/currency; each account's opening balance plus postings equals its projection; active hold totals match held fields; no wallet stake is simultaneously held and captured; escrow equals unresolved funded liabilities; inventory reservations match active owners/sessions; terminal sessions have one settlement; daily/interest/achievement logical claims are unique. Example: opening supply 1,200, issuance 25 and sink fees 5 means positive asset holdings including the sink total 1,225 and circulating supply excluding it is 1,220. Including the negative issuance/opening counteraccounts instead makes the complete ledger sum zero. A wallet→bank transfer changes neither supply figure. Never “fix” a mismatch by overwriting the balance without identifying the missing/duplicate operation.

Suspend new admissions for an affected realm on a material accounting discrepancy while retaining receipt reads and controlled recovery. Take a consistent database backup including ledger, receipts, holds, inventory, game state and outbox; copying only balances cannot restore settlement authority. Restore into an isolated environment, reconcile, and determine which externally delivered outcomes postdate the backup before enabling replay. A code rollback does not reverse committed rewards or consumed items. Feature disablement must drain or deliberately refund active sessions; do not delete them to clear a queue.

Future acceptance evidence must include:

| Area | Required tests / release evidence |
|---|---|
| Numeric/accounting | Exact codec round trips and bounds on both real drivers; per-currency conservation; issuance exception isolation; fee rounding; wallet/bank net-worth invariance; no unsafe Number conversion. |
| Concurrent mutations | Two spends from insufficient shared funds; account creation race; stock/asset race; same-key duplicate and changed-payload conflict; hold expiry versus capture; winner versus timeout. |
| Crash recovery | Failure before commit leaves no partial charge/item; lost response after commit returns receipt; process death after capture resumes/refunds once; outbox retry never rerolls or pays twice. |
| Rewards | Duplicate/edit/late events; replay after denial; rule-version change; restart cooldown; cross-guild budget; repeated attachment; multilingual short text and heuristic false positives. |
| Voice/time | Partial intervals, mute/deaf/AFK transitions, one remaining participant, stale gateway data, reconnect, overlapping sessions, backward clock and duplicate period close. |
| Progression | Legacy curve preview; new threshold boundaries; level-down compensation and milestone deduplication; rank ties, singleton/empty population, guild filtering and snapshot staleness. |
| Inventory/games | Purchase/consumption rollback; equip/trade/listing conflict; shop purchase versus use caps; all five games' legal/illegal moves; nonparticipant/stale controls; house reserve exhaustion and draw/refund rules. |
| Security/operations | Cross-user/guild/realm permission denials; model/client amount injection; frozen-account recovery; controlled opening migration; backup/restore reconciliation; measured query plans and bounded growth. |

Implementation should proceed through contracts/schema and both-dialect transaction tests, reconciled opening balances, limited rewards/read surfaces, bank/transfers, inventory, then wagers and TCG composition. This is sequencing guidance, not authorization to cross the standing workboard's single-ticket or epic PR boundary. No live economy, representative-data migration, game-balance simulation or runtime economy test has been completed by this documentation work.
