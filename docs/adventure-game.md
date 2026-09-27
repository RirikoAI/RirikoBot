# Adventure RPG — Branching Path Engine Specification

## 1. Purpose and confirmed rules

`/adventure`, `!adventure`, `!adv`, `!journey`, and `!quest-adventure` provide public, button-driven adventures connecting mini-games, economy, leveling, and Waifu TCG. Only the initiating player can choose actions.

- The catalog contains **35 adventures**: the original five below and [30 additional illustrated stories](adventure-catalog.md), each with four decisions and at least three endings. Search the slash-command scenario option by title, theme or element; results are limited to 25 per query.
- Completed adventures contain **exactly 4 or 5 player decisions**, as specified by the scenario. Automatic transitions and result embeds do not count.
- Entry costs **15 energy** when energy is enabled. Only energy-disabled guilds use the **15-minute fallback cooldown**.
- There is **one active adventure per Discord user ID across all channels and guilds**, including simultaneous starts.
- Rewards and involuntary penalties accumulate for one atomic completion settlement. **Voluntary costs (bribes, purchases, wagers, item offerings) are paid when a choice is accepted**, before revealing its outcome.
- Each decision has a 90-second deadline. Timeout or abandonment grants no pending rewards, discards pending involuntary penalties, and refunds **7 energy** if entry consumed 15.
- Involuntary credit losses cannot make a wallet negative. Voluntary prices require full payment and cannot use the loss clamp.

The execution plan is [adventure_game_plan.md](adventure_game_plan.md). This specification defines the authoritative gameplay semantics.

New sessions also use [companion reward ranks](adventure-reward-ranks-plan.md), implemented with user-requested bonuses up to +500%. This policy scales eligible amounts and relative drop chances before settlement, preserving existing session payouts and fixed wagers.

## 2. Architecture and contracts

### 2.1. Locations and integration

- Types, scenarios, engine, and payout service: `packages/services/src/adventure/`.
- Durable adventure session repository, ownership and receipt constraints: `packages/database/src/repositories/` and both dialect schemas/migrations. Implemented by `AdventureSessionRepository`, `ensureAdventureSchema`, and matching SQLite/PostgreSQL tables.
- Command: `apps/bot/src/commands/games/adventure.command.ts`; wiring in `apps/bot/src/services.ts` and relevant barrel exports.
- Tests: `packages/services/src/adventure/__tests__/` and `apps/bot/src/commands/games/__tests__/adventure.command.test.ts`.

Review new database contracts/migrations against `packages/database` before consuming them in the bot.

### 2.2. Required data contracts

Implemented contracts (button presentation remains in the Discord renderer):

| Contract | Required fields and invariants |
|---|---|
| `AdventureScenario` | ID/version, title/description/color, theme elements, risk tier, `totalDecisions: 4 \| 5`, `energyCost: 15`, root ID, node registry |
| `AdventureNode` | Discriminated union: decision node with stage/narrative/2–4 choices, or terminal node with outcome and rewards/penalties; terminals have no decision stage |
| `AdventureChoice` | ID/label, optional upfront wallet/item `cost`, optional deferred `effects`, and exactly one transition: direct target, probabilistic success/failure targets, or stat/element pass/fail targets |
| `AdventureRewardConfig` | Bounded integer credits, player XP, dust, energy restoration, item chance/codes, card chance and minimum `CardRarity` |
| `AdventurePenaltyConfig` | Bounded integer credit loss, energy drain, hazard reason; never a voluntary price already paid |
| `ActiveAdventureSession` | IDs, scenario version, node, decision count, revision/status/deadline, RNG state, card/stat snapshot, entry mode/actual energy charged, pending reward/penalty intents, accepted-choice receipts, history, settlement receipt |

Risk tiers remain `SAFE`, `BALANCED`, `HIGH_RISK`, `EXTREME`; outcomes remain `CRITICAL_SUCCESS`, `SUCCESS`, `MIXED`, `FAILURE`, `CRITICAL_FAILURE`. Pending cards/items are intents, not already granted inventory IDs. A unique `(sessionId, revision)` choice receipt records the accepted choice, actual costs, sampled effects/outcome, and next state, preventing repeated charging or rerolling.

Player XP uses leveling, not card XP. Dust uses catalog inventory grants. Snapshot the equipped card's element and stats at admission. Skill checks use injectable seeded RNG and `clamp(baseChance + matchingElementBonus, 0, 1)`, with matching bonus `0.25` unless specified otherwise. Stat checks compare the snapshot to the threshold. Missing cards fail affinity/stat gates normally.

### 2.3. Decision depth and graph validation

For `N = totalDecisions`, the root is decision 1, every non-terminal edge goes from stage `k` to `k + 1`, and only choices at stage `N` may reach a terminal. Every root-to-terminal path must therefore contain exactly `N` accepted decisions, including failed-check routes.

Each decision offers at least two actions with distinct consequences, costs, routes, or reward/risk profiles, including at least one free ungated action. No automatic transitions, acknowledgements, inline early endings, skipped stages, cycles, missing/unreachable nodes, or dead ends. Cancellation is outside the scenario graph and may occur early without completion rewards.

## 3. Launch scenario catalog

The following tables replace the earlier shortcut graphs. IDs are local to their scenario. `+` effects are pending rewards; losses/drains are pending involuntary penalties; **pay/consume** means an immediate voluntary cost. All paths have the stated decision count. Unlisted terminal rewards/penalties are zero. Listed cards/items are guaranteed subject to catalog availability (section 4.3).

### 3.1. The Goblin Bazaar of Whispers — 5 decisions

Balanced risk; SHADOW/LIGHTNING theme; `scenarios/the-goblin-bazaar.ts`.

| Stage / node | Choices → next nodes |
|---|---|
| 1 `root` | Bribe keeper (pay 50) → `market`; sneak (SHADOW, 50% base) → `market` / `detention`; force entry → `brawl` |
| 2 `market` | Visit Griznak → `relic`; follow smugglers → `vault`; visit tavern → `tavern` |
| 2 `detention` | Bribe guard (pay 100) → `relic`; use drain → `vault` with loss 25 |
| 2 `brawl` | Press attack → `vault` with loss 50; retreat into crowd → `tavern` |
| 3 `relic` | Buy relic (pay 200) → `appraiser`; haggle (60%) → `appraiser` / `counterfeit`; inspect the dealer's samples → `counterfeit` |
| 3 `vault` | Take chest → `pursuit`; take small parcel → `quiet_exit` |
| 3 `tavern` | Stake 200 (pay once, 50%) → `winning_table` / `losing_table`; gather intel → `quiet_exit` |
| 4 `appraiser` | Break seal → `relic_exit`; pay for provenance (pay 25) → `relic_exit` with +50 credits |
| 4 `counterfeit` | Confront dealer → `scam_exit`; search stall → `scam_exit` with +25 credits and loss 50 |
| 4 `pursuit` | Sprint through alley → `chest_exit`; hide in stalls → `chest_exit` with +25 XP and drain 5 energy |
| 4 `quiet_exit` | Wait for patrol → `safe_exit`; trade intel → `safe_exit` with +25 credits and loss 50 |
| 4 `winning_table` | Collect winnings → `cash_exit`; help cashier → `cash_exit` with +25 XP and drain 5 energy |
| 4 `losing_table` | Slip away → `broke_exit`; clear tables → `broke_exit` with +25 XP and drain 5 energy |
| 5 `relic_exit` | Keep relic → `appraised`; sell it → `clean` |
| 5 `scam_exit` | Expose scam → `scammed`; escape quietly → `clean` |
| 5 `chest_exit` | Keep chest → `chased`; surrender it for side parcel → `clean` |
| 5 `safe_exit` | Follow safe route → `clean`; try dealer's shortcut → `scammed` |
| 5 `cash_exit` | Keep card prize → `jackpot`; exchange for supplies → `clean` |
| 5 `broke_exit` | Leave → `broke`; run courier errand → `recovery` |

Terminal bundles: `appraised` SUCCESS (+150 credits, +100 XP, AMULET_MOUNTAIN); `scammed` FAILURE (75–150 credit loss); `chased` MIXED (RARE+ card, loss 50); `clean` SUCCESS (+300 credits, 50 dust); `jackpot` CRITICAL_SUCCESS (+400 gross credits, UNCOMMON+ card); `broke` FAILURE (no additional debit: the 200 stake is already paid); `recovery` MIXED (+50 credits, +25 XP). Choosing another route after wagering never refunds the stake.

### 3.2. The Sunken Shrine of Leviathans — 5 decisions

Balanced risk; WATER/ICE theme; `scenarios/the-sunken-shrine.ts`.

| Stage / node | Choices → next nodes |
|---|---|
| 1 `root` | Wade → `antechamber`; build ice bridge (ICE gate) → `sanctum` / `antechamber`; dive (speed ≥150) → `grotto` / `whirlpool` |
| 2 `antechamber` | Read glyphs → `puzzle`; follow fish → `guardian` |
| 2 `sanctum` | Touch crystal → `blessing`; search treasure → `trap` |
| 2 `grotto` | Harvest pearls → `blessing`; disturb eel → `guardian` |
| 2 `whirlpool` | Struggle free → `puzzle` with drain 10 energy; ride current → `guardian` with drain 5 energy |
| 3 `puzzle` | Decode (60%) → `treasure` / `flood`; smash panel → `flood` |
| 3 `guardian` | Challenge (WATER, 50% base) → `victory` / `flood`; offer POTION_MINOR_HP (consume 1) → `treasure`; use spillway → `flood` |
| 3 `blessing` | Accept blessing → `treasure` with +25 XP; collect pearls → `treasure` with +25 credits |
| 3 `trap` | Dodge (speed ≥150) → `treasure` / `bruised`; shield (defense ≥800) → `treasure` / `bruised`; crawl through debris → `bruised` |
| 4 `treasure` | Study lock → `reward_exit`; pry lid → `reward_exit` with +50 credits and drain 5 energy |
| 4 `flood` | Climb ledge → `flood_exit`; rescue fragment → `flood_exit` with +25 XP and drain 5 energy |
| 4 `victory` | Honor sentinel → `victory_exit` with +25 XP; search pedestal → `victory_exit` with +25 credits |
| 4 `bruised` | Bind wounds → `bruised_exit`; salvage coins → `bruised_exit` with +25 credits and drain 5 energy |
| 5 `reward_exit` | Carry treasure → `treasure_room`; donate for blessing → `restored` |
| 5 `flood_exit` | Escape flood → `flooded`; salvage purse → `bruised_but_through` |
| 5 `victory_exit` | Accept card → `guardian_victory`; choose supplies → `treasure_room` |
| 5 `bruised_exit` | Take narrow path → `bruised_but_through`; brave flood → `flooded` |

Terminal bundles: `treasure_room` SUCCESS (+300 credits, 50 dust, POTION_MAJOR_HP); `restored` SUCCESS (+100 XP, restore 15 energy); `flooded` FAILURE (loss 100); `guardian_victory` CRITICAL_SUCCESS (SUPER_RARE+ card, +250 XP); `bruised_but_through` MIXED (+150 credits, drain 5 energy).

### 3.3. The Cursed Crypt of the Forgotten King — 4 decisions

High risk; LIGHT/SHADOW theme; `scenarios/the-cursed-crypt.ts`.

| Stage / node | Choices → next nodes |
|---|---|
| 1 `root` | Channel LIGHT → `purified` if matching, otherwise `alarm`; use SHADOW → `shadow` if matching, otherwise `alarm`; break door → `alarm` |
| 2 `purified` | Pay respects → `audience`; raid bowls → `avarice` |
| 2 `shadow` | Follow whisper → `throne`; take gold → `avarice` |
| 2 `alarm` | Fight (attack ≥1200) → `throne` / `pursuit`; fall back → `pursuit` |
| 3 `audience` | Accept trial → `armory_gate`; demand treasure → `curse_gate` |
| 3 `throne` | Open sarcophagus (50%) → `armory_gate` / `curse_gate`; take crown → `crown_gate` |
| 3 `avarice` | Confess → `curse_gate`; hoard treasure → `avarice_gate` |
| 3 `pursuit` | Barricade door → `retreat_gate`; face king → `curse_gate` |
| 4 `armory_gate` | Choose solar lance → `lance`; choose aegis → `aegis` |
| 4 `curse_gate` | Shatter seal → `cursed`; surrender crown → `retreat` |
| 4 `crown_gate` | Keep crown → `crown`; return it → `mercy` |
| 4 `avarice_gate` | Keep hoard → `consumed`; abandon it → `cursed` |
| 4 `retreat_gate` | Flee → `retreat`; aid a spirit → `mercy` |

Terminal bundles: `lance` / `aegis` CRITICAL_SUCCESS (+800 credits, RARE+ card, WEAPON_SOLAR_LANCE / ARMOR_AEGIS_BARRIER respectively); `crown` SUCCESS (+500 credits, AMULET_MOUNTAIN); `mercy` MIXED (+100 XP); `consumed` CRITICAL_FAILURE (loss 250); `cursed` FAILURE (loss 200, drain 10 energy); `retreat` FAILURE (loss 150, drain 5 energy). Narrative retreat still takes four decisions; the abandon command is available at any time.

### 3.4. The Celestial Peaks of Aether — 5 decisions

Balanced risk; LIGHTNING/EARTH theme; `scenarios/the-celestial-peaks.ts`.

| Stage / node | Choices → next nodes |
|---|---|
| 1 `root` | Take trail → `switchbacks`; scale cliff (EARTH gate) → `nest` / `switchbacks`; enter cavern → `caverns` |
| 2 `switchbacks` | Push through rockslide → `ridge`; wait → `hermit` |
| 2 `nest` | Befriend griffin (LIGHTNING, 50% base) → `flight` / `chase`; steal egg → `chase` |
| 2 `caverns` | Mine crystals → `ridge` with +50 dust; explore → `elemental` |
| 3 `ridge` | Ride lightning (LIGHTNING gate) → `summit_approach` / `shelter`; take shelter → `shelter` |
| 3 `hermit` | Rest → `shelter` with restore 15 energy; help hermit → `shelter` with POTION_MAJOR_HP |
| 3 `flight` | Fly high → `summit_approach`; scout camps → `shelter` with +50 credits |
| 3 `chase` | Outrun griffin (speed ≥200) → `summit_approach` / `shelter`; return egg → `shelter` |
| 3 `elemental` | Fight (attack ≥1000) → `summit_approach` / `shelter`; negotiate → `shelter` with +25 XP |
| 4 `summit_approach` | Cross bridge → `summit_choice`; collect flowers → `summit_choice` with +25 credits and drain 5 energy |
| 4 `shelter` | Gather firewood → `camp_choice`; tend traveler → `camp_choice` with +25 XP and drain 5 energy |
| 5 `summit_choice` | Accept relic → `summit`; leave relic and descend → `camp` |
| 5 `camp_choice` | Rest → `camp`; trade stories → `stories` |

Terminal bundles: `summit` CRITICAL_SUCCESS (+500 credits, RELIC_CHRONOS_HOURGLASS, RARE+ card, +200 XP); `camp` SUCCESS (+250 credits, restore 15 energy, +100 XP); `stories` SUCCESS (+300 credits, +125 XP). Restoration effects accumulate and are capped at settlement.

### 3.5. The Highwayman's Ambush — 4 decisions

High risk; FIRE theme; `scenarios/the-bandit-ambush.ts`.

| Stage / node | Choices → next nodes |
|---|---|
| 1 `root` | Fight (FIRE, 50% base) → `scattered` / `overpowered`; pay toll (pay 150) → `passage`; escape (speed ≥150) → `escaped` / `briar`; take cover → `overpowered` |
| 2 `scattered` | Loot camp → `camp`; chase leader → `duel` |
| 2 `overpowered` | Negotiate → `job`; play dead → `sneak` |
| 2 `passage` | Follow bandits → `camp`; continue safely → `road` |
| 2 `escaped` | Circle back → `camp`; keep running → `road` with +25 XP |
| 2 `briar` | Struggle free → `road` with drain 5 energy and loss 50; crawl toward camp → `sneak` |
| 3 `camp` | Ransack (60%) → `hoard_gate` / `trap_gate`; take small chest → `supply_gate` |
| 3 `duel` | Attack (attack ≥1000) → `hoard_gate` / `trap_gate`; defend → `duel_gate` |
| 3 `job` | Accept and betray → `hoard_gate`; refuse → `refusal_gate` |
| 3 `sneak` | Grab bag → `sneak_gate`; leave quietly → `road_gate` |
| 3 `road` | Search roadside → `road_gate`; escort traveler → `diplomacy_gate` |
| 4 `hoard_gate` | Open main chest → `jackpot`; take supply bag → `supplies` |
| 4 `trap_gate` | Force lock → `explosion`; abandon chest → `refused` |
| 4 `supply_gate` | Keep supplies → `supplies`; exchange for passage → `diplomacy` |
| 4 `duel_gate` | Take bounty → `duel_won`; spare leader for intel → `road_reward` |
| 4 `refusal_gate` | Push past guards → `refused`; negotiate safe conduct → `diplomacy` |
| 4 `sneak_gate` | Keep loot → `sneak_loot`; drop it and flee → `road_reward` |
| 4 `road_gate` | Search cache → `road_reward`; aid traveler → `diplomacy` |
| 4 `diplomacy_gate` | Accept thanks → `diplomacy`; scout ahead → `road_reward` |

Terminal bundles: `jackpot` CRITICAL_SUCCESS (+350 credits, WEAPON_OBSIDIAN_KATANA, +100 XP, RARE+ card); `supplies` SUCCESS (+250 credits, POTION_MINOR_HP); `duel_won` SUCCESS (+350 credits, +100 XP); `sneak_loot` MIXED (+100 credits, COMMON+ card); `road_reward` SUCCESS (+50 credits, +75 XP); `diplomacy` MIXED (+50 XP); `refused` FAILURE (loss 200); `explosion` CRITICAL_FAILURE (loss 250, drain 10 energy). A chosen toll is already paid and is never charged again by `diplomacy`.

## 4. Admission, payment, and rewards

### 4.1. Energy and cooldown

| Condition at start | Result |
|---|---|
| Unexpired fallback deadline, in any guild | Reject with remaining cooldown, including when moving to an energy-enabled guild |
| Energy enabled; energy ≥15 | Charge 15 atomically and start in `ENERGY` mode |
| Energy enabled; energy 0–14 | Reject; no fallback, cooldown, charge, or live session remains |
| Energy disabled; fallback deadline absent/expired | Start in `COOLDOWN` mode; persist user-global deadline = start time +15 minutes |

Snapshot admission mode at start; later setting changes do not change the run. Persist fallback deadlines across restart. Resolve the energy toggle from actual shared configuration during implementation; if none exists, add a validated adventure setting with energy enabled by default. A zero balance never means energy is disabled.

`PlayerEnergyRepository.consumeEnergy(userId, 15, tx)` exists. Resolve any applicable regeneration before admission using the existing energy policy. Record the actual charge. On timeout/abandon, the base refund is `floor(actualEntryEnergyCharged / 2)` = **7**. Apply `min(baseRefund, max(0, capacity - currentEnergy))` once, where capacity is `maxEnergy + bonusEnergy`. Cooldown mode refunds **0** and retains its deadline. Refunds do not consume or reset potion allowances.

On completion in energy mode, apply pending energy drains first, clamped at zero, then restores capped at capacity. Cancellation discards pending effects and returns only the entry refund. In cooldown mode suppress all adventure energy drains/restores. Receipts/UI report actual changes. Never refund uncharged energy.

The 10-second command throttle applies to start attempts; status and abandon remain usable. Each decision's 90-second deadline starts when successfully presented. Unauthorized, stale, unaffordable, or duplicate clicks do not extend it.

### 4.2. Choice costs and penalty settlement

- Re-read wallet/inventory under the required transaction locks when accepting a paid choice. Require the full listed price; pending rewards cannot finance it, and bank funds are not automatically used.
- Use `EconomyRepository.modifyBalance(params, tx)` with `ADVENTURE_COST` and `ItemGrantService.consume(..., tx)`. Payment, outcome/RNG state, receipt, and transition commit together. Insufficient funds/items reject without advancing, rolling, charging, or resetting the deadline; a free route remains available.
- Committed voluntary costs are non-refundable on timeout/abandon, including failed checks. Transaction failure rolls the cost and transition back together. A Discord send failure after commit retries presentation, not payment.
- A tavern wager debits 200 once. The winning bundle pays **400 gross**, net +200 before other events. Losing pays zero, net -200, with no second stake deduction. Leaving after a winning roll forfeits that pending payout. The 150-credit toll likewise debits once.
- Involuntary losses are deferred. At completion, lock the wallet and calculate `actualLoss = min(requestedLoss, walletBeforeSettlement)` with bigint currency arithmetic. Apply losses before adding completion rewards. Paid choice costs are excluded from this loss accumulator.
- Final credits are `grossRewards - actualLosses - paidChoiceCosts`. Keep separate ledger entries and session/choice metadata so the net total is explainable.
- Cancellation deliberately discards pending involuntary penalties as well as pending rewards; it never reverses accepted voluntary costs.

The previous standalone read-then-debit loss example is removed: a balance read before `modifyBalance` is not safe against concurrent wallet writers. Implement the wallet locking/serialization strategy shared with other economy writes, on both dialects, before claiming safe clamping.

### 4.3. Card grants with existing APIs and rarity floors

Award an owned copy of an **existing active card definition**. `UserCard.cardId` must reference that definition, not its artwork asset. `CardGenerator` belongs to ingestion/building; payout does not need a new definition. There is no `WaifuAssetRepository.findRandomAsset()` method.

Use these existing methods:

1. `WaifuCardRepository.listCards({ isActive: true, rarity, limit, offset }, tx)`. Paginate every eligible tier beyond the default first page of 50.
2. `WaifuAssetRepository.findById(card.assetId, tx)`. Exclude missing assets and `isDeletedByRequest` assets.
3. `WaifuCardRepository.getHighestSerialNumber(card.id, tx)` and `createUserCard(data, tx)`, subject to the serial-allocation prerequisite below.

Rarity order is explicit, never lexical:

```typescript
const RARITY_ORDER: readonly CardRarity[] = [
  'COMMON', 'UNCOMMON', 'RARE', 'SUPER_RARE',
  'ULTRA_RARE', 'SECRET_RARE', 'SIR', 'MYTHIC',
];
// Validate minRarity before indexing/slicing.
const eligibleRarities = RARITY_ORDER.slice(RARITY_ORDER.indexOf(minRarity));
```

Roll `cardDropChance` once. If awarded, gather all eligible active definitions with usable assets. Sample a nonempty tier using existing `RARITY_TIERS[rarity].weight`, renormalized over eligible nonempty tiers, then choose uniformly within that tier with injected RNG. A RARE floor therefore grants RARE or higher. Never change a low-rarity definition's rarity or fall back below the floor.

An empty eligible pool produces no card and an explicit unavailable-card count in the receipt and explanatory UI message; other rewards settle normally. Database failures roll back settlement and must not be disguised as an empty pool. Persist selection and reward rolls with the final accepted decision so retries do not reroll. Revalidate availability during settlement; a subsequently removed/inactive card produces the same explicit no-card result, not another random draw.

`getHighestSerialNumber() + 1` alone is unsafe concurrently. Before adventure grants ship, add shared per-definition serialization for **every card-minting path** (PostgreSQL row lock / SQLite write transaction) and a unique `(cardId, serialNumber)` constraint after auditing existing data. Allocate the serial and create the copy inside the settlement transaction; retry a conflicting transaction with the frozen selection. Implemented by `reserveSerialNumber` / `mintUserCard` and `ensureCardSerialSchema`. Drops reserve at spawn to keep displayed serials stable; tutorials, achievements and adventures share the allocator.

Persistence after protected allocation:

```typescript
await cardRepo.createUserCard({
  userId,
  cardId: selectedCard.id,
  serialNumber: allocatedSerial,
  level: 1,
  exp: 0,
  state: 'IDLE',
  isFavorite: false,
}, tx);
```

### 4.4. Atomic settlement and cancellation

The final accepted decision freezes reward rolls and moves the session to `SETTLING`. `AdventurePayoutService` uses `withTransaction(db, callback)`, passing `tx` through wallet, player XP, item/dust, card, and energy operations. Existing `ItemGrantService.grant(userId, itemCode, quantity, 'ADVENTURE_REWARD', tx)` accepts a transaction. Audit other participating APIs and add transaction support wherever needed.

A unique settlement receipt keyed by session ID, the status update, rewards/penalties, and active-lock release commit together. A retry returns the existing receipt. Rollback retains the frozen result for retry. Timeout/abandon cannot cancel a session already `SETTLING`; status reports pending settlement during transient failure. A failed result-message send must not repeat payout.

Cancellation atomically marks `TIMED_OUT` or `ABANDONED`, applies the capped refund, and releases ownership once. Recovery/status/new-start attempts reconcile expired sessions through this same path; do not just delete an expired lock and lose refunds or receipts.

## 5. Global sessions and Discord experience

### 5.1. Global ownership and races

The existing `MiniGameSessionManager` uses `${userId}:${channelId}` and does not satisfy adventure's global lock. Preserve existing games' behavior. Add a dedicated durable `AdventureSessionRepository` whose active ownership key is **Discord user ID only** (for example, an active-owner table with `userId` primary key referencing session history). Enforce uniqueness in both database dialects, across channels, guilds, and bot workers. An in-memory user map may cache state but is not the authority.

Admission claims ownership, checks persisted cooldown, charges entry or records the fallback deadline, and creates session state in one transaction. Conflicting starts return the existing session location without charging or changing cooldown. Failed admission rolls back ownership.

Serialize choice, timeout, abandon, and settlement operations by session revision/status. Button IDs include session ID/revision; exactly one operation may advance a revision. Persist state, costs, RNG, deadlines, and receipts for restart recovery. Resume valid deadlines, reconcile expired sessions, and retry frozen settlements. Losing an in-memory collector does not release ownership.

If admission commits but the initial decision cannot be published, use a dedicated idempotent start-failure compensation: restore the actual entry charge up to remaining energy capacity, undo only that session's newly created fallback deadline, and release ownership. This applies only before any decision was presented/accepted. Later delivery failures preserve committed state and paid costs for re-presentation/recovery, never a second charge. An unpresented decision has a delivery-recovery deadline 90 seconds after its state was committed; on expiry use start-failure compensation for the initial decision, or normal cancellation for later decisions. Successful presentation replaces that deadline with the 90-second choice deadline. An ambiguous send result must be reconciled against the stored message/session before compensating or presenting again.

### 5.2. Commands, embeds, and receipts

- Slash: `/adventure [action: start|status|abandon|settings] [scenario: id] [energy: true|false]`.
- Prefix: `!adventure`, `!adv`, `!journey`, `!quest-adventure`, with equivalent arguments; display the configured prefix in help.
- Category `CommandCategory.GAMES`; guild-only gameplay; public story with owner-only buttons.
- Show the narrative, companion and a small `Chapter k of N` deadline footer. Keep choices on buttons only; omit affinity explanations, wallet/energy panels and pending journey totals.
- Offer 2–4 owner-locked choice buttons with visible voluntary prices. Replace buttons after acceptance and edit the same public message. A start leaves no extra jump-link acknowledgement. The result embed is not another decision.
- Share 45 illustrated locations across all 413 decision and ending nodes: 15 for the original five adventures, plus one distinct setting for each of the 30 new stories. Attach local scene artwork to the embed and replace old attachments when editing; retain a text fallback if an asset is missing.
- Unauthorized/stale interactions receive explanatory ephemeral replies. Slash start conflicts are ephemeral; prefix conflicts are regular replies because message commands cannot be ephemeral.
- Timeout/abandon summaries explain the departure and show nonzero retained costs and net energy after refund. Status can present the active decision or completed receipt after a message failure.
- Completion focuses on the ending narrative, outcome color (green success, yellow mixed, red failure), and nonzero actual rewards/costs. Combine settlement energy and the entry charge in one net value; omit zero totals and empty fields. Never publish journey history or present pending reward intents as owned inventory. Internal choice receipts remain persisted for idempotency.

## 6. Verification requirements

### Catalog and engine

- Enumerate every direct/check pass/check fail edge and every terminal path: exactly **5 / 5 / 4 / 5 / 4** decisions for the original five scenarios, and exactly **4** for each of the 30 new stories (1,315 complete paths in total).
- Reject cycles, missing/unreachable nodes, skipped stages, early terminals, acknowledgement-only nodes, and nodes without a free ungated choice.
- Validate probabilities, finite integer amounts, item codes, and rarity floors. Use seeded RNG and injected time; failed affordability checks must not advance, roll, charge, or extend time.

### Persistence, payments, and rewards

- Race starts across channels/guilds/workers: one session and one admission charge per user; different users remain independent.
- Test enabled energy at 0/1/14/15, disabled-energy fallback, cross-guild cooldown bypass attempts, mid-run config changes, and restart persistence.
- Refund 7 once for charged entry (less at capacity), zero for cooldown mode; retain cooldown and suppress energy effects in cooldown mode. Race cancellation against accepted choices and settlement.
- Test full-cost affordability, item offerings, duplicate clicks, transaction rollback, cancellation after payment, 400 gross wager winnings, and no double stake/toll debit.
- Clamp requested loss 200 against wallets 0/50/200, including concurrent external wallet writes and loss-before-reward ordering; use bigint arithmetic.
- Verify every rarity floor, pagination, missing/removed assets, empty pools, seeded weighted selection, and serial races against other minting paths.
- Inject failure into each settlement participant on both dialects; prove all-or-nothing rewards and stable retry receipts across restart, without duplicate grants/refunds/rolls.

### Discord and implementation gates

Test slash/prefix parity, owner-only buttons, stale/duplicate actions, status/abandon, deadlines, public embeds, and send failures before/after committed transitions. Implementers must run targeted suites plus `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

Manual verification uses `pnpm dev:bot`: check decision counts, `/balance`, `/card collection`, and cross-channel/guild starts. Documentation-only edits require document/link/board checks rather than runtime gates.

## 7. Proposed implementation breakdown

These tasks are registered under `STORY-170`. TASK-1701 through TASK-1704 and follow-ups TASK-1706–TASK-1715 are DONE. TASK-1705 remains in REVIEW for live PostgreSQL/Discord verification. See [implementation status](adventure_game_plan.md#implementation-status--2026-09-26) and the [verification handover](kanban/handovers/TASK-1705.md). Revised estimates include durable locking, transaction receipts, shared card-minting safeguards and scene artwork. Individual estimates are Fibonacci values; 67 is the summed task total.

| Ticket | Points | Deliverable |
|---|---:|---|
| `TASK-1701` | 3 | Contracts, five complete scenario DAGs, exhaustive depth/catalog validation |
| `TASK-1702` | 8 | Dual-dialect durable global ownership, admission/cooldown, revision-safe traversal, restart recovery |
| `TASK-1703` | 8 | Upfront cost receipts, atomic/idempotent payout and cancellation, rarity floors, shared serial-allocation safety |
| `TASK-1704` | 5 | Slash/prefix command, stage UI, ownership/revision checks, status/abandon and recovery presentation |
| `TASK-1705` | 3 | Integration races/fault injection on both dialects, command coverage, full quality gates |
| `TASK-1706` | 5 | Story-focused presentation, single start message, net summaries and shared location artwork |

| `TASK-1707` | 8 | Thirty authored four-decision adventures, distinct location illustrations, searchable catalog and exhaustive delivery/traversal verification |

| `TASK-1708` | 3 | Reward rank policy and companion snapshots |
| `TASK-1709` | 5 | Reward scaling and frozen settlement |
| `TASK-1710` | 2 | Compact rank display and help |
| `TASK-1711` | 3 | Balance comparison and integration verification |

| `TASK-1712` | 1 | Requested user override to S+ rank |
| `TASK-1713` | 5 | Tower-benchmarked completion rewards |
| `TASK-1714` | 5 | Atomic companion XP and stronger card acquisition |
| `TASK-1715` | 3 | Completion-economy balance verification |

**Total: 67 points.** Execute the registered tasks sequentially with WIP limit 1. The engine, persistence, payouts, Discord command and presentation refinements are implemented; see [runtime and rollout instructions](adventure-runtime.md).

New admissions use [completion economy version 2](adventure-completion-rewards.md), superseding the authored ordinary reward amounts above. Rank E targets about 10% more progression per net energy than repeat floor 34, including failed routes and choice costs. Every completed ending grants progression, with separate companion XP and stronger card opportunities. Original sessions retain their saved rules.
