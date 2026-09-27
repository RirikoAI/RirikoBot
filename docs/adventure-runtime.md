# Adventure RPG runtime and verification

## Player commands

Use `/adventure` for a random choice among 35 scenarios, or search the `scenario` option by title, theme or element. Autocomplete returns up to 25 matching titles; type more of the title to find any of the 35. For example, select `the-midnight-bakery` or `the-goblin-bazaar`. See the [complete catalog](adventure-catalog.md) for all IDs and premises. Prefix equivalents use the server's configured prefix, for example `!adv start the-goblin-bazaar`. Aliases: `adv`, `journey`, `quest-adventure`.

`/adventure action:status` returns your current location or stored result. `/adventure action:abandon` ends an active run. Prefix equivalents are `!adv status` and `!adv abandon`. These actions remain available during the ten-second start throttle.

Stories are public. Only their owner can use the decision and abandon buttons. Each complete scenario requires four or five decisions. The equipped card's level- and equipment-adjusted stats are snapshotted at entry; no equipped card is required. Matching an elemental skill check adds 25 percentage points to its success chance.

Starting an adventure leaves one public story message. Prefix starts no longer send a second jump-link reply; slash starts remove their temporary private acknowledgement after the story is delivered. Decisions update that same message. The embed focuses on narrative and companion, with choices on buttons only. Wallet, affinity explanations, pending totals and route history are not displayed. Final results omit zero statistics and show one net energy change including entry (for example, 15 entry plus a 5-energy penalty displays `Energy: -20`; a seven-energy refund displays `Energy: -8`). Internal receipts remain stored for safe settlement.

Forty-five illustrated locations cover all 413 decision and ending nodes. The original five adventures share 15 locations across related branches; each of the 30 new four-decision adventures has its own illustration shared across its branches. Artwork ships in `assets/adventure/scenes/`; preserve that directory when deploying and grant the bot Attach Files permission. Images are attached directly to the story message and replaced on edits. Missing local artwork falls back to the text story. The original and expansion asset manifests record generation prompts; `adventure-art.ts` defines the branch mapping.

## Companion reward ranks

New adventures snapshot the equipped companion’s owned level at admission. F (solo/1–9) is normal; E (10–19) gives +50%, D (20–29) +100%, C (30–39) +150%, B (40–59) +200%, A (60–79) +300%, S (80–99) +400%, and S+ (100+) +500%. Bonuses apply to calibrated earned credits, player XP, dust, companion XP and relative item/card drop chances, capped at 100%. At S+, a calibrated base of 300 credits becomes 1,800 and a 10% drop chance becomes 60%. Card quantities, costs and penalties are not multiplied. Fixed Bazaar winnings and their supplies exchange components are excluded.

Explicit override: Discord user `391220345769689090` always receives exactly S+ rank (+500%) on new runs, even solo or with a level-100 companion. Existing runs retain their saved rank.

Use `/adventure action:ranks` or `!adv ranks` for the table without starting a run. The companion field and result footer show the frozen rank; level/equipment changes affect the next run. Old active/settling/completed sessions retain their original rewards. All workers must use compatible policy readers; startup rejects unsupported unfinished payloads. No new SQL column is needed because rank/calculation/receipt data lives in existing JSON payloads. Drain new-format sessions before rolling back to an older binary.

New runs use [completion economy version 2](adventure-completion-rewards.md): every completed ending, including failures, pays progression rewards. Rank E targets about 10% better ordinary rewards per net energy than repeat floor 34, including failed routes and paid choices. Completion restoration is capped at seven energy. New card opportunities have base chances of 20% for success, 15% for mixed and 10% for failure; newly added success/mixed drops have a RARE floor and failures UNCOMMON. Existing authored rarity floors and guaranteed drops remain. Companion XP goes to the original owned card, clipped to its level cap; unavailable companions are skipped with a summary notice. Cancellation gives no XP.

See the [rank policy](adventure-reward-ranks-plan.md) and [balance comparison](adventure-reward-balance.md).

## Server configuration and costs

Manage Server permission is required for `/adventure action:settings energy:false` (prefix `!adv settings false`). This disables adventure energy effects and uses a persistent, user-global 15-minute start cooldown. Use `energy:true` / `settings true` to restore the default 15-energy entry cost. Insufficient energy never activates the cooldown fallback. The chosen admission mode stays fixed for the run, and an existing fallback cooldown applies even in another guild with energy enabled.

Bribes, purchases, bets and item offerings are charged immediately on accepted choices. Pending rewards cannot fund a choice. These costs are retained after abandonment or timeout. Deferred losses are clamped to the wallet before completion rewards are credited. A 200-credit winning wager retains its fixed 400-credit component; new runs also earn a calibrated completion reward. Its stake is not charged again. Cards, items, dust, player and companion XP, money and energy settle with the receipt in one transaction.

Each presented choice has 90 seconds. A normal timeout/abandon returns seven of the 15 entry energy, capped at `maxEnergy + bonusEnergy`; cooldown-mode runs return zero. A failed unpublished start returns the full charged energy up to capacity or clears its fallback cooldown. Later message failures retain saved progress for retry until the deadline. Status can recover the receipt even when the original message/channel no longer exists.

## Deployment

Restart the bot after updating code and assets; startup also synchronizes the slash-command definition, including scenario autocomplete.

Normal bot startup runs `ensureAdventureSchema` and `ensureCardSerialSchema` before gateway activity. They add adventure tables, cooldown/delivery state, serial counters and indexes without resetting existing data. Empty SQLite databases also include these in generated DDL. PostgreSQL needs the existing project schema first, as before this feature.

The serial migration deliberately stops startup if existing copies share a `(card_id, serial_number)` pair. It never renumbers or deletes cards automatically. Before rollout, audit the target database using this read-only query:

```sql
SELECT card_id, serial_number, count(*) AS copies
FROM user_cards
GROUP BY card_id, serial_number
HAVING count(*) > 1;
```

If it returns rows, resolve those ownership/serial conflicts explicitly before restarting with this change. This task did not inspect or modify a deployed database. All ordinary minting paths now share the serial allocator; unclaimed drops may leave harmless serial gaps.

`createBotServices` constructs dependencies; callers that bypass the normal bot entrypoint must run the two upgrade functions themselves before gameplay. Reconnecting READY events do not duplicate the recovery timer. Shutdown stops it; pending sessions and payouts remain in the database for the next worker.

## Automated checks

```bash
pnpm test -- packages/services/src/adventure apps/bot/src/commands/games
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

The focused suite uses seeded RNG, injected time and real SQLite transactions. It covers all 1,315 scenario paths, cross-channel/guild starts, two connections and restart persistence, payment/cancellation races, energy boundaries, every rarity floor, catalog pagination, failure after the last payout write, serial allocation, command parity, catalog-wide autocomplete and Discord delivery recovery. All 30 new adventures also have an end-to-end four-decision SQLite/Discord-payload test. Discord is mocked; this is not a live bot smoke test.

For a disposable PostgreSQL instance, set `ADVENTURE_TEST_POSTGRES_URL` and run:

```bash
pnpm test -- packages/services/src/adventure/__tests__/postgres.integration.test.ts
```

The opt-in suite creates a uniquely named isolated schema, exports the actual PostgreSQL Drizzle schema, opens two independent pools, and tests global admission, concurrent wallet settlement, shared serial allocation and concurrent tower/adventure companion XP. It drops only its own schema afterward. The role needs schema-creation privileges. No existing tables are truncated. These five tests are skipped when the variable is absent. They have not been executed on this workstation because PostgreSQL is unavailable.

Original full-suite and coverage limitations are recorded in [TASK-1705](kanban/handovers/TASK-1705.md); current completion-economy results are in [TASK-1715](kanban/handovers/TASK-1715.md). Finish live PostgreSQL testing and a Discord smoke test before production rollout: complete each scenario, verify `/balance` and `/card collection`, try aliases and cross-guild starts, and check restart, timeout, abandonment and lost-message recovery.
