# Handover Note: [STORY-156] Equipment Acquisition: Drop Tables, Boss Signature Drops & Gear Power Budget

- **Ticket Type & Points**: Story | 8 pts
- **Parent**: `EPIC-015`
- **Author / Agent**: Claude Code (Opus 5)
- **Status**: DONE
- **Timestamp**: 2026-09-19T17:45:00Z

## 1. Summary of Work Accomplished
- **Catalog** ([catalog.ts](file:///Z:/Projects/ririko-v2-2026/packages/services/src/waifu-tcg/equipment/catalog.ts)): 25 new pieces.
  - 15 **bracket items** fill every slot in every floor bracket (shop, RARE, SUPER_RARE, ULTRA_RARE, SECRET_RARE).
  - 10 **Season 1 signature items**, one per mini/major boss (Fire Brigade Badge through Crucible Heart Blade, MYTHIC). They are not shop-buyable.
  - Stats follow a power budget: each bracket's gear is sized to the card stats players have at that point. A test checks that bracket averages rise strictly.
- **Drop tables** ([dungeon-loot.service.ts](file:///Z:/Projects/ririko-v2-2026/packages/services/src/waifu-tcg/dungeon/dungeon-loot.service.ts)): `DUNGEON_DROP_BRACKETS`.
  - Weighted pools per floor range, 35% item chance on repeat clears.
  - Standard-floor first clears always roll one item.
  - Boss floors give the boss's `signatureDropCode` on first clear (bracket fallback without one) and 8% on repeat clears.
  - Major floors keep the big credit/dust first-clear bonus.
  - The runner passes the session boss's signature code to the loot service.
- **S1 catalog**: `signatureDropCode` set for all 10 mini/major bosses and re-imported locally.
- **Secondary gear stats are now real in dungeon combat:**
  - `Combatant.gearMods` holds mitigation (+ elementalResistance, capped at 60%, not against enrage true damage), armorPiercing, elementalMastery and manaRegen.
  - `applyEquipmentToCombatant` also applies critDamage, manaMax and manaShield (as a starting shield).
- **Simulator profiles** now wear the gear each bracket actually drops, including signature pieces.
- Docs: [waifu-tcg.md §13.3](file:///Z:/Projects/ririko-v2-2026/docs/waifu-tcg.md) has the drop table overview and a secondary-stat table.

## 2. Current State & Verification
- New [gear-and-drops.test.ts](file:///Z:/Projects/ririko-v2-2026/packages/services/src/waifu-tcg/__tests__/gear-and-drops.test.ts) (5 tests):
  - All drop and signature codes exist, and signatures are not buyable.
  - Bracket gear power rises strictly.
  - Signature, fallback and standard first-clear drops work, and repeat signature chance works.
  - Every secondary stat changes combat outcomes as designed.
- `pnpm test` green except the live-network music test. `pnpm typecheck` clean. eslint 0 errors.
- Simulator after this story (S1 curve still untuned):

| Floor | newbie | starter | early | mid | late | endgame |
|---|---|---|---|---|---|---|
| F1 | 81% | 88% | 100% | 100% | 100% | 100% |
| F5 | 4% | 6% | 43% | 95% | 100% | 100% |
| F10 | 0% | 0% | 0% | 14% | 97% | 100% |
| F15 | 0% | 0% | 0% | 0% | 87% | 100% |
| F20 | 0% | 0% | 0% | 0% | 0% | 16% |
| F25 | 0% | 0% | 0% | 0% | 5% | 32% |
| F30+ | 0% | 0% | 0% | 0% | 0% | 0% |

## 3. Roadblocks, Gotchas & Decisions Made
- The exponential S1 curve still outgrows every gear set past ~F25. That is STORY-159's tuning job; gear is now at the power budget it needs.
- New catalog items appear in existing databases on the next bot boot (canonical item seeding creates missing codes). Existing items are not updated by seeding.
- Secondary stats affect the dungeon session only. PvP and world raids (`CombatSimulator`) still use the primary stats plus perks.

## 4. Actionable Next Steps
- STORY-157: interactive `/card gear` menu.
