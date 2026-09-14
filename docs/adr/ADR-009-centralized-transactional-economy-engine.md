# ADR-009: Transactional economy and inventory

## Status

Proposed future subsystem. No new wallet, ledger, bank, shop, reward or inventory service is implemented by the foundation schema.

## Problem

Legacy coin updates read a user, change `coins`, then save without an atomic debit boundary. Message rewards update global user coins/karma, and item discovery only logs a rarity before an inventory TODO. Source shows race/validation risks, not evidence that every suspected exploit occurred. New transfers, games, shops and TCG ownership require shared transactional rules.

## Options considered

- Keep mutable balance columns and add checks around command handlers.
- Store transaction descriptions alongside mutable balances without balanced postings.
- Use service-owned transactions with explicit accounts, balanced ledger postings, constraints and idempotency.

## Decision proposed

Define integer currency units and account scope explicitly. A double-entry ledger must contain balanced postings per currency, including explicit issuance/sink accounts; a single transaction-history row is not itself double entry. Use unique operation keys, nonnegative spendable-balance constraints and atomic conditional debits/transfers. Define PostgreSQL/SQLite transaction strategies separately and expose one service contract.

Implement shops, inventory consumption, bank movements, game stakes/payouts and card-market payments through that service. Trade/item locks and ledger changes must commit together where required. Keep public commands free of direct balance mutations. Preserve audited balances/karma and migration provenance without inventing historical ledger entries or item ownership.

Apply bounded anti-spam XP rules per user/guild and define the relationship between XP, global legacy karma and coins before migration. XP amounts, cooldown windows, daily streak multipliers, bank interest and prices remain configurable game-design choices requiring simulation; the previous fixed values were not verified requirements or balanced outcomes.

## Consequences

Ledgers and receipts increase storage and reconciliation work. Database constraints and idempotency reduce risk but cannot justify claims of immunity to double-spend, implementation defects or inflation. Issuance policies, retention and correction entries require operator visibility. A service must distinguish retryable conflicts from insufficient funds and already-applied operations.

## Validation and evidence

Before commands are exposed, test concurrent spending, repeated operation keys, partial failure rollback, issuance balance, overflow/negative input, inventory locks and ledger/balance reconciliation on both dialects. Migration must reconcile supplied source totals and preserve discrepancies. See [legacy data audit](../legacy-data-manifest.json), [database decision](ADR-003-database-layer-and-dual-dialect-orm.md), and [TCG transaction dependencies](ADR-010-waifu-tcg-pipeline-and-game-design.md).
