# Handover Note: [STORY-152] Dungeon Balance Simulator CLI & CI Win-Rate Bands

- **Ticket Type & Points**: Story | 5 pts
- **Parent**: `EPIC-015`
- **Author / Agent**: Claude Code (Opus 5)
- **Status**: DONE
- **Timestamp**: 2026-09-19T15:00:00Z

## 1. Summary of Work Accomplished
- [balance-simulator.ts](file:///Z:/Projects/ririko-v2-2026/packages/services/src/waifu-tcg/dungeon/balance-simulator.ts)
  - `simulateDungeonBalance` runs Monte Carlo trials through the **real** encounter builder and `DungeonBattleSession`. Auto-battle uses the skill when affordable and drinks a Minor HP Potion below 35% HP. Card stats are rolled per trial from the rarity, and gear comes from catalog codes with enhancement scaling.
  - `DEFAULT_SIM_PROFILES`: six stages from tutorial graduate to endgame (newbie, starter, early, mid, late, endgame).
  - `S1_TARGET_BANDS`: minimum win rates per bracket plus maximums that keep players from skipping gear checks (for example, a newbie must not clear F10).
  - `checkWinRateBands`, `formatBalanceReport`, and `createSeededRng` (mulberry32) for repeatable runs.
- CLI: `pnpm tcg:simulate [--season=] [--floors=1-20,30] [--profiles=] [--trials=300] [--seed=42] [--check]` ([tcg-balance-sim.ts](file:///Z:/Projects/ririko-v2-2026/scripts/tcg-balance-sim.ts)). It reads the configured DB. `--check` exits 1 when floors fall outside the S1 bands.
- Refactors that let the simulator share code with the bot instead of copying it:
  - `DungeonRunner.buildEncounter` returns a plain-data `FloorEncounter`. `startEncounterSession` creates a fresh session (ward, affix handler) per battle. `prepareFloorSetup` returns `{ encounter }`.
  - `createCardCombatant` ([card-combatant.ts](file:///Z:/Projects/ririko-v2-2026/packages/services/src/waifu-tcg/card/card-combatant.ts)) is the single card-to-combatant builder; `LoadoutService.buildCombatant` uses it.
  - Pure gear helpers `scaleEquipmentStats` / `scaleEquipmentPerks` (enhancement) and `addEquipmentStats` / `applyEquipmentToCombatant` (loadout). The service methods delegate to them.

## 2. Current State & Verification
- New [balance-simulator.test.ts](file:///Z:/Projects/ririko-v2-2026/packages/services/src/waifu-tcg/__tests__/balance-simulator.test.ts) (4 tests): deterministic per seed, difficulty rises with floors and falls with better profiles, band violations detected, unknown gear rejected.
- `pnpm test` all green (1152 tests). `pnpm typecheck` clean. eslint 0 errors.
- Baseline on the current (untuned) S1 DB, 200 trials:

| Floor | newbie | starter | early | mid | late | endgame |
|---|---|---|---|---|---|---|
| F1 | 81% | 86% | 100% | 100% | 100% | 100% |
| F3 | 68% | 70% | 97% | 100% | 100% | 100% |
| F4 | 56% | 73% | 95% | 100% | 100% | 100% |
| F5 | 9% | 13% | 42% | 98% | 100% | 100% |
| F10 | 0% | 0% | 0% | 5% | 56% | 96% |

## 3. Roadblocks, Gotchas & Decisions Made
- The S1 band assertions are **not** in CI yet: the current curve fails them (see the table). STORY-159 tunes S1 and adds a Vitest check that runs the simulator against the seeded S1 data with `S1_TARGET_BANDS`.
- The simulator fights one card, like the bot's dungeon (the session is 1v1).

## 4. Actionable Next Steps
- STORY-153: boss builder. STORY-154 seeds S1 bosses/floors. STORY-159 then tunes `scaling_params` until `pnpm tcg:simulate --check` passes.
