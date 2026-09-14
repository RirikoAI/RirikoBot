# ADR-009: Transaction authority for economy, rewards and inventory

## Status and context

Proposed future subsystem. No wallet, ledger, bank, reward engine, shop, inventory or wager service exists in the foundation's three managed tables. The detailed [economy contract](../economy.md) owns candidate policy values and command examples. This decision addresses blueprint32–40,76–77 and the [database catalog](../database.md).

Legacy coins and karma live on global user rows. Updates read, modify and save without an atomic debit condition; item discovery logs a rarity before an inventory TODO. These are concrete correctness risks, not proof of an observed exploit. There is no supplied historical posting ledger or reliable owned-item inventory to reconstruct. Migration must preserve global balances once and explain any opening adjustment; it cannot manufacture transactions for past messages.

The new platform combines bank movements, rewards, wagers, purchases, card markets, consumables and player-guild treasuries. Correctness requires a common transaction boundary even when different modules own business rules. A table containing one transaction-description row does not establish double-entry accounting, and a CHECK constraint alone does not coordinate all related assets.

## Alternatives

| Option | Benefit | Failure boundary / disposition |
|---|---|---|
| Mutate balance fields in handlers | Small initial implementation | Duplicated validation, lost updates, partial item/payment effects; rejected |
| Balance plus descriptive history | Useful explanation of events | History can disagree with balances and need not conserve units; insufficient alone |
| Full event sourcing for every subsystem | Rich rebuild history | Adds broad replay/versioning burden to unrelated settings/features; not required initially |
| Service-owned balanced postings, receipts and atomic domain transitions | Explicit conservation, provenance and retry semantics | More schema/reconciliation work; proposed |
| Separate economy service/database immediately | Independent scaling | Distributed payment/ownership commit and operating overhead before measured need; deferred |

Choose a modular monolith transaction boundary initially. A domain service composes economy and inventory repositories using the same transaction object; it does not call an HTTP wallet service halfway through a SQL trade. Future service extraction requires a new settlement/saga contract, not an invisible repository replacement.

## Decisions and invariants

### Explicit units, accounts and scope

Use checked integer currency units. Wire representations must preserve exact values across JSON/TypeScript/database boundaries; validate canonical integer strings where the chosen range exceeds safe JavaScript numbers. Reject fractions, exponent ambiguity, negative user spend requests and overflow. SQL and service limits must agree on each supported dialect.

An account is identified by explicit global/Discord-guild/player-guild scope, owner kind/ID, currency and pocket. Wallet, bank, escrow and treasury are distinct accounts or reserved-balance semantics with one declared model. The proposed legacy currency key is COIN, displayed as coins; credits may be a display alias, not an undeclared second currency. Global legacy coins are not copied into every guild. A player-guild treasury funded by global COIN uses the same global currency scope with owner-kind player-guild; ownership authority is distinct from currency realm. A separate player-guild currency scope cannot silently accept global COIN contributions. XP is progression, not a spendable currency, and global karma does not prove guild-specific historical XP. Cross-scope/currency exchange is unavailable until an explicit conversion policy exists.

A transaction header identifies operation, scope, currency, source and time. Posting lines have account, signed delta and consistent before/after values. Sum of deltas is zero per currency; issuance and sinks use explicit system counteraccounts. Player spendable funds equal posted less active holds and remain nonnegative. A hold is not also a debit: reserve once, then capture or release once under the same source identity.

Example invariant, using synthetic units: buyer -100, seller +95, fee sink +5 sums to zero. Card ownership and the single-item listing's sold transition commit with those postings. If fee calculation or ownership validation fails, no line or transfer remains. A bank deposit moves wallet to bank; it cannot also be reported as newly earned wealth. Interest, if enabled after balance review, is explicit issuance tied to one account/logical-interest-kind/period receipt, with applied rule version as evidence.

### One operation, many retries

Use a domain operation key and canonical request digest independent of transport retries. Same key/same payload returns the stored result; changed payload conflicts. An idempotency key generated anew on every button retry defeats the requirement. Receipts include settlement identity and safe outcome, while presentation retries do not rerun the domain effect.

PostgreSQL and SQLite enforce the same invariant using reviewed dialect-specific transactions. Lock/check accounts and exclusive assets in a deterministic order; recheck ownership/state/available funds inside the transaction. PostgreSQL may use row locks/conditional updates; SQLite uses a short immediate transaction. Neither an in-memory mutex nor a successful single-process test proves multi-writer safety. Transient conflict retries retain operation identity and have a bounded budget.

Transactions are short and contain no provider/Discord calls. Commit domain effects and outbox intent together. After a lost reply, the receipt settles uncertainty about SQL effects; external messages retain their own submitted/unknown states. A restored old database may forget previously delivered effects, so replay after restore needs reconciliation against retained external/backup evidence.

### Shared settlement, domain-owned rules

Economy authorizes accounts, validates funds/holds and posts units; game/card services own valid moves, outcomes, offer revisions and ownership. Both are checked in the same settlement transaction. No command, dashboard form, background reward or AI tool directly changes a balance. Sensitive account administration uses the same rules with an auditable actor/reason, not a hidden bypass.

Wagers reserve eligible stakes before admission. Pre-admission expiry or cancellation releases holds. Once both players accept, admission atomically captures both stakes into match escrow. Mutually exclusive terminal winner, tie, timeout or cancellation outcomes debit that escrow to payouts/fees or refunds under one unique session settlement; they do not release already captured holds. Bot-opponent liabilities require a declared house reserve/issuance policy. Card trades require both parties to confirm the current offer revision, not merely any historical acceptance. Inventory consumption updates quantity/effect/receipt together. See [TCG ADR](ADR-010-waifu-tcg-pipeline-and-game-design.md).

Freeze/disable policies stop new spending while retaining authorized refund/reconciliation paths; they must not strand funds. Corrections use compensating postings linked to original transactions, never silent history edits. Operations cannot be deleted to evade deduplication or inflate a retry budget.

### Reward events and anti-abuse

A trusted domain event carries stable source identity, subject, scope, version and bounded validated metadata. It does not carry an authoritative client-chosen reward amount. Versioned rules evaluate eligibility, cooldown/window state and reward budget before transactionally reserving/issuing credits and XP. Duplicate message/edit/attachment/voice/session events cannot mint repeatedly. Rejected-event re-evaluation policy is explicit so a replay after cooldown does not turn yesterday's denial into a new award.

Text, voice, attachments, games, quests, achievements and giveaways share the engine. Voice awards should exceed ordinary chat under the chosen eligible participation policy, but disconnected/AFK intervals and unverified missing events earn nothing automatically. Hashes and rolling windows require bounded retention; anti-abuse heuristics are imperfect and need false-positive review. A local command cooldown is not durable economy protection.

Daily claims use durable rolling eligibility (24 hours) and streak continuity (36 hours), while interest, quests and energy use their declared calendar periods. Persist the logical eligibility/period identity independently of the applied rule version; changing rules cannot create another claim for the same logical event. A restart or repeated scheduled reset is not another period. XP thresholds and level projections are versioned; altering a curve needs preview/migration policy and cannot silently duplicate milestone rewards. Indexed leaderboard snapshots with as-of timestamps are read models, not fresh global rank recomputed by scanning all users on every profile.

## Reconciliation, retention and rollout

Reconcile ledger sums, each account's postings/projection, active holds, inventory reservations and terminal session receipts. Report a discrepancy and stop affected new settlement; do not automatically edit balances until the source of disagreement is understood. Retain enough headers/receipts to reconstruct totals and reject unsafe replay. Archive strategy must preserve opening checkpoints and integrity checks, and distinguish content erasure from minimum transaction provenance.

The rollout order is contract/schema and both-dialect transaction tests, controlled opening balance migration, limited rewards/read surfaces, bank/transfers, inventory/purchases, then game/TCG settlement. This is future sequencing, not permission to start another workboard scope. Disable new admissions for rollback; drain or explicitly reconcile existing holds. Reverting code cannot reverse already spent rewards or database migration.

## Acceptance and reconsideration

Required evidence includes simultaneous overspend, same-key replay and changed-payload conflict, integer boundaries, atomic card/payment/fee rollback, hold expiry-versus-capture, winner-versus-timeout, profile/rank ties, persistent abuse windows, duplicate rolling daily eligibility claims and calendar interest periods, partial migration and restore replay. Test each supported real driver, plus deterministic service tests and sampled invariant/property checks. A passed simulation does not prove enjoyable balance or immunity to inflation.

Reconsider extraction or accounting representation only when measured contention, storage or operating needs justify it, with an explicit migration/reconciliation design. Tune reward and interest rates through versioned simulations and user feedback. No fixed XP range, cooldown, interest or streak multiplier is accepted as balanced by this ADR. No runtime or live economy tests were executed in this documentation epic; [testing](../testing.md) separates actual evidence from these release gates.
