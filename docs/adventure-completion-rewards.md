# Adventure completion economy (version 2)

Implemented locally on 2026-09-27 in TASK-1713–TASK-1715. This supersedes the original authored amount totals for **new admissions** across all 35 adventures. Rank policy version 1 and its level thresholds remain unchanged. The temporary user-specific S+ override was removed in CHORE-1703; new runs use companion level for every user. Existing sessions without `rewardEconomy` finish using their original rules.

## Progression and the tower benchmark

Every completed ending, including failures, awards credits, player XP, dust and XP to the original companion. Abandonment and timeout discard pending rewards. Solo runs have no companion XP; a companion at its rarity level cap receives no excess XP. The summary shows actual grants and level changes, omitting zero values.

The reference is repeat tower floor 34: mean rewards of 875 credits, 175 player XP, 70.5 dust and 890 XP per participating card for 20 energy. Adventure rank E (levels 10–19, including the requested level-18 comparison) targets **110% of each reference resource per net energy**, after paid choices, expected wallet losses and the shop value of consumed offerings. The target concerns one companion; tower may award XP to multiple party members.

At admission, an exact traversal of the chosen story includes every decision and failed check, using the companion's snapshotted stats and affinity. Choices are equally likely and assumed affordable. It freezes resource coefficients in the session, rather than choosing rewards from a successful path. The final outcome and authored rewards still determine the actual payout:

- Outcome weights: critical success 1.30, success 1.15, mixed 1.00, failure 0.70, critical failure 0.55.
- Resource shape: outcome weight plus authored eligible credits / 300, player XP / 100 or dust / 50. Companion XP uses the player-XP shape.
- Each coefficient makes the weighted mean meet the resource target at rank E, accounting for excluded fixed rewards and costs. Completion computes the calibrated base, floors it, then applies the frozen rank multiplier once. Fixed wager/exchange components remain excluded from multiplication.
- Rank E is the balance anchor. Higher ranks retain the user-requested larger bonuses up to S+ (+500%); they deliberately exceed the 10% advantage. F rewards are below the E target. Better stats change route probabilities, loot and variance; admission calibration keeps the ordinary expected reward rate consistent at a given rank.

This is an expectation under the documented choice model, not a guarantee that every route or player strategy beats tower. Wallet shortages, preferred routes, capped companions and unavailable loot can change realized value. Paid choices charge immediately; calibration includes their average cost but does not refund a player's exact spending. The Bazaar's winning wager retains its fixed 400-credit component for a 200-credit stake; new runs also receive the calibrated completion reward.

## Energy and cooldown mode

Entry remains 15 energy. Completion restoration is capped at **7 energy total** on new runs, preventing old full-refund endings from becoming free repeat farms. Penalties remain unchanged. The calibration assumes a 100-energy starting balance, no external energy changes and penalties clamped to remaining energy. Normal completed runs therefore cost at least 8 net energy. Cancellation still refunds 7; an unpublished failed start receives admission compensation under the existing rules.

When energy is disabled, neither entry nor completion affects energy. The existing global 15-minute start cooldown applies, with 15 virtual energy used only to calibrate ordinary rewards. Insufficient energy does not activate this fallback.

## Card acquisition specialty

New completion card opportunities use these base chances before the relative rank bonus:

| Ending | Base chance | Rank E chance | New card floor |
|---|---:|---:|---|
| Success / critical success | 20% | 30% | RARE |
| Mixed | 15% | 22.5% | RARE |
| Failure / critical failure | 10% | 15% | UNCOMMON |

An existing terminal card opportunity receives at least the corresponding base chance and retains its authored rarity floor. Guaranteed and rarer authored drops stay intact. If a prior node already awarded a card, no additional universal completion opportunity is added. Existing authored terminal drops still run. Rank multiplies chances, capped at 100%, without multiplying card quantities. A new completion opportunity remains rank-scaled even when an authored exchange bundle is excluded.

Card selection continues to require an active eligible definition and asset. Empty/removed pools produce the existing unavailable-card receipt, never a lower-rarity substitute. The balance report counts successful card intents, assuming an eligible pool; it does not count absent assets as minted cards.

## Atomic settlement and compatibility

Companion XP uses the original owned-card ID. The shared progression service locks the card row and participates in the adventure transaction, so simultaneous tower XP cannot overwrite it. Ownership and eligible state (IDLE/EQUIPPED) are checked at payout; transferred, deleted or trade/market-listed cards receive no XP, with an explanation in the summary. XP is clipped to the card's remaining rarity-level capacity. Ordinary rewards still settle if the companion becomes unavailable.

The completion amounts, rank and economy coefficients are frozen before `SETTLING`. XP, wallet, player XP, dust, items, cards, energy and the receipt commit together. Retries cannot double-grant XP, and failures roll back the transaction. Rank metadata and economy version are separately validated. Old sessions and immutable receipts are not recalculated. Internal tests may explicitly disable completion rewards to exercise version-1 compatibility; production admissions default to version 2.

Deploy compatible readers/writers together and restart the bot. Drain new-format sessions before reverting to a binary without version-2 support. No new SQL column or live data migration is required for these JSON fields.

## Verification

The [generated balance report](adventure-reward-balance.md) and [JSON data](adventure-reward-balance.json) use 3,150,000 seeded runs: 35 stories at eight ranks, plus a free-choice-only E sensitivity sample. Level-18 E results across stories are 8.8–11.2% above tower for net credits, 8.7–10.3% for player XP, 6.7–9.8% for dust and 9.3–10.9% for companion XP; integer rounding accounts for much of the dust difference. Average card intents range from 17.1% to 35.6% per run.

Reproduce with `pnpm exec tsx scripts/adventure-reward-balance.ts`. See [TASK-1715](kanban/handovers/TASK-1715.md) for test results and pending live PostgreSQL/Discord verification. Public adventure messages continue to hide route history; this developer report does not publish route solutions.
