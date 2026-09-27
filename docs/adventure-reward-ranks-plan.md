# Plan: Companion-Level Adventure Reward Ranks

Status: **Implemented locally** (2026-09-27), TASK-1708–TASK-1711. The user requested ten times the proposed percentage bonuses: 0/50/100/150/200/300/400/500%. Applies to all 35 adventures. Live PostgreSQL/Discord checks remain pending. See [verification handover](kanban/handovers/TASK-1711.md).

Completion follow-up: **economy version 2** (TASK-1713–TASK-1715) adds companion XP, failure progression, stronger card acquisition and tower-calibrated ordinary rewards. The [completion policy](adventure-completion-rewards.md) is authoritative for new admissions; old sessions retain their original rules. Rank multipliers remain version 1.

## Player experience

A stronger companion earns a higher adventure reward rank. Rank is derived automatically from the equipped card's level when a run starts; there is no separate rank XP, purchase or claim step. Finishing an adventure awards calibrated credits, player XP, crafting dust and companion XP, and improves item/card acquisition chances.

Keep the current story-focused layout. Add one short line inside the existing companion field: `Reward rank B · +200% rewards · +200% drop chance`. Show the stored level separately from the display name; do not parse `Lv.` text. The final summary shows actual boosted totals and a compact `Reward rank B` footer, with zero values and route history still hidden. Drop percentages are relative bonuses; a short optional `/adventure action:ranks` view explains the table and gives a 10% → 30% example. Prefix parity: `!adv ranks`. This help action never starts or charges for a run and returns one response.

Solo runs retain normal rewards. Show `Reward rank F` in the companion field for solo play, without a redundant +0% explanation. Reward rank is independent of scenario risk, story outcome, elemental affinity and card rarity.

## Implemented rank ladder

| Companion level | Rank | Credits / player XP / dust / companion XP | Item and card drop chance |
|---|---|---:|---:|
| No companion, or 1–9 | F | Normal | Normal |
| 10–19 | E | +50% | +50% relative |
| 20–29 | D | +100% | +100% relative |
| 30–39 | C | +150% | +150% relative |
| 40–59 | B | +200% | +200% relative |
| 60–79 | A | +300% | +300% relative |
| 80–99 | S | +400% | +400% relative |
| 100+ | S+ | +500% | +500% relative |

Use absolute level, not percentage of a card's maximum. Current rarity caps are Common 20, Uncommon 30, Rare 40, Super Rare 50, Ultra Rare 60, Secret Rare 70, SIR 85 and Mythic 100. Consequently Common can reach D, Uncommon C, Rare/Super Rare B, Ultra Rare/Secret Rare A, SIR S and Mythic S+. This is an intentional consequence of the existing progression system, not an additional rarity multiplier. Equal levels earn equal bonuses except for the explicit user-requested override: Discord ID `391220345769689090` always starts at exactly S+ (+500%), including solo and level-100 runs. Its actual level is still snapshotted; older runs retain their saved rank.

Bonuses increase at rank thresholds, not at every level. Clamp reward-rank evaluation to level 100 for future higher levels. A missing companion uses F; a new snapshot with a present but invalid level (noninteger, nonfinite or below 1) is rejected before entry payment. Legacy records have separate compatibility rules below.

## What the bonus affects

| Reward or mechanic | Rule |
|---|---|
| Calibrated earned credits, player XP, crafting dust, companion XP | Increase by the rank amount multiplier |
| Item/card drop chance, including completion opportunities | Multiply by the rank chance multiplier, capped at 100% |
| Guaranteed drops | Stay guaranteed, with the same quantity |
| Absent or zero-probability drops | Rank alone does not add drops; completion economy adds a card opportunity when no earlier card dropped and raises terminal card chances to the outcome baseline |
| Item quantities / number of cards per successful drop | Unchanged; a chance bonus does not duplicate drops |
| Card rarity floor and weighted rarity selection | Unchanged; rank improves the chance of a drop, not its rarity |
| Energy restoration, entry charge, cancellation/start-failure refunds | Rank does not scale them; economy version 2 caps completion restoration at 7 |
| Involuntary penalties, bribes, purchases, stakes and item costs | Unchanged |
| Returned stakes and fixed wager payouts | Excluded from scaling; the Bazaar retains its 400-credit wager component for a 200-credit stake, plus the new calibrated completion reward |
| Skill-check probabilities, element gates and stat checks | Unchanged; those already benefit from companion stats/affinity |

Player XP and companion XP are separate rewards. Economy version 2 introduces progression rewards on every completed ending, including failures, with lower outcome weights for failures. Companion XP goes to the original eligible owned card and respects its rarity level cap. Cancellation discards pending rewards and grants no XP.

Use `AdventureRewardConfig.rankScaling?: 'standard' | 'none'`, defaulting to `standard`, to exclude explicit fixed exchanges/wagers. The Bazaar jackpot bundle uses `none`. Its supplies exchange uses a final-choice `terminalRankScaling: none` override so the shared ordinary ending retains its normal boost elsewhere. All 35 scenarios were audited for other fixed wager/exchange payouts. It excludes amount and authored chance scaling for that bundle. The new completion card opportunity is separately rank-scaled. Ordinary earned rewards behind a paid route remain eligible; paying a bribe is not itself a reward multiplier exemption. Keep shared crafting dust consistently represented by `rewards.dust`; validate against using a `CRAFTING_DUST` item grant to bypass the amount rule.

## Calculation and examples

Store multipliers as integer basis points: 10,000 means normal, 30,000 means +200%, 60,000 means +500%.

- Roll each base credit range once using the existing persisted RNG. Accumulate eligible base credits, XP and dust separately from excluded amounts.
- On new admissions, calibrate the eligible base from the outcome weight and authored reward shape using frozen economy coefficients (see the completion policy). Then compute each final resource once: `excluded + floor(eligibleBase × amountBps / 10_000)`. Round down after aggregating eligible awards across the run, not per node. Use bigint for currency and intermediate integer multiplication; validate safe integer bounds before converting XP/dust to numbers. Keep currency values as decimal strings in JSON.
- Before each item/card chance roll, compute `effectiveChance = min(1, baseChance × chanceBps / 10_000)`. This is a relative increase, not percentage points. Use the existing single RNG draw and comparison for each drop, including guaranteed drops, so the rank multiplier adds no extra draws. Economy version 2 can add a new completion card roll. Transition checks and the weighted rarity-selection algorithm are not modified.
- Apply scaling once, before saving `SETTLING`. The payout service consumes frozen final totals; it never boosts them again. Final receipts and displayed net credits use those actual amounts.

| Calibrated base / chance example | Normal | Rank B (+200%) | Rank S+ (+500%) |
|---|---:|---:|---:|
| Earned credits | 300 | 900 | 1,800 |
| Player XP | 100 | 300 | 600 |
| Crafting dust | 50 | 150 | 300 |
| Card drop chance | 10% | 30% | 60% |
| Item drop chance | 80% | 100% | 100% |
| Guaranteed item | 1 item | 1 item | 1 item |
| Fixed wager component | 400 | 400 | 400 |

At rank B, a run earning 300 eligible credits, with 50 actual involuntary losses and 30 already paid for a choice, reports `900 − 50 − 30 = 820` net credits. Penalties are still clamped to the pre-settlement wallet before rewards are credited. An entry of 15 energy plus a 5-energy penalty remains a single `−20` energy result at every rank. A calibrated eligible dust total of 6 at rank D produces `floor(6 × 2) = 12`. Legacy rank-only runs aggregate authored awards directly before scaling.

## Contracts, persistence and integration

Current integration points: [types](../packages/services/src/adventure/types.ts), [engine](../packages/services/src/adventure/adventure-engine.ts), [payout service](../packages/services/src/adventure/adventure-payout.service.ts), [command](../apps/bot/src/commands/games/adventure.command.ts), [view](../apps/bot/src/commands/games/adventure-view.ts), and [session repository](../packages/database/src/repositories/adventure-session.repository.ts).

1. Add a pure, versioned `reward-rank.ts` policy with rank definitions, rank lookup, amount calculation and chance calculation. Define contracts before wiring behavior. Keep UI labels and calculations on the same table.
2. Extend new companion snapshots with explicit `userCardId` and `level`. Read the level from the equipped ownership record, alongside the existing loadout-derived stats, not from the player account, display name or command arguments. Capture the companion once for admission; changing equipment or leveling afterward does not change the frozen reward budget. Trading/dismantling can make the original companion ineligible for XP at settlement; XP is never redirected. Resolve the snapshot through a server-side admission callback using the admission transaction, validating current ownership/equipped state before charging, rather than trusting a stale pre-admission lookup.
3. Persist a session `rewardRank` snapshot containing `policyVersion`, `rank`, `companionLevel` (null for solo), `amountBps` and `chanceBps`. Freeze actual multipliers, not just a rank label, so a future balance-table change cannot alter an in-flight run.
4. Persist a versioned reward-calculation state with eligible base and excluded totals for credits/XP/dust, plus a `finalized` flag. Keep item/card rolls and intents in existing pending rewards. Finalization writes final numeric totals and the flag in the same accepted-choice transaction; retries must not add or scale them twice. Guard overflow before state is committed.
5. Copy rank/version metadata and base-versus-bonus amounts into the durable settlement receipt for audit and recovery. Cancellation receipts show no granted reward bonus. Keep atomic settlement, serial allocation, unavailable-card handling, global ownership and choice revisions intact.
6. Session payloads and receipt data are already JSON-backed for SQLite/PostgreSQL, so no new indexed table or column is expected. Add explicit decoding/normalization for older payloads in a domain adapter; the database package must remain independent of service-domain types. Verify both dialects and recovery paths before relying on this compatibility approach.

### Existing sessions and rollout

Existing ACTIVE, SETTLING and completed sessions without the new policy fields retain legacy unboosted behavior for the entire run. Do not infer a rank by parsing a companion name, reading its current level or backfilling old rewards. Existing pending amounts and RNG state remain untouched. New sessions store rank policy version 1 and completion economy version 2, including solo/F runs. Existing rank-only sessions without an economy snapshot keep their original payouts. Distinguish missing legacy fields from malformed version-1 fields; corrupt new snapshots must fail safely, not silently fall back to a different multiplier.

Completed receipts remain immutable. Rank/table changes affect only new admissions. Deploy matching readers/writers together and restart all bot workers; an older binary must not resume a session written with the new calculation state. Startup should reject unsupported newer policy versions. A rollback requires draining new-format active sessions or retaining a compatible reader. Synchronize the new optional `ranks` action during normal command startup registration.

## Implementation sequence and estimates

Implemented sequentially as TASK-1708 (3), TASK-1709 (5), TASK-1710 (2) and TASK-1711 (3). Total: **13 points**. With the S+ override and completion-economy follow-ups, the story roll-up is now 67 points; its prior live-verification task remains in REVIEW.

| Order | Points | Deliverable |
|---|---:|---|
| 1 | 3 | Rank policy/contracts, authoritative snapshot, legacy JSON normalization and boundary tests |
| 2 | 5 | Eligible/excluded accumulation, chance scaling, frozen finalization/receipts, catalog audit and payout/retry integration tests |
| 3 | 2 | Compact companion/result rank display and slash/prefix ranks help; retain current presentation rules |
| 4 | 3 | All-catalog balance report, compatibility/recovery/concurrency checks, quality gates and rollout documentation |

## Acceptance and balance checks

- Test every threshold immediately below/at/above it, all eight rarity caps, solo runs, invalid levels and levels above 100. A level increase never reduces an eligible amount or chance; equal levels produce equal ranks.
- Verify all example amounts, bigint values above JavaScript's safe integer range, XP/dust overflow guards, cross-node rounding, zero/absent/100% chances and fractional probabilities. Excluded authored components retain their payout value, alongside the new calibrated completion reward.
- Use seeded RNG and injected clocks. Check each drop at its chance boundary, plus exact legacy/F behavior and unchanged RNG consumption at the chance-roll layer. Do not assert identical future RNG streams after different loot outcomes cause different card-selection work.
- Exercise duplicate buttons, rejected payments, abandon/timeout, initial delivery failure, transaction rollback, restart/recovery, duplicate settlement and mid-run equipment/level/table changes. There must be one frozen rank and one payout per run.
- Test legacy ACTIVE, SETTLING and completed JSON fixtures, new F and boosted sessions, malformed new metadata and unsupported policy versions on SQLite and the opt-in PostgreSQL suite.
- Preserve minimum rarity, empty/removed card-pool behavior, paid-choice affordability and all 1,315 scenario paths. No added decisions or public route history. Views still use one illustrated story message, omit zeros and combine energy into one net value.
- Produce a reproducible developer-only balance report for all 35 stories at each rank: gross/net credits, player XP, dust, item/card expected counts, paid-route effects and reward per 15 energy or fallback cooldown. Separate fixed-path reward scaling from the existing effect of stronger stats on route success. For each fixed path, eligible amounts cannot exceed 6× base and drop probability cannot exceed `min(1, 6× base)`; rank alone leaves the rarity distribution conditional on a successful drop unchanged; newly introduced completion drops use the new policy floors.
- Review guaranteed rare-card paths and routes selectable repeatedly by scenario ID. The existing 15-minute fallback cooldown and energy regeneration still constrain frequency; measure inflation across representative route choices before release. The explicit completion-economy follow-up supersedes authored amount totals using the documented calibration; old sessions remain unchanged.
- Run focused rank/engine/payout/command tests, then `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and formatting checks. Record pre-existing unrelated failures separately. Smoke-test rank changes across two new runs and frozen behavior within one run in Discord before rollout.

The +500% ceiling is the user-requested tenfold increase over the initial proposal. A [seeded balance report](adventure-reward-balance.md) compares all ranks and stories; these estimates do not replace live economy observations. The implementation uses a single global policy; guild-specific multipliers, rarity upgrades and rank-specific artwork are outside this plan.
