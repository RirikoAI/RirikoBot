# Handover Note: CHORE-1701 Adventure Plan Corrections

- **Ticket Type & Points**: Chore | 2 pts
- **Author / Agent**: Codex coordinator
- **Status**: DONE
- **Date**: 2026-09-26

## 1. Work completed

- Revised [adventure-game.md](../../adventure-game.md) and [adventure_game_plan.md](../../adventure_game_plan.md) for the four user-requested corrections.
- Replaced shortcut/early-terminal graphs with explicit staged choices: Bazaar/Shrine/Peaks require 5 decisions; Crypt/Ambush require 4. All decision nodes offer 2–4 actions and a free ungated alternative.
- Specified durable global adventure ownership by Discord user ID, admission/revision races, receipts, recovery, and cancellation. Existing mini-game per-channel semantics remain unchanged.
- Replaced the invalid asset-randomization example with active card catalog pagination, explicit rarity floors and weighted tier selection, correct card-definition ownership IDs, and planned shared serial-allocation safeguards.
- Defined energy-only admission when enabled, disabled-energy cooldown fallback, cross-guild cooldown enforcement, 7-energy cancellation refund/capping, upfront non-refundable voluntary prices, and deferred atomic reward/hazard settlement.
- Updated proposed task estimates to 3/8/8/5/3 (27 total) to include the clarified persistence/transaction requirements. Adventure implementation tasks remain proposed, not registered or started.
- Synchronized [board.json](../board.json) and [BOARD.md](../BOARD.md).

## 2. Verification and current state

- One-off Node validation exhaustively walked 464 graph branch paths across all five Markdown catalogs. Every terminal path has the expected decision count; all targets resolve; every decision and terminal is reachable; every decision has 2–4 actions and a free ungated route.
- Confirmed repository signatures for card listing/creation, asset lookup, item grants/consumption, energy consumption, wallet mutations, and transaction handling.
- Checked board IDs/WIP, document links, task estimate agreement, and whitespace. No runtime implementation changed; lint/typecheck/test/build were not run for this documentation-only chore.
- Branch: `develop/2.0.0`; baseline commit: `c32b55a9a4163bab06db6e8d3936e888a0a35c37`. Changes are uncommitted. Both adventure documents were already untracked before this task.

## 3. Decisions and gotchas

- Paid choice costs are an explicit exception to deferred completion settlement. Retrying or abandoning cannot erase a chosen stake/toll; terminal bundles must not charge it again.
- Pending involuntary penalties are discarded on cancellation along with rewards; voluntary prices remain spent.
- Existing repository calls alone do not provide globally safe card serial allocation or cross-repository atomic settlement. The plan explicitly requires database support, shared minting discipline, and both-dialect verification.
- Story estimates are roll-ups; individual task estimates use Fibonacci points. The revised 27-point total is not a claim of approved or completed implementation.
- Scenario branch tables supersede the earlier narrative shortcut graphs. Reward balance and complete prose still require implementation review.

## 4. Next steps

1. If implementation is requested, read the applicable project/subsystem instructions and recheck the board.
2. Groom/register STORY-170 and its proposed tasks/dependencies, reviewing the revised scope and estimates.
3. Start TASK-1701 alone, implement contracts/scenarios with exhaustive validation, and proceed sequentially under WIP limit 1.
4. Review proposed dual-dialect persistence and transaction changes before bot integration; run full quality gates when implementing runtime behavior.
