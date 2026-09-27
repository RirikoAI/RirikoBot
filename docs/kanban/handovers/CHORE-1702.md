# CHORE-1702 — Plan Companion-Level Adventure Reward Ranks

- Type / estimate: Chore, 2 points.
- Status: DONE (2026-09-27).
- Branch: `codex/adventure-rpg`; HEAD `c32b55a9a4163bab06db6e8d3936e888a0a35c37`. Changes uncommitted.

## Work completed

Created [the reward-rank plan](../../adventure-reward-ranks-plan.md) and linked it from [the adventure implementation plan](../../adventure_game_plan.md). Reviewed current companion capture, rank-relevant card level caps, reward accumulation/RNG, atomic payout, JSON session persistence and the simplified Discord views.

Proposed eight ranks F–S+ at levels 1/10/20/30/40/60/80/100, scaling earned credits/player XP/dust and relative item/card drop chances up to +50%. Defined exclusions for energy, costs, losses, guaranteed quantities and fixed wagers; integer rounding, frozen policy snapshots, recovery and old-session compatibility. Preserved the story-focused UI with a compact rank line and optional rank help. Proposed four sequential implementation packages totaling 13 points, with reproducible balance checks and explicit acceptance criteria.

## Verification and decisions

Documentation-only change; no gameplay code, database or deployed settings changed. Checked formulas/examples, existing level caps, local document links, board ID uniqueness and WIP. Runtime lint/test/build are unnecessary for this planning chore and were not rerun. Rank values remain a proposal pending implementation balance validation; the earlier story's live verification status is unchanged.

No implementation tickets were activated or added to STORY-170's 40-point total. The board's pre-existing duplicate summary rows for STORY-170, TASK-1705 and TASK-1706 were removed so each appears only once in its story table, in accordance with protocol section 8.1.

## Next steps

When implementation is requested, register the four proposed work packages using unused IDs and recheck WIP. Start with policy/contracts and explicit companion-level snapshots, then reward finalization, UI and verification. Keep prior sessions unboosted; do not parse level from names or boost already-paid receipts. No commit, PR or deployment was performed.
