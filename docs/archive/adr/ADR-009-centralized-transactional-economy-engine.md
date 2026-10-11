# ADR-009: Centralized Transactional Economy Engine

## Status
Accepted

## Context
In Ririko 1.4.0, economy operations updated user rows directly without transactions (`user.coins += amount; await userRepository.save(user)`). This exposed the economy to race conditions, currency duplication exploits, and balance discrepancies. Furthermore, the item inventory system was left unfinished (`// TODO! Add an item with that rarity to the user's inventory`).

## Decision
1. **Double-Entry Ledger Pattern**: Maintain an immutable `economy_transactions` table recording every credit, debit, transfer, daily reward, shop purchase, and gamble outcome.
2. **ACID Transactions**: Execute all multi-account transfers inside database transactions with row-level locks or explicit `CHECK (wallet_balance >= 0)` constraints.
3. **Anti-Spam Experience Curve**: Replace per-message XP incrementing with a rolling-window cooldown algorithm (15-25 XP rewarded at most once per 60 seconds per user per guild, ignoring bot spam and short repetitive text).
4. **Complete Shop & Inventory**: Build an active item catalog with inventory bags, usable consumable items, and custom profile background purchases.
5. **Daily Streaks & Banking**: Implement daily claim streaks with escalating multipliers and bank deposits with interest calculations.

## Consequences
### Positive
- Immune to race conditions, double-spend exploits, and currency inflation glitches.
- Complete audit trail of every coin earned or spent across the entire platform.
- Fair, anti-spam leveling progression.

### Negative
- Higher transaction logging volume in the database, requiring index maintenance and periodic archiving of ancient transaction logs.
