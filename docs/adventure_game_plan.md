# Implementation Plan: Interactive Branching Adventure RPG

## Goal and scope

Build `/adventure` and prefix equivalents as a public, player-controlled RPG connecting mini-games, economy, leveling, and Waifu TCG. Completed runs require exactly four or five meaningful decisions, targeting roughly 2–3 minutes for an engaged player; the 90-second per-decision timeout is a maximum wait, not the expected pace.

The authoritative contracts, full revised scenario graphs, payment examples, and edge cases are in [adventure-game.md](adventure-game.md). The implementation now lives in the repository; rollout verification is recorded below.

## Implementation status — 2026-09-26

`TASK-1701` through `TASK-1704`, presentation follow-up `TASK-1706`, catalog expansion `TASK-1707`, and reward-rank tasks `TASK-1708`–`TASK-1711` are DONE. The 35 scenarios, durable global ownership, transactional payments/rewards, public Discord commands, restart recovery and shared scene illustrations are implemented. `TASK-1705` and `STORY-170` are in REVIEW: focused suites pass, while live PostgreSQL/Discord validation remains unexecuted by the agent and the previously documented full-suite/coverage environment limitations remain. See [verification handover](kanban/handovers/TASK-1705.md), [presentation handover](kanban/handovers/TASK-1706.md) and [runtime guide](adventure-runtime.md). The [catalog](adventure-catalog.md) lists all 35 adventures and their artwork.

## Resolved grooming decisions

Implemented follow-up (2026-09-27): [Companion-level reward ranks](adventure-reward-ranks-plan.md) defines a level-based F–S+ ladder, reward amounts/drop chances, frozen session policy, legacy compatibility and a 13-point implementation sequence completed as TASK-1708–TASK-1711. The user requested tenfold bonuses, up to +500% amounts/relative drop chance. Existing sessions keep legacy rewards.

| Topic | Required behavior |
|---|---|
| Visibility | Public embeds; only the initiating player can act |
| Depth | Exactly 5/5/4/5/4 decisions for Bazaar/Shrine/Crypt/Peaks/Ambush; terminal embeds and automatic transitions do not count |
| Graph shape | Stage k only leads to k+1; only final-stage choices lead to terminal nodes; every decision has 2–4 actions including a free ungated route |
| Global ownership | Dedicated durable adventure ownership keyed solely by Discord user ID, unique across channels/guilds/workers; existing per-channel mini-game sessions remain unchanged |
| Card source | Existing active card definitions via paginated `WaifuCardRepository.listCards`, filtered by minimum rarity and usable assets |
| Entry energy | Energy enabled: require and consume 15; reject balances 0–14, with no cooldown fallback |
| Fallback | Energy disabled only: persist user-global start cooldown of 15 minutes; while active it also blocks starts in energy-enabled guilds |
| Timeout/abandon | No pending rewards or penalties; refund floor(actual entry charge /2), normally 7 energy, capped to capacity; cooldown mode refunds 0 and keeps cooldown |
| Voluntary costs | Bribes, purchases, wagers, and item offerings are paid in full when accepted; no payment from pending rewards and no refund on abandonment |
| Completion | Accumulated rewards and involuntary penalties settle once atomically; paid costs are excluded from pending losses |
| Retries | Durable choice/settlement receipts, revision checks, frozen RNG outcomes, and transactional state changes prevent duplicate charges/rewards |

## Implementation components

### 1. Contracts and scenario catalog (`TASK-1701`, 3 points)

Create `packages/services/src/adventure/types.ts`, scenario files, registry, and barrel exports. Use discriminated decision/terminal nodes and transition forms. Track pending reward intents, actual paid costs, admission mode/charge, revision, RNG state, deadlines, and durable receipts.

| File under `scenarios/` | Decisions | Themes |
|---|---:|---|
| `the-goblin-bazaar.ts` | 5 | SHADOW/LIGHTNING; trade, smugglers, wagers |
| `the-sunken-shrine.ts` | 5 | WATER/ICE; seals, guardian, flood |
| `the-cursed-crypt.ts` | 4 | LIGHT/SHADOW; trials, curses, treasure |
| `the-celestial-peaks.ts` | 5 | LIGHTNING/EARTH; griffins, storms, summit |
| `the-bandit-ambush.ts` | 4 | FIRE; toll, retaliation, escape |

Implement the revised tables in specification section 3, including the added intermediate/final choices. Do not reuse the earlier short routes or pad them with acknowledgement buttons. Validate every path, both outcomes of every check, stage advancement, reachability, and free fallback actions. Card/stat snapshots and seeded RNG make checks deterministic.

### 2. Global ownership, admission, and traversal (`TASK-1702`, 8 points)

Create `AdventureEngine` and `AdventureSessionRepository`. Add SQLite/PostgreSQL schema and migration support for durable sessions, unique active ownership by user ID, fallback deadlines, and revision/receipt state. Review database contracts before bot wiring.

The existing `MiniGameSessionManager` indexes user plus channel; neither using it directly nor separately instantiating one manager per channel enforces adventure's global rule. Ownership must be database-enforced, with an optional in-memory cache.

Admission atomically claims ownership, checks cooldown/energy, charges entry or records fallback cooldown, and creates state. Conflicting starts do not charge or change cooldown. Resolve expired ownership through idempotent cancellation, not blind deletion. Persist and recover deadlines/RNG/state across restart and workers.

Resolve the actual energy-enabled configuration during implementation; if absent, add a validated adventure setting defaulting to enabled. Never treat zero energy as a disabled setting. Use `PlayerEnergyRepository.consumeEnergy(userId, 15, tx)`. Snapshot entry mode and actual charge. Capacity is `maxEnergy + bonusEnergy`.

Serialize accepted choices, timeout, abandon, and settlement by revision/status. A choice receipt key `(sessionId, revision)` makes stale/duplicate input harmless. Freeze final rolls and move to `SETTLING` before payout; cancellation may no longer win after that transition. Snapshot card stats/element at start.

### 3. Choice payment and atomic payout (`TASK-1703`, 8 points)

Create `AdventurePayoutService` and transactional choice-payment/cancellation operations.

- For each paid choice, recheck full wallet/item affordability under transaction locks, debit using `EconomyRepository.modifyBalance(..., tx)` / `ItemGrantService.consume(..., tx)`, and save outcome/transition/receipt together. Reject unaffordable choices without consuming RNG or changing the deadline. Every node retains a free action.
- Paid prices are non-refundable after acceptance and never enter the involuntary-loss accumulator. Stake 200 once; a winning wager pays 400 gross, a loss pays zero. The 150-credit toll likewise appears only once in net credits.
- At completion, serialize against other wallet writers, clamp involuntary losses to the pre-settlement wallet, then add rewards. Use bigint currency arithmetic and ledger metadata. `net = gross rewards - actual losses - paid costs`.
- Pass one `withTransaction` context through credits, player XP, items/dust, cards, energy, settlement receipt, completion state, and ownership release. Add missing transaction support before declaring the operation atomic. A failed participant rolls everything back; retries use the frozen outcome and unique session settlement receipt.
- Energy-mode completion drains first (floor 0), then restores (capacity cap). Cooldown-mode sessions never modify energy. Cancellation discards all pending rewards/hazards, returns 7 of the 15 charged energy once (capacity permitting), or 0 in cooldown mode; paid choices remain spent and fallback cooldown remains active.
- Initial presentation failure before any presented/accepted choice uses separate idempotent admission compensation (entry energy up to remaining capacity, and only that session's fallback deadline). Later Discord failures re-present committed state without recharging. An unpresented decision has a 90-second delivery-recovery deadline from state commit; expiry compensates initial admission or cancels a later decision normally. Reconcile ambiguous sends before compensating or re-presenting.

#### Card grant algorithm

1. Roll the drop chance once. If successful, consider tiers at or above the explicit order `COMMON < UNCOMMON < RARE < SUPER_RARE < ULTRA_RARE < SECRET_RARE < SIR < MYTHIC`.
2. Paginate `WaifuCardRepository.listCards({ isActive: true, rarity, limit, offset }, tx)` for all eligible tiers. Check `WaifuAssetRepository.findById(card.assetId, tx)` and exclude missing/taken-down assets.
3. Renormalize existing `RARITY_TIERS` weights over eligible nonempty tiers, sample a tier with injected RNG, then sample uniformly within it. Freeze the selected definition for retry.
4. At settlement revalidate availability. Empty pool or removed/inactive selection gives an explicit `NO_ELIGIBLE_CARD` result; never silently downgrade or reroll. Real database errors roll back.
5. Allocate a serial with shared per-card serialization and a unique `(cardId, serialNumber)` guard after auditing existing data, then call `createUserCard` using the **card definition ID** and the transaction. Update all competing minting paths to use the same allocation discipline. Existing `getHighestSerialNumber() + 1` alone is unsafe.

No `findRandomAsset()` call or payout-time `CardGenerator` is needed. The exact repository-backed persistence shape is in specification section 4.3.

### 4. Discord command and service wiring (`TASK-1704`, 5 points)

Add `adventure.command.ts`, export/register it through the games command factory, and wire the engine/repositories/payout service in `apps/bot/src/services.ts`.

- Slash action `start|status|abandon`, optional scenario ID; prefix aliases `adventure`, `adv`, `journey`, `quest-adventure` with equivalent arguments.
- Public story/companion embeds with a chapter/deadline footer, 2–4 owner-locked choice buttons and visible prices. Choices appear only on buttons; omit affinity explanations, wallet panels and pending journey totals.
- Include session ID and revision in button IDs; reject unauthorized/stale clicks. Disable old buttons after accepted transitions and present the next decision.
- Start throttle 10 seconds; allow status/abandon during it. Choice deadline 90 seconds from successful presentation, unchanged by invalid clicks.
- Global start conflicts return the existing session's location, ephemeral for slash commands and normal replies for prefix commands.
- Final recap reports nonzero actual grants, clamped losses, paid prices and net credits. One energy value includes entry and settlement/refund. Hide route history and empty fields. Status/recovery can re-present state or a stored receipt after message failure.

### 5. Integration verification (`TASK-1705`, 3 points)

Create domain engine/payout suites and bot command tests. Cover:

1. Every terminal route has exactly its scenario's decision count; no unreachable/dead nodes or unavailable-only decisions.
2. Concurrent starts across channels/guilds/workers yield one session/charge; ownership and cooldown survive restart.
3. Energy boundaries 0/1/14/15, disabled-energy mode, cross-guild fallback cooldown, setting changes, capped 7-energy refund, and zero refund/effects in cooldown mode.
4. Paid choice affordability, potion consumption, duplicate callbacks, non-refundable cancellation, no double toll/stake debit, and the fixed 400-credit wager component (plus calibrated completion rewards on version-2 runs).
5. Wallet-loss clamping before rewards, concurrent wallet mutation, and atomic rollback across every reward participant.
6. All rarity floors, catalog pagination, empty/missing/removed assets, deterministic weighted selection, and concurrent card minting/serial allocation.
7. Choice/timeout/abandon/settlement races, stable retry receipts, restart recovery, and Discord delivery failures.
8. Slash/prefix parity, ownership/stale buttons, public visibility, and status/abandon behavior.

Use injected clocks and seeded RNG. Run transaction integration tests on both SQLite and PostgreSQL.

## Execution order and estimates

`TASK-1701 (3) → TASK-1702 (8) → TASK-1703 (8) → TASK-1704 (5) → TASK-1705 (3)`.

Presentation follow-up `TASK-1706 (5)` addresses playtest feedback: one start message, story and companion focus, zero-free summaries without route history, and 15 illustrated locations shared across all 111 nodes. The user selected shared locations over one image per node. Generation prompts are recorded in `assets/adventure/manifest.json`.

Expansion `TASK-1707 (8)` adds 30 authored four-decision adventures with at least three endings each, 30 distinct shared-location illustrations and searchable scenario autocomplete. The complete catalog has 35 adventures, 45 images and 413 nodes; traversal validates 1,315 complete paths. Exact new prompts are recorded in `assets/adventure/expansion-manifest.json`. See [expansion handover](kanban/handovers/TASK-1707.md).

**67 points total**, including the presentation follow-up and the persistent ownership/payment safeguards. Individual task estimates use Fibonacci values; the total is their roll-up. The story and task dependencies are registered on the board. Keep one ticket in progress and follow the story-completion PR checkpoint.

## Implementation quality gates

Run targeted suites first:

```bash
pnpm test packages/services/src/adventure/
pnpm test apps/bot/src/commands/games/__tests__/adventure.command.test.ts
```

Then `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

For manual verification run `pnpm dev:bot`, finish each scenario, inspect `/balance` and `/card collection`, try prefix aliases, test cross-channel/guild starts, and exercise zero-energy, insufficient-funds, timeout, and abandonment behavior. Automated verification and known environment limits are recorded in the TASK-1705 handover.

Completion economy TASK-1713 (5), companion XP/card acquisition TASK-1714 (5) and verification TASK-1715 (3) implement [tower-benchmarked completion rewards](adventure-completion-rewards.md). Failed endings earn progression, new runs cap restoration at seven energy, and the original companion receives atomic XP. See the [balance report](adventure-reward-balance.md).

Historical user override TASK-1712 (1 point) was removed by CHORE-1703 on 2026-09-28. New admissions use companion level for every user; existing runs retain their saved rank.
